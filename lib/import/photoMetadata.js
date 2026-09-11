/**
 * Location and camera details out of photos, without touching their pixels.
 *
 * Works on the bytes: metadata segments, chunks and blocks are cut out, or in
 * HEIF blanked in place, and the compressed image data is copied as it is, so
 * a photo is never re-encoded. The orientation the camera recorded is written
 * back on its own (JPEG, PNG and WebP keep it in Exif), so portraits stay
 * upright. HEIF keeps orientation in properties that are left alone.
 *
 * Anything that doesn't parse cleanly is returned unchanged with status
 * 'unsupported', for the import to list as "location not removed".
 *
 * DOM-free so it runs under `node --test`.
 */

const text = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length))
const u16be = (bytes, i) => (bytes[i] << 8) | bytes[i + 1]
const u32be = (bytes, i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
const u32le = (bytes, i) => (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0
const startsWith = (bytes, i, prefix) => i + prefix.length <= bytes.length && text(bytes, i, prefix.length) === prefix

function concat (parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

class NotParsed extends Error {}
const fail = (message) => { throw new NotParsed(message) }

let crcTable = null
function crc32 (bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/** The Orientation tag (1-8) in TIFF-structured Exif starting at `start`, or 1. */
export function exifOrientation (bytes, start = 0) {
  if (start < 0 || start + 8 > bytes.length) return 1
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49
  if (!little && !(bytes[start] === 0x4D && bytes[start + 1] === 0x4D)) return 1
  const u16 = i => (little ? bytes[i] | (bytes[i + 1] << 8) : u16be(bytes, i))
  const u32 = i => (little ? u32le(bytes, i) : u32be(bytes, i))
  if (u16(start + 2) !== 42) return 1
  const ifd = start + u32(start + 4)
  if (ifd + 2 > bytes.length) return 1
  const count = u16(ifd)
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12
    if (entry + 12 > bytes.length) break
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

/** TIFF-structured Exif holding nothing but an Orientation tag. */
export function orientationExif (orientation) {
  return new Uint8Array([
    0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // big-endian header, first IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1 value
    0x00, 0x00, 0x00, 0x00 // no next IFD
  ])
}

// --- JPEG ----------------------------------------------------------------------

function stripJpeg (bytes) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) fail('not a JPEG')
  const kept = [bytes.subarray(0, 2)]
  const removed = new Set()
  let orientation = 1
  let afterJfif = 1
  let i = 2
  let ended = false
  while (i < bytes.length) {
    if (bytes[i] !== 0xFF) fail('expected a marker')
    let marker = bytes[i + 1]
    while (marker === 0xFF && i + 2 < bytes.length) {
      i++
      marker = bytes[i + 1]
    }
    if (marker === 0xD9) {
      kept.push(bytes.subarray(i, i + 2))
      i += 2
      ended = true
      break
    }
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
      kept.push(bytes.subarray(i, i + 2))
      i += 2
      continue
    }
    if (i + 4 > bytes.length) fail('truncated segment')
    const length = u16be(bytes, i + 2)
    const end = i + 2 + length
    if (length < 2 || end > bytes.length) fail('segment runs past the end')
    const payload = i + 4

    if (marker === 0xDA) {
      // Start of scan: the entropy-coded data runs to the next real marker
      let j = end
      while (j < bytes.length) {
        if (bytes[j] === 0xFF && j + 1 < bytes.length) {
          const next = bytes[j + 1]
          if (next === 0x00 || (next >= 0xD0 && next <= 0xD7)) {
            j += 2
            continue
          }
          if (next !== 0xFF) break
        }
        j++
      }
      kept.push(bytes.subarray(i, j))
      i = j
      continue
    }

    let drop = null
    if (marker === 0xE1) {
      if (startsWith(bytes, payload, 'Exif\0\0')) {
        orientation = exifOrientation(bytes, payload + 6)
        drop = 'exif'
      } else if (startsWith(bytes, payload, 'http://ns.adobe.com/')) {
        drop = 'xmp'
      } else {
        drop = 'app1'
      }
    } else if (marker === 0xE0) {
      if (!startsWith(bytes, payload, 'JFIF\0') && !startsWith(bytes, payload, 'JFXX\0')) drop = 'app0'
    } else if (marker === 0xE2) {
      if (!startsWith(bytes, payload, 'ICC_PROFILE\0')) drop = startsWith(bytes, payload, 'MPF\0') ? 'mpf' : 'app2'
    } else if (marker === 0xEE) {
      if (!startsWith(bytes, payload, 'Adobe')) drop = 'app14'
    } else if (marker === 0xED) {
      drop = 'iptc'
    } else if (marker === 0xFE) {
      drop = 'comment'
    } else if (marker >= 0xE3 && marker <= 0xEF) {
      drop = 'app' + (marker - 0xE0)
    }

    if (drop) {
      removed.add(drop)
    } else {
      kept.push(bytes.subarray(i, end))
      if (marker === 0xE0 && kept.length === 2) afterJfif = 2
    }
    i = end
  }
  if (!ended) fail('no end of image')
  // Secondary images and maker trailers after the main image carry their own Exif
  if (i < bytes.length) removed.add('trailing-data')
  if (orientation !== 1) {
    const exif = concat([new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]), orientationExif(orientation)])
    const segment = concat([new Uint8Array([0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 0xFF]), exif])
    kept.splice(afterJfif, 0, segment)
  }
  return { bytes: removed.size > 0 ? concat(kept) : bytes, removed: [...removed], orientation }
}

