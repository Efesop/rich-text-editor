/**
 * Dash Sync — React Hook
 *
 * Composes lib/vaultStorage + lib/syncQueue + lib/syncDiff + lib/syncPull
 * into a single hook used by RichTextEditor.
 *
 * Responsibilities:
 *   - Load vault metadata on mount.
 *   - Create the persistent push queue.
 *   - Provide an `enqueueChangedPages(prev, next)` callback that the save
 *     pipeline calls after each successful local save.
 *   - Provide `pull()` and `flush()` for manual sync triggers.
 *   - Expose status for UI ("Syncing", "Synced X min ago", "Offline").
 *
 * The hook does NOT modify usePagesManager directly — instead it sets a
 * global `window.__syncEnqueueChangedPages` callback that usePagesManager
 * checks for. If the callback isn't set, the existing save pipeline runs
 * unchanged (sync stays gated off).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createVaultStore,
  autoSelectBackend,
  safeStorageStoreVaultKey,
  safeStorageRetrieveVaultKey
} from '../lib/vaultStorage.js'
import { createSyncQueue } from '../lib/syncQueue.js'
import { diffPages, snapshotPages, buildManifestPayload } from '../lib/syncDiff.js'
import { pullSince, applyPulledChanges, PullError } from '../lib/syncPull.js'
import { captureVersion } from '../lib/versionStorage.js'

// Persist backend for the queue itself (separate from vault metadata).
function createQueuePersistBackend () {
  if (typeof window === 'undefined') return null
  if (window.electron?.invoke) {
    return {
      async read () { return window.electron.invoke('read-sync-queue') },
      async write (entries) { await window.electron.invoke('save-sync-queue', entries) },
      async clear () { await window.electron.invoke('clear-sync-queue') }
    }
  }
  // PWA path uses mobileStorage. We dynamic-import to avoid pulling it into
  // SSR bundles or Electron tests that don't need it.
  return null // caller can wire mobileStorage backend if needed
}

/**
 * @typedef {Object} SyncStatus
 * @property {boolean} enabled - is sync enabled at all?
 * @property {boolean} unlocked - is vault key in memory?
 * @property {string} stage - 'idle' | 'queued' | 'flushing' | 'rate-limited' | 'paused' | 'error' | 'pulling'
 * @property {number} pendingCount - pushes pending
 * @property {number|null} lastSuccessAt - Date.now() of last successful push or pull
 * @property {string|null} lastError
 * @property {string|null} vaultId
 * @property {string|null} deviceId
 * @property {string|null} deviceName
 * @property {Array} pairedDevices
 */

