/**
 * Storing an import's photos and files.
 *
 * Photos keep their original pixels: location and camera details come out of
 * the bytes without re-encoding (lib/import/photoMetadata.js). A photo is only
 * re-encoded when it has to be: HEIC, which the Mac app can't show, becomes a
 * JPEG where the device can decode it, and a photo over the attachment limit
 * is made just small enough to fit. Every file is read back and compared
 * before it counts as stored.
 *
 * DOM-free: decoding and re-encoding are passed in.
 */

import { ImageNotSavedError, attachmentIdForBytes, sameBytes, storeImageBytes } from '../imageAttachments.js'
import { cleanAttachmentFilename } from '../attachmentRefs.js'
import { MAX_ATTACHMENT_BYTES } from '../attachmentLimits.js'
import { photoFormat, stripPhotoMetadata } from './photoMetadata.js'
import { readResource as readResourceBytes } from './resources.js'

export class ResourceNotImportedError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'ResourceNotImportedError'
    this.code = code
  }
}

function asBytes (value) {
  if (!value) return null
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

async function loadBytes (storage, attachmentId) {
  try {
    return asBytes(await storage.load(attachmentId))
  } catch {
    return null
  }
}

async function storeFile (bytes, { name, mimeType, keyBytes, storage, maxBytes, notices }) {
  if (bytes.length > maxBytes) throw new ResourceNotImportedError('too-large', `${name} is too large to sync`)
  const attachmentId = await attachmentIdForBytes(bytes, keyBytes)
  let existing = null
  let unreadable = false
  try {
    existing = asBytes(await storage.load(attachmentId))
  } catch {
    unreadable = true
  }
  if (!sameBytes(existing, bytes)) {
    await storage.save(attachmentId, bytes.slice().buffer)
    if (!sameBytes(await loadBytes(storage, attachmentId), bytes)) {
      throw new ResourceNotImportedError('not-saved', `${name} couldn't be saved on this device`)
    }
  }
  return {
    kind: 'file',
    attachmentId,
    created: existing === null && !unreadable,
    data: { attachmentId, filename: name, mimeType: String(mimeType || 'application/octet-stream').slice(0, 100), size: bytes.length, preview: '' },
    notices
  }
}

/**
 * Stores one resource as a photo or a file.
 *
 * @param {{resource: object, as: 'photo'|'file', beforeSave?: (attachmentId: string) => Promise<void>}} request - `beforeSave` hears of every write before it happens
 * @param {object} deps
 * @param {Uint8Array} deps.keyBytes - the key attachment ids are made with
 * @param {{save: (id: string, buffer: ArrayBuffer) => Promise<void>, load: (id: string) => Promise<ArrayBuffer|Uint8Array|null>}} deps.storage
 * @param {(bytes: Uint8Array) => Promise<Uint8Array|null>} [deps.convertHeic] - a JPEG, or null where HEIC can't be decoded
 * @param {(bytes: Uint8Array, maxBytes: number) => Promise<Uint8Array|null>} [deps.fitPhoto] - a copy small enough, or null
 * @param {(resource: object) => Promise<Uint8Array>} [deps.readResource]
 * @param {number} [deps.maxBytes]
 * @returns {Promise<{kind: 'photo'|'file', attachmentId: string, created: boolean, data: object, notices: string[]}>} - `created` when nothing was stored under the id before
 * @throws {ResourceNotImportedError} 'unreadable', 'too-large' or 'not-saved'
 */
export async function storeImportResource ({ resource, as, beforeSave }, { keyBytes, storage: store, convertHeic, fitPhoto, readResource = readResourceBytes, maxBytes = MAX_ATTACHMENT_BYTES }) {
  // Every write is announced first, so an import that stops can find all it wrote
  const storage = beforeSave ? { ...store, save: async (id, buffer) => { await beforeSave(id); return store.save(id, buffer) } } : store
  let name = cleanAttachmentFilename(resource?.name) || 'file'
  let bytes = null
  try {
    bytes = asBytes(await readResource(resource))
  } catch {
    bytes = null
  }
  if (!bytes || bytes.length === 0) throw new ResourceNotImportedError('unreadable', `${name} couldn't be read`)

  const notices = []
  const fileOptions = () => ({ name, mimeType: resource.mimeType, keyBytes, storage, maxBytes, notices })
  const format = photoFormat(bytes)
  const cleaned = (input) => {
    const result = stripPhotoMetadata(input)
    if (result.status === 'unsupported' && !notices.includes('location-not-removed')) notices.push('location-not-removed')
    return result.bytes
  }

  if (format === 'unknown') return storeFile(bytes, fileOptions())
  if (as !== 'photo' || format === 'tiff') return storeFile(cleaned(bytes), fileOptions())

  let photo = bytes
  if (format === 'heif') {
    const jpeg = convertHeic ? asBytes(await convertHeic(bytes).catch(() => null)) : null
    if (!jpeg || photoFormat(jpeg) !== 'jpeg') {
      notices.push('heic-kept-as-file')
      return storeFile(cleaned(bytes), fileOptions())
    }
    notices.push('heic-converted')
    name = name.replace(/\.(heic|heif)$/i, '.jpg')
    photo = jpeg
  }

  photo = cleaned(photo)
  if (photo.length > maxBytes) {
    const smaller = fitPhoto ? asBytes(await fitPhoto(photo, maxBytes).catch(() => null)) : null
    if (!smaller || smaller.length > maxBytes || photoFormat(smaller) === 'unknown') {
      throw new ResourceNotImportedError('too-large', `${name} is too large to sync`)
    }
    notices.push('photo-resized')
    photo = stripPhotoMetadata(smaller).bytes
  }

  try {
    const stored = await storeImageBytes({ bytes: photo, keyBytes, storage, maxBytes })
    return {
      kind: 'photo',
      attachmentId: stored.attachmentId,
      created: !stored.existed,
      data: { attachmentId: stored.attachmentId, mimeType: stored.mimeType, width: stored.width, height: stored.height, filename: name },
      notices
    }
  } catch (error) {
    if (error instanceof ImageNotSavedError) throw new ResourceNotImportedError('not-saved', `${name} couldn't be saved on this device`)
    // Not an image a photo block can show: keep it as a file
    notices.push('kept-as-file')
    return storeFile(photo, fileOptions())
  }
}
