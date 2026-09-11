/**
 * Importers: storing photos and files, with location removed and every copy
 * read back.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { storeImportResource } = await import('../lib/import/attachments.js')
const { attachmentIdForBytes } = await import('../lib/imageAttachments.js')
const { imageDimensions } = await import('../lib/attachmentRefs.js')

const ascii = (s) => Array.from(s, c => c.charCodeAt(0))
const cat = (...parts) => Uint8Array.from(parts.flatMap(part => Array.from(part)))
const be16 = (n) => [n >> 8, n & 0xFF]
const be32 = (n) => [n >>> 24, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]
const LATITUDE = [0, 0, 0, 51, 0, 0, 0, 1, 0, 0, 0, 30, 0, 0, 0, 1]

function exifWithGps () {
  return cat(
    ascii('MM'), be16(42), be32(8),
    be16(2), be16(0x0112), be16(3), be32(1), be16(1), be16(0), be16(0x8825), be16(4), be32(1), be32(38), be32(0),
    be16(1), be16(0x0002), be16(5), be32(3), be32(56), be32(0),
    LATITUDE, [0, 0, 0, 0, 0, 0, 0, 1]
  )
}
const segment = (marker, payload) => cat([0xFF, marker], be16(payload.length + 2), payload)
const jpeg = () => cat(
  [0xFF, 0xD8],
  segment(0xE0, cat(ascii('JFIF\0'), [1, 1, 0, 0, 1, 0, 1, 0, 0])),
  segment(0xE1, cat(ascii('Exif\0\0'), exifWithGps())),
  segment(0xDB, [0, ...new Array(64).fill(1)]),
  segment(0xC0, [8, ...be16(16), ...be16(32), 1, 1, 0x11, 0]),
  segment(0xC4, [0x00, 1, ...new Array(15).fill(0), 0]),
  segment(0xDA, [1, 1, 0x00, 0, 63, 0]), [0x12, 0x34],
  [0xFF, 0xD9]
)
const tinyJpeg = () => cat([0xFF, 0xD8], segment(0xC0, [8, ...be16(2), ...be16(4), 1, 1, 0x11, 0]), segment(0xDA, [1, 1, 0, 0, 63, 0]), [0x01], [0xFF, 0xD9])

function heic () {
  const box = (type, content) => cat(be32(content.length + 8), ascii(type), content)
  const full = (type, version, content) => box(type, cat([version, 0, 0, 0], content))
  const imageData = new Array(10).fill(0xAA)
  const exifData = cat(be32(0), exifWithGps())
  const infe = (id, type) => full('infe', 2, cat(be16(id), be16(0), ascii(type), [0]))
  const ftyp = box('ftyp', cat(ascii('heic'), be32(0), ascii('mif1heic')))
  const build = (mdatStart) => {
    const at = [mdatStart + 8, mdatStart + 8 + imageData.length]
    const lengths = [imageData.length, exifData.length]
    const items = [1, 2].map((id, k) => cat(be16(id), be16(0), be16(0), be16(1), be32(at[k]), be32(lengths[k])))
    return full('meta', 0, cat(full('iinf', 0, cat(be16(2), infe(1, 'hvc1'), infe(2, 'Exif'))), full('iloc', 1, cat([0x44, 0x00], be16(2), ...items))))
  }
  const meta = build(ftyp.length + build(0).length)
  return cat(ftyp, meta, box('mdat', cat(imageData, exifData)))
}

function includes (haystack, needle) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let k = 0; k < needle.length; k++) if (haystack[i + k] !== needle[k]) continue outer
    return true
  }
  return false
}

const keyBytes = new Uint8Array(32).fill(7)
function memoryStore () {
  const map = new Map()
  return { map, save: async (id, buffer) => { map.set(id, new Uint8Array(buffer)) }, load: async (id) => map.get(id) ?? null }
}
const resource = (name, bytes, mimeType) => ({ key: name, name, mimeType, size: bytes.length, blob: new Blob([bytes], { type: mimeType }) })

describe('storeImportResource', () => {
  it('stores a photo without its location, under an id made from the stored bytes', async () => {
    const storage = memoryStore()
    const result = await storeImportResource({ resource: resource('beach.jpg', jpeg(), 'image/jpeg'), as: 'photo' }, { keyBytes, storage })
    const stored = storage.map.get(result.attachmentId)
    assert.equal(result.kind, 'photo')
    assert.equal(includes(stored, LATITUDE), false)
    assert.equal(result.attachmentId, await attachmentIdForBytes(stored, keyBytes))
    assert.deepEqual(result.data, { attachmentId: result.attachmentId, mimeType: 'image/jpeg', ...imageDimensions(stored), filename: 'beach.jpg' })
    assert.deepEqual(result.notices, [])
    assert.equal(result.created, true)

    const again = await storeImportResource({ resource: resource('copy.jpg', jpeg(), 'image/jpeg'), as: 'photo' }, { keyBytes, storage })
    assert.equal(again.attachmentId, result.attachmentId, 'the same photo is stored once')
    assert.equal(again.created, false, 'a photo stored before was not created by this import')
    assert.equal(storage.map.size, 1)
  })

  it('converts HEIC where the device can decode it, and otherwise keeps it as a file without its location', async () => {
    const converted = await storeImportResource({ resource: resource('IMG_1.HEIC', heic(), 'image/heic'), as: 'photo' }, { keyBytes, storage: memoryStore(), convertHeic: async () => jpeg() })
    assert.deepEqual([converted.kind, converted.data.filename, converted.notices], ['photo', 'IMG_1.jpg', ['heic-converted']])

    const storage = memoryStore()
    const kept = await storeImportResource({ resource: resource('IMG_1.HEIC', heic(), 'image/heic'), as: 'photo' }, { keyBytes, storage, convertHeic: async () => null })
    assert.deepEqual([kept.kind, kept.data.filename, kept.data.mimeType, kept.notices], ['file', 'IMG_1.HEIC', 'image/heic', ['heic-kept-as-file']])
    const stored = storage.map.get(kept.attachmentId)
    assert.equal(stored.length, heic().length)
    assert.equal(includes(stored, LATITUDE), false)
  })

  it('makes a photo over the limit just small enough, and refuses when it cannot', async () => {
    const big = resource('big.jpg', jpeg(), 'image/jpeg')
    const fitted = await storeImportResource({ resource: big, as: 'photo' }, { keyBytes, storage: memoryStore(), maxBytes: 120, fitPhoto: async () => tinyJpeg() })
    assert.deepEqual([fitted.kind, fitted.data.width, fitted.data.height, fitted.notices], ['photo', 4, 2, ['photo-resized']])
    await assert.rejects(storeImportResource({ resource: big, as: 'photo' }, { keyBytes, storage: memoryStore(), maxBytes: 120 }), { code: 'too-large' })
  })

  it('keeps images a photo block cannot show as files, and says the location stayed', async () => {
    const tiff = cat(ascii('II*\0'), [8, 0, 0, 0])
    const result = await storeImportResource({ resource: resource('scan.tif', tiff, 'image/tiff'), as: 'photo' }, { keyBytes, storage: memoryStore() })
    assert.deepEqual([result.kind, result.data.mimeType, result.data.size, result.data.preview, result.notices], ['file', 'image/tiff', 8, '', ['location-not-removed']])
  })

  it('stores files as they are, within the limit', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 plan')
    const result = await storeImportResource({ resource: resource('plan.pdf', pdf, 'application/pdf'), as: 'file' }, { keyBytes, storage: memoryStore() })
    assert.deepEqual(result.data, { attachmentId: result.attachmentId, filename: 'plan.pdf', mimeType: 'application/pdf', size: pdf.length, preview: '' })
    await assert.rejects(storeImportResource({ resource: resource('plan.pdf', pdf, 'application/pdf'), as: 'file' }, { keyBytes, storage: memoryStore(), maxBytes: 3 }), { code: 'too-large' })
  })

  it('announces a write before it happens, and never for a copy already stored', async () => {
    const storage = memoryStore()
    const order = []
    const recording = { load: storage.load, save: async (id, buffer) => { order.push(['save', id]); return storage.save(id, buffer) } }
    const beforeSave = async (id) => { order.push(['announce', id]) }
    const first = await storeImportResource({ resource: resource('beach.jpg', jpeg(), 'image/jpeg'), as: 'photo', beforeSave }, { keyBytes, storage: recording })
    assert.deepEqual(order, [['announce', first.attachmentId], ['save', first.attachmentId]])
    await storeImportResource({ resource: resource('copy.jpg', jpeg(), 'image/jpeg'), as: 'photo', beforeSave }, { keyBytes, storage: recording })
    assert.equal(order.length, 2, 'the same photo again is neither announced nor written')
  })

  it('says a file was created only when nothing, readable or not, was stored under its id', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 plan')
    const storage = memoryStore()
    const first = await storeImportResource({ resource: resource('plan.pdf', pdf, 'application/pdf'), as: 'file' }, { keyBytes, storage })
    const second = await storeImportResource({ resource: resource('plan.pdf', pdf, 'application/pdf'), as: 'file' }, { keyBytes, storage })
    assert.deepEqual([first.created, second.created], [true, false])
    let loads = 0
    const busy = { save: storage.save, load: async (id) => { if (loads++ === 0) throw new Error('busy'); return storage.load(id) } }
    const other = await storeImportResource({ resource: resource('other.pdf', new TextEncoder().encode('%PDF-1.4 other'), 'application/pdf'), as: 'file' }, { keyBytes, storage: busy })
    assert.equal(other.created, false, 'a copy that could not be checked is never taken back')
  })

  it('never counts a copy that did not read back, or a file it could not read', async () => {
    const lossy = { save: async () => {}, load: async () => null }
    await assert.rejects(storeImportResource({ resource: resource('plan.pdf', new Uint8Array([1, 2]), 'application/pdf'), as: 'file' }, { keyBytes, storage: lossy }), { code: 'not-saved' })
    await assert.rejects(storeImportResource({ resource: resource('beach.jpg', jpeg(), 'image/jpeg'), as: 'photo' }, { keyBytes, storage: lossy }), { code: 'not-saved' })
    await assert.rejects(storeImportResource({ resource: { key: 'x', name: 'x.png', mimeType: 'image/png' }, as: 'photo' }, { keyBytes, storage: memoryStore(), readResource: async () => { throw new Error('gone') } }), { code: 'unreadable' })
  })
})
