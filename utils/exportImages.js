/**
 * Photos stored as attachments, read once before a note is exported, so every
 * format that can hold a picture gets the same bytes.
 */

import { imageDimensions, sniffImageType } from '../lib/attachmentRefs.js'
import { exportItems } from './exportBlocks.js'

function bytesToBase64 (bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * @param {object} content - Editor.js content
 * @param {{loadAttachment: (id: string) => Promise<ArrayBuffer|Uint8Array|null>}} deps
 * @returns {Promise<Map<string, {bytes: Uint8Array, mimeType: string, width?: number, height?: number, dataUrl: string}>>}
 *   photos by attachment id; a photo not on this device is simply absent
 */
export async function resolveExportImages (content, { loadAttachment }) {
  const images = new Map()
  for (const item of exportItems(content)) {
    if (item.kind !== 'image' || !item.attachmentId || images.has(item.attachmentId)) continue
    try {
      const data = await loadAttachment(item.attachmentId)
      if (!data) continue
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      const mimeType = sniffImageType(bytes)
      if (!mimeType) continue
      const size = imageDimensions(bytes)
      images.set(item.attachmentId, {
        bytes,
        mimeType,
        width: size?.width,
        height: size?.height,
        dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`
      })
    } catch (err) {
      console.error('Export: could not read a photo', item.attachmentId, err)
    }
  }
  return images
}
