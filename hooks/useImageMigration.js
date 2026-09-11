/**
 * Moves photos pasted into notes before Stage 2 out of the notes and into
 * attachment storage, in the background. The work and its proofs live in
 * lib/imageMigration.js; this decides when it may run.
 *
 * Off until the Stage 3 release (IMAGE_MIGRATION_ENABLED). When on, it runs
 * only while all of these hold:
 *   - every device syncing the vault can show photos stored as attachments
 *   - canRun(): unlocked, not in duress, saves not blocked, no import running
 *   - attachments live in IndexedDB or the desktop app's files, never the
 *     browser's localStorage, which holds about 5 MB in all
 *   - the window is visible
 * With sync on it moves at most MONTHLY_SYNC_BUDGET_BYTES of photos a month,
 * so their uploads fit within the relay's monthly allowance.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  devicesReadyForMigration,
  migrateNotePhotos,
  planImageMigration,
  recoverInterruptedMigration
} from '@/lib/imageMigration'
import { storeImageBytes } from '@/lib/imageAttachments'
import { getAttachmentIdKey } from '@/lib/attachmentIdKey'
import { attachmentBackend, deleteAttachment, loadAttachment, saveAttachment } from '@/lib/attachmentStorage'

export const IMAGE_MIGRATION_ENABLED = false

const MONTHLY_SYNC_BUDGET_BYTES = 50 * 1024 * 1024
const FIRST_RUN_DELAY_MS = 30 * 1000
const RUN_EVERY_MS = 10 * 60 * 1000
const PAUSE_BETWEEN_NOTES_MS = 250

const JOURNAL_KEY = 'dash:image-migration:journal'
const REPORT_KEY = 'dash:image-migration:report'
const BUDGET_KEY = 'dash:image-migration:budget'

// Why a note is left as it was for good, rather than tried again next run.
const LEFT_AS_IS = new Set(['photo-too-large', 'unreadable-photo', 'verify-failed'])

const emptyReport = () => ({ moved: 0, bytes: 0, leftAsIs: [], waitingOn: [], updatedAt: null })

function readJson (key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* kept in memory for this session */ }
}

// A note's original content can be megabytes of inline photos, so the
// journal keeps it in attachment storage under its own id, with only that id
// in localStorage.
const journal = {
  async write (entry) {
    const id = crypto.randomUUID()
    const bytes = new TextEncoder().encode(JSON.stringify(entry))
    await saveAttachment(id, bytes.slice().buffer)
    const back = await loadAttachment(id)
    if (!back || back.byteLength !== bytes.byteLength) throw new Error('The migration journal did not save')
    const previous = localStorage.getItem(JOURNAL_KEY)
    localStorage.setItem(JOURNAL_KEY, id)
    if (previous && previous !== id) await deleteAttachment(previous).catch(() => {})
  },
  async read () {
    const id = localStorage.getItem(JOURNAL_KEY)
    if (!id) return null
    const data = await loadAttachment(id)
    if (!data) return null
    try {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(data)))
    } catch {
      return null
    }
  },
  async clear () {
    const id = localStorage.getItem(JOURNAL_KEY)
    localStorage.removeItem(JOURNAL_KEY)
    if (id) await deleteAttachment(id).catch(() => {})
  }
}

