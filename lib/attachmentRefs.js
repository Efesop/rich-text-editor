/**
 * Attachment-backed photos — the pure half: ids, references and image bytes.
 *
 * A photo's bytes live in attachment storage, not inside the note. An image
 * block names its attachment twice: as `attachmentId`, and inside `file.url`,
 * a stub data URL of a blank GIF. Apps from 1.6.8 and earlier accept the stub
 * and keep it when they save, but drop `attachmentId`, so the stub is how the
 * id survives an edit on an older device.
 *
 * DOM-free so it runs under `node --test`.
 */

// The shape crypto.randomUUID() and attachmentIdForBytes produce. Electron
// only stores ids of 36 hex digits and dashes (isValidAttachmentId).
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAttachmentId (value) {
  return typeof value === 'string' && ATTACHMENT_ID.test(value)
}

// A 1x1 transparent GIF: what an older app shows in place of the photo.
const BLANK_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const STUB_PREFIX = 'data:image/gif;dash-attachment='

/** The stub `file.url` for a photo stored under `attachmentId`. */
export function imageStubUrl (attachmentId) {
  if (!isAttachmentId(attachmentId)) throw new Error('imageStubUrl: not an attachment id')
  return `${STUB_PREFIX}${attachmentId};base64,${BLANK_GIF_BASE64}`
}

/** The attachment id inside a stub URL, or null for any other URL. */
export function attachmentIdFromStub (url) {
  if (typeof url !== 'string' || !url.startsWith(STUB_PREFIX)) return null
  const end = url.indexOf(';', STUB_PREFIX.length)
  const id = url.slice(STUB_PREFIX.length, end === -1 ? undefined : end)
  return isAttachmentId(id) ? id : null
}

/** Whether a URL is a photo stub rather than an image that can be shown as it is. */
export function isImageStubUrl (url) {
  return attachmentIdFromStub(url) !== null
}

/** The attachment an image block's photo is stored under, or null for an inline or web image. */
export function imageAttachmentId (data) {
  if (!data || typeof data !== 'object') return null
  if (isAttachmentId(data.attachmentId)) return data.attachmentId
  return attachmentIdFromStub(data.file?.url)
}

/** Every attachment id in a list of blocks, from file and image blocks alike, first seen first. */
export function attachmentIdsInBlocks (blocks) {
  const ids = new Set()
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?.type === 'attachment') {
      if (isAttachmentId(block.data?.attachmentId)) ids.add(block.data.attachmentId)
    } else if (block?.type === 'image') {
      const id = imageAttachmentId(block.data)
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export function attachmentIdsInPage (page) {
  return attachmentIdsInBlocks(page?.content?.blocks)
}

/**
 * Which of `candidateIds` no remaining page refers to, so their bytes can be
 * deleted. Pages in Trash still count. Returns null, meaning delete nothing,
 * when a remaining page's content can't be read (password or app lock), since
 * it could refer to any of them.
 *
 * @param {string[]} candidateIds
 * @param {object[]} remainingPages - every page except the ones going away
 * @returns {string[]|null}
 */
export function attachmentIdsSafeToDelete (candidateIds, remainingPages) {
  const inUse = new Set()
  for (const page of Array.isArray(remainingPages) ? remainingPages : []) {
    if (!page || page.type === 'folder') continue
    const blocks = page.content?.blocks
    if (!Array.isArray(blocks)) {
      if (page.encryptedContent || page.appLockEncrypted || page.password?.hash) return null
      continue
    }
    for (const id of attachmentIdsInBlocks(blocks)) inUse.add(id)
  }
  return [...new Set(candidateIds || [])].filter(id => isAttachmentId(id) && !inUse.has(id))
}

// ---------------------------------------------------------------------------
// Image bytes
// ---------------------------------------------------------------------------

export const IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/svg+xml'
])

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])

