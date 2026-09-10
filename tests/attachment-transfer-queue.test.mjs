/**
 * Attachment transfers: pacing, retries, headroom, reconcile, persistence.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const tq = await import('../lib/attachmentTransferQueue.js')
const { createAttachmentTransferQueue, RETRY_BASE_MS, TRANSFER_WINDOW_MS, VAULT_LIMIT_BYTES, PHOTO_HEADROOM } = tq

function harness ({ upload, download, exists, usage, local = {}, canRun = () => true, persisted = [] } = {}) {
  let clock = 1_000_000_000
  const timers = []
  const data = new Map(Object.entries(local).map(([id, bytes]) => [id, new Uint8Array(bytes)]))
  const calls = { upload: [], download: [], exists: [] }
  const reply = (handler, fallback, ...args) => (typeof handler === 'function' ? handler(...args) : (handler ?? fallback))
  const queue = createAttachmentTransferQueue({
    relay: {
      async upload (id, bytes) { calls.upload.push(id); return reply(upload, { ok: true }, id, bytes) },
      async download (id) { calls.download.push(id); return reply(download, { ok: true, bytes: new Uint8Array([7]) }, id) },
      async exists (ids) { calls.exists.push(ids); return reply(exists, { ok: true, present: [], missing: ids }, ids) }
    },
    store: {
      async load (id) { return data.get(id) ?? null },
      async save (id, bytes) { data.set(id, bytes) },
      async has (id) { return data.has(id) }
    },
    persist: {
      async read () { return persisted.at(-1) ?? null },
      async write (state) { persisted.push(JSON.parse(JSON.stringify(state))) }
    },
    getUsage: () => (usage ? usage() : null),
    canRun,
    now: () => clock,
    setTimer: (fn, ms) => { const handle = { fn, at: clock + ms }; timers.push(handle); return handle },
    clearTimer: (handle) => { const i = timers.indexOf(handle); if (i >= 0) timers.splice(i, 1) }
  })

  async function advance (ms) {
    clock += ms
    for (;;) {
      const due = timers.filter(t => t.at <= clock).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers.splice(timers.indexOf(due), 1)
      due.fn()
      await queue.idle()
    }
  }

  return { queue, data, calls, persisted, advance }
}

const files = (n, size = 10) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, new Array(size).fill(i)]))

describe('attachment transfers — pacing', () => {
  it('stays within five transfers a minute', async () => {
    const h = harness({ local: files(12) })
    h.queue.enqueueUpload(Object.keys(files(12)))
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 5)
    await h.advance(TRANSFER_WINDOW_MS)
    assert.equal(h.calls.upload.length, 10)
    await h.advance(TRANSFER_WINDOW_MS)
    assert.equal(h.calls.upload.length, 12)
    assert.equal(h.queue.summary().uploads, 0)
  })

  it('estimates the wait from the allowance', () => {
    const h = harness({ canRun: () => false })
    h.queue.enqueueUpload(Object.keys(files(12)))
    assert.equal(h.queue.summary().etaMs, 3 * TRANSFER_WINDOW_MS)
  })

  it('pauses every transfer for as long as Retry-After says', async () => {
    let calls = 0
    const h = harness({
      local: files(2),
      upload: () => (++calls === 1 ? { ok: false, errorCode: 'rate-limited', retryAfterMs: 30_000 } : { ok: true })
    })
    h.queue.enqueueUpload(['f0', 'f1'])
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 1)
    await h.advance(29_999)
    assert.equal(h.calls.upload.length, 1)
    await h.advance(1)
    assert.equal(h.calls.upload.length, 3)
    assert.equal(h.queue.summary().uploads, 0)
  })

  it('does not queue the same transfer twice', () => {
    const h = harness({ canRun: () => false })
    h.queue.enqueueUpload(['a', 'a'])
    h.queue.enqueueUpload('a')
    assert.equal(h.queue.summary().uploads, 1)
  })

  it('does nothing while it cannot run, and starts when kicked', async () => {
    let allowed = false
    const h = harness({ local: files(1), canRun: () => allowed })
    h.queue.enqueueUpload('f0')
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 0)
    allowed = true
    await h.queue.kick()
    assert.equal(h.calls.upload.length, 1)
  })
})

describe('attachment transfers — failures', () => {
  it('backs off after a network failure and retries until the upload lands', async () => {
    let calls = 0
    const h = harness({ local: files(1), upload: () => (++calls < 3 ? { ok: false, errorCode: 'network' } : { ok: true }) })
    h.queue.enqueueUpload('f0')
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 1)
    await h.advance(RETRY_BASE_MS)
    assert.equal(h.calls.upload.length, 2)
    await h.advance(2 * RETRY_BASE_MS)
    assert.equal(h.calls.upload.length, 3)
    assert.deepEqual(h.queue.summary().failed, [])
    assert.equal(h.queue.summary().uploads, 0)
  })

  it('lists an attachment missing from this device instead of retrying it forever', async () => {
    const h = harness()
    h.queue.enqueueUpload('gone')
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 0)
    assert.deepEqual(h.queue.summary().failed.map(f => [f.id, f.reason]), [['gone', 'missing-on-device']])
    assert.equal(h.queue.summary().uploads, 0)
  })

  it('lists a file the relay can never accept', async () => {
    const h = harness({ local: files(1), upload: { ok: false, errorCode: 'payload-too-large' } })
    h.queue.enqueueUpload('f0')
    await h.queue.idle()
    assert.deepEqual(h.queue.summary().failed.map(f => f.reason), ['too-large'])
  })

  it('pauses uploads, not downloads, while the relay is out of attachment space', async () => {
    let uploads = 0
    const h = harness({
      local: files(1),
      upload: () => (++uploads === 1 ? { ok: false, errorCode: 'capacity', retryAfterMs: 3_600_000 } : { ok: true })
    })
    h.queue.enqueueUpload('f0')
    h.queue.enqueueDownload('remote-1')
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 1)
    assert.equal(h.calls.download.length, 1)
    assert.ok(h.queue.summary().uploadsPausedUntil)
    await h.advance(TRANSFER_WINDOW_MS)
    assert.equal(h.calls.upload.length, 1)
    await h.advance(3_600_000)
    assert.equal(h.calls.upload.length, 2)
  })

  it('keeps the last tenth of sync storage for notes', async () => {
    const limit = VAULT_LIMIT_BYTES * PHOTO_HEADROOM
    let used = limit - 5
    const h = harness({ local: files(1, 10), usage: () => ({ totalBytes: used }) })
    h.queue.enqueueUpload('f0')
    await h.queue.idle()
    assert.equal(h.calls.upload.length, 0)
    assert.equal(h.queue.summary().uploadsHeld, true)
    used = limit - 1000
    await h.queue.refresh()
    assert.equal(h.calls.upload.length, 1)
    assert.equal(h.queue.summary().uploadsHeld, false)
  })

  it('retries a download its own device has not uploaded yet, then saves it', async () => {
    let calls = 0
    const h = harness({ download: () => (++calls === 1 ? { ok: false, errorCode: 'not-found' } : { ok: true, bytes: new Uint8Array([1, 2]) }) })
    h.queue.enqueueDownload('photo')
    await h.queue.idle()
    assert.equal(h.calls.download.length, 1)
    assert.equal(h.queue.summary().downloads, 1)
    await h.advance(RETRY_BASE_MS)
    assert.equal(h.calls.download.length, 2)
    assert.deepEqual([...h.data.get('photo')], [1, 2])
    assert.equal(h.queue.summary().downloads, 0)
  })
})

describe('attachment transfers — reconcile', () => {
  it('downloads what this device lacks and uploads only what the relay lacks', async () => {
    const h = harness({ local: { a: [1], b: [2], c: [3] }, exists: (ids) => ({ ok: true, present: ids.filter(id => id === 'a'), missing: ids.filter(id => id !== 'a') }) })
    await h.queue.reconcile(['a', 'b', 'c', 'd', 'a'])
    await h.queue.idle()
    assert.deepEqual(h.calls.exists, [['a', 'b', 'c']])
    assert.deepEqual(h.calls.upload.sort(), ['b', 'c'])
    assert.deepEqual(h.calls.download, ['d'])
  })

  it('offers every local upload to a relay that predates the exists check', async () => {
    const h = harness({ local: { a: [1], b: [2] }, exists: { ok: false, errorCode: 'not-found' } })
    await h.queue.reconcile(['a', 'b'])
    await h.queue.idle()
    assert.deepEqual(h.calls.upload.sort(), ['a', 'b'])
  })
})

describe('attachment transfers — persistence', () => {
  it('restores pending work and failures after a restart', async () => {
    const persisted = []
    const first = harness({ canRun: () => false, persisted })
    first.queue.enqueueUpload(['x', 'y'])
    first.queue.enqueueDownload('z')
    await new Promise(resolve => setTimeout(resolve, 10))
    first.queue.dispose()

    const second = harness({ canRun: () => false, persisted })
    await second.queue.restore()
    const summary = second.queue.summary()
    assert.equal(summary.uploads, 2)
    assert.equal(summary.downloads, 1)
  })
})

describe('attachment transfers — clear', () => {
  it('forgets pending work and failures', async () => {
    const h = harness()
    h.queue.enqueueUpload('missing')
    await h.queue.idle()
    h.queue.enqueueDownload('elsewhere')
    h.queue.clear()
    const summary = h.queue.summary()
    assert.equal(summary.uploads + summary.downloads, 0)
    assert.deepEqual(summary.failed, [])
  })
})
