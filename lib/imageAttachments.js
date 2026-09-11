/**
 * Storing photos as attachments.
 *
 * A photo's attachment id is an HMAC of its bytes, so storing the same photo
 * twice keeps one copy, an interrupted import or migration can simply run
 * again, and the relay can't tell whether two vaults hold the same photo.
 * With sync on, the HMAC key comes from the vault key and every paired device
 * agrees on the id; otherwise it's a random key kept on this device.
 */

import { bytesToHex, hkdfDeriveBytes, hmacSha256 } from '../utils/cryptoUtils.js'
import { MAX_ATTACHMENT_BYTES } from './attachmentLimits.js'
import {
  IMAGE_MIME_TYPES,
  cleanAttachmentFilename,
  imageDimensions,
  imageStubUrl,
  isImageDimension,
  sniffImageType
} from './attachmentRefs.js'

const INFO_ATTACHMENT_ID = 'dash:attachment-id:v1'

/** The HMAC key for photo ids in a synced vault. */
export async function vaultAttachmentIdKey (vaultKeyBytes) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('vaultAttachmentIdKey: vaultKeyBytes must be 32 bytes')
  }
  return hkdfDeriveBytes(vaultKeyBytes, INFO_ATTACHMENT_ID, 32)
}

/**
 * A photo's attachment id: HMAC-SHA256 of its bytes, cut to 128 bits and
 * shaped as a version 8 UUID, since Electron only stores ids of that shape.
 */
export async function attachmentIdForBytes (bytes, keyBytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('attachmentIdForBytes: bytes must be a Uint8Array')
  if (!(keyBytes instanceof Uint8Array) || keyBytes.length < 16) throw new Error('attachmentIdForBytes: key too short')
  const id = (await hmacSha256(keyBytes, bytes)).slice(0, 16)
  id[6] = (id[6] & 0x0F) | 0x80
  id[8] = (id[8] & 0x3F) | 0x80
  const hex = bytesToHex(id)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export class ImageTooLargeError extends Error {
  constructor (byteLength, maxBytes) {
    super(`This photo is ${byteLength} bytes; photos can be at most ${maxBytes} bytes`)
    this.name = 'ImageTooLargeError'
    this.byteLength = byteLength
    this.maxBytes = maxBytes
  }
}

export class ImageNotSavedError extends Error {
  constructor (message = 'The photo could not be saved on this device') {
    super(message)
    this.name = 'ImageNotSavedError'
  }
}

function asBytes (data) {
  if (!data) return null
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return null
}

export function sameBytes (a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Store a photo as an attachment and prove it reads back exactly.
 *
 * @param {object} args
 * @param {Uint8Array} args.bytes
 * @param {Uint8Array} args.keyBytes - see attachmentIdForBytes
 * @param {{ save: (id: string, buffer: ArrayBuffer) => Promise<unknown>, load: (id: string) => Promise<ArrayBuffer|Uint8Array|null> }} args.storage
 * @param {number} [args.maxBytes]
 * @returns {Promise<{ attachmentId: string, mimeType: string, width?: number, height?: number, byteLength: number, reused: boolean }>}
 */
export async function storeImageBytes ({ bytes, keyBytes, storage, maxBytes = MAX_ATTACHMENT_BYTES }) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('storeImageBytes: no image data')
  if (bytes.byteLength > maxBytes) throw new ImageTooLargeError(bytes.byteLength, maxBytes)
  const mimeType = sniffImageType(bytes)
  if (!mimeType) throw new Error('storeImageBytes: the data is not an image Dash can show')

  const attachmentId = await attachmentIdForBytes(bytes, keyBytes)
  const existing = asBytes(await storage.load(attachmentId))
  const reused = sameBytes(existing, bytes)
  if (!reused) {
    // A copy under this id with other bytes can only be damaged: replace it.
    await storage.save(attachmentId, bytes.slice().buffer)
    if (!sameBytes(asBytes(await storage.load(attachmentId)), bytes)) throw new ImageNotSavedError()
  }

  const size = imageDimensions(bytes)
  return {
    attachmentId,
    mimeType,
    ...(size || {}),
    byteLength: bytes.byteLength,
    reused,
    // Some copy, even a damaged one, was stored under this id already
    existed: existing !== null
  }
}

/**
 * Image block data for a stored photo, in the key order ImageTool saves and
 * the sanitizer writes.
 */
export function buildImageBlockData ({
  attachmentId,
  mimeType,
  width,
  height,
  filename,
  caption = '',
  withBorder = false,
  withBackground = false,
  stretched = false
}) {
  const data = {
    attachmentId,
    file: { url: imageStubUrl(attachmentId) },
    caption: typeof caption === 'string' ? caption : '',
    withBorder: Boolean(withBorder),
    withBackground: Boolean(withBackground),
    stretched: Boolean(stretched)
  }
  if (IMAGE_MIME_TYPES.includes(mimeType)) data.mimeType = mimeType
  if (isImageDimension(width) && isImageDimension(height)) {
    data.width = width
    data.height = height
  }
  const name = cleanAttachmentFilename(filename)
  if (name) data.filename = name
  return data
}