function ascii (bytes, start, length) {
  if (start < 0 || start + length > bytes.length) return ''
  let text = ''
  for (let i = start; i < start + length; i++) text += String.fromCharCode(bytes[i])
  return text
}

const u16be = (b, o) => (b[o] << 8) | b[o + 1]
const u16le = (b, o) => b[o] | (b[o + 1] << 8)
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const i32le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)

// ISO BMFF boxes (HEIF, AVIF) between start and end.
function * isoBoxes (b, start, end) {
  let i = start
  while (i + 8 <= end) {
    let size = u32be(b, i)
    let header = 8
    if (size === 1) {
      if (i + 16 > end) return
      size = u32be(b, i + 8) * 2 ** 32 + u32be(b, i + 12)
      header = 16
    } else if (size === 0) {
      size = end - i
    }
    if (size < header || i + size > end) return
    yield { type: ascii(b, i + 4, 4), start: i + header, end: i + size }
    i += size
  }
}

function childBox (b, parent, type, skip = 0) {
  for (const box of isoBoxes(b, parent.start + skip, parent.end)) {
    if (box.type === type) return box
  }
  return null
}

function heifBrand (b) {
  const ftyp = childBox(b, { start: 0, end: b.length }, 'ftyp')
  if (!ftyp || ftyp.start !== 8) return null
  const brands = [ascii(b, ftyp.start, 4)]
  for (let i = ftyp.start + 8; i + 4 <= ftyp.end; i += 4) brands.push(ascii(b, i, 4))
  if (brands.includes('avif') || brands.includes('avis')) return 'image/avif'
  if (brands.some(brand => HEIF_BRANDS.has(brand))) return 'image/heic'
  if (brands.includes('mif1') || brands.includes('msf1')) return 'image/heif'
  return null
}

/** The image type bytes hold, judged by their signature, or null. */
export function sniffImageType (bytes) {
  const b = bytes
  if (!(b instanceof Uint8Array) || b.length < 12) return null
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (u32be(b, 0) === 0x89504E47 && u32be(b, 4) === 0x0D0A1A0A) return 'image/png'
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'image/gif'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(b, 4, 4) === 'ftyp') return heifBrand(b)
  if (b[0] === 0x42 && b[1] === 0x4D && b.length >= 26 && [12, 40, 52, 56, 64, 108, 124].includes(i32le(b, 14))) return 'image/bmp'
  // SVG is text: skip a UTF-8 byte order mark, then look for the root element.
  const start = b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF ? 3 : 0
  const head = ascii(b, start, Math.min(b.length - start, 1024)).trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return null
}

// Exif orientation from a TIFF header spanning start..end; 1 when absent.
function exifOrientation (b, start, end) {
  if (start + 8 > end) return 1
  const little = b[start] === 0x49 && b[start + 1] === 0x49
  if (!little && !(b[start] === 0x4D && b[start + 1] === 0x4D)) return 1
  const u16 = (o) => little ? u16le(b, o) : u16be(b, o)
  const u32 = (o) => little ? (i32le(b, o) >>> 0) : u32be(b, o)
  const ifd = start + u32(start + 4)
  if (ifd + 2 > end) return 1
  const count = u16(ifd)
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12
    if (entry + 12 > end) break
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

function isExifHeader (b, at) {
  return ascii(b, at, 4) === 'Exif' && b[at + 4] === 0 && b[at + 5] === 0
}

function jpegSize (b) {
  let orientation = 1
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xFF) { i++; continue }
    const marker = b[i + 1]
    if (marker === 0xFF) { i++; continue }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { i += 2; continue }
    if (marker === 0xD9 || marker === 0xDA) return null
    const length = u16be(b, i + 2)
    if (length < 2) return null
    if (marker === 0xE1 && isExifHeader(b, i + 4)) {
      orientation = exifOrientation(b, i + 10, Math.min(b.length, i + 2 + length))
    }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      if (i + 9 > b.length) return null
      const size = { width: u16be(b, i + 7), height: u16be(b, i + 5) }
      return orientation >= 5 ? { width: size.height, height: size.width } : size
    }
    i += 2 + length
  }
  return null
}