function monthKey () {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function budgetUsed () {
  const saved = readJson(BUDGET_KEY, null)
  return saved?.month === monthKey() ? saved.bytes : 0
}

/**
 * @param {object} options
 * @param {boolean} [options.enabled]
 * @param {() => boolean} options.canRun
 * @param {boolean} options.syncEnabled
 * @param {() => Promise<object[]|null>} options.getPairedDevices - the relay's device list, null when unavailable
 * @param {() => object[]} options.getPages
 * @param {() => string|null} options.getOpenPageId
 * @param {(next: object, expected: object) => boolean} options.replacePageIfUnchanged
 * @param {() => Promise<unknown>} options.saveNowOrThrow
 * @param {(pageId: string) => Promise<object|null>} options.readSavedPage
 */
export default function useImageMigration ({
  enabled = IMAGE_MIGRATION_ENABLED,
  canRun,
  syncEnabled,
  getPairedDevices,
  getPages,
  getOpenPageId,
  replacePageIfUnchanged,
  saveNowOrThrow,
  readSavedPage
}) {
  const [report, setReport] = useState(() => readJson(REPORT_KEY, emptyReport()))
  const runningRef = useRef(false)
  const optionsRef = useRef({})
  optionsRef.current = { canRun, syncEnabled, getPairedDevices, getPages, getOpenPageId, replacePageIfUnchanged, saveNowOrThrow, readSavedPage }

  const updateReport = useCallback((change) => {
    const next = { ...readJson(REPORT_KEY, emptyReport()), ...change(readJson(REPORT_KEY, emptyReport())), updatedAt: Date.now() }
    writeJson(REPORT_KEY, next)
    setReport(next)
  }, [])

  const run = useCallback(async () => {
    if (!enabled || runningRef.current) return
    const options = optionsRef.current
    const backend = attachmentBackend()
    if (backend !== 'indexeddb' && backend !== 'electron') return
    const blocked = () => !optionsRef.current.canRun?.() || document.visibilityState !== 'visible'
    if (blocked()) return

    runningRef.current = true
    try {
      if (options.syncEnabled) {
        const devices = await options.getPairedDevices?.()
        if (!devices) return
        const { ready, waitingOn } = devicesReadyForMigration(devices)
        updateReport(() => ({ waitingOn }))
        if (!ready) return
      }

      const shared = {
        getPages: options.getPages,
        getOpenPageId: options.getOpenPageId,
        swapPage: options.replacePageIfUnchanged,
        saveNow: options.saveNowOrThrow,
        readSavedPage: options.readSavedPage,
        loadAttachment,
        journal
      }
      const recovery = await recoverInterruptedMigration(shared)
      if (recovery.outcome === 'waiting' || recovery.outcome === 'failed') return

      const exclude = new Set(readJson(REPORT_KEY, emptyReport()).leftAsIs.map(entry => entry.pageId))
      const plan = planImageMigration(options.getPages(), { openPageId: options.getOpenPageId(), exclude })
      for (const entry of plan) {
        if (blocked()) break
        if (options.syncEnabled && budgetUsed() >= MONTHLY_SYNC_BUDGET_BYTES) break

        const result = await migrateNotePhotos({
          ...shared,
          pageId: entry.pageId,
          storePhoto: (bytes) => storeImageBytes({ bytes, keyBytes: getAttachmentIdKey(), storage: { save: saveAttachment, load: loadAttachment } }),
          shouldStop: blocked
        })

        if (result.outcome === 'moved') {
          if (options.syncEnabled) writeJson(BUDGET_KEY, { month: monthKey(), bytes: budgetUsed() + result.bytes })
          updateReport(current => ({ moved: current.moved + result.photos, bytes: current.bytes + result.bytes }))
        }
        const reason = result.outcome === 'moved' && result.stayedInline > 0 ? 'photo-too-large' : result.reason
        if (LEFT_AS_IS.has(reason) || result.outcome === 'failed') {
          updateReport(current => ({
            leftAsIs: [...current.leftAsIs.filter(item => item.pageId !== entry.pageId), { pageId: entry.pageId, reason, at: Date.now() }]
          }))
        }
        // A failed restore leaves a journal for the next run to recover first.
        if (result.outcome === 'failed') break
        await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_NOTES_MS))
      }
    } catch (err) {
      console.error('[image migration] run stopped', err)
    } finally {
      runningRef.current = false
    }
  }, [enabled, updateReport])

  useEffect(() => {
    if (!enabled) return
    const first = setTimeout(run, FIRST_RUN_DELAY_MS)
    const timer = setInterval(run, RUN_EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [enabled, run])

  return { report, runNow: run }
}
