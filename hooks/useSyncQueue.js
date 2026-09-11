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
  safeStorageRetrieveVaultKey,
  iosKeychainStoreVaultKey,
  iosKeychainRetrieveVaultKey
} from '../lib/vaultStorage.js'
import { createSyncQueue } from '../lib/syncQueue.js'
import { isSameRelay, resolveRelayUrl, compatRelayUrl, toHttpUrl, relaySupportsWebSocket } from '../lib/relayHosts.js'
import { diffPages, snapshotPages, buildManifestPayload } from '../lib/syncDiff.js'
import { importInProgress } from '../lib/import/lock.js'
import { pullSince, applyPulledChanges, PullError } from '../lib/syncPull.js'
import { makeIsHardDeleted } from '../lib/hardDeletes.js'
import mobileStorage from '../lib/mobileStorage.js'
import { captureVersion } from '../lib/versionStorage.js'
import {
  pushAttachment as syncPushAttachment,
  pullAttachment as syncPullAttachment,
  attachmentsExist as syncAttachmentsExist,
  extractAttachmentIds,
  newAttachmentIds
} from '../lib/syncAttachments.js'
import { createAttachmentTransferQueue } from '../lib/attachmentTransferQueue.js'
import { fetchVersionList, fetchVersion } from '../lib/syncVersions.js'
import { getEntitlementIds } from '../lib/entitlementId.js'
import { buildSyncHeaders, generateAuthProof } from '../lib/syncAuth.js'
import { setAttachmentIdVaultKey } from '../lib/attachmentIdKey.js'
import useTagStore from '../store/tagStore'
import packageJson from '../package.json'

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
  // PWA / browser / Capacitor: persist via mobileStorage IDB syncQueue store.
  return {
    async read () { return mobileStorage.readSyncQueue() },
    async write (entries) { await mobileStorage.saveSyncQueue(entries) },
    async clear () { await mobileStorage.clearSyncQueue() }
  }
}

// Persist backend for attachment transfers: IndexedDB on every platform
// (Electron's renderer has it too), beside the push queue.
function createTransferPersistBackend () {
  if (typeof window === 'undefined') return null
  return {
    read: () => mobileStorage.readAttachmentTransfers(),
    write: (state) => mobileStorage.saveAttachmentTransfers(state)
  }
}