export function useSyncQueue ({
  pagesRef,         // ref to the latest pages array (from usePagesManager)
  hasInFlightEdit,  // (pageId) => boolean — caller's dirty-page detector
  isAppLocked,      // boolean ref or value — when true, sync is paused
  duressActive,     // boolean ref or value — when true, sync is cleared
  applyRemoteChanges, // (newPages, manifest) => void — caller writes to local state
  relayUrl,         // string — wss://...
  onStatusChange    // (SyncStatus) => void
} = {}) {
  const vaultStoreRef = useRef(null)
  const queueRef = useRef(null)
  const metadataRef = useRef(null) // reactive copy: { vaultId, deviceId, deviceName, syncEnabled, ... }
  const lastSyncedSnapshotRef = useRef([]) // pages array as last seen by sync
  const pullingRef = useRef(false)

  const [status, setStatus] = useState({
    enabled: false,
    unlocked: false,
    stage: 'idle',
    pendingCount: 0,
    lastSuccessAt: null,
    lastError: null,
    vaultId: null,
    deviceId: null,
    deviceName: null,
    pairedDevices: []
  })

  const updateStatus = useCallback((partial) => {
    setStatus(prev => {
      const next = { ...prev, ...partial }
      onStatusChange?.(next)
      return next
    })
  }, [onStatusChange])

  // ── Initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function init () {
      try {
        const backend = autoSelectBackend(/* mobileStorage instance */ null)
        const store = createVaultStore(backend)
        vaultStoreRef.current = store
        const meta = await store.load()
        if (cancelled) return
        metadataRef.current = meta
        updateStatus({
          enabled: meta.syncEnabled,
          unlocked: false,
          vaultId: meta.vaultId,
          deviceId: meta.deviceId,
          deviceName: meta.deviceName,
          pairedDevices: meta.pairedDevices || []
        })
      } catch (err) {
        console.error('useSyncQueue init failed', err)
        updateStatus({ stage: 'error', lastError: err.message })
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Build the credentials provider ─────────────────────────────────────

  const getCredentials = useCallback(async () => {
    const store = vaultStoreRef.current
    const meta = metadataRef.current
    if (!store || !meta || !meta.syncEnabled) {
      throw new Error('sync not enabled')
    }
    if (!store.isUnlocked()) {
      throw new Error('vault locked')
    }
    return {
      vaultKeyBytes: store.getVaultKey(),
      vaultCryptoKey: store.getVaultCryptoKey(),
      vaultId: meta.vaultId,
      deviceId: meta.deviceId,
      relayUrl: meta.relayUrl
    }
  }, [])

  // ── Build the queue ────────────────────────────────────────────────────

  useEffect(() => {
    const persistBackend = createQueuePersistBackend()
    const queue = createSyncQueue({
      getCredentials,
      persistBackend,
      canPush: () => {
        if (typeof isAppLocked === 'function' ? isAppLocked() : isAppLocked) return false
        if (typeof duressActive === 'function' ? duressActive() : duressActive) return false
        return true
      },
      onStateChange: (s) => {
        updateStatus({
          stage: s.status,
          pendingCount: s.pendingCount,
          lastError: s.lastError,
          lastSuccessAt: s.lastSuccessAt
        })
      }
    })
    queueRef.current = queue
    queue.restore?.().catch(() => {})

    return () => {
      queue.dispose?.()
      queueRef.current = null
    }
  }, [getCredentials, isAppLocked, duressActive, updateStatus])

  // ── Public API ─────────────────────────────────────────────────────────

  const enqueueChangedPages = useCallback((prev, next, tags) => {
    const store = vaultStoreRef.current
    const queue = queueRef.current
    const meta = metadataRef.current
    if (!queue || !store || !meta?.syncEnabled || !store.isUnlocked()) return
    const changes = diffPages(prev || lastSyncedSnapshotRef.current, next || pagesRef?.current || [])
    for (const [pageId, page] of changes.notesUpserted) {
      queue.enqueue({
        resourceType: 'note',
        resourceId: pageId,
        payload: page,
        parentVersion: meta.lastSyncedVersion?.[pageId] ?? null
      })
    }
    for (const pageId of changes.notesDeleted) {
      queue.enqueue({
        resourceType: 'tombstone',
        resourceId: pageId,
        payload: { tombstoned: true },
        parentVersion: meta.lastSyncedVersion?.[pageId] ?? null
      })
    }
    for (const [folderId, folder] of changes.foldersUpserted) {
      queue.enqueue({
        resourceType: 'folder',
        resourceId: folderId,
        payload: folder
      })
    }
    if (changes.manifestChanged) {
      queue.enqueue({
        resourceType: 'meta',
        resourceId: 'manifest',
        payload: buildManifestPayload(next || pagesRef?.current || [], tags || [])
      })
    }
    lastSyncedSnapshotRef.current = snapshotPages(next || pagesRef?.current || [])
  }, [pagesRef])

  // Wire the global callback so usePagesManager can hand off changes without
  // taking a hard import dependency on this hook.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__syncEnqueueChangedPages = enqueueChangedPages
    return () => {
      if (window.__syncEnqueueChangedPages === enqueueChangedPages) {
        window.__syncEnqueueChangedPages = null
      }
    }
  }, [enqueueChangedPages])

  const flushNow = useCallback(async () => {
    const queue = queueRef.current
    if (!queue) return
    await queue.flushNow()
  }, [])

  const pull = useCallback(async () => {
    const store = vaultStoreRef.current
    const meta = metadataRef.current
    if (!store || !meta?.syncEnabled || !store.isUnlocked()) return
    if (pullingRef.current) return
    pullingRef.current = true
    updateStatus({ stage: 'pulling' })
    try {
      const creds = await getCredentials()
      const result = await pullSince({
        credentials: creds,
        cursor: meta.cursorVersion || 0,
        limit: 100
      })
      if (result.envelopes.length > 0 || result.manifest) {
        const apply = await applyPulledChanges(
          pagesRef?.current || [],
          result.envelopes,
          {
            hasInFlightEdit,
            captureVersion: async (pageId, blocks) => {
              try { await captureVersion(pageId, blocks) } catch { /* non-fatal */ }
            }
          }
        )
        applyRemoteChanges?.(apply.newPages, apply.manifest)
      }
      // Persist new cursor + per-page versions
      const newMeta = {
        ...meta,
        cursorVersion: result.cursorAfter,
        lastSyncedVersion: { ...(meta.lastSyncedVersion || {}) }
      }
      // (Per-resource version tracking happens in syncQueue ack handling
      // for pushes; for pulls, we just bump the cursor.)
      metadataRef.current = newMeta
      await store.save(newMeta)
      updateStatus({ stage: 'idle', lastSuccessAt: Date.now(), lastError: null })
      // If hasMore, recurse
      if (result.hasMore) {
        pullingRef.current = false
        return pull()
      }
    } catch (err) {
      const msg = err instanceof PullError
        ? `pull ${err.code}${err.status ? ` (HTTP ${err.status})` : ''}`
        : `pull failed: ${err.message}`
      updateStatus({ stage: 'error', lastError: msg })
    } finally {
      pullingRef.current = false
    }
  }, [getCredentials, hasInFlightEdit, applyRemoteChanges, pagesRef, updateStatus])

  // ── Settings actions (called from SyncSettingsPanel) ───────────────────

  const enableSync = useCallback(async ({ deviceName, wrapMethod, appLockKey, passphrase }) => {
    const store = vaultStoreRef.current
    if (!store) throw new Error('store not initialized')
    const isElectron = typeof window !== 'undefined' && !!window.electron?.invoke
    const opts = { deviceName, relayUrl, wrapMethod }
    if (wrapMethod === 'app-lock') opts.appLockKey = appLockKey
    if (wrapMethod === 'passphrase') opts.passphrase = passphrase
    if (wrapMethod === 'safe-storage') {
      if (!isElectron) throw new Error("'safe-storage' wrap method requires Electron")
      opts.safeStorageStore = safeStorageStoreVaultKey
    }
    const { metadata } = await store.createVault(opts)
    await store.save(metadata)
    metadataRef.current = metadata
    updateStatus({
      enabled: true,
      unlocked: true,
      vaultId: metadata.vaultId,
      deviceId: metadata.deviceId,
      deviceName: metadata.deviceName,
      pairedDevices: []
    })
    return metadata
  }, [relayUrl, updateStatus])

  const disableSync = useCallback(async () => {
    const store = vaultStoreRef.current
    if (!store) return
    const queue = queueRef.current
    queue?.clear()
    await store.disableSync()
    metadataRef.current = null
    lastSyncedSnapshotRef.current = []
    updateStatus({
      enabled: false,
      unlocked: false,
      stage: 'idle',
      pendingCount: 0,
      vaultId: null,
      deviceId: null,
      deviceName: null,
      pairedDevices: []
    })
  }, [updateStatus])

  const unlockVault = useCallback(async (cred) => {
    const store = vaultStoreRef.current
    const meta = metadataRef.current
    if (!store || !meta?.syncEnabled) throw new Error('sync not enabled')
    if (meta.keyWrapMethod === 'safe-storage') {
      cred.safeStorageRetrieve = safeStorageRetrieveVaultKey
    }
    await store.unlock(meta, cred)
    updateStatus({ unlocked: true, lastError: null })
  }, [updateStatus])

  const lockVault = useCallback(() => {
    const store = vaultStoreRef.current
    if (!store) return
    store.lock()
    queueRef.current?.pause()
    updateStatus({ unlocked: false, stage: 'paused' })
  }, [updateStatus])

  // ── Hook into duress entry — clear queue + lock ────────────────────────

  useEffect(() => {
    const flag = typeof duressActive === 'function' ? duressActive() : duressActive
    if (flag) {
      queueRef.current?.clear()
      vaultStoreRef.current?.lock()
      updateStatus({ unlocked: false, pendingCount: 0, stage: 'paused' })
    }
  }, [duressActive, updateStatus])

  return {
    status,
    enqueueChangedPages,
    flushNow,
    pull,
    enableSync,
    disableSync,
    unlockVault,
    lockVault,
    metadata: metadataRef.current,
    isUnlocked: () => vaultStoreRef.current?.isUnlocked() ?? false
  }
}