// --- PNG -----------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

function pngChunk (type, data) {
  const typeAndData = concat([Uint8Array.from(type, c => c.charCodeAt(0)), data])
  const crc = crc32(typeAndData)
  return concat([
    new Uint8Array([data.length >>> 24, (data.length >>> 16) & 0xFF, (data.length >>> 8) & 0xFF, data.length & 0xFF]),
    typeAndData,
    new Uint8Array([crc >>> 24, (crc >>> 16) & 0xFF, (crc >>> 8) & 0xFF, crc & 0xFF])
  ])
}

function stripPng (bytes) {
  if (!PNG_SIGNATURE.every((b, k) => bytes[k] === b)) fail('not a PNG')
  const kept = [bytes.subarray(0, 8)]
  const removed = new Set()
  let orientation = 1
  let i = 8
  let ended = false
  while (i + 12 <= bytes.length) {
    const length = u32be(bytes, i)
    const type = text(bytes, i + 4, 4)
    const end = i + 12 + length
    if (end > bytes.length) fail('chunk runs past the end')
    if (PNG_METADATA.has(type)) {
      removed.add(type)
      if (type === 'eXIf') orientation = exifOrientation(bytes.subarray(i + 8, i + 8 + length))
    } else {
      kept.push(bytes.subarray(i, end))
    }
    i = end
    if (type === 'IEND') {
      ended = true
      break
    }
  }
  if (!ended || kept.length < 2 || text(kept[1], 4, 4) !== 'IHDR') fail('missing IHDR or IEND')
  if (i < bytes.length) removed.add('trailing-data')
  if (orientation !== 1) kept.splice(2, 0, pngChunk('eXIf', orientationExif(orientation)))
  return { bytes: removed.size > 0 ? concat(kept) : bytes, removed: [...removed], orientation }
}

// --- WebP ----------------------------------------------------------------------

function webpChunk (type, data) {
  const size = data.length
  return concat([
    Uint8Array.from(type, c => c.charCodeAt(0)),
    new Uint8Array([size & 0xFF, (size >>> 8) & 0xFF, (size >>> 16) & 0xFF, size >>> 24]),
    data,
    size & 1 ? new Uint8Array([0]) : new Uint8Array(0)
  ])
}

function stripWebp (bytes) {
  if (text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WEBP') fail('not a WebP')
  const riffEnd = 8 + u32le(bytes, 4)
  if (riffEnd > bytes.length) fail('RIFF runs past the end')
  const chunks = []
  const removed = new Set()
  let orientation = 1
  let i = 12
  while (i + 8 <= riffEnd) {
    const type = text(bytes, i, 4)
    const size = u32le(bytes, i + 4)
    if (i + 8 + size > riffEnd) fail('chunk runs past the end')
    const end = Math.min(riffEnd, i + 8 + size + (size & 1))
    if (type === 'EXIF') {
      removed.add('exif')
      const data = bytes.subarray(i + 8, i + 8 + size)
      orientation = exifOrientation(data, startsWith(data, 0, 'Exif\0\0') ? 6 : 0)
    } else if (type === 'XMP ') {
      removed.add('xmp')
    } else {
      chunks.push({ type, bytes: bytes.slice(i, end) })
    }
    i = end
  }
  if (chunks.length === 0) fail('no image chunks')
  if (riffEnd < bytes.length) removed.add('trailing-data')
  if (removed.size === 0) return { bytes, removed: [], orientation }
  const extended = chunks.find(chunk => chunk.type === 'VP8X')
  if (extended) {
    extended.bytes[8] &= ~(0x08 | 0x04)
    if (orientation !== 1) {
      extended.bytes[8] |= 0x08
      chunks.push({ type: 'EXIF', bytes: webpChunk('EXIF', orientationExif(orientation)) })
    }
  }
  const body = concat(chunks.map(chunk => chunk.bytes))
  const size = body.length + 4
  const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, size & 0xFF, (size >>> 8) & 0xFF, (size >>> 16) & 0xFF, size >>> 24, 0x57, 0x45, 0x42, 0x50])
  return { bytes: concat([header, body]), removed: [...removed], orientation }
}

