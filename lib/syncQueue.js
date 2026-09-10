/**
 * Dash Sync — Push Queue
 *
 * Queues sync envelopes and pushes them to the relay in batches with
 * exponential backoff on failure. Survives app restarts via persistent
 * storage (caller-provided backend).
 *
 * Hook into the save pipeline:
 *   1. After local save succeeds (usePagesManager.savePagesToStorage), call
 *      `queue.enqueue({ resourceType, resourceId, payload, parentVersion })`.
 *   2. Queue auto-flushes 2 seconds after the last enqueue (debounced).
 *   3. Pushes happen via the caller-provided `pusher` callback (HTTP POST to
 *      /sync/push, returning the server response). Queue handles retry.
 *
 * Failure modes (all preserve local data):
 *   - Network drop: keep envelope in queue, exp backoff (1s, 2s, 4s, 8s,
 *     max 60s) until reconnect.
 *   - Server 413 vault-full: pause the queue with an error and keep every
 *     envelope; resume() restarts it once there is room.
 *   - Server 413 payload-too-large: narrow to one envelope, then drop only
 *     the one the relay can never accept and report it through onDrop.
 *   - Server 429 rate-limited: pause queue 60 s, then resume.
 *   - Server 401: surface error (caller prompts re-pair).
 *
 * Space: payloads are kept in memory and on disk up to MAX_QUEUE_LENGTH
 * entries or MAX_QUEUE_BYTES. Past that, entries spill: they stay queued
 * as references, and their payload is resolved from the live pages when
 * they are pushed. A large import never pushes earlier edits out.
 *
 * Concurrency: at most one in-flight push at a time. Subsequent enqueues
 * during a push wait until current push resolves.
 *
 * Persistence: the queue maintains its full pending list in memory AND
 * persists every change via the caller-provided `persistBackend`. On app
 * restart, caller calls `queue.restore()` to rehydrate.
 */

import { encryptEnvelope } from './syncCrypto.js'
import { markRelayUnreachable } from './relayHosts.js'
import { buildSyncHeaders } from './syncAuth.js'

// =============================================================================
// Constants
// =============================================================================

// 600ms balances "instant" feel against typing-burst coalescing — at 2s
// the last-keystroke→peer-update gap was the dominant driver of the
// "mobile→desktop sync feels slow" complaint. WS doorbell + 10s pull
// fallback are unchanged. Tests pass `tunables.debounceMs` directly so
// changing this default does not affect their timing.
export const DEFAULT_DEBOUNCE_MS = 600
export const DEFAULT_BATCH_COUNT = 50
export const DEFAULT_BATCH_BYTES = 200 * 1024 // 200 KB
export const DEFAULT_MAX_RETRIES = Infinity // retry forever (with exp backoff)
export const RETRY_BASE_MS = 1000
export const RETRY_MAX_MS = 60 * 1000
export const RATE_LIMIT_PAUSE_MS = 60 * 1000

// Payload budget. Entries past MAX_QUEUE_LENGTH, or past MAX_QUEUE_BYTES of
// payload, spill: they stay queued without their payload, which is resolved
// again when they are pushed (opts.resolvePayload). Nothing is dropped for
// space; without a resolver every payload is kept.
export const MAX_QUEUE_BYTES = 5 * 1024 * 1024
export const MAX_QUEUE_LENGTH = 5000

// =============================================================================
// Types
// =============================================================================

/**
 * @typedef {Object} QueueEntry
 * @property {string} entryId - local UUID for tracking
 * @property {'note'|'folder'|'tag'|'meta'|'tombstone'|'attachment'} resourceType
 * @property {string} resourceId
 * @property {object|null} payload - plaintext envelope body; null when spilled
 * @property {boolean} spilled - payload is resolved when the entry is pushed
 * @property {number} bytes - JSON size of the carried payload; 0 when spilled
 * @property {number} revision - bumped each time a newer payload replaces it
 * @property {number|null} parentVersion - last-known server version
 * @property {number} enqueuedAt - Date.now() when added
 * @property {number} attempts - retry counter
 * @property {string|null} lastError - human-readable last error
 */

