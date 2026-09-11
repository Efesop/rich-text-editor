/**
 * Importers: removing location and camera metadata from photos without
 * re-encoding them.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { stripPhotoMetadata, photoFormat, exifOrientation, orientationExif } = await import('../lib/import/photoMetadata.js')
const { imageDimensions } = await import('../lib/attachmentRefs.js')

const ascii = (s) => Array.from(s, c => c.charCodeAt(0))
const cat = (...parts) => Uint8Array.from(parts.flatMap(part => Array.from(part)))
const be16 = (n) => [n >> 8, n & 0xFF]
const be32 = (n) => [n >>> 24, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]
const le32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, n >>> 24]

// Exif with Orientation and a GPS latitude of 51 degrees 30 minutes
const LATITUDE = [0, 0, 0, 51, 0, 0, 0, 1, 0, 0, 0, 30, 0, 0, 0, 1]
function exifWithGps (orientation) {
  return cat(
    ascii('MM'), be16(42), be32(8),
    be16(2), be16(0x0112), be16(3), be32(1), be16(orientation), be16(0), be16(0x8825), be16(4), be32(1), be32(38), be32(0),
    be16(1), be16(0x0002), be16(5), be32(3), be32(56), be32(0),
    LATITUDE, [0, 0, 0, 0, 0, 0, 0, 1]
  )
}
const XMP = ascii('<x:xmpmeta><exif:GPSLatitude>51,30N</exif:GPSLatitude></x:xmpmeta>')

function includes (haystack, needle) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let k = 0; k < needle.length; k++) if (haystack[i + k] !== needle[k]) continue outer
    return true
  }
  return false
}

describe('JPEG', () => {
  const segment = (marker, payload) => cat([0xFF, marker], be16(payload.length + 2), payload)
  const scan = cat(segment(0xDA, [1, 1, 0x00, 0, 63, 0]), [0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD0, 0x56])
  const trailingImage = cat([0xFF, 0xD8], segment(0xE1, cat(ascii('Exif\0\0'), exifWithGps(1))), [0xFF, 0xD9])
  const jpeg = cat(
    [0xFF, 0xD8],
    segment(0xE0, cat(ascii('JFIF\0'), [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    segment(0xE1, cat(ascii('Exif\0\0'), exifWithGps(6))),
    segment(0xE1, cat(ascii('http://ns.adobe.com/xap/1.0/\0'), XMP)),
    segment(0xE2, cat(ascii('ICC_PROFILE\0'), [1, 1, 9, 9])),
    segment(0xE2, cat(ascii('MPF\0'), [0, 0])),
    segment(0xED, cat(ascii('Photoshop 3.0\0'), [1, 2])),
    segment(0xFE, ascii('taken at home')),
    segment(0xDB, [0, ...new Array(64).fill(1)]),
    segment(0xC0, [8, ...be16(16), ...be16(32), 1, 1, 0x11, 0]),
    segment(0xC4, [0x00, 1, ...new Array(15).fill(0), 0]),
    scan,
    [0xFF, 0xD9],
    trailingImage
  )

  it('removes Exif, XMP, IPTC, comments and trailing images, and keeps the image data', () => {
    const result = stripPhotoMetadata(jpeg)
    assert.equal(result.format, 'jpeg')
    assert.equal(result.status, 'cleaned')
    assert.deepEqual(result.removed.sort(), ['comment', 'exif', 'iptc', 'mpf', 'trailing-data', 'xmp'])
    assert.equal(includes(result.bytes, LATITUDE), false, 'no GPS values')
    assert.equal(includes(result.bytes, [0x88, 0x25]), false, 'no GPS pointer')
    assert.equal(includes(result.bytes, XMP.slice(0, 20)), false, 'no XMP')
    assert.equal(includes(result.bytes, ascii('taken at home')), false)
    assert.equal(includes(result.bytes, scan), true, 'scan data copied byte for byte')
    assert.equal(includes(result.bytes, ascii('ICC_PROFILE')), true, 'colour profile kept')
    assert.equal(includes(result.bytes, ascii('JFIF')), true)
    assert.deepEqual([...result.bytes.slice(-2)], [0xFF, 0xD9])
    assert.deepEqual(imageDimensions(result.bytes), imageDimensions(jpeg))
  })

  it('writes the orientation back on its own, so portraits stay upright', () => {
    const result = stripPhotoMetadata(jpeg)
    assert.equal(result.orientation, 6)
    const app1 = result.bytes.indexOf(0xE1, 2)
    assert.equal(result.bytes[app1 - 1], 0xFF)
    assert.equal(exifOrientation(result.bytes, app1 + 3 + 6), 6)
    assert.deepEqual(stripPhotoMetadata(result.bytes).removed, ['exif'], 'reading it again finds only that Exif')
  })

  it('leaves a broken JPEG as it is and says the location was not removed', () => {
    const cut = jpeg.slice(0, 60)
    const result = stripPhotoMetadata(cut)
    assert.equal(result.status, 'unsupported')
    assert.equal(result.bytes, cut)
  })
})

describe('PNG', () => {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes) => {
    let c = 0xFFFFFFFF
    for (const b of bytes) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const chunk = (type, data) => cat(be32(data.length), ascii(type), data, be32(crc(cat(ascii(type), data))))
  const idat = chunk('IDAT', [1, 2, 3, 4])
  const png = cat(
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    chunk('IHDR', [...be32(2), ...be32(3), 8, 6, 0, 0, 0]),
    chunk('tEXt', ascii('Comment\0hello')),
    chunk('iTXt', cat(ascii('XML:com.adobe.xmp\0\0\0\0\0'), XMP)),
    chunk('eXIf', exifWithGps(8)),
    chunk('tIME', [7, 232, 1, 1, 0, 0, 0]),
    idat,
    chunk('IEND', []),
    [9, 9]
  )

  it('removes text, time and Exif chunks, keeps image chunks and orientation', () => {
    const result = stripPhotoMetadata(png)
    assert.equal(result.status, 'cleaned')
    assert.deepEqual(result.removed.sort(), ['eXIf', 'iTXt', 'tEXt', 'tIME', 'trailing-data'])
    assert.equal(includes(result.bytes, LATITUDE), false)
    assert.equal(includes(result.bytes, idat), true)
    assert.equal(includes(result.bytes, chunk('eXIf', orientationExif(8))), true, 'a valid eXIf chunk with only the orientation')
    assert.deepEqual(imageDimensions(result.bytes), imageDimensions(png))
  })
})

describe('WebP', () => {
  const riffChunk = (type, data) => cat(ascii(type), le32(data.length), data, data.length % 2 ? [0] : [])
  const vp8l = riffChunk('VP8L', [0x2F, 1, 0, 0, 0])
  const alph = riffChunk('ALPH', [1, 2, 3])
  const body = cat(
    riffChunk('VP8X', [0x10 | 0x08 | 0x04, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
    alph, vp8l,
    riffChunk('EXIF', cat(ascii('Exif\0\0'), exifWithGps(1))),
    riffChunk('XMP ', XMP)
  )
  const webp = cat(ascii('RIFF'), le32(body.length + 4), ascii('WEBP'), body)

  it('removes EXIF and XMP chunks and clears their flags', () => {
    const result = stripPhotoMetadata(webp)
    assert.equal(result.status, 'cleaned')
    assert.deepEqual(result.removed.sort(), ['exif', 'xmp'])
    assert.equal(includes(result.bytes, LATITUDE), false)
    assert.equal(includes(result.bytes, vp8l), true)
    assert.equal(includes(result.bytes, alph), true)
    assert.equal(result.bytes[20], 0x10, 'only the alpha flag is left')
    assert.equal(result.bytes.length - 8, result.bytes[4] | (result.bytes[5] << 8) | (result.bytes[6] << 16), 'RIFF size matches')
  })
})

describe('GIF', () => {
  const trailer = [1, ...Array.from({ length: 256 }, (_, k) => 255 - k), 0]
  const image = [0x2C, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0]
  const loop = [0x21, 0xFF, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0]
  const gif = cat(
    ascii('GIF89a'), [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255],
    loop,
    [0x21, 0xFE, 5, ...ascii('hello'), 0],
    [0x21, 0xFF, 11, ...ascii('XMP DataXMP'), ...XMP, ...trailer],
    [0x21, 0xF9, 4, 0, 0, 0, 0, 0],
    image,
    [0x3B]
  )

  it('removes comments and XMP, and keeps looping and frames', () => {
    const result = stripPhotoMetadata(gif)
    assert.equal(result.status, 'cleaned')
    assert.deepEqual(result.removed.sort(), ['comment', 'xmp'])
    assert.equal(includes(result.bytes, XMP.slice(0, 12)), false)
    assert.equal(includes(result.bytes, loop), true)
    assert.equal(includes(result.bytes, image), true)
    assert.equal(result.bytes[result.bytes.length - 1], 0x3B)
  })
})

describe('HEIF', () => {
  const box = (type, content) => cat(be32(content.length + 8), ascii(type), content)
  const full = (type, version, content) => box(type, cat([version, 0, 0, 0], content))
  const imageData = new Array(10).fill(0xAA)
  const exifData = cat(be32(0), exifWithGps(1))
  const infe = (id, type, extra = []) => full('infe', 2, cat(be16(id), be16(0), ascii(type), [0], extra))

  function heic () {
    const ftyp = box('ftyp', cat(ascii('heic'), be32(0), ascii('mif1heic')))
    const build = (mdatStart) => {
      const at = (k) => [mdatStart + 8, mdatStart + 8 + imageData.length, mdatStart + 8 + imageData.length + exifData.length][k]
      const lengths = [imageData.length, exifData.length, XMP.length]
      const items = [1, 2, 3].map((id, k) => cat(be16(id), be16(0), be16(0), be16(1), be32(at(k)), be32(lengths[k])))
      return full('meta', 0, cat(
        full('hdlr', 0, cat(be32(0), ascii('pict'), new Array(12).fill(0), [0])),
        full('pitm', 0, be16(1)),
        full('iinf', 0, cat(be16(3), infe(1, 'hvc1'), infe(2, 'Exif'), infe(3, 'mime', cat(ascii('application/rdf+xml'), [0])))),
        full('iloc', 1, cat([0x44, 0x00], be16(3), ...items))
      ))
    }
    const metaLength = build(0).length
    const meta = build(ftyp.length + metaLength)
    const mdat = box('mdat', cat(imageData, exifData, XMP))
    return cat(ftyp, meta, mdat)
  }

  it('blanks Exif and XMP items in place, keeping every offset and the image data', () => {
    const file = heic()
    assert.equal(photoFormat(file), 'heif')
    const result = stripPhotoMetadata(file)
    assert.equal(result.status, 'cleaned')
    assert.deepEqual(result.removed.sort(), ['exif', 'xmp'])
    assert.equal(result.bytes.length, file.length)
    assert.equal(includes(result.bytes, LATITUDE), false)
    assert.equal(includes(result.bytes, XMP.slice(0, 12)), false)
    assert.equal(includes(result.bytes, imageData), true)
  })
})

describe('other files', () => {
  it('leaves formats it cannot read with confidence unchanged, and says so', () => {
    const tiff = cat(ascii('II*\0'), [8, 0, 0, 0])
    assert.deepEqual(stripPhotoMetadata(tiff), { bytes: tiff, format: 'tiff', status: 'unsupported', removed: [], orientation: 1 })
    const svg = Uint8Array.from(ascii('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))
    assert.equal(stripPhotoMetadata(svg).status, 'clean')
  })
})