// --- GIF -----------------------------------------------------------------------

function skipSubBlocks (bytes, i) {
  while (i < bytes.length && bytes[i] !== 0) i += bytes[i] + 1
  if (i >= bytes.length) fail('sub-blocks run past the end')
  return i + 1
}

function stripGif (bytes) {
  if (!startsWith(bytes, 0, 'GIF87a') && !startsWith(bytes, 0, 'GIF89a')) fail('not a GIF')
  const flags = bytes[10]
  const start = 13 + (flags & 0x80 ? 3 * (2 ** ((flags & 7) + 1)) : 0)
  if (start > bytes.length) fail('colour table runs past the end')
  const kept = [bytes.subarray(0, start)]
  const removed = new Set()
  let i = start
  let ended = false
  while (i < bytes.length) {
    const introducer = bytes[i]
    if (introducer === 0x3B) {
      kept.push(bytes.subarray(i, i + 1))
      i++
      ended = true
      break
    }
    if (introducer === 0x21) {
      const label = bytes[i + 1]
      const end = skipSubBlocks(bytes, i + 2)
      if (label === 0xFE) {
        removed.add('comment')
      } else if (label === 0xFF && bytes[i + 2] === 11 && startsWith(bytes, i + 3, 'XMP DataXMP')) {
        removed.add('xmp')
      } else {
        kept.push(bytes.subarray(i, end))
      }
      i = end
      continue
    }
    if (introducer === 0x2C) {
      if (i + 10 > bytes.length) fail('image descriptor runs past the end')
      const local = bytes[i + 9]
      const data = i + 10 + (local & 0x80 ? 3 * (2 ** ((local & 7) + 1)) : 0) + 1
      const end = skipSubBlocks(bytes, data)
      kept.push(bytes.subarray(i, end))
      i = end
      continue
    }
    fail('unexpected block')
  }
  if (!ended) fail('no trailer')
  if (i < bytes.length) removed.add('trailing-data')
  return { bytes: removed.size > 0 ? concat(kept) : bytes, removed: [...removed], orientation: 1 }
}

// --- HEIF and AVIF -------------------------------------------------------------

function boxes (bytes, start, end) {
  const found = []
  let i = start
  while (i + 8 <= end) {
    let size = u32be(bytes, i)
    const type = text(bytes, i + 4, 4)
    let header = 8
    if (size === 1) {
      if (i + 16 > end) fail('large box runs past the end')
      const high = u32be(bytes, i + 8)
      if (high !== 0) fail('box too large')
      size = u32be(bytes, i + 12)
      header = 16
    } else if (size === 0) {
      size = end - i
    }
    if (size < header || i + size > end) fail(`box ${type} runs past the end`)
    found.push({ type, start: i, content: i + header, end: i + size })
    i += size
  }
  return found
}

function readSized (bytes, i, size) {
  if (size === 0) return 0
  if (size === 4) return u32be(bytes, i)
  if (size === 8) {
    if (u32be(bytes, i) !== 0) fail('offset too large')
    return u32be(bytes, i + 4)
  }
  fail('unsupported field size')
}

