/**
 * Storing photos as attachments: content ids, verified writes, block data.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const {
  attachmentIdForBytes,
  vaultAttachmentIdKey,
  storeImageBytes,
  buildImageBlockData,
  ImageTooLargeError,
  ImageNotSavedError
} = await import('../lib/imageAttachments.js')
const { imageStubUrl } = await import('../lib/attachmentRefs.js')
const { deriveAuthKey } = await import('../lib/syncCrypto.js')

const KEY = new Uint8Array(32).fill(7)
const OTHER_KEY = new Uint8Array(32).fill(9)

function png (width, height, extra = 0) {
  const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height), 8, 6, 0, 0, 0, ...new Array(extra).fill(1)])
}

// Attachment storage in memory. `damage` flips the first byte of every write.
function memoryStorage ({ damage = false } = {}) {
  const files = new Map()
  const calls = { save: 0, load: 0 }
  return {
    files,
    calls,
    async save (id, buffer) {
      calls.save++
      const copy = new Uint8Array(buffer.slice(0))
      if (damage) copy[0] ^= 0xFF
      files.set(id, copy.buffer)
    },
    async load (id) {
      calls.load++
      return files.has(id) ? files.get(id).slice(0) : null
    }
  }
}

const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ELECTRON_ID = /^[a-f0-9-]{36}$/i

describe('attachmentIdForBytes', () => {
  it('makes a version 8 UUID that Electron accepts as a file name', async () => {
    const id = await attachmentIdForBytes(png(10, 10), KEY)
    assert.match(id, UUID_V8)
    assert.match(id, ELECTRON_ID)
  })

  it('gives the same bytes and key the same id', async () => {
    assert.equal(await attachmentIdForBytes(png(10, 10), KEY), await attachmentIdForBytes(png(10, 10), KEY))
  })

  it('gives different bytes, or a different key, a different id', async () => {
    const id = await attachmentIdForBytes(png(10, 10), KEY)
    assert.notEqual(await attachmentIdForBytes(png(10, 11), KEY), id)
    assert.notEqual(await attachmentIdForBytes(png(10, 10), OTHER_KEY), id)
  })

  it('refuses a missing or short key', async () => {
    await assert.rejects(attachmentIdForBytes(png(1, 1), new Uint8Array(8)))
    await assert.rejects(attachmentIdForBytes(png(1, 1), null))
  })
})

describe('vaultAttachmentIdKey', () => {
  it('is the same for every device holding the vault key, and differs from the sync auth key', async () => {
    const vaultKey = new Uint8Array(32).fill(3)
    const key = await vaultAttachmentIdKey(vaultKey)
    assert.equal(key.length, 32)
    assert.deepEqual(key, await vaultAttachmentIdKey(new Uint8Array(32).fill(3)))
    assert.notDeepEqual(key, await deriveAuthKey(vaultKey))
  })

  it('refuses a vault key of the wrong size', async () => {
    await assert.rejects(vaultAttachmentIdKey(new Uint8Array(16)))
  })
})

describe('storeImageBytes', () => {
  it('stores the photo, reads it back, and reports what it stored', async () => {
    const storage = memoryStorage()
    const bytes = png(640, 480)
    const stored = await storeImageBytes({ bytes, keyBytes: KEY, storage })
    assert.equal(stored.attachmentId, await attachmentIdForBytes(bytes, KEY))
    assert.equal(stored.mimeType, 'image/png')
    assert.equal(stored.width, 640)
    assert.equal(stored.height, 480)
    assert.equal(stored.byteLength, bytes.byteLength)
    assert.equal(stored.reused, false)
    assert.deepEqual(new Uint8Array(storage.files.get(stored.attachmentId)), bytes)
  })

  it('reuses a copy that is already there, byte for byte, without writing', async () => {
    const storage = memoryStorage()
    await storeImageBytes({ bytes: png(5, 5), keyBytes: KEY, storage })
    const again = await storeImageBytes({ bytes: png(5, 5), keyBytes: KEY, storage })
    assert.equal(again.reused, true)
    assert.equal(storage.calls.save, 1)
  })

  it('replaces a damaged copy stored under the same id', async () => {
    const storage = memoryStorage()
    const bytes = png(5, 5)
    const id = await attachmentIdForBytes(bytes, KEY)
    storage.files.set(id, new Uint8Array([1, 2, 3]).buffer)
    const stored = await storeImageBytes({ bytes, keyBytes: KEY, storage })
    assert.equal(stored.reused, false)
    assert.deepEqual(new Uint8Array(storage.files.get(id)), bytes)
  })

  it('fails when the bytes do not read back exactly', async () => {
    await assert.rejects(storeImageBytes({ bytes: png(5, 5), keyBytes: KEY, storage: memoryStorage({ damage: true }) }), ImageNotSavedError)
  })

  it('stores a private copy, unaffected by later changes to the caller\'s array', async () => {
    const storage = memoryStorage()
    const bytes = png(5, 5)
    const stored = await storeImageBytes({ bytes, keyBytes: KEY, storage })
    bytes[20] = 99
    assert.notEqual(new Uint8Array(storage.files.get(stored.attachmentId))[20], 99)
  })

  it('refuses photos over the size limit, and data that is not an image', async () => {
    await assert.rejects(storeImageBytes({ bytes: png(5, 5, 100), keyBytes: KEY, storage: memoryStorage(), maxBytes: 64 }), ImageTooLargeError)
    await assert.rejects(storeImageBytes({ bytes: new TextEncoder().encode('just some text here'), keyBytes: KEY, storage: memoryStorage() }))
    await assert.rejects(storeImageBytes({ bytes: new Uint8Array(0), keyBytes: KEY, storage: memoryStorage() }))
  })
})

describe('buildImageBlockData', () => {
  const ID = '0f8fad5b-d9cb-869f-a165-70867728950e'

  it('writes the photo contract in a fixed key order', () => {
    const data = buildImageBlockData({ attachmentId: ID, mimeType: 'image/jpeg', width: 4032, height: 3024, filename: 'IMG_0001.HEIC', caption: 'Beach', stretched: true })
    assert.deepEqual(Object.keys(data), ['attachmentId', 'file', 'caption', 'withBorder', 'withBackground', 'stretched', 'mimeType', 'width', 'height', 'filename'])
    assert.equal(data.file.url, imageStubUrl(ID))
    assert.equal(data.stretched, true)
    assert.equal(data.withBorder, false)
  })

  it('leaves out a type, size or file name it cannot vouch for', () => {
    const data = buildImageBlockData({ attachmentId: ID, mimeType: 'text/html', width: 0, height: 10, filename: String.fromCharCode(0x202E) })
    assert.deepEqual(Object.keys(data), ['attachmentId', 'file', 'caption', 'withBorder', 'withBackground', 'stretched'])
  })

  it('refuses an id that is not an attachment id', () => {
    assert.throws(() => buildImageBlockData({ attachmentId: 'nope' }))
  })
})