function webpSize (b) {
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ' && b.length >= 30 && b[23] === 0x9D && b[24] === 0x01 && b[25] === 0x2A) {
    return { width: u16le(b, 26) & 0x3FFF, height: u16le(b, 28) & 0x3FFF }
  }
  if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2F) {
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0
    return { width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 }
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
  }
  return null
}

function heifSize (b) {
  const meta = childBox(b, { start: 0, end: b.length }, 'meta')
  // meta is a full box: version and flags come before its children.
  const iprp = meta && childBox(b, meta, 'iprp', 4)
  const ipco = iprp && childBox(b, iprp, 'ipco')
  if (!ipco) return null
  let best = null
  let quarterTurn = false
  for (const box of isoBoxes(b, ipco.start, ipco.end)) {
    if (box.type === 'ispe' && box.start + 12 <= box.end) {
      const width = u32be(b, box.start + 4)
      const height = u32be(b, box.start + 8)
      if (!best || width * height > best.width * best.height) best = { width, height }
    } else if (box.type === 'irot' && box.start < box.end) {
      const angle = b[box.start] & 0x03
      if (angle === 1 || angle === 3) quarterTurn = true
    }
  }
  if (!best) return null
  return quarterTurn ? { width: best.height, height: best.width } : best
}

const MAX_DIMENSION = 100000

/** Whether a width or height is a plausible pixel count. */
export function isImageDimension (value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION
}

/** Displayed pixel size from the image's header (Exif and HEIF rotation applied), or null. */
export function imageDimensions (bytes) {
  const b = bytes
  let size = null
  switch (sniffImageType(b)) {
    case 'image/png':
      if (ascii(b, 12, 4) === 'IHDR' && b.length >= 24) size = { width: u32be(b, 16), height: u32be(b, 20) }
      break
    case 'image/gif':
      size = { width: u16le(b, 6), height: u16le(b, 8) }
      break
    case 'image/bmp':
      size = { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) }
      break
    case 'image/webp':
      size = webpSize(b)
      break
    case 'image/jpeg':
      size = jpegSize(b)
      break
    case 'image/heic':
    case 'image/heif':
    case 'image/avif':
      size = heifSize(b)
      break
  }
  return size && isImageDimension(size.width) && isImageDimension(size.height) ? size : null
}

/** The type and bytes of a base64 or percent-encoded data: URL, or null. */
export function dataUrlToBytes (url) {
  if (typeof url !== 'string' || !/^data:/i.test(url)) return null
  const comma = url.indexOf(',')
  if (comma === -1) return null
  const params = url.slice(5, comma).split(';')
  const mimeType = (params[0] || 'text/plain').trim().toLowerCase()
  const body = url.slice(comma + 1)
  try {
    if (params.slice(1).some(param => param.trim().toLowerCase() === 'base64')) {
      const binary = atob(body.replace(/\s/g, ''))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return { mimeType, bytes }
    }
    return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(body)) }
  } catch {
    return null
  }
}

// C0 and C1 controls, bidi embeddings and overrides, bidi isolates, and the
// byte order mark: nothing a file name needs, and some can disguise one.
const HIDDEN_CHARACTERS = new RegExp('[' + [[0x00, 0x1F], [0x7F, 0x9F], [0x202A, 0x202E], [0x2066, 0x2069], [0xFEFF, 0xFEFF]]
  .map(([from, to]) => String.fromCharCode(from) + '-' + String.fromCharCode(to))
  .join('') + ']', 'g')

/**
 * A file name safe to keep in block data and show as text: hidden characters
 * removed, at most 255 characters. Empty when nothing is left.
 */
export function cleanAttachmentFilename (name) {
  if (typeof name !== 'string') return ''
  return name.replace(HIDDEN_CHARACTERS, '').trim().slice(0, 255)
}