function stripHeif (bytes) {
  const top = boxes(bytes, 0, bytes.length)
  const meta = top.find(box => box.type === 'meta')
  if (!meta) fail('no meta box')
  const children = boxes(bytes, meta.content + 4, meta.end)
  const iinf = children.find(box => box.type === 'iinf')
  const iloc = children.find(box => box.type === 'iloc')
  if (!iinf || !iloc) return { bytes, removed: [], orientation: 1 }

  // Which items are Exif or XMP
  const metadataItems = new Map()
  const iinfVersion = bytes[iinf.content]
  const entriesStart = iinf.content + 4 + (iinfVersion === 0 ? 2 : 4)
  for (const infe of boxes(bytes, entriesStart, iinf.end)) {
    if (infe.type !== 'infe') continue
    const version = bytes[infe.content]
    if (version < 2) continue
    let p = infe.content + 4
    const id = version === 2 ? u16be(bytes, p) : u32be(bytes, p)
    p += version === 2 ? 2 : 4
    p += 2 // protection index
    const type = text(bytes, p, 4)
    p += 4
    if (type === 'Exif') {
      metadataItems.set(id, 'exif')
    } else if (type === 'mime') {
      while (p < infe.end && bytes[p] !== 0) p++ // item name
      const typeStart = p + 1
      let typeEnd = typeStart
      while (typeEnd < infe.end && bytes[typeEnd] !== 0) typeEnd++
      if (/rdf\+xml|xmp/i.test(text(bytes, typeStart, typeEnd - typeStart))) metadataItems.set(id, 'xmp')
    }
  }
  if (metadataItems.size === 0) return { bytes, removed: [], orientation: 1 }

  // Where they are
  const version = bytes[iloc.content]
  let p = iloc.content + 4
  const offsetSize = bytes[p] >> 4
  const lengthSize = bytes[p] & 0x0F
  const baseOffsetSize = bytes[p + 1] >> 4
  const indexSize = version >= 1 ? bytes[p + 1] & 0x0F : 0
  p += 2
  const itemCount = version < 2 ? u16be(bytes, p) : u32be(bytes, p)
  p += version < 2 ? 2 : 4
  const idat = children.find(box => box.type === 'idat')
  const ranges = []
  const removed = new Set()
  for (let k = 0; k < itemCount; k++) {
    if (p > iloc.end) fail('iloc runs past its box')
    const id = version < 2 ? u16be(bytes, p) : u32be(bytes, p)
    p += version < 2 ? 2 : 4
    const method = version >= 1 ? u16be(bytes, p) & 0x0F : 0
    if (version >= 1) p += 2
    p += 2 // data reference index
    const base = readSized(bytes, p, baseOffsetSize)
    p += baseOffsetSize
    const extentCount = u16be(bytes, p)
    p += 2
    for (let e = 0; e < extentCount; e++) {
      p += indexSize
      const offset = readSized(bytes, p, offsetSize)
      p += offsetSize
      const length = readSized(bytes, p, lengthSize)
      p += lengthSize
      const kind = metadataItems.get(id)
      if (!kind) continue
      if (length === 0) fail('open-ended extent')
      let start
      if (method === 0) start = base + offset
      else if (method === 1 && idat) start = idat.content + base + offset
      else fail('unsupported construction method')
      if (start + length > bytes.length) fail('extent runs past the end')
      ranges.push([start, start + length])
      removed.add(kind)
    }
  }
  if (ranges.length === 0) return { bytes, removed: [], orientation: 1 }
  const out = bytes.slice()
  for (const [from, to] of ranges) out.fill(0, from, to)
  return { bytes: out, removed: [...removed], orientation: 1 }
}

// --- Entry point ---------------------------------------------------------------

/** The photo format from its first bytes. */
export function photoFormat (bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg'
  if (PNG_SIGNATURE.every((b, k) => bytes[k] === b)) return 'png'
  if (startsWith(bytes, 0, 'GIF8')) return 'gif'
  if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WEBP')) return 'webp'
  if (startsWith(bytes, 4, 'ftyp')) {
    const brand = text(bytes, 8, 4)
    if (/^(avif|avis)$/.test(brand)) return 'avif'
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heif'
  }
  if (startsWith(bytes, 0, 'BM')) return 'bmp'
  if (startsWith(bytes, 0, 'II*\0') || startsWith(bytes, 0, 'MM\0*')) return 'tiff'
  const head = text(bytes, 0, Math.min(bytes.length, 256)).trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg'
  return 'unknown'
}

const STRIPPERS = { jpeg: stripJpeg, png: stripPng, webp: stripWebp, gif: stripGif, heif: stripHeif, avif: stripHeif }

/**
 * A photo with its location and camera metadata removed.
 *
 * @param {Uint8Array} bytes
 * @returns {{bytes: Uint8Array, format: string, status: 'cleaned'|'clean'|'unsupported', removed: string[], orientation: number}}
 *   'cleaned' when something was removed, 'clean' when there was nothing to
 *   remove (BMP and SVG carry none), 'unsupported' when it couldn't be read
 *   with confidence; then the bytes are the ones passed in
 */
export function stripPhotoMetadata (bytes) {
  const format = photoFormat(bytes)
  if (format === 'bmp' || format === 'svg') return { bytes, format, status: 'clean', removed: [], orientation: 1 }
  const strip = STRIPPERS[format]
  if (!strip) return { bytes, format, status: 'unsupported', removed: [], orientation: 1 }
  try {
    const result = strip(bytes)
    if (result.removed.length === 0) return { bytes, format, status: 'clean', removed: [], orientation: result.orientation }
    // The result must read back as the same kind of image
    strip(result.bytes)
    return { bytes: result.bytes, format, status: 'cleaned', removed: result.removed, orientation: result.orientation }
  } catch (error) {
    if (!(error instanceof NotParsed) && !(error instanceof RangeError)) throw error
    return { bytes, format, status: 'unsupported', removed: [], orientation: 1 }
  }
}
