/**
 * Object URLs for photos: shared per photo, counted per use, trimmed by size.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createObjectUrlCache, AttachmentNotOnDeviceError } from '../lib/attachmentObjectUrls.js'

function harness ({ files = {}, maxBytes = 100 } = {}) {
  const created = []
  const revoked = []
  let loads = 0
  let next = 0
  const cache = createObjectUrlCache({
    load: async (id) => {
      loads++
      return files[id] ? new Uint8Array(files[id]) : null
    },
    createUrl: (bytes, mimeType) => {
      const url = `blob:test/${++next}`
      created.push({ url, size: bytes.byteLength, mimeType })
      return url
    },
    revokeUrl: (url) => revoked.push(url),
    maxBytes
  })
  return { cache, created, revoked, loads: () => loads }
}

describe('createObjectUrlCache', () => {
  it('loads a photo once and shares its URL, even between acquires that overlap', async () => {
    const { cache, created, loads } = harness({ files: { a: 10 } })
    const [first, second] = await Promise.all([cache.acquire('a', 'image/png'), cache.acquire('a', 'image/png')])
    assert.equal(first, second)
    assert.equal(loads(), 1)
    assert.deepEqual(created, [{ url: first, size: 10, mimeType: 'image/png' }])
    assert.deepEqual(cache.stats(), { entries: 1, inUse: 1, cachedBytes: 10 })
  })

  it('keeps an unused photo cached while unused photos fit the budget', async () => {
    const { cache, revoked, loads } = harness({ files: { a: 10 } })
    await cache.acquire('a')
    cache.release('a')
    assert.deepEqual(revoked, [])
    await cache.acquire('a')
    assert.equal(loads(), 1)
  })

  it('revokes the least recently used unused photos once the budget is passed', async () => {
    const { cache, revoked } = harness({ files: { a: 60, b: 60, c: 60 }, maxBytes: 100 })
    const urlA = await cache.acquire('a')
    cache.release('a')
    const urlB = await cache.acquire('b')
    cache.release('b')
    assert.deepEqual(revoked, [urlA])
    await cache.acquire('c')
    cache.release('c')
    assert.deepEqual(revoked, [urlA, urlB])
  })

  it('never revokes a photo that is still shown', async () => {
    const { cache, revoked } = harness({ files: { a: 90, b: 90 }, maxBytes: 10 })
    const urlA = await cache.acquire('a')
    await cache.acquire('b')
    cache.release('b')
    assert.equal(revoked.includes(urlA), false)
  })

  it('rejects a photo that is not on this device, and tries again next time', async () => {
    const files = {}
    const { cache, loads } = harness({ files })
    await assert.rejects(cache.acquire('missing'), AttachmentNotOnDeviceError)
    files.missing = 5
    assert.match(await cache.acquire('missing'), /^blob:/)
    assert.equal(loads(), 2)
  })

  it('does not cache a URL for a photo forgotten while it loaded', async () => {
    const { cache, created } = harness({ files: { a: 5 } })
    const pending = cache.acquire('a')
    cache.forget('a')
    await assert.rejects(pending, AttachmentNotOnDeviceError)
    assert.deepEqual(created, [])
    assert.deepEqual(cache.stats(), { entries: 0, inUse: 0, cachedBytes: 0 })
  })

  it('revokes on forget and clear, and ignores extra releases', async () => {
    const { cache, revoked } = harness({ files: { a: 5, b: 5 } })
    const urlA = await cache.acquire('a')
    const urlB = await cache.acquire('b')
    cache.release('a')
    cache.release('a')
    cache.release('never')
    cache.forget('a')
    assert.deepEqual(revoked, [urlA])
    cache.clear()
    assert.deepEqual(revoked, [urlA, urlB])
    assert.deepEqual(cache.stats(), { entries: 0, inUse: 0, cachedBytes: 0 })
  })
})
