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
import {
  pushAttachment as syncPushAttachment,
  pullAttachment as syncPullAttachment,
  extractAttachmentIds,
  newAttachmentIds
} from '../lib/syncAttachments.js'

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
  // Phase 2.6: track attachments we've pushed/pulled in this session to
  // avoid redundant network calls for attachments we know are already at
  // the server / already cached locally. Server is content-addressed so
  // this is just a cost optimization, not a correctness requirement.
  const pushedAttachmentsRef = useRef(new Set())
  const pulledAttachmentsRef = useRef(new Set())

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
    const baseline = prev || lastSyncedSnapshotRef.current
    const target = next || pagesRef?.current || []
    const changes = diffPages(baseline, target)
    for (const [pageId, page] of changes.notesUpserted) {
      queue.enqueue({
        resourceType: 'note',
        resourceId: pageId,
        payload: page,
        parentVersion: meta.lastSyncedVersion?.[pageId] ?? null
      })
      // Phase 2.6: push any attachments newly referenced by this page.
      // Fire-and-forget background tasks — note envelope can land before
      // attachments arrive at server; recipient devices lazy-pull on
      // first view.
      try {
        const baselinePage = (baseline || []).find(p => p.id === pageId) || null
        const newIds = newAttachmentIds(baselinePage, page)
        for (const attId of newIds) {
          if (pushedAttachmentsRef.current.has(attId)) continue
          pushedAttachmentsRef.current.add(attId) // optimistic mark
          pushAttachmentInBackground(attId).catch(() => {
            // On failure, allow retry on next save
            pushedAttachmentsRef.current.delete(attId)
          })
        }
      } catch (err) {
        console.error('useSyncQueue: attachment scan failed', err)
      }
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
        payload: buildManifestPayload(target, tags || [])
      })
    }
    lastSyncedSnapshotRef.current = snapshotPages(target)
  }, [pagesRef])

  // ── Attachment push (Phase 2.6) — fire-and-forget background helper ──
  // Reads bytes from the local attachment store, pushes to relay. No retry
  // here (server is idempotent — if it fails we'll re-attempt on the next
  // save that touches the page).
  const pushAttachmentInBackground = useCallback(async (attachmentId) => {
    const meta = metadataRef.current
    const store = vaultStoreRef.current
    if (!meta?.syncEnabled || !store?.isUnlocked()) return
    const creds = await getCredentials().catch(() => null)
    if (!creds) return
    const { loadAttachment } = await import('../lib/attachmentStorage.js')
    const data = await loadAttachment(attachmentId)
    if (!data) {
      console.warn('useSyncQueue: attachment not found locally', attachmentId)
      return
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
      : (data instanceof Uint8Array ? data : new Uint8Array(data))
    const result = await syncPushAttachment({
      attachmentId,
      bytes,
      credentials: creds
    })
    if (!result.ok) {
      console.warn('useSyncQueue: pushAttachment failed', attachmentId, result.errorCode)
      throw new Error(result.errorCode || 'push failed')
    }
  }, [getCredentials])

  // Pull missing attachments after applying pulled note envelopes.
  const pullMissingAttachments = useCallback(async (appliedPages) => {
    if (!appliedPages || appliedPages.length === 0) return
    const meta = metadataRef.current
    const store = vaultStoreRef.current
    if (!meta?.syncEnabled || !store?.isUnlocked()) return
    const creds = await getCredentials().catch(() => null)
    if (!creds) return
    const { loadAttachment, saveAttachment } = await import('../lib/attachmentStorage.js')
    const seen = new Set()
    for (const page of appliedPages) {
      const ids = extractAttachmentIds(page)
      for (const attId of ids) {
        if (seen.has(attId)) continue
        seen.add(attId)
        if (pulledAttachmentsRef.current.has(attId)) continue
        // Check local cache first
        const local = await loadAttachment(attId).catch(() => null)
        if (local) {
          pulledAttachmentsRef.current.add(attId)
          continue
        }
        // Fetch from server
        const result = await syncPullAttachment({ attachmentId: attId, credentials: creds })
        if (result.ok && result.bytes) {
          try {
            await saveAttachment(attId, result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength))
            pulledAttachmentsRef.current.add(attId)
          } catch (err) {
            console.error('useSyncQueue: failed to write pulled attachment', attId, err)
          }
        } else {
          console.warn('useSyncQueue: pullAttachment failed', attId, result.errorCode)
        }
      }
    }
  }, [getCredentials])

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
        // Phase 2.6: lazy-pull attachments referenced by newly-applied
        // pages but missing from local store. Fire-and-forget.
        const appliedPagesData = apply.applied
          .map(id => apply.newPages.find(p => p.id === id))
          .filter(Boolean)
        pullMissingAttachments(appliedPagesData).catch(err => {
          console.error('useSyncQueue: pullMissingAttachments failed', err)
        })
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

  /**
   * Build a vault packet suitable for QR-pair onboarding. Encapsulates raw
   * vault-key access — caller never sees the bytes directly. Returns null if
   * the vault is locked or sync isn't enabled.
   *
   * @returns {object|null} { vaultId, vaultKey: number[], relayUrl, pairedDevices }
   */
  const getVaultPacketForPairing = useCallback(() => {
    const store = vaultStoreRef.current
    const meta = metadataRef.current
    if (!store || !store.isUnlocked() || !meta?.syncEnabled) return null
    const raw = store.getVaultKey()
    if (!(raw instanceof Uint8Array) || raw.length !== 32) return null
    return {
      vaultId: meta.vaultId,
      vaultKey: Array.from(raw),
      relayUrl: meta.relayUrl,
      pairedDevices: meta.pairedDevices || []
    }
  }, [])

  return {
    status,
    enqueueChangedPages,
    flushNow,
    pull,
    enableSync,
    disableSync,
    unlockVault,
    lockVault,
    getVaultPacketForPairing,
    metadata: metadataRef.current,
    isUnlocked: () => vaultStoreRef.current?.isUnlocked() ?? false
  }
}
