/**
 * Dash Sync — attachment transfers
 *
 * Moves attachment bytes between this device and the relay: uploads the ones
 * the relay lacks, and downloads the ones a note references that this device
 * lacks. It replaces fire-and-forget transfers that were never retried, where
 * one dropped connection or a suspended app left a photo unsynced for good.
 *
 *   - Durable: pending work and failures survive a restart.
 *   - Paced to the relay's allowance (TRANSFERS_PER_MINUTE per device, shared
 *     by uploads and downloads), and honours Retry-After.
 *   - A failed transfer backs off and retries. One that cannot succeed is
 *     listed in `failed` rather than forgotten.
 *   - An upload that would take the vault past PHOTO_HEADROOM of its sync
 *     storage waits, so notes always keep room to sync.
 *
 * Pure: the relay, the local store, persistence, the clock and timers are all
 * injected.
 */

export const TRANSFERS_PER_MINUTE = 5
export const TRANSFER_WINDOW_MS = 60 * 1000
export const VAULT_LIMIT_BYTES = 500 * 1024 * 1024
export const PHOTO_HEADROOM = 0.9
export const RETRY_BASE_MS = 30 * 1000
export const RETRY_MAX_MS = 60 * 60 * 1000
// A download the relay doesn't have yet is usually still uploading from its
// own device, so it is retried for longer.
export const NOT_ON_RELAY_RETRY_MAX_MS = 6 * 60 * 60 * 1000
export const CAPACITY_PAUSE_MS = 60 * 60 * 1000
// After this many failed attempts a transfer is listed in `failed` while it
// keeps retrying.
export const ATTEMPTS_BEFORE_LISTED = 5
export const EXISTS_BATCH = 200

const STATE_VERSION = 1

