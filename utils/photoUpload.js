/**
 * Adding photos to notes: the browser half of lib/imageAttachments.js.
 *
 * A picked, pasted or dropped photo is re-encoded (location and camera data
 * removed, at most 2048 px), stored as an attachment, read back to prove it
 * saved, and shown through a shared object URL. In a plain browser tab
 * attachments live in localStorage, which holds about 5 MB in all, so there
 * photos stay inline in the note, as they always have.
 */

import { stripImageMetadata } from './imageUtils'
import { storeImageBytes } from '@/lib/imageAttachments'
import { getAttachmentIdKey } from '@/lib/attachmentIdKey'
import { attachmentBackend, loadAttachment, saveAttachment } from '@/lib/attachmentStorage'
import { createObjectUrlCache } from '@/lib/attachmentObjectUrls'
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachmentLimits'
import { dataUrlToBytes, sniffImageType } from '@/lib/attachmentRefs'

// Checked before decoding, so a huge file can't stall the page.
const MAX_INPUT_BYTES = 25 * 1024 * 1024

function bytesToDataUrl (bytes, mimeType) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

/**
 * Store an image file the person picked, pasted or dropped.
 *
 * @returns {Promise<{attachmentId: string, mimeType: string, width?: number, height?: number, filename?: string} | {url: string}>}
 */
export async function storePhotoFile (file, filename = file?.name) {
  if (!file) throw new Error('No image to add')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image too large. Maximum size is 25MB.')
  const { bytes, mimeType, width, height } = await stripImageMetadata(file, { maxBytes: MAX_ATTACHMENT_BYTES })
  if (attachmentBackend() === 'localStorage') {
    return { url: bytesToDataUrl(bytes, mimeType) }
  }
  const stored = await storeImageBytes({
    bytes,
    keyBytes: getAttachmentIdKey(),
    storage: { save: saveAttachment, load: loadAttachment }
  })
  return {
    attachmentId: stored.attachmentId,
    mimeType: stored.mimeType,
    width: stored.width ?? width,
    height: stored.height ?? height,
    filename
  }
}

/**
 * Store an image pasted as an address. Data and blob URLs are stored like a
 * file; a web address stays a link to the web.
 */
export async function storePhotoUrl (url) {
  if (typeof url !== 'string' || !url) throw new Error('No image to add')
  if (/^https?:/i.test(url)) return { url }
  if (/^data:/i.test(url)) {
    const decoded = dataUrlToBytes(url)
    if (!decoded) throw new Error('The pasted image could not be read')
    const type = sniffImageType(decoded.bytes) || decoded.mimeType
    return storePhotoFile(new File([decoded.bytes], 'image', { type }), undefined)
  }
  if (/^blob:/i.test(url)) {
    const blob = await (await fetch(url)).blob()
    const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer())
    return storePhotoFile(new File([blob], 'image', { type: sniffImageType(head) || blob.type }), undefined)
  }
  throw new Error('This kind of image address cannot be added')
}

let urls = null

function photoUrls () {
  if (!urls) {
    urls = createObjectUrlCache({
      load: loadAttachment,
      createUrl: (bytes, mimeType) => URL.createObjectURL(new Blob([bytes], { type: sniffImageType(bytes) || mimeType || 'application/octet-stream' })),
      revokeUrl: (url) => URL.revokeObjectURL(url)
    })
  }
  return urls
}

/** An object URL for a stored photo. Call releasePhotoUrl once for every successful call. */
export function acquirePhotoUrl (attachmentId, mimeType) {
  return photoUrls().acquire(attachmentId, mimeType)
}

export function releasePhotoUrl (attachmentId) {
  urls?.release(attachmentId)
}

/** Revoke every photo URL, for when the app locks. */
export function clearPhotoUrls () {
  urls?.clear()
}