/**
 * @typedef {Object} QueueState
 * @property {QueueEntry[]} entries
 * @property {string} status - 'idle' | 'queued' | 'flushing' | 'retry-backoff' | 'rate-limited' | 'paused' | 'error'
 * @property {number|null} nextFlushAt - Date.now() ms of next scheduled flush
 * @property {string|null} lastError
 * @property {number|null} lastSuccessAt
 * @property {number} pendingCount
 */

// =============================================================================
// Helpers
// =============================================================================

function uuid () {
  return crypto.randomUUID()
}

function jsonByteLen (obj) {
  return new TextEncoder().encode(JSON.stringify(obj)).length
}

function classifyHttpError (status) {
  if (status === 401) return { code: 'unauthorized', recoverable: false }
  if (status === 402) return { code: 'subscription-required', recoverable: false } // entitlement gate; resume() once a plan is active
  if (status === 403) return { code: 'forbidden', recoverable: false }
  if (status === 404) return { code: 'not-found', recoverable: false }
  if (status === 409) return { code: 'stale-parent', recoverable: true } // server accepts anyway
  if (status === 410) return { code: 'gone', recoverable: false }
  if (status === 413) return { code: 'too-large', recoverable: 'maybe' } // try smaller batch
  if (status === 429) return { code: 'rate-limited', recoverable: true }
  if (status >= 500) return { code: 'server-error', recoverable: true }
  return { code: 'unknown', recoverable: true }
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =============================================================================
// Queue factory
// =============================================================================

/**
 * Create a push queue.
 *
 * @param {Object} opts
 * @param {() => Promise<{vaultKeyBytes:Uint8Array, vaultCryptoKey:CryptoKey, vaultId:string, deviceId:string, relayUrl:string}>} opts.getCredentials
 *   Called before each flush to fetch the current credentials. Returns
 *   credentials object, OR throws if the vault is locked / sync disabled.
 * @param {(url:string, init:RequestInit) => Promise<Response>} [opts.fetch]
 *   Override fetch (for tests). Defaults to globalThis.fetch.
 * @param {Object} [opts.persistBackend] - { read, write, clear } async methods
 *   Callbacks for queue persistence. If null, queue is in-memory only
 *   (lost on reload).
 * @param {() => boolean} [opts.canPush] - Optional gate: returns false to
 *   silently skip flushing (e.g. when app lock is engaged). Default: () => true.
 * @param {(resourceType: string, resourceId: string) => (object|null|undefined)} [opts.resolvePayload]
 *   The current payload for a spilled entry: an object to push, null when the
 *   resource no longer exists (the entry is removed), or undefined when it
 *   can't be read yet (the entry waits). Providing it enables spilling.
 * @param {(drop: {resourceType: string, resourceId: string, reason: string}) => void} [opts.onDrop]
 *   Called when an envelope leaves the queue without reaching the relay.
 * @param {(pushed: {resourceType: string, resourceId: string}) => void} [opts.onPushed]
 *   Called for each envelope the relay accepted.
 * @param {(state: QueueState) => void} [opts.onStateChange] - Status updates
 *   for UI ("Syncing", "Synced", "Offline").
 * @param {Object} [opts.tunables] - override DEFAULT_DEBOUNCE_MS, etc.
 * @returns {SyncQueue}
 */
export function createSyncQueue (opts) {
  const {
    getCredentials,
    fetch: fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : null),
    persistBackend = null,
    canPush = () => true,
    resolvePayload = null,
    onDrop = () => {},
    onPushed = () => {},
    onStateChange = () => {},
    tunables = {}
  } = opts || {}

  if (typeof getCredentials !== 'function') {
    throw new Error('createSyncQueue: getCredentials function required')
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('createSyncQueue: fetch unavailable; provide opts.fetch')
  }

  const DEBOUNCE_MS = tunables.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const BATCH_COUNT = tunables.batchCount ?? DEFAULT_BATCH_COUNT
  const BATCH_BYTES = tunables.batchBytes ?? DEFAULT_BATCH_BYTES
  const CARRY_LENGTH = tunables.maxQueueLength ?? MAX_QUEUE_LENGTH
  const CARRY_BYTES = tunables.maxQueueBytes ?? MAX_QUEUE_BYTES

  // Internal state — tightly scoped to this queue instance.
  /** @type {QueueEntry[]} */
  let entries = []
  // Entries by resource, so coalescing doesn't scan the queue.
  const byResource = new Map()
  // Entries carrying their payload, and those payloads' total JSON size.
  let carriedCount = 0
  let carriedBytes = 0
  let flushTimer = null
  let flushing = false
  let backoffMs = RETRY_BASE_MS
  let paused = false
  let pauseUntil = 0
  let lastError = null
  let lastSuccessAt = null
  let status = 'idle'
  // Cap for next batch — narrowed to 1 after a 413 multi-envelope
  // response so we can isolate + drop the oversize envelope.
  let nextBatchCap = BATCH_COUNT

  // Resource types are fixed words without a colon, so this key is unambiguous.
  const resourceKey = (resourceType, resourceId) => `${resourceType}:${resourceId}`

  function carry (entry, payload) {
    entry.payload = payload
    entry.bytes = jsonByteLen(payload)
    entry.spilled = false
    carriedCount++
    carriedBytes += entry.bytes
  }

  function spill (entry) {
    if (!entry.spilled) {
      carriedCount--
      carriedBytes -= entry.bytes
    }
    entry.payload = null
    entry.bytes = 0
    entry.spilled = true
  }

  // Spill an entry that takes the carried payloads past the budget. Only with
  // a resolver — without one, a spilled entry could never be pushed.
  function fitBudget (entry) {
    if (resolvePayload && !entry.spilled && (carriedCount > CARRY_LENGTH || carriedBytes > CARRY_BYTES)) {
      spill(entry)
    }
  }

  function removeEntries (shouldRemove) {
    const kept = []
    for (const e of entries) {
      if (shouldRemove(e)) {
        spill(e) // gives back its share of the payload budget
        byResource.delete(resourceKey(e.resourceType, e.resourceId))
      } else {
        kept.push(e)
      }
    }
    entries = kept
  }

  function resetEntries () {
    entries = []
    byResource.clear()
    carriedCount = 0
    carriedBytes = 0
  }

  function publishState () {
    onStateChange({
      entries: entries.slice(),
      status,
      nextFlushAt: flushTimer ? Date.now() + DEBOUNCE_MS : null,
      lastError,
      lastSuccessAt,
      pendingCount: entries.length
    })
  }

  function setStatus (s) {
    if (status !== s) {
      status = s
      publishState()
    }
  }

  // Serialize persist writes. Multiple concurrent enqueues racing into
  // the same .tmp → .json rename caused ENOENT crashes (Electron
  // electron-main.js save-sync-queue handler is non-atomic across
  // simultaneous calls). Chain writes through one promise so only one
  // backend.write runs at a time, and coalesce — if many requests pile
  // up, only the latest snapshot needs to land on disk.
  let persistInflight = null
  let persistPending = false
  function snapshotPersistable () {
    return entries.map(e => ({
      entryId: e.entryId,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      // A spilled entry is saved without its payload; it is resolved again
      // when pushed.
      payload: e.spilled ? null : e.payload,
      spilled: e.spilled,
      parentVersion: e.parentVersion,
      enqueuedAt: e.enqueuedAt,
      attempts: e.attempts
    }))
  }
  async function persist () {
    if (!persistBackend) return
    if (persistInflight) {
      // Mark that another write is needed once the current one finishes.
      // We don't await — caller doesn't need to block on disk.
      persistPending = true
      return
    }
    persistInflight = (async () => {
      try {
        await persistBackend.write(snapshotPersistable())
      } catch (err) {
        // Persistence failure is non-fatal; log and continue.
        console.error('syncQueue: persist failed', err)
      } finally {
        persistInflight = null
        if (persistPending) {
          persistPending = false
          // Re-trigger to capture any state added while we were writing.
          persist()
        }
      }
    })()
  }

  async function restore () {
    if (!persistBackend) return
    try {
      const stored = await persistBackend.read()
      if (Array.isArray(stored)) {
        // Anything enqueued since launch is newer than the stored copy of the
        // same resource, and stays after the stored entries.
        const restored = []
        for (const e of stored) {
          if (!e || typeof e.resourceType !== 'string' || typeof e.resourceId !== 'string') continue
          const key = resourceKey(e.resourceType, e.resourceId)
          if (byResource.has(key)) continue
          const entry = {
            entryId: e.entryId || uuid(),
            resourceType: e.resourceType,
            resourceId: e.resourceId,
            payload: null,
            bytes: 0,
            spilled: true,
            revision: 0,
            parentVersion: e.parentVersion ?? null,
            enqueuedAt: e.enqueuedAt || Date.now(),
            attempts: e.attempts || 0,
            lastError: null
          }
          if (e.payload && typeof e.payload === 'object') {
            carry(entry, e.payload)
            fitBudget(entry)
          }
          restored.push(entry)
          byResource.set(key, entry)
        }
        entries = [...restored, ...entries]
        publishState()
      }
    } catch (err) {
      console.error('syncQueue: restore failed', err)
    }
  }

  function scheduleFlush (immediate = false) {
    if (paused) return
    if (Date.now() < pauseUntil) {
      // Still in rate-limit pause — schedule for end of pause window
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}) }, pauseUntil - Date.now())
      return
    }
    if (flushTimer) clearTimeout(flushTimer)
    const wait = immediate ? 0 : DEBOUNCE_MS
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush().catch(err => {
        console.error('syncQueue: flush threw unexpectedly', err)
      })
    }, wait)
    setStatus('queued')
  }

  /**
   * Take up to BATCH_COUNT envelopes (or BATCH_BYTES total) from the head of
   * the queue. Spilled entries are resolved from the live pages here: one
   * whose resource is gone is removed, one that can't be read yet is skipped
   * and waits.
   *
   * `maxCount` lets the retry path force batch=1 after a 413 too-large
   * response, so the next push isolates the offender and the
   * single-envelope drop path can fire.
   *
   * @returns {{ batch: Array<{entry: QueueEntry, payload: object, revision: number}>, waiting: number }}
   */
  function takeBatch (maxCount = BATCH_COUNT) {
    const batch = []
    const gone = new Set()
    let waiting = 0
    let totalBytes = 0
    for (const e of entries) {
      if (batch.length >= maxCount) break
      let payload = e.payload
      let size = e.bytes
      if (e.spilled) {
        payload = resolvePayload ? resolvePayload(e.resourceType, e.resourceId) : undefined
        if (payload === null) {
          gone.add(e)
          continue
        }
        if (!payload || typeof payload !== 'object') {
          waiting++
          continue
        }
        size = jsonByteLen(payload)
      }
      if (totalBytes + size > BATCH_BYTES && batch.length > 0) break
      batch.push({ entry: e, payload, revision: e.revision })
      totalBytes += size
    }
    if (gone.size > 0) removeEntries(e => gone.has(e))
    return { batch, waiting }
  }

  /**
   * Encrypt batch + POST to /sync/push.
   *
   * @returns {Promise<{ok: boolean, errorCode?: string, retryAfterMs?: number, results?: Array, status?: number}>}
   */
  async function pushBatch (batch, creds) {
    const { vaultCryptoKey, vaultKeyBytes, vaultId, deviceId, relayUrl } = creds

    // Encrypt each envelope's payload under the vault key
    const encryptedEnvelopes = []
    for (const { entry: e, payload } of batch) {
      const env = {
        schemaVersion: 1,
        envelopeType: e.resourceType,
        resourceId: e.resourceId,
        payload,
        timestamp: e.enqueuedAt,
        authorDeviceId: deviceId,
        parentVersion: e.parentVersion
      }
      const encrypted = await encryptEnvelope(env, vaultCryptoKey)
      // Server expects { resourceType, resourceId, ciphertext (b64), parentVersion, size }
      // ciphertext: serialize the encrypted payload (which has {v, cipher, iv, data}) to bytes,
      // then base64
      const wireBytes = new TextEncoder().encode(JSON.stringify(encrypted))
      const ciphertextB64 = base64Encode(wireBytes)
      encryptedEnvelopes.push({
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        ciphertext: ciphertextB64,
        parentVersion: e.parentVersion,
        size: wireBytes.byteLength
      })
    }

    const httpUrl = relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
    const path = '/sync/push'
    const headers = await buildSyncHeaders(vaultKeyBytes, {
      vaultId,
      deviceId,
      timestamp: Date.now(),
      method: 'POST',
      path,
      contentType: 'application/json'
    })

    let response
    try {
      response = await fetchFn(httpUrl + path, {
        method: 'POST',
        headers,
        body: JSON.stringify({ envelopes: encryptedEnvelopes })
      })
    } catch (err) {
      markRelayUnreachable(relayUrl)
      return { ok: false, errorCode: 'network', message: err.message }
    }

    if (!response.ok) {
      const cls = classifyHttpError(response.status)
      let body = null
      try { body = await response.json() } catch { /* not JSON */ }
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      return {
        ok: false,
        status: response.status,
        errorCode: cls.code,
        recoverable: cls.recoverable,
        retryAfterMs: retryAfter,
        body
      }
    }

    let body
    try { body = await response.json() } catch (err) {
      return { ok: false, errorCode: 'invalid-response', message: err.message }
    }
    return { ok: true, results: body.results, vaultIndex: body.vaultIndex }
  }

  function parseRetryAfter (header) {
    if (!header) return null
    const seconds = parseInt(header, 10)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    // Try HTTP-date format
    const ts = Date.parse(header)
    if (Number.isFinite(ts)) return Math.max(0, ts - Date.now())
    return null
  }

  async function flush () {
    if (flushing) return
    if (paused) return
    if (entries.length === 0) {
      setStatus('idle')
      return
    }
    if (!canPush()) {
      // App locked / duress / sync disabled — don't push, but don't drop queue.
      setStatus('paused')
      return
    }

    flushing = true
    setStatus('flushing')

    let creds
    try {
      creds = await getCredentials()
    } catch (err) {
      // No credentials — vault locked or disabled. Pause, don't drop.
      flushing = false
      lastError = `credentials unavailable: ${err.message}`
      setStatus('paused')
      return
    }

    // After a 413 too-large response, narrow the batch size aggressively
    // so the next push isolates the offending envelope and the
    // single-envelope drop path can fire. Reset on any successful push.
    const { batch, waiting } = takeBatch(nextBatchCap)
    if (batch.length === 0) {
      flushing = false
      if (waiting > 0) {
        // Everything left is waiting on local data, for example a page
        // still encrypted by app lock. Look again after a backoff.
        backoffMs = Math.min(backoffMs * 2, RETRY_MAX_MS)
        setStatus('retry-backoff')
        flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}) }, backoffMs)
      } else {
        setStatus('idle')
      }
      return
    }

    const result = await pushBatch(batch, creds)

    if (result.ok) {
      // Remove what was pushed, unless a newer payload replaced it while the
      // push was in flight. That one still has to go out.
      const pushedRevision = new Map(batch.map(b => [b.entry, b.revision]))
      removeEntries(e => pushedRevision.get(e) === e.revision)
      for (const { entry } of batch) {
        try { onPushed({ resourceType: entry.resourceType, resourceId: entry.resourceId }) } catch { /* caller's problem */ }
      }
      // Reset backoff + batch cap on success
      backoffMs = RETRY_BASE_MS
      nextBatchCap = BATCH_COUNT
      lastError = null
      lastSuccessAt = Date.now()
      flushing = false
      await persist()

      // Per-envelope server result inspection — surface vault-full warnings
      // for individual rejections (server returns per-envelope accept/reject).
      if (Array.isArray(result.results)) {
        for (const r of result.results) {
          if (r && r.accepted === false) {
            console.warn('syncQueue: server rejected envelope', r.resourceId, r.error)
          }
        }
      }

      // If more entries remain, flush again immediately (no debounce — already queued)
      if (entries.length > 0) {
        scheduleFlush(true)
      } else {
        setStatus('idle')
      }
      return
    }

    // Failure path
    flushing = false
    lastError = `push failed: ${result.errorCode}${result.status ? ` (HTTP ${result.status})` : ''}`

    if (result.errorCode === 'rate-limited') {
      // Pause until the rate-limit window expires
      const retryMs = result.retryAfterMs || RATE_LIMIT_PAUSE_MS
      pauseUntil = Date.now() + retryMs
      setStatus('rate-limited')
      // Bump attempts so we don't retry forever in tight loop
      for (const { entry } of batch) entry.attempts++
      await persist()
      flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}) }, retryMs)
      return
    }

    if (result.errorCode === 'unauthorized' || result.errorCode === 'gone' || result.errorCode === 'forbidden' || result.errorCode === 'subscription-required') {
      // Permanent-until-the-user-acts failure — surface to UI, pause queue.
      // unauthorized/gone/forbidden: user must re-pair to recover.
      // subscription-required (402): nothing is wrong with the vault; the
      // signed-in email just has no active plan. The panel calls resume()
      // the moment the entitlement turns on — retrying before that would
      // only hammer the relay with 402s.
      paused = true
      setStatus('error')
      return
    }

    if (result.errorCode === 'too-large' && result.body?.error === 'vault-full') {
      // The vault's sync storage is full. Every envelope stays queued, and
      // resume() restarts the queue once there is room; retrying now would
      // only fail again.
      paused = true
      lastError = 'vault-full: sync storage is full'
      setStatus('error')
      await persist()
      return
    }

    if (result.errorCode === 'too-large' && batch.length > 1) {
      // Server-side per-envelope limit hit. Narrow next batch to 1 so
      // the single-envelope drop path can fire on the next flush; that
      // isolates + drops the offender, then everything else proceeds.
      // Pre-fix this branch retried with the SAME head every time
      // (BATCH_COUNT unchanged) → infinite 413 loop.
      flushing = false
      nextBatchCap = 1
      backoffMs = Math.min(backoffMs * 2, RETRY_MAX_MS)
      setStatus('retry-backoff')
      flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}) }, Math.min(backoffMs, 2000))
      return
    }

    if (result.errorCode === 'too-large' && batch.length === 1) {
      // Single envelope too large — drop it and warn. Don't block other entries.
      const { entry, revision } = batch[0]
      // Edited while in flight: the newer version may fit, so it stays.
      if (entry.revision === revision) {
        console.error('syncQueue: dropping oversize envelope', entry.resourceId)
        removeEntries(e => e === entry)
        lastError = `envelope ${entry.resourceId} exceeds size limit; dropped from queue`
        try { onDrop({ resourceType: entry.resourceType, resourceId: entry.resourceId, reason: 'too-large' }) } catch { /* caller's problem */ }
      }
      // Restore default batch cap now that we've isolated + dropped.
      nextBatchCap = BATCH_COUNT
      flushing = false
      await persist()
      // Continue flushing remaining
      if (entries.length > 0) scheduleFlush(true)
      else setStatus('idle')
      return
    }

    // Network error or 5xx — exp backoff and retry
    for (const { entry } of batch) {
      entry.attempts++
      entry.lastError = result.errorCode
    }
    await persist()
    backoffMs = Math.min(backoffMs * 2, RETRY_MAX_MS)
    setStatus('retry-backoff')
    flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}) }, backoffMs)
  }

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    /**
     * Add an envelope to the queue. Auto-schedules a flush after debounce
     * window. If an envelope for the same (resourceType, resourceId) is
     * already queued, replace it (latest-wins coalescing).
     *
     * @param {Object} args
     * @param {string} args.resourceType
     * @param {string} args.resourceId
     * @param {object} args.payload
     * @param {number|null} [args.parentVersion]
     */
    enqueue ({ resourceType, resourceId, payload, parentVersion = null }) {
      if (typeof resourceType !== 'string' || !resourceType) {
        throw new Error('enqueue: resourceType required')
      }
      if (typeof resourceId !== 'string' || !resourceId) {
        throw new Error('enqueue: resourceId required')
      }
      if (!payload || typeof payload !== 'object') {
        throw new Error('enqueue: payload must be object')
      }

      // Coalesce: if a pending entry already targets the same resource, replace
      // its payload (keep the entryId so existing scheduling continues). The
      // revision bump stops a push already in flight from removing it.
      const key = resourceKey(resourceType, resourceId)
      const existing = byResource.get(key)
      if (existing) {
        spill(existing) // gives back the old payload's share of the budget
        carry(existing, payload)
        existing.revision++
        existing.parentVersion = parentVersion
        existing.enqueuedAt = Date.now()
        existing.attempts = 0
        existing.lastError = null
        fitBudget(existing)
      } else {
        const entry = {
          entryId: uuid(),
          resourceType,
          resourceId,
          payload: null,
          bytes: 0,
          spilled: true,
          revision: 0,
          parentVersion,
          enqueuedAt: Date.now(),
          attempts: 0,
          lastError: null
        }
        carry(entry, payload)
        fitBudget(entry)
        entries.push(entry)
        byResource.set(key, entry)
      }

      persist().catch(() => {})
      scheduleFlush()
    },

    /**
     * Force an immediate flush (skip debounce). Used by "Sync now" button.
     */
    flushNow () {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      return flush()
    },

    /**
     * Pause the queue. Outgoing pushes will not fire until resume(). Pending
     * entries remain in the queue.
     */
    pause () {
      paused = true
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      setStatus('paused')
    },

    /**
     * Resume after pause. If entries pending, schedule a flush.
     */
    resume () {
      paused = false
      pauseUntil = 0
      backoffMs = RETRY_BASE_MS
      lastError = null
      if (entries.length > 0) {
        scheduleFlush(true)
      } else {
        setStatus('idle')
      }
    },

    /**
     * Drop all queued entries. Used during duress mode entry — we never want
     * to push pending edits after duress. Returns the dropped count.
     */
    clear () {
      const n = entries.length
      resetEntries()
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      persist().catch(() => {})
      setStatus('idle')
      return n
    },

    /**
     * Restore from persistent backend. Caller invokes once on app startup
     * after credentials are available.
     */
    restore,

    /**
     * Snapshot of queue state. Use for status indicators.
     * @returns {QueueState}
     */
    state () {
      return {
        entries: entries.slice(),
        status,
        nextFlushAt: flushTimer ? Date.now() + DEBOUNCE_MS : null,
        lastError,
        lastSuccessAt,
        pendingCount: entries.length
      }
    },

    /**
     * Number of pending entries (for badge in UI).
     * @returns {number}
     */
    pendingCount () {
      return entries.length
    },

    /**
     * Release all timers + clear in-memory state. Used in tests to prevent
     * pending setTimeouts from keeping Node alive, and in production when
     * tearing down on app close. Does NOT clear persistent storage.
     */
    dispose () {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      resetEntries()
      flushing = false
      paused = true
      pauseUntil = 0
      backoffMs = RETRY_BASE_MS
      lastError = null
    }
  }
}

// =============================================================================
// Base64 helper — needed for ciphertext serialization on the wire.
// btoa/atob exist in browsers and modern Node. Use Buffer fallback for older
// runtimes that lack them.
// =============================================================================

export function base64Encode (bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('base64Encode: input must be Uint8Array')
  }
  if (typeof btoa === 'function') {
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
  }
  // Node fallback
  // eslint-disable-next-line no-undef
  return Buffer.from(bytes).toString('base64')
}

export function base64Decode (str) {
  if (typeof str !== 'string') throw new Error('base64Decode: input must be string')
  if (typeof atob === 'function') {
    const bin = atob(str)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  // eslint-disable-next-line no-undef
  return new Uint8Array(Buffer.from(str, 'base64'))
}