// Notes the relay refused as too large to ever store. Kept on this device so
// Sync settings can list them until they sync.
const OVERSIZE_NOTES_KEY = 'dash:sync:oversize-notes'
function readOversizeNotes () {
  try {
    const list = JSON.parse(localStorage.getItem(OVERSIZE_NOTES_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function writeOversizeNotes (list) {
  try { localStorage.setItem(OVERSIZE_NOTES_KEY, JSON.stringify(list)) } catch { /* unavailable */ }
}

const APP_VERSION = packageJson.version

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
 * @property {object|null} transfers - attachment transfer summary
 * @property {Array} oversizeNotes - notes the relay refused as too large to store
 */

export function useSyncQueue ({
  pagesRef,         // ref to the latest pages array (from usePagesManager)
  getLatestPages,   // () => the pages right now (usePagesManager's pagesRef)
  arePagesLoaded,   // () => false until usePagesManager has read the pages
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
  // Phase 2.6: attachment bytes move through a durable transfer queue.
  const transferQueueRef = useRef(null)
  // Latest known vault usage, so photo uploads leave room for notes.
  const usageRef = useRef(null)
  const oversizeNotesRef = useRef(typeof window !== 'undefined' ? readOversizeNotes() : [])
  const getLatestPagesRef = useRef(getLatestPages)
  getLatestPagesRef.current = getLatestPages
  const arePagesLoadedRef = useRef(arePagesLoaded)
  arePagesLoadedRef.current = arePagesLoaded
  const sessionStartedRef = useRef(false)
  // Phase 2.10c: refs to functions defined later in the hook body — used
  // by adoptVault (declared earlier) without taking them as deps (which
  // would TDZ at the useCallback site). Same render → same closure.
  const initialPullRef = useRef(null)
  const authenticatedRequestRef = useRef(null)
  const enqueueChangedPagesRef = useRef(null)

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
    pairedDevices: [],
    transfers: null,
    oversizeNotes: oversizeNotesRef.current
  })

  const updateStatus = useCallback((partial) => {
    setStatus(prev => {
      const next = { ...prev, ...partial }
      onStatusChange?.(next)
      return next
    })
  }, [onStatusChange])

  // The pages right now. usePagesManager's ref is fresher than the React
  // state RichTextEditor mirrors into pagesRef.
  const latestPages = useCallback(() => {
    const fresh = typeof getLatestPagesRef.current === 'function' ? getLatestPagesRef.current() : null
    return Array.isArray(fresh) ? fresh : (pagesRef?.current || [])
  }, [pagesRef])

  // ── Initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function init () {
      try {
        // Pass mobileStorage so PWA / Capacitor / browser uses IndexedDB
        // (vaultMetadata + syncQueue stores). Without this, vault metadata
        // lives in memory and is wiped on reload.
        const backend = autoSelectBackend(mobileStorage)
        const store = createVaultStore(backend)
        vaultStoreRef.current = store
        let meta = await store.load()
        if (cancelled) return
        // Stale-relay guard: if the saved vault metadata points at a
        // different relay than the current env (e.g. user switched from
        // prod to local for testing, or vice versa), the vault's HMAC
        // creds were registered at the old relay — talking to the new
        // one returns 401. Clear and require fresh setup.
        // Public relay aliases (sync.dashnote.io ↔ dash-relay.efesop.deno.net)
        // are the same server and must NOT trip this guard — see relayHosts.js.
        if (meta.syncEnabled && meta.relayUrl && relayUrl && !isSameRelay(meta.relayUrl, relayUrl)) {
          console.warn('useSyncQueue: relayUrl mismatch — clearing stale vault metadata',
            { stored: meta.relayUrl, current: relayUrl })
          await store.disableSync()
          meta = await store.load()
        }
        metadataRef.current = meta
        let unlocked = false
        // Auto-unlock when the vault key is wrapped under the OS keychain
        // (safe-storage). No user prompt needed — Electron's safeStorage
        // unwrap is a synchronous native call. Required after each app
        // start (and after Fast Refresh in dev), otherwise the queue's
        // canPush check sees `unlocked: false` and silently drops every
        // enqueue.
        if (meta.syncEnabled && meta.keyWrapMethod === 'safe-storage') {
          try {
            await store.unlock(meta, { safeStorageRetrieve: safeStorageRetrieveVaultKey })
            unlocked = store.isUnlocked()
          } catch (err) {
            console.warn('useSyncQueue: auto-unlock failed', err)
          }
        } else if (meta.syncEnabled && meta.keyWrapMethod === 'ios-keychain') {
          // iOS Capacitor: vault key is in iOS Keychain. Auto-unwrap
          // silently — no Face ID prompt at this layer (the Keychain
          // item is accessible after first device unlock; biometric
          // gating can be layered at the app-lock level).
          try {
            await store.unlock(meta, { iosKeychainRetrieve: iosKeychainRetrieveVaultKey })
            unlocked = store.isUnlocked()
          } catch (err) {
            console.warn('useSyncQueue: ios-keychain auto-unlock failed', err)
          }
        }
        updateStatus({
          enabled: meta.syncEnabled,
          unlocked,
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
      // Whichever public alias answers right now (cached per session); the
      // STORED relayUrl stays the legacy name for older clients.
      relayUrl: await resolveRelayUrl(meta.relayUrl)
    }
  }, [])

  // ── Build the queue ────────────────────────────────────────────────────

  // Stash the latest gate callbacks in refs so the queue can read them
  // without being part of the queue's effect deps. Caller passes inline
  // arrows like `() => appLock.isLocked` — a new function identity every
  // render. If we made the queue effect depend on them directly it would
  // tear the queue down + rebuild on every parent render, clearing any
  // in-flight 2s flush debounce timer before it could fire — push never
  // happens. (This was the exact symptom we hit.)
  const isAppLockedRef = useRef(isAppLocked)
  const duressActiveRef = useRef(duressActive)
  useEffect(() => { isAppLockedRef.current = isAppLocked }, [isAppLocked])
  useEffect(() => { duressActiveRef.current = duressActive }, [duressActive])

  useEffect(() => {
    const persistBackend = createQueuePersistBackend()
    const queue = createSyncQueue({
      getCredentials,
      persistBackend,
      // Entries past the queue's payload budget are pushed from the pages as
      // they are at push time.
      resolvePayload: (resourceType, resourceId) => {
        if (resourceType === 'tombstone') return { tombstoned: true }
        const pages = latestPages()
        // Pages not loaded yet: wait, rather than conclude the page is gone.
        if (pages.length === 0) return undefined
        if (resourceType === 'meta') {
          return resourceId === 'manifest' ? buildManifestPayload(pages, useTagStore.getState().tags || []) : undefined
        }
        const page = pages.find(p => p && p.id === resourceId)
        if (!page) return null
        // Same rule as enqueueChangedPages: peers can't read app-lock ciphertext.
        if (page.appLockEncrypted === true && (!page.content || !Array.isArray(page.content?.blocks))) return undefined
        return page
      },
      onDrop: ({ resourceType, resourceId, reason }) => {
        if (resourceType !== 'note') return
        const next = [...oversizeNotesRef.current.filter(n => n.resourceId !== resourceId), { resourceId, reason, at: Date.now() }]
        oversizeNotesRef.current = next
        writeOversizeNotes(next)
        updateStatus({ oversizeNotes: next })
      },
      onPushed: ({ resourceType, resourceId }) => {
        if (resourceType !== 'note' || !oversizeNotesRef.current.some(n => n.resourceId === resourceId)) return
        const next = oversizeNotesRef.current.filter(n => n.resourceId !== resourceId)
        oversizeNotesRef.current = next
        writeOversizeNotes(next)
        updateStatus({ oversizeNotes: next })
      },
      canPush: () => {
        const al = isAppLockedRef.current
        const da = duressActiveRef.current
        if (typeof al === 'function' ? al() : al) return false
        if (typeof da === 'function' ? da() : da) return false
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
    // Intentionally exclude isAppLocked/duressActive — read via refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCredentials, updateStatus, latestPages])

  // ── Attachment transfers (Phase 2.6) ───────────────────────────────────

  useEffect(() => {
    const storage = () => import('../lib/attachmentStorage.js')
    const transfers = createAttachmentTransferQueue({
      relay: {
        upload: async (attachmentId, bytes) => syncPushAttachment({ attachmentId, bytes, credentials: await getCredentials() }),
        download: async (attachmentId) => syncPullAttachment({ attachmentId, credentials: await getCredentials() }),
        exists: async (ids) => syncAttachmentsExist({ ids, credentials: await getCredentials() })
      },
      store: {
        load: async (id) => (await storage()).loadAttachment(id),
        save: async (id, bytes) => {
          const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          await (await storage()).saveAttachment(id, buffer)
        },
        has: async (id) => (await storage()).hasAttachment(id)
      },
      persist: createTransferPersistBackend(),
      getUsage: () => usageRef.current,
      canRun: () => {
        const store = vaultStoreRef.current
        if (!store || !metadataRef.current?.syncEnabled || !store.isUnlocked()) return false
        const al = isAppLockedRef.current
        const da = duressActiveRef.current
        if (typeof al === 'function' ? al() : al) return false
        if (typeof da === 'function' ? da() : da) return false
        return true
      },
      onChange: (summary) => updateStatus({ transfers: summary })
    })
    transferQueueRef.current = transfers
    transfers.restore().catch(() => {})
    return () => {
      transfers.dispose()
      transferQueueRef.current = null
    }
    // Intentionally exclude isAppLocked/duressActive — read via refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCredentials, updateStatus])

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
      // Refuse to push app-lock-encrypted pages whose content is
      // null. The encryptedContent blob is wrapped under THIS device's
      // app-lock key — peers have no way to decrypt. Pre-fix Mac
      // would enqueue the encrypted form before the user unlocked
      // app-lock, then flush after unlock → iPhone pulled ciphertext
      // it couldn't read → editor showed blank pages. Skip; once the
      // page is decrypted locally (decryptAllAppLockPages), pagesRef
      // gets plaintext and a fresh executeSave re-fires this enqueue
      // path with content present.
      if (page?.appLockEncrypted === true && (!page.content || !Array.isArray(page.content?.blocks))) {
        console.warn('[sync] skipping push of app-lock-encrypted page with no plaintext', pageId)
        continue
      }
      queue.enqueue({
        resourceType: 'note',
        resourceId: pageId,
        payload: page,
        parentVersion: meta.lastSyncedVersion?.[pageId] ?? null
      })
      // Phase 2.6: upload attachments this page newly references. The
      // transfer queue retries until each one lands; the note envelope can
      // arrive first, and other devices download on their side.
      try {
        const baselinePage = (baseline || []).find(p => p.id === pageId) || null
        const newIds = newAttachmentIds(baselinePage, page)
        if (newIds.length > 0) transferQueueRef.current?.enqueueUpload(newIds)
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
  // Stash for use by enableSync/adoptVault initial-push without taking
  // enqueueChangedPages as a useCallback dep (TDZ — defined later in hook
  // body relative to those callbacks via the ref).
  enqueueChangedPagesRef.current = enqueueChangedPages

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
    // Never apply a pull before the local pages have loaded: the empty list
    // would be taken as this device's pages, and the save that follows would
    // replace them on disk. The next pull (focus, doorbell, timer) catches up.
    if (typeof arePagesLoadedRef.current === 'function' && !arePagesLoadedRef.current()) return
    // An import is adding notes: pull once it has saved them
    if (importInProgress()) return
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
        // Snapshot the hard-delete tombstones once per pull (cheap
        // localStorage read) so applyPulledChanges can drop incoming
        // alive-envelopes for ids we permanently deleted on this
        // device — protects against the peer-resurrect race.
        const isHardDeleted = makeIsHardDeleted()
        const base = latestPages()
        const apply = await applyPulledChanges(
          base,
          result.envelopes,
          {
            hasInFlightEdit,
            isHardDeleted,
            captureVersion: async (pageId, blocks) => {
              try { await captureVersion(pageId, blocks) } catch { /* non-fatal */ }
            }
          }
        )
        // The caller rebases onto the pages as they are now: anything changed
        // locally while this pull ran is missing from apply.newPages.
        applyRemoteChanges?.(apply.newPages, apply.manifest, {
          base,
          changedIds: [...apply.applied, ...apply.deleted]
        })
        // Phase 2.6: download attachments the applied pages reference and
        // this device lacks. The transfer queue skips ones already here.
        const referenced = new Set()
        const appliedIds = new Set(apply.applied)
        for (const page of apply.newPages) {
          if (appliedIds.has(page.id)) extractAttachmentIds(page).forEach(id => referenced.add(id))
        }
        if (referenced.size > 0) transferQueueRef.current?.enqueueDownload([...referenced])
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
  }, [getCredentials, hasInFlightEdit, applyRemoteChanges, latestPages, updateStatus])

  // Keep the ref aligned so adoptVault (defined earlier) can call pull()
  // after registration without taking it as a dep (which would TDZ).
  initialPullRef.current = pull

  // Periodic pull + focus-based pull. Without this, a device only pulls
  // once at pair time and never sees subsequent pushes from peers.
  // Also triggers an immediate flush of the push queue when the app
  // backgrounds — `lib/syncQueue.enqueue` schedules persist as
  // fire-and-forget (`persist().catch(() => {})`), so on iOS Capacitor
  // a quit-within-debounce window (default 600 ms) would lose envelopes
  // that the user just produced (most visible: a sidebar reorder you
  // make then immediately quit). Flushing on `visibilitychange` to
  // hidden ships them to the server before iOS suspends the WebView.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const tryPull = () => {
      if (cancelled) return
      const store = vaultStoreRef.current
      const meta = metadataRef.current
      if (!store || !meta?.syncEnabled || !store.isUnlocked()) return
      pull().catch(err => console.warn('[sync] pull threw (suppressed)', err))
      // Also a chance for attachment transfers that were waiting to start.
      transferQueueRef.current?.kick()
    }
    const flushPending = () => {
      // Order matters: flush LOCAL save debounce (150 ms in
      // `usePagesManager.savePagesToStorage`) FIRST so the latest
      // pagesRef state hits IndexedDB. THEN flush the sync queue —
      // otherwise a freshly-trashed page might miss its tombstone push
      // because the local save hasn't run yet so `enqueueChangedPages`
      // never saw the trashed=true delta. Both operations are
      // fire-and-forget across iOS's suspend boundary, but starting them
      // ASAP gives in-flight IndexedDB / fetch handles a better chance
      // of landing before the runtime freezes.
      try {
        const flushSaves = typeof window !== 'undefined' ? window.__dashFlushSaves : null
        if (typeof flushSaves === 'function') {
          // Awaiting isn't reliable across suspend; just kick it.
          Promise.resolve(flushSaves()).catch(() => {})
        }
      } catch { /* */ }
      const queue = queueRef.current
      const store = vaultStoreRef.current
      const meta = metadataRef.current
      if (!queue || !store || !meta?.syncEnabled || !store.isUnlocked()) return
      try { queue.flushNow().catch(() => {}) } catch { /* */ }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushPending()
      } else {
        tryPull()
      }
    }
    const onFocus = () => tryPull()
    // Polling interval bumped 10s → 60s. WS doorbell handles
    // sub-second propagation when peers actively edit; the periodic
    // pull is a fallback for missed doorbells (e.g. transient network
    // partitions). On Deno Deploy Free tier the 10s cadence chewed
    // through the daily KV-read quota — user hit a 75% usage alert
    // with only one synced device pair. 60s is a reasonable floor
    // (focus + visibilitychange + appStateChange:isActive listeners
    // already cover the "user came back" case more responsively).
    const interval = setInterval(tryPull, 60000)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', flushPending)
    window.addEventListener('beforeunload', flushPending)
    document.addEventListener('visibilitychange', onVisibility)

    // Capacitor App lifecycle — `appStateChange` fires reliably on iOS
    // foreground/background transitions, whereas `visibilitychange` in
    // WKWebView can be flaky depending on iOS version and how the user
    // dismissed (swipe-up vs Home button). Belt-and-braces: register
    // both. Plugin call is dynamic-import to avoid a hard dep on
    // Capacitor in browser/Electron builds.
    let appListenerHandle = null
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      ;(async () => {
        try {
          const { App } = await import('@capacitor/app')
          appListenerHandle = await App.addListener('appStateChange', (state) => {
            if (state.isActive) tryPull()
            else flushPending()
          })
        } catch (err) {
          console.warn('[sync] @capacitor/app appStateChange listener failed', err)
        }
      })()
    }

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', flushPending)
      window.removeEventListener('beforeunload', flushPending)
      document.removeEventListener('visibilitychange', onVisibility)
      if (appListenerHandle) {
        try { appListenerHandle.remove() } catch { /* */ }
      }
    }
  }, [pull])

  // ── Session start: report the app version, learn usage, reconcile attachments ──

  const refreshUsage = useCallback(async () => {
    const ar = authenticatedRequestRef.current
    if (!ar) return null
    try {
      const index = await ar('GET', '/sync/vault/index')
      if (index && typeof index.totalBytes === 'number') {
        usageRef.current = { totalBytes: index.totalBytes }
        // Held photo uploads may fit now.
        transferQueueRef.current?.refresh()
      }
      return index
    } catch (err) {
      console.warn('[sync] vault usage refresh failed', err?.message || err)
      return null
    }
  }, [])

  // Tell the relay which app version this device runs, so a newer device can
  // tell when every device understands newer data. Re-registering an existing
  // device is idempotent.
  const reportAppVersion = useCallback(async () => {
    const meta = metadataRef.current
    const ar = authenticatedRequestRef.current
    if (!meta?.vaultId || !meta?.deviceId || !ar) return
    try {
      await ar('POST', '/sync/vault/register', {
        vaultId: meta.vaultId,
        deviceId: meta.deviceId,
        ...(meta.deviceName ? { deviceName: meta.deviceName } : {}),
        appVersion: APP_VERSION
      })
    } catch (err) {
      console.warn('[sync] app version report failed', err?.message || err)
    }
  }, [])

  // Queue downloads for attachments the pages reference and this device
  // lacks, and uploads for the ones the relay lacks.
  const reconcileAttachments = useCallback(async () => {
    const transfers = transferQueueRef.current
    const pages = latestPages()
    if (!transfers || pages.length === 0) return false
    const ids = new Set()
    for (const page of pages) extractAttachmentIds(page).forEach(id => ids.add(id))
    await transfers.reconcile([...ids])
    return true
  }, [latestPages])

  useEffect(() => {
    if (!status.enabled || !status.unlocked) {
      sessionStartedRef.current = false
      // Photos added now get ids from this device's own key.
      setAttachmentIdVaultKey(null)
      return
    }
    if (sessionStartedRef.current) return
    sessionStartedRef.current = true
    let cancelled = false
    ;(async () => {
      // Paired devices give the same photo the same attachment id.
      try {
        await setAttachmentIdVaultKey((await getCredentials()).vaultKeyBytes)
      } catch (err) {
        console.warn('[sync] photo id key unavailable', err)
      }
      await reportAppVersion()
      await refreshUsage()
      // Pages may still be loading on a cold start; try again for a minute.
      for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
        if (await reconcileAttachments()) break
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    })().catch(err => console.warn('[sync] session start failed', err))
    // While photos wait to upload, keep usage current so held ones start
    // once there is room.
    const usageTimer = setInterval(() => {
      const transfers = transferQueueRef.current?.summary()
      if (transfers && transfers.uploads > 0) refreshUsage()
    }, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(usageTimer)
    }
  }, [status.enabled, status.unlocked, getCredentials, reportAppVersion, refreshUsage, reconcileAttachments])

  // WebSocket doorbell — server pushes 'new-version' events when peers
  // commit new data. Triggers an immediate pull instead of waiting up to
  // 10s for the polling interval.
  //
  // CRITICAL: the effect deps must NOT include `status` fields. Those
  // change on every push/pull (stage transitions), each causing a cleanup +
  // re-run. The browser caps simultaneous WS handshakes (we hit
  // "Insufficient resources" with ~50/sec). Connect once on mount, poll
  // for readiness via refs, debounce reconnects through one persistent
  // backoff timer.
  const pullRef = useRef(pull)
  useEffect(() => { pullRef.current = pull }, [pull])
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    let socket = null
    let reconnectTimer = null
    let backoff = 2000

    const scheduleReconnect = (delay) => {
      if (cancelled) return
      if (reconnectTimer) return // already armed
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const connect = async () => {
      if (cancelled) return
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return // already up
      }
      const store = vaultStoreRef.current
      const meta = metadataRef.current
      if (!store || !meta?.syncEnabled || !store.isUnlocked()) {
        // Vault not ready yet — wait, then retry. Don't ratchet backoff
        // here; the polling cadence is fine while we wait for unlock.
        scheduleReconnect(5000)
        return
      }
      let creds
      try {
        creds = await getCredentials()
      } catch {
        scheduleReconnect(5000)
        return
      }
      if (!relaySupportsWebSocket(creds.relayUrl)) {
        // HTTPS-only proxy alias (see relayHosts.js): no doorbell here. The
        // periodic + foreground pulls carry sync; re-check each minute in case
        // the resolver moves back to a direct name.
        scheduleReconnect(60000)
        return
      }
      const wsUrl = creds.relayUrl.replace(/^https?:\/\//, m => m === 'https://' ? 'wss://' : 'ws://')
      const path = `/sync/ws/${encodeURIComponent(creds.vaultId)}`
      const timestamp = Date.now()
      const auth = await generateAuthProof(creds.vaultKeyBytes, {
        vaultId: creds.vaultId,
        deviceId: creds.deviceId,
        timestamp,
        method: 'GET',
        path
      })
      const url = `${wsUrl}${path}?v=${encodeURIComponent(creds.vaultId)}&d=${encodeURIComponent(creds.deviceId)}&t=${timestamp}&a=${encodeURIComponent(auth)}`
      let s
      try {
        s = new WebSocket(url)
      } catch (err) {
        console.warn('useSyncQueue: WS construct failed', err)
        scheduleReconnect(backoff)
        backoff = Math.min(backoff * 2, 60000)
        return
      }
      socket = s
      // Heartbeat — Deno Deploy idle-closes WS after a few minutes of
      // silence. Without a keepalive, the doorbell channel dies in the
      // background and the device falls back to the 10s polling tier;
      // peers feel like sync stopped working. Send a tiny `ping` every
      // 25s — server doesn't need to handle it (the catch-on-parse clause
      // above ignores non-JSON / unknown messages identically on both
      // sides).
      let heartbeatTimer = null
      s.addEventListener('open', () => {
        backoff = 2000
        heartbeatTimer = setInterval(() => {
          if (s.readyState !== WebSocket.OPEN) return
          try { s.send('ping') } catch { /* will surface via close */ }
        }, 25000)
      })
      s.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'new-version') {
            pullRef.current?.().catch(err => console.warn('[sync] doorbell pull threw', err))
          }
        } catch { /* ignore non-JSON pings */ }
      })
      s.addEventListener('close', () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
        if (socket === s) socket = null
        if (cancelled) return
        // Reset backoff on planned-looking closes so a transient network
        // blip doesn't push us into the 60s cool-down. The exponential
        // ratchet still applies to subsequent failures.
        scheduleReconnect(backoff)
        backoff = Math.min(backoff * 2, 60000)
      })
      s.addEventListener('error', () => {
        try { s.close() } catch { /* */ }
      })
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      const s = socket; socket = null
      try { s?.close() } catch { /* */ }
    }
    // Mount-once. relayUrl + getCredentials are stable across the hook's
    // life; status churn must NOT re-run this effect (caused a connection
    // storm previously).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Settings actions (called from SyncSettingsPanel) ───────────────────

  // (Functions below — keep refs in sync for ones referenced earlier.)

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
    if (wrapMethod === 'ios-keychain') {
      opts.iosKeychainStore = iosKeychainStoreVaultKey
    }
    const { metadata } = await store.createVault(opts)
    await store.save(metadata)
    metadataRef.current = metadata
    // Fresh vault → reset diff baselines so the FIRST save pushes ALL
    // existing notes into the new vault. Without this, a stale baseline
    // from a previous vault makes diff return zero changes → notes sit
    // on this device only.
    lastSyncedSnapshotRef.current = []
    if (typeof window !== 'undefined') window.__syncLastSnapshot = null
    // Register vault + this device on the relay. MUST succeed — without
    // server-side registration the device's auth proofs return 401 and
    // sync is silently broken. On failure, roll back local metadata so
    // the user sees the disabled state + an error toast and can retry.
    try {
      const ar = authenticatedRequestRef.current
      if (!ar) throw new Error('authenticated request unavailable')
      const entIds = await getEntitlementIds()
      await ar('POST', '/sync/vault/register', {
        vaultId: metadata.vaultId,
        deviceId: metadata.deviceId,
        deviceName: metadata.deviceName,
        appVersion: APP_VERSION,
        ...entIds
      })
    } catch (err) {
      console.error('enableSync: vault register failed', err)
      // Rollback: clear local metadata + restore disabled state. Caller
      // (RichTextEditor) catches and surfaces a toast.
      try { await store.disableSync() } catch { /* ignore secondary fail */ }
      metadataRef.current = null
      updateStatus({
        enabled: false,
        unlocked: false,
        stage: 'error',
        lastError: 'vault register failed: ' + (err.message || err.code || 'unknown'),
        vaultId: null,
        deviceId: null,
        deviceName: null,
        pairedDevices: []
      })
      throw err
    }
    updateStatus({
      enabled: true,
      unlocked: true,
      vaultId: metadata.vaultId,
      deviceId: metadata.deviceId,
      deviceName: metadata.deviceName,
      pairedDevices: []
    })
    // Initial push: enqueue all existing pages immediately so the user
    // doesn't have to type a character to trigger first sync. Diff vs
    // empty baseline = every page becomes an upsert. Pass current tags
    // so the manifest payload carries their colors.
    try {
      const currentPages = pagesRef?.current || []
      if (currentPages.length > 0) {
        const currentTags = useTagStore.getState().tags || []
        // Defer one tick so updateStatus's setState has flushed and
        // store.isUnlocked() returns true to enqueueChangedPages.
        setTimeout(() => {
          enqueueChangedPagesRef.current?.([], currentPages, currentTags)
        }, 0)
      }
    } catch (err) {
      console.error('enableSync: initial push enqueue failed', err)
    }
    return metadata
  }, [relayUrl, updateStatus, pagesRef])

  // Phase 2.10c: adopt an existing vault from a QR-pair packet (guest
  // device flow). Persists metadata, registers the new device with the
  // relay, and triggers an initial pull so the user has all existing
  // notes from the vault.
  const adoptVault = useCallback(async ({ packet, deviceName, wrapMethod, appLockKey, passphrase, mergeLocalPages = false }) => {
    const store = vaultStoreRef.current
    if (!store) throw new Error('store not initialized')
    const isElectron = typeof window !== 'undefined' && !!window.electron?.invoke
    const opts = { packet, deviceName, wrapMethod }
    if (wrapMethod === 'app-lock') opts.appLockKey = appLockKey
    if (wrapMethod === 'passphrase') opts.passphrase = passphrase
    if (wrapMethod === 'safe-storage') {
      if (!isElectron) throw new Error("'safe-storage' wrap method requires Electron")
      opts.safeStorageStore = safeStorageStoreVaultKey
    }
    if (wrapMethod === 'ios-keychain') {
      opts.iosKeychainStore = iosKeychainStoreVaultKey
    }
    const result = await store.adoptVault(opts)
    const metadata = result.metadata
    await store.save(metadata)
    metadataRef.current = metadata
    // Reset diff baselines for the same reason as enableSync — see comment
    // there. Adopted vault is a fresh sync context.
    lastSyncedSnapshotRef.current = []
    if (typeof window !== 'undefined') window.__syncLastSnapshot = null
    // Register the new device with the relay BEFORE flipping status to
    // enabled. If register fails, server has no record of this device →
    // every subsequent sync call returns 401. Better to roll back and
    // surface an error than leave a half-paired vault in place.
    try {
      const ar = authenticatedRequestRef.current
      if (!ar) throw new Error('authenticated request unavailable')
      const entIds = await getEntitlementIds()
      await ar('POST', '/sync/vault/register', {
        vaultId: metadata.vaultId,
        deviceId: metadata.deviceId,
        deviceName: metadata.deviceName,
        appVersion: APP_VERSION,
        ...entIds
      })
    } catch (err) {
      try { await store.disableSync() } catch { /* */ }
      metadataRef.current = null
      updateStatus({
        enabled: false,
        unlocked: false,
        stage: 'error',
        lastError: 'pair register failed: ' + (err.message || err.code || 'unknown'),
        vaultId: null,
        deviceId: null,
        deviceName: null,
        pairedDevices: []
      })
      throw err
    }
    updateStatus({
      enabled: true,
      unlocked: true,
      vaultId: metadata.vaultId,
      deviceId: metadata.deviceId,
      deviceName: metadata.deviceName,
      pairedDevices: metadata.pairedDevices || []
    })
    // Initial pull THEN initial push, in that order, MUST be serialized.
    //
    // Bug we hit when these ran in parallel: enqueueChangedPages with
    // baseline=[] and target=pagesRef.current emits a *manifest* envelope
    // listing all pages on this device. If the local device is the guest
    // joining a populated vault, pagesRef.current at adopt time only has
    // the guest's small local set (e.g. 2 pages). Pushing that manifest
    // before the pull completes overwrites the host's manifest of (e.g.)
    // 28 pages → on the next host pull, the host filters its local pages
    // through the new short manifest and silently loses 26 notes.
    //
    // Chain: pull first so pagesRef has the merged set, THEN push so the
    // manifest reflects everything, not just the guest's tiny baseline.
    setTimeout(async () => {
      const pullFn = initialPullRef.current
      if (typeof pullFn === 'function') {
        try { await pullFn() } catch (err) { console.error('adoptVault: initial pull failed', err) }
      }
      if (mergeLocalPages) {
        try {
          const currentPages = pagesRef?.current || []
          if (currentPages.length > 0) {
            const currentTags = useTagStore.getState().tags || []
            enqueueChangedPagesRef.current?.([], currentPages, currentTags)
          }
        } catch (err) {
          console.error('adoptVault: merge enqueue failed', err)
        }
      }
    }, 0)
    return metadata
  }, [updateStatus, pagesRef])

  const disableSync = useCallback(async () => {
    const store = vaultStoreRef.current
    if (!store) return
    // Best-effort: revoke this device on the relay BEFORE clearing local
    // state, so peers see this device disappear from their settings panel
    // (their next /sync/vault/index returns the updated devices map).
    // Must run while the vault is still unlocked — getCredentials needs
    // vaultKeyBytes which `store.disableSync()` is about to wipe.
    try {
      const myDeviceId = metadataRef.current?.deviceId
      const ar = authenticatedRequestRef.current
      if (myDeviceId && ar) {
        await ar('DELETE', `/sync/vault/devices/${encodeURIComponent(myDeviceId)}`)
      }
    } catch (err) {
      // Offline / 404 / network — local disable still proceeds. Peers
      // will see us as stale until their own polling drops us.
      console.warn('disableSync: revoke failed (continuing locally)', err?.message || err)
    }
    const queue = queueRef.current
    queue?.clear()
    await store.disableSync()
    metadataRef.current = null
    lastSyncedSnapshotRef.current = []
    // Clear the cross-hook caller-side snapshot too. usePagesManager reads
    // `window.__syncLastSnapshot || []` and passes that as the diff
    // baseline. If we leave it stale from a previous vault, the next
    // enableSync sees no diff vs current pages → never pushes the
    // existing notes to the new vault.
    if (typeof window !== 'undefined') {
      window.__syncLastSnapshot = null
    }
    // Pending transfers belonged to this vault.
    transferQueueRef.current?.clear()
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
    if (meta.keyWrapMethod === 'ios-keychain') {
      cred.iosKeychainRetrieve = iosKeychainRetrieveVaultKey
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

  // Helper: do an authenticated request to the relay. Used by the
  // less-common ops that don't go through the queue (purge, revoke,
  // initial-register on adoptVault).
  // Silently re-register this device against the existing vault. Used when
  // the relay returns 401 "Device not registered" — common cause: server
  // evicted the device record (free-tier inactivity, partial vault purge,
  // operator restart of an unstable build), but local credentials are
  // still valid. A re-register binds this device id back into the vault
  // with the SAME vaultKey so subsequent requests authenticate. Returns
  // true on success, false on failure (vault truly gone). Never throws.
  const tryReregisterSelf = useCallback(async () => {
    try {
      const creds = await getCredentials()
      const meta = metadataRef.current
      if (!meta?.deviceId || !meta?.vaultId || !meta?.deviceName) return false
      const httpUrl = creds.relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
      const path = '/sync/vault/register'
      const headers = await buildSyncHeaders(creds.vaultKeyBytes, {
        vaultId: creds.vaultId,
        deviceId: creds.deviceId,
        timestamp: Date.now(),
        method: 'POST',
        path,
        contentType: 'application/json'
      })
      const body = JSON.stringify({
        vaultId: meta.vaultId,
        deviceId: meta.deviceId,
        deviceName: meta.deviceName,
        appVersion: APP_VERSION
      })
      const response = await fetch(httpUrl + path, { method: 'POST', headers, body })
      if (response.ok) {
        console.info('[sync] re-registered self after 401 — vault still exists, sync resumed')
        return true
      }
      // 401/403 here means the vault itself is gone (or quota-blocked).
      // Don't disable local — just surface the disconnect so UI can show
      // a "Sync paused: server-side state gone, please re-pair" toast
      // without nuking the user's notes or vault key.
      console.warn('[sync] re-register failed', response.status, await response.text().catch(() => ''))
      return false
    } catch (err) {
      console.warn('[sync] re-register threw', err)
      return false
    }
  }, [getCredentials])

  const authenticatedRequest = useCallback(async (method, path, body = null, _retry = false) => {
    const creds = await getCredentials()
    const httpUrl = creds.relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
    const headers = await buildSyncHeaders(creds.vaultKeyBytes, {
      vaultId: creds.vaultId,
      deviceId: creds.deviceId,
      timestamp: Date.now(),
      method,
      path,
      contentType: body ? 'application/json' : undefined
    })
    const init = { method, headers }
    if (body) init.body = JSON.stringify(body)
    const response = await fetch(httpUrl + path, init)
    let parsed = null
    try { parsed = await response.json() } catch { /* not JSON */ }
    if (!response.ok) {
      const code = parsed?.error || `http-${response.status}`
      // Auto-recover from "Device not registered" — server evicted us but
      // local creds are still valid. Re-register and retry ONCE. Don't
      // recurse on the recovery itself (the path /sync/vault/register
      // is the retry, not retried by this layer). _retry guard prevents
      // infinite loops if the server consistently 401s the register too
      // (vault truly gone — surface the original error in that case).
      const isUnauthorized = response.status === 401 ||
        code === 'unauthorized' ||
        /Device not registered/i.test(parsed?.message || '')
      if (isUnauthorized && !_retry && path !== '/sync/vault/register') {
        const recovered = await tryReregisterSelf()
        if (recovered) {
          return authenticatedRequest(method, path, body, true)
        }
      }
      const err = new Error(parsed?.message || code)
      err.code = code
      err.status = response.status
      throw err
    }
    return parsed
  }, [getCredentials, tryReregisterSelf])

  // Keep the ref in sync so adoptVault (defined earlier) can call this
  // without taking it as a useCallback dep (which would TDZ).
  authenticatedRequestRef.current = authenticatedRequest

  // Phase 2.10b: server-side vault purge. Two-step (token issue + use).
  const purgeCloud = useCallback(async () => {
    try {
      const tokenResponse = await authenticatedRequest('GET', '/sync/vault/purge-token')
      if (!tokenResponse?.token) throw new Error('No token in response')
      const result = await authenticatedRequest('POST', '/sync/vault/purge', { confirmToken: tokenResponse.token })
      // Reset cursor + per-resource versions; vault stays paired locally
      // (user can re-push to populate the cloud copy again on next save).
      const meta = metadataRef.current
      if (meta) {
        const next = { ...meta, cursorVersion: 0, lastSyncedVersion: {} }
        metadataRef.current = next
        await vaultStoreRef.current?.save(next)
      }
      lastSyncedSnapshotRef.current = []
      updateStatus({ stage: 'idle', lastError: null })
      // The relay no longer holds this vault's attachments: upload them again.
      reconcileAttachments().catch(() => {})
      return { ok: true, purgedBytes: result?.purgedBytes }
    } catch (err) {
      updateStatus({ stage: 'error', lastError: `purge failed: ${err.message}` })
      return { ok: false, error: err.message }
    }
  }, [authenticatedRequest, updateStatus, reconcileAttachments])

  // Phase 2.8: synced version history — fetch the list of server-stored
  // versions for a note. Returns { ok, versions } or { ok:false, errorCode }.
  const fetchSyncedVersionList = useCallback(async (noteId) => {
    const meta = metadataRef.current
    const store = vaultStoreRef.current
    if (!meta?.syncEnabled || !store?.isUnlocked()) {
      return { ok: false, errorCode: 'sync-not-ready' }
    }
    try {
      const creds = await getCredentials()
      return fetchVersionList({ noteId, credentials: creds })
    } catch (err) {
      return { ok: false, errorCode: 'unexpected', message: err.message }
    }
  }, [getCredentials])

  // Fetch a specific server version's decrypted payload. Caller can show
  // it in a Compare view or call setPages-equivalent to restore.
  const fetchSyncedVersion = useCallback(async (noteId, version) => {
    const meta = metadataRef.current
    const store = vaultStoreRef.current
    if (!meta?.syncEnabled || !store?.isUnlocked()) {
      return { ok: false, errorCode: 'sync-not-ready' }
    }
    try {
      const creds = await getCredentials()
      return fetchVersion({ noteId, version, credentials: creds })
    } catch (err) {
      return { ok: false, errorCode: 'unexpected', message: err.message }
    }
  }, [getCredentials])

  // Phase 2.10b: server-side device revoke. Removes deviceId from the
  // vault's devices map. The revoked device's auth proofs stop validating
  // (server's authenticate() checks devices map).
  const revokeDevice = useCallback(async (deviceId) => {
    if (!deviceId) throw new Error('revokeDevice: deviceId required')
    try {
      const result = await authenticatedRequest('DELETE', `/sync/vault/devices/${encodeURIComponent(deviceId)}`)
      // Update local pairedDevices list
      const meta = metadataRef.current
      if (meta) {
        const next = {
          ...meta,
          pairedDevices: (meta.pairedDevices || []).filter(d => d.deviceId !== deviceId)
        }
        metadataRef.current = next
        await vaultStoreRef.current?.save(next)
        updateStatus({ pairedDevices: next.pairedDevices })
      }
      return { ok: true, alreadyRevoked: result?.alreadyRevoked === true }
    } catch (err) {
      updateStatus({ lastError: `revoke failed: ${err.message}` })
      return { ok: false, error: err.message }
    }
  }, [authenticatedRequest, updateStatus])

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
      // Legacy name on purpose: older app versions require it verbatim;
      // newer ones treat every public alias as the same relay.
      relayUrl: compatRelayUrl(meta.relayUrl),
      pairedDevices: meta.pairedDevices || []
    }
  }, [])

  // Fetch vault usage from server. Returns { totalBytes, lastVersion,
   // deviceCount, pairedDevices } or null if not signed in / not ready.
   const fetchVaultUsage = useCallback(async () => {
    try {
      const ar = authenticatedRequestRef.current
      if (!ar) return null
      const res = await ar('GET', '/sync/vault/index')
      if (res && typeof res.totalBytes === 'number') {
        usageRef.current = { totalBytes: res.totalBytes }
        // Held photo uploads may fit now.
        transferQueueRef.current?.refresh()
      }
      return res
    } catch (err) {
      console.warn('fetchVaultUsage failed', err)
      return null
    }
  }, [])

  // Fetch IP-bucketed quota (read-only, no auth needed). Lets the disabled
  // state show "X of N sync setups used today" before the user has a vault.
  // Returns { usedThisHour, hourLimit, lifetimeUsed, lifetimeLimit } or null
  // if the relay is unreachable / endpoint missing (older relay deploys).
  const fetchQuota = useCallback(async () => {
    if (!relayUrl) return null
    try {
      const httpUrl = toHttpUrl(await resolveRelayUrl(relayUrl))
      const response = await fetch(httpUrl + '/sync/vault/quota', { method: 'GET' })
      if (!response.ok) return null
      return await response.json()
    } catch (err) {
      console.warn('fetchQuota failed', err)
      return null
    }
  }, [relayUrl])

  return {
    status,
    enqueueChangedPages,
    flushNow,
    pull,
    // Un-pause after a subscription-required (402) stop, then push + pull once.
    resumeSync: async () => { try { queueRef.current?.resume?.(); transferQueueRef.current?.resume() } catch { /* ignore */ } await flushNow(); await pull() },
    // Try failed and waiting attachment transfers again now.
    retryAttachmentTransfers: () => transferQueueRef.current?.resume(),
    enableSync,
    adoptVault,
    disableSync,
    unlockVault,
    lockVault,
    purgeCloud,
    revokeDevice,
    fetchSyncedVersionList,
    fetchSyncedVersion,
    fetchVaultUsage,
    fetchQuota,
    getVaultPacketForPairing,
    metadata: metadataRef.current,
    isUnlocked: () => vaultStoreRef.current?.isUnlocked() ?? false
  }
}