function toBytes (value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

/**
 * @param {Object} opts
 * @param {{ upload(id, bytes), download(id), exists(ids) }} opts.relay
 *   Each resolves to `{ ok, errorCode?, retryAfterMs? }`; download adds `bytes`,
 *   exists adds `present` and `missing`.
 * @param {{ load(id), save(id, bytes), has(id) }} opts.store - this device's attachments
 * @param {{ read(), write(state) }} [opts.persist]
 * @param {() => ({ totalBytes: number }|null)} [opts.getUsage] - latest known vault usage
 * @param {() => boolean} [opts.canRun] - false while sync is off, locked, or in duress
 * @param {(summary) => void} [opts.onChange]
 */
export function createAttachmentTransferQueue ({
  relay,
  store,
  persist = null,
  getUsage = () => null,
  canRun = () => true,
  onChange = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  limits = {}
} = {}) {
  if (!relay || !store) throw new Error('createAttachmentTransferQueue: relay and store required')

  const perWindow = limits.transfersPerMinute ?? TRANSFERS_PER_MINUTE
  const windowMs = limits.windowMs ?? TRANSFER_WINDOW_MS
  const vaultLimit = limits.vaultLimitBytes ?? VAULT_LIMIT_BYTES
  const headroom = limits.photoHeadroom ?? PHOTO_HEADROOM

  /** @type {Array<{id: string, direction: 'upload'|'download', attempts: number, notBefore: number, lastError: string|null, addedAt: number, size?: number}>} */
  let jobs = []
  const byKey = new Map()
  /** @type {Array<{id: string, direction: string, reason: string, at: number}>} */
  let failed = []
  const recent = []
  let pausedUntil = 0
  let uploadsPausedUntil = 0
  let uploadsHeld = false
  let paused = false
  let pumping = null
  let timer = null
  let disposed = false

  const keyOf = (direction, id) => `${direction}:${id}`

  // ── State ───────────────────────────────────────────────────────────────

  function summary () {
    const uploads = jobs.filter(j => j.direction === 'upload').length
    return {
      uploads,
      downloads: jobs.length - uploads,
      failed: failed.slice(),
      uploadsHeld,
      pausedUntil: pausedUntil > now() ? pausedUntil : null,
      uploadsPausedUntil: uploadsPausedUntil > now() ? uploadsPausedUntil : null,
      etaMs: Math.ceil(jobs.length / perWindow) * windowMs
    }
  }

  function notify () {
    try { onChange(summary()) } catch { /* caller's problem */ }
  }

  let persistChain = Promise.resolve()
  function save () {
    if (!persist) return persistChain
    const state = {
      version: STATE_VERSION,
      jobs: jobs.map(({ id, direction, attempts, notBefore, lastError, addedAt }) => ({ id, direction, attempts, notBefore, lastError, addedAt })),
      failed: failed.slice()
    }
    persistChain = persistChain
      .then(() => persist.write(state))
      .catch(err => { console.error('attachmentTransferQueue: persist failed', err) })
    return persistChain
  }

  async function restore () {
    if (!persist) return
    try {
      const state = await persist.read()
      if (!state || state.version !== STATE_VERSION) return
      for (const job of Array.isArray(state.jobs) ? state.jobs : []) {
        addJob(job.direction, job.id, job)
      }
      const known = new Set(failed.map(f => keyOf(f.direction, f.id)))
      for (const f of Array.isArray(state.failed) ? state.failed : []) {
        if (f && typeof f.id === 'string' && !known.has(keyOf(f.direction, f.id))) failed.push(f)
      }
      notify()
      kick()
    } catch (err) {
      console.error('attachmentTransferQueue: restore failed', err)
    }
  }

  function addJob (direction, id, fields = {}) {
    if (typeof id !== 'string' || !id) return false
    if (direction !== 'upload' && direction !== 'download') return false
    const key = keyOf(direction, id)
    if (byKey.has(key)) return false
    const job = {
      id,
      direction,
      attempts: Number.isFinite(fields.attempts) ? fields.attempts : 0,
      notBefore: Number.isFinite(fields.notBefore) ? fields.notBefore : 0,
      lastError: fields.lastError || null,
      addedAt: Number.isFinite(fields.addedAt) ? fields.addedAt : now()
    }
    jobs.push(job)
    byKey.set(key, job)
    return true
  }

  function listFailure (job, reason) {
    failed = failed.filter(f => !(f.id === job.id && f.direction === job.direction))
    failed.push({ id: job.id, direction: job.direction, reason, at: now() })
  }

  function clearFailure (job) {
    failed = failed.filter(f => !(f.id === job.id && f.direction === job.direction))
  }

  /** Remove a job: done, or listed in `failed` with `reason` when it can't succeed. */
  function finish (job, reason = null) {
    jobs = jobs.filter(j => j !== job)
    byKey.delete(keyOf(job.direction, job.id))
    if (reason) listFailure(job, reason)
    else clearFailure(job)
    save()
  }

  function backoff (job, maxMs, reason) {
    job.attempts++
    job.lastError = reason
    job.notBefore = now() + Math.min(RETRY_BASE_MS * 2 ** (job.attempts - 1), maxMs)
    if (job.attempts >= ATTEMPTS_BEFORE_LISTED) listFailure(job, reason)
    save()
  }

  // ── Scheduling ──────────────────────────────────────────────────────────

  function schedule (ms) {
    if (timer) clearTimer(timer)
    timer = setTimer(() => { timer = null; kick() }, Math.max(0, ms))
  }

  function uploadsBlocked (t) {
    return uploadsHeld || t < uploadsPausedUntil
  }

  function nextJob (t) {
    for (const job of jobs) {
      if (job.notBefore > t) continue
      if (job.direction === 'upload' && uploadsBlocked(t)) continue
      return job
    }
    return null
  }

  /** When the earliest waiting job becomes runnable, or null if none will on their own. */
  function nextWake (t) {
    let wake = null
    for (const job of jobs) {
      let at = job.notBefore
      if (job.direction === 'upload') {
        if (uploadsHeld) continue
        at = Math.max(at, uploadsPausedUntil)
      }
      if (wake === null || at < wake) wake = at
    }
    return wake === null ? null : Math.max(wake, t)
  }

  /** How long until a transfer slot frees up in the current window. */
  function slotWait (t) {
    while (recent.length > 0 && recent[0] <= t - windowMs) recent.shift()
    return recent.length < perWindow ? 0 : recent[0] + windowMs - t
  }

  function kick () {
    if (disposed) return Promise.resolve()
    if (!pumping) {
      pumping = pump().finally(() => { pumping = null })
    }
    return pumping
  }

  async function pump () {
    if (timer) {
      clearTimer(timer)
      timer = null
    }
    while (!disposed && !paused && canRun()) {
      const t = now()
      if (t < pausedUntil) return schedule(pausedUntil - t)
      const job = nextJob(t)
      if (!job) {
        const wake = nextWake(t)
        if (wake !== null) schedule(wake - t)
        return
      }
      const wait = slotWait(t)
      if (wait > 0) return schedule(wait)
      if (job.direction === 'upload') await runUpload(job)
      else await runDownload(job)
      notify()
    }
  }

  // ── Transfers ───────────────────────────────────────────────────────────

  async function attempt (fn) {
    try {
      return await fn()
    } catch (err) {
      return { ok: false, errorCode: 'exception', message: err?.message }
    }
  }

  function wouldCrowdOutNotes (size) {
    const usage = getUsage()
    return !!usage && typeof usage.totalBytes === 'number' && usage.totalBytes + size > vaultLimit * headroom
  }

  async function runUpload (job) {
    // A file already known to be too big for the space left waits without
    // reading it again.
    if (typeof job.size === 'number' && wouldCrowdOutNotes(job.size)) {
      uploadsHeld = true
      return
    }
    let bytes = null
    try {
      bytes = toBytes(await store.load(job.id))
    } catch { /* treated as missing below */ }
    if (!bytes) {
      finish(job, 'missing-on-device')
      return
    }
    job.size = bytes.byteLength
    if (wouldCrowdOutNotes(bytes.byteLength)) {
      // Keep the last part of sync storage for notes.
      uploadsHeld = true
      return
    }
    recent.push(now())
    const result = await attempt(() => relay.upload(job.id, bytes))
    if (result?.ok) {
      finish(job)
      return
    }
    handleFailure(job, result)
  }

  async function runDownload (job) {
    if (await attempt(() => store.has(job.id)) === true) {
      finish(job)
      return
    }
    recent.push(now())
    const result = await attempt(() => relay.download(job.id))
    if (result?.ok && result.bytes) {
      try {
        await store.save(job.id, result.bytes)
      } catch (err) {
        backoff(job, RETRY_MAX_MS, 'save-failed')
        return
      }
      if (await attempt(() => store.has(job.id)) === true) finish(job)
      else backoff(job, RETRY_MAX_MS, 'save-failed')
      return
    }
    handleFailure(job, result)
  }

  function handleFailure (job, result) {
    const code = result?.errorCode || 'unknown'
    switch (code) {
      case 'rate-limited':
        // The relay's allowance, not this job's fault: pause everything.
        pausedUntil = now() + (result.retryAfterMs ?? windowMs)
        job.lastError = code
        save()
        return
      case 'capacity':
        // The relay is out of space for attachments; downloads carry on.
        uploadsPausedUntil = now() + (result.retryAfterMs ?? CAPACITY_PAUSE_MS)
        job.lastError = code
        save()
        return
      case 'vault-full':
        uploadsHeld = true
        job.lastError = code
        save()
        return
      case 'payload-too-large':
      case 'too-large':
        finish(job, 'too-large')
        return
      case 'decrypt-failed':
        finish(job, 'unreadable')
        return
      case 'not-found':
        backoff(job, NOT_ON_RELAY_RETRY_MAX_MS, 'not-on-relay')
        return
      default:
        backoff(job, RETRY_MAX_MS, code)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  function enqueue (direction, ids) {
    let added = false
    for (const id of [].concat(ids)) {
      if (addJob(direction, id)) added = true
    }
    if (added) {
      save()
      notify()
      kick()
    }
  }

  /**
   * Queue what the pages reference: downloads for attachments this device
   * lacks, and uploads for the ones the relay lacks.
   */
  async function reconcile (referencedIds) {
    const ids = [...new Set((referencedIds || []).filter(id => typeof id === 'string' && id))]
    const local = []
    for (const id of ids) {
      if (await attempt(() => store.has(id)) === true) local.push(id)
      else addJob('download', id)
    }
    for (let i = 0; i < local.length; i += EXISTS_BATCH) {
      const chunk = local.slice(i, i + EXISTS_BATCH)
      const result = await attempt(() => relay.exists(chunk))
      if (result?.ok) {
        for (const id of result.missing || []) addJob('upload', id)
      } else if (result?.errorCode === 'not-found') {
        // A relay older than the exists check: offer every upload, and the
        // relay skips the ones it already holds.
        for (const id of chunk) addJob('upload', id)
      } else {
        break // try again at the next reconcile
      }
    }
    save()
    notify()
    kick()
  }

  return {
    restore,
    enqueueUpload: (ids) => enqueue('upload', ids),
    enqueueDownload: (ids) => enqueue('download', ids),
    reconcile,
    kick,
    /** Vault usage may have changed: let held uploads try again. */
    refresh () {
      uploadsHeld = false
      notify()
      return kick()
    },
    pause () {
      paused = true
      if (timer) {
        clearTimer(timer)
        timer = null
      }
    },
    resume () {
      paused = false
      uploadsHeld = false
      return kick()
    },
    /** Forget all pending work and failures, e.g. when sync is turned off. */
    clear () {
      jobs = []
      byKey.clear()
      failed = []
      pausedUntil = 0
      uploadsPausedUntil = 0
      uploadsHeld = false
      save()
      notify()
    },
    /** Resolves once the current run has nothing left it can do right now. */
    idle: () => pumping || Promise.resolve(),
    summary,
    dispose () {
      disposed = true
      if (timer) {
        clearTimer(timer)
        timer = null
      }
    }
  }
}
