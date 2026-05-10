/**
 * Dash Sync — Auto-backup hook (Phase 2.9)
 *
 * Reads the backup settings from disk on mount, runs a sweep every minute
 * to check whether a backup is due, fires the encrypted .dashpack export
 * when so. Independent of sync — works whether SYNC_ENABLED is on or off
 * and serves as the safety net for users who lose all their paired
 * devices (the "no-data-loss" priority backstop).
 *
 * Electron-only for v1: writes via the new write-backup-file IPC. PWA
 * fallback (manual download prompt when overdue) lives in the settings
 * panel; the hook just no-ops on non-Electron environments.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  defaultBackupSettings,
  validateBackupSettings,
  isBackupDue,
  backupFilename,
  applyRetention,
  formatBackupAge,
  SCHEDULE_OFF
} from '../lib/backupSchedule.js'
import { encryptJsonWithPassphrase } from '../utils/cryptoUtils.js'

const SWEEP_INTERVAL_MS = 60 * 1000 // check once a minute

/**
 * @param {Object} opts
 * @param {() => object[]} opts.getPages - returns latest pages array
 * @param {() => object[]} opts.getTags - returns latest tags array
 * @param {() => Promise<string>} opts.getBackupPassphrase - returns
 *   passphrase for encrypting the .dashpack. Caller decides where it
 *   comes from: app-lock master password, separate user-set passphrase,
 *   or vault-key-derived. v1 uses a deterministic passphrase derived
 *   from the user's app-lock password (caller resolves).
 * @param {() => Promise<object[]>} [opts.collectAttachmentsForExport] -
 *   optional override; falls back to dynamic-importing the attachment
 *   storage module.
 */
export function useAutoBackup ({
  getPages,
  getTags,
  getBackupPassphrase,
  collectAttachmentsForExport = null
} = {}) {
  const [settings, setSettings] = useState(defaultBackupSettings())
  const [isLoaded, setIsLoaded] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [lastError, setLastError] = useState(null)

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const isElectron = typeof window !== 'undefined' && !!window.electron?.invoke
  const isCapacitorNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

  // ── Load settings on mount ──
  useEffect(() => {
    let cancelled = false
    async function load () {
      try {
        if (isElectron) {
          const stored = await window.electron.invoke('read-backup-settings')
          if (cancelled) return
          if (stored) {
            setSettings(validateBackupSettings(stored))
          }
        }
        // PWA: no persistent settings store yet (could use IndexedDB later);
        // for v1 PWA falls back to defaults each session.
      } catch (err) {
        console.error('useAutoBackup: load failed', err)
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isElectron])

  const persistSettings = useCallback(async (next) => {
    validateBackupSettings(next)
    setSettings(next)
    settingsRef.current = next
    if (isElectron) {
      await window.electron.invoke('save-backup-settings', next)
    }
  }, [isElectron])

  // ── Run a backup ──
  const exportBackupNow = useCallback(async () => {
    if (isExporting) return null
    if (!getPages || !getBackupPassphrase) {
      console.error('useAutoBackup: getPages and getBackupPassphrase required')
      return null
    }
    // iOS Capacitor: WKWebView ignores synthetic `<a download>` clicks,
    // so the previous PWA branch silently no-op'd while updating
    // lastBackupAt — the user thought they had backups, they didn't.
    // Surface an honest error and DO NOT advance lastBackupAt. A real
    // native backup needs @capacitor/filesystem (deferred to a future
    // build); for now Settings → Export should integrate the iOS share
    // sheet via navigator.share under user gesture.
    if (isCapacitorNative && !isElectron) {
      const message = 'Auto-backup is not yet available on iOS — use Settings → Export to share manually.'
      setLastError(message)
      return { success: false, skipped: 'ios-not-supported', error: message }
    }
    setIsExporting(true)
    setLastError(null)
    try {
      const pages = getPages() || []
      const tags = getTags ? getTags() : []
      const passphrase = await getBackupPassphrase()
      if (!passphrase || typeof passphrase !== 'string') {
        // No passphrase configured — silent skip. Expected on first run
        // (PWA / Capacitor) and any time the user has not yet set a
        // backup passphrase. Sweep will retry next interval.
        return { success: false, skipped: true, reason: 'no-passphrase' }
      }

      // Bundle attachments same as manual dashpack export
      let attachments = {}
      if (collectAttachmentsForExport) {
        attachments = await collectAttachmentsForExport(pages)
      } else {
        try {
          const mod = await import('../lib/attachmentStorage.js')
          if (mod.collectAttachmentsForExport) {
            attachments = await mod.collectAttachmentsForExport(pages)
          }
        } catch { /* attachment-less backup is fine */ }
      }

      const payload = { pages, tags, createdAt: new Date().toISOString(), attachments }
      const encrypted = await encryptJsonWithPassphrase(payload, passphrase)
      const json = JSON.stringify(encrypted)
      const filename = backupFilename(Date.now())

      if (isElectron) {
        const result = await window.electron.invoke('write-backup-file', {
          filename,
          content: json,
          folderPath: settingsRef.current.folderPath
        })
        if (!result?.success) throw new Error('Failed to write backup file')

        // Apply retention — list, decide what to purge, delete
        const existing = await window.electron.invoke('list-backup-files', settingsRef.current.folderPath)
        const { purge } = applyRetention(existing || [], settingsRef.current.retentionCount || 12)
        for (const oldFile of purge) {
          try {
            await window.electron.invoke('delete-backup-file', {
              filename: oldFile,
              folderPath: settingsRef.current.folderPath
            })
          } catch (e) {
            console.warn('useAutoBackup: failed to purge', oldFile, e)
          }
        }
      } else {
        // PWA / browser: trigger download
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      // Update lastBackupAt
      const next = { ...settingsRef.current, lastBackupAt: Date.now() }
      await persistSettings(next)

      return { success: true, filename }
    } catch (err) {
      console.error('useAutoBackup: export failed', err)
      setLastError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsExporting(false)
    }
  }, [isExporting, getPages, getTags, getBackupPassphrase, collectAttachmentsForExport, isElectron, isCapacitorNative, persistSettings])

  // ── Schedule sweep ──
  useEffect(() => {
    if (!isLoaded) return
    const sweep = () => {
      if (settingsRef.current.schedule === SCHEDULE_OFF) return
      if (isBackupDue(settingsRef.current)) {
        exportBackupNow().catch(() => {/* errors logged in exportBackupNow */})
      }
    }
    sweep() // run once on mount/load
    const t = setInterval(sweep, SWEEP_INTERVAL_MS)
    return () => clearInterval(t)
  }, [isLoaded, exportBackupNow])

  return {
    settings,
    isLoaded,
    isExporting,
    lastError,
    persistSettings,
    exportBackupNow,
    formatLastBackup: () => formatBackupAge(settings.lastBackupAt)
  }
}
