/**
 * Attachment-backed photos: ids, stubs, references and image bytes.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  isAttachmentId,
  imageStubUrl,
  attachmentIdFromStub,
  isImageStubUrl,
  imageAttachmentId,
  attachmentIdsInBlocks,
  attachmentIdsInPage,
  attachmentIdsSafeToDelete,
  sniffImageType,
  imageDimensions,
  dataUrlToBytes,
  cleanAttachmentFilename
} from '../lib/attachmentRefs.js'
import { sanitizeEditorContent } from '../utils/securityUtils.js'

const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e'
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const ID_C = 'b7e1c2d4-1111-4222-8333-444455556666'

// Byte helpers: strings are ASCII, arrays are spread, numbers are bytes.
function bytesOf (...parts) {
  const out = []
  for (const part of parts) {
    if (typeof part === 'string') for (const ch of part) out.push(ch.charCodeAt(0))
    else if (Array.isArray(part)) out.push(...part)
    else out.push(part)
  }
  return new Uint8Array(out)
}
const u16be = (n) => [(n >> 8) & 255, n & 255]
const u16le = (n) => [n & 255, (n >> 8) & 255]
const u24le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]
const u32be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const zeros = (count) => new Array(count).fill(0)

const png = (width, height) => bytesOf(0x89, 'PNG', 0x0D, 0x0A, 0x1A, 0x0A, u32be(13), 'IHDR', u32be(width), u32be(height), 8, 6, 0, 0, 0)
const gif = (width, height) => bytesOf('GIF89a', u16le(width), u16le(height), zeros(6))

function jpeg (width, height, orientation) {
  const parts = [0xFF, 0xD8]
  if (orientation) {
    const tiff = ['MM', 0x00, 0x2A, u32be(8), u16be(1), u16be(0x0112), u16be(3), u32be(1), u16be(orientation), 0, 0, u32be(0)]
    const tiffBytes = bytesOf(...tiff)
    parts.push(0xFF, 0xE1, u16be(2 + 6 + tiffBytes.length), 'Exif', 0, 0, [...tiffBytes])
  }
  parts.push(0xFF, 0xC0, u16be(17), 8, u16be(height), u16be(width), 3, zeros(9), 0xFF, 0xD9)
  return bytesOf(...parts)
}

function isoBox (type, ...content) {
  const body = bytesOf(...content)
  return [...u32be(8 + body.length), ...bytesOf(type), ...body]
}

function heif ({ brand = 'heic', compatible = ['mif1', 'heic'], sizes = [[4032, 3024], [320, 240]], rotation = null } = {}) {
  const ipco = sizes.map(([w, h]) => isoBox('ispe', u32be(0), u32be(w), u32be(h)))
  if (rotation !== null) ipco.push(isoBox('irot', rotation))
  const iprp = isoBox('iprp', isoBox('ipco', ...ipco))
  const meta = isoBox('meta', u32be(0), iprp)
  const ftyp = isoBox('ftyp', brand, u32be(0), ...compatible)
  return bytesOf(ftyp, meta)
}

describe('attachment ids and photo stubs', () => {
  it('recognises the UUID-shaped ids attachments are stored under', () => {
    assert.equal(isAttachmentId(ID_A), true)
    assert.equal(isAttachmentId(ID_A.toUpperCase()), true)
    for (const value of ['', 'not-an-id', ID_A + 'x', '../../etc/passwd', null, 42]) assert.equal(isAttachmentId(value), false, String(value))
  })

  it('round-trips an id through the stub URL', () => {
    const stub = imageStubUrl(ID_A)
    assert.match(stub, /^data:image\/gif;dash-attachment=/)
    assert.equal(attachmentIdFromStub(stub), ID_A)
    assert.equal(isImageStubUrl(stub), true)
  })

  it('refuses to build a stub for something that is not an id', () => {
    assert.throws(() => imageStubUrl('../escape'))
  })

  it('finds no id in ordinary image URLs or damaged stubs', () => {
    for (const url of ['https://example.com/a.png', 'data:image/png;base64,iVBORw0KGgo=', 'data:image/gif;dash-attachment=nope;base64,R0lG', null]) {
      assert.equal(attachmentIdFromStub(url), null, String(url))
    }
  })

  it('is kept by the sanitizer, including the one in apps from 1.6.8 and earlier', () => {
    const stub = imageStubUrl(ID_B)
    const [saved] = sanitizeEditorContent({ blocks: [{ id: 'img', type: 'image', data: { file: { url: stub }, caption: '' } }] }).blocks
    assert.equal(saved.type, 'image')
    assert.equal(saved.data.file.url, stub)
  })

  it('reads an image block id from attachmentId first, then from the stub an older app kept', () => {
    assert.equal(imageAttachmentId({ attachmentId: ID_A, file: { url: imageStubUrl(ID_B) } }), ID_A)
    assert.equal(imageAttachmentId({ file: { url: imageStubUrl(ID_B) } }), ID_B)
    assert.equal(imageAttachmentId({ file: { url: 'https://example.com/a.png' } }), null)
    assert.equal(imageAttachmentId(null), null)
  })
})

describe('which attachments notes refer to', () => {
  const blocks = [
    { type: 'attachment', data: { attachmentId: ID_A } },
    { type: 'image', data: { attachmentId: ID_B, file: { url: imageStubUrl(ID_B) } } },
    { type: 'image', data: { file: { url: imageStubUrl(ID_C) } } },
    { type: 'image', data: { file: { url: 'https://example.com/a.png' } } },
    { type: 'attachment', data: { attachmentId: ID_A } },
    { type: 'attachment', data: { attachmentId: 'bad' } },
    { type: 'paragraph', data: { text: imageStubUrl(ID_A) } }
  ]

  it('collects file and photo attachments once each, in order', () => {
    assert.deepEqual(attachmentIdsInBlocks(blocks), [ID_A, ID_B, ID_C])
    assert.deepEqual(attachmentIdsInPage({ content: { blocks } }), [ID_A, ID_B, ID_C])
    assert.deepEqual(attachmentIdsInPage({}), [])
  })

  it('keeps bytes another note still uses, including a note in Trash', () => {
    const remaining = [
      { id: 'b', content: { blocks: [{ type: 'image', data: { file: { url: imageStubUrl(ID_B) } } }] } },
      { id: 'c', trashed: true, content: { blocks: [{ type: 'attachment', data: { attachmentId: ID_C } }] } },
      { id: 'f', type: 'folder' }
    ]
    assert.deepEqual(attachmentIdsSafeToDelete([ID_A, ID_B, ID_C, ID_A, 'bad'], remaining), [ID_A])
  })

  it('deletes nothing while some note cannot be read', () => {
    for (const locked of [
      { id: 'l', appLockEncrypted: true, content: null, encryptedContent: 'x' },
      { id: 'p', password: { hash: 'h' }, content: null }
    ]) {
      assert.equal(attachmentIdsSafeToDelete([ID_A], [locked]), null)
    }
  })

  it('reads a password-protected note that is open, and still counts its photos', () => {
    const open = { id: 'p', password: { hash: 'h' }, content: { blocks: [{ type: 'attachment', data: { attachmentId: ID_A } }] } }
    assert.deepEqual(attachmentIdsSafeToDelete([ID_A, ID_B], [open]), [ID_B])
  })
})

describe('sniffImageType', () => {
  it('knows each supported format by its signature', () => {
    assert.equal(sniffImageType(png(1, 1)), 'image/png')
    assert.equal(sniffImageType(gif(1, 1)), 'image/gif')
    assert.equal(sniffImageType(jpeg(1, 1)), 'image/jpeg')
    assert.equal(sniffImageType(bytesOf('RIFF', u32le(30), 'WEBP', 'VP8X', zeros(14))), 'image/webp')
    assert.equal(sniffImageType(bytesOf('BM', u32le(1000), zeros(4), u32le(54), u32le(40), u32le(2), u32le(2), zeros(8))), 'image/bmp')
    assert.equal(sniffImageType(heif()), 'image/heic')
    assert.equal(sniffImageType(heif({ brand: 'avif', compatible: ['mif1', 'avif'] })), 'image/avif')
    assert.equal(sniffImageType(heif({ brand: 'mif1', compatible: ['mif1'] })), 'image/heif')
    assert.equal(sniffImageType(bytesOf('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml')
    assert.equal(sniffImageType(bytesOf(0xEF, 0xBB, 0xBF, '<svg viewBox="0 0 1 1"></svg>')), 'image/svg+xml')
  })

  it('refuses bytes that only look like an image at a glance', () => {
    assert.equal(sniffImageType(bytesOf('BM this is not a bitmap at all')), null)
    assert.equal(sniffImageType(bytesOf('hello, world! plain text')), null)
    assert.equal(sniffImageType(bytesOf(0xFF, 0xD8)), null)
    assert.equal(sniffImageType('not bytes'), null)
  })
})

describe('imageDimensions', () => {
  it('reads PNG, GIF and BMP headers', () => {
    assert.deepEqual(imageDimensions(png(640, 480)), { width: 640, height: 480 })
    assert.deepEqual(imageDimensions(gif(320, 200)), { width: 320, height: 200 })
    const bmp = bytesOf('BM', u32le(1000), zeros(4), u32le(54), u32le(40), u32le(100), u32le((-50) >>> 0), zeros(8))
    assert.deepEqual(imageDimensions(bmp), { width: 100, height: 50 })
  })

  it('reads all three WebP headers', () => {
    const lossy = bytesOf('RIFF', u32le(30), 'WEBP', 'VP8 ', u32le(10), 0, 0, 0, 0x9D, 0x01, 0x2A, u16le(800), u16le(600))
    const lossless = bytesOf('RIFF', u32le(30), 'WEBP', 'VP8L', u32le(10), 0x2F, u32le((499 | (299 << 14)) >>> 0), zeros(4))
    const extended = bytesOf('RIFF', u32le(30), 'WEBP', 'VP8X', u32le(10), 0, 0, 0, 0, u24le(1919), u24le(1079))
    assert.deepEqual(imageDimensions(lossy), { width: 800, height: 600 })
    assert.deepEqual(imageDimensions(lossless), { width: 500, height: 300 })
    assert.deepEqual(imageDimensions(extended), { width: 1920, height: 1080 })
  })

  it('reads a JPEG frame header and turns the size for sideways Exif orientations', () => {
    assert.deepEqual(imageDimensions(jpeg(400, 300)), { width: 400, height: 300 })
    assert.deepEqual(imageDimensions(jpeg(400, 300, 1)), { width: 400, height: 300 })
    assert.deepEqual(imageDimensions(jpeg(400, 300, 6)), { width: 300, height: 400 })
    assert.deepEqual(imageDimensions(jpeg(400, 300, 8)), { width: 300, height: 400 })
  })

  it('takes the main image of a HEIC, not its thumbnail, and applies its rotation', () => {
    assert.deepEqual(imageDimensions(heif()), { width: 4032, height: 3024 })
    assert.deepEqual(imageDimensions(heif({ rotation: 1 })), { width: 3024, height: 4032 })
    assert.deepEqual(imageDimensions(heif({ rotation: 2 })), { width: 4032, height: 3024 })
  })

  it('returns null rather than a nonsense size', () => {
    assert.equal(imageDimensions(png(0, 480)), null)
    assert.equal(imageDimensions(bytesOf('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
    assert.equal(imageDimensions(bytesOf(0xFF, 0xD8, 0xFF, 0xDA, zeros(20))), null)
  })
})

describe('dataUrlToBytes', () => {
  it('decodes base64 data URLs', () => {
    const decoded = dataUrlToBytes('data:image/png;base64,iVBORw0KGgo=')
    assert.equal(decoded.mimeType, 'image/png')
    assert.deepEqual([...decoded.bytes], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  })

  it('decodes percent-encoded data URLs', () => {
    const decoded = dataUrlToBytes('data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E')
    assert.equal(decoded.mimeType, 'image/svg+xml')
    assert.equal(new TextDecoder().decode(decoded.bytes), '<svg></svg>')
  })

  it('returns null for anything it cannot decode', () => {
    for (const url of ['https://example.com/a.png', 'data:image/png;base64', 'data:image/png;base64,%%%', 'data:text/plain,%E0%A4%A', 42]) {
      assert.equal(dataUrlToBytes(url), null, String(url))
    }
  })
})

describe('cleanAttachmentFilename', () => {
  it('removes control and direction-override characters', () => {
    assert.equal(cleanAttachmentFilename('invoice' + String.fromCharCode(0x202E) + 'fdp.exe'), 'invoicefdp.exe')
    assert.equal(cleanAttachmentFilename('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(0x9F) + '.png'), 'ab.png')
    assert.equal(cleanAttachmentFilename(String.fromCharCode(0xFEFF) + ' holiday.jpg '), 'holiday.jpg')
  })

  it('keeps ordinary names, accents included, and caps the length', () => {
    assert.equal(cleanAttachmentFilename('Caf' + String.fromCharCode(0xE9) + ' menu.pdf'), 'Caf' + String.fromCharCode(0xE9) + ' menu.pdf')
    assert.equal(cleanAttachmentFilename('x'.repeat(300)).length, 255)
    assert.equal(cleanAttachmentFilename(null), '')
  })
})
