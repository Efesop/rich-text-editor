/**
 * The photos and files an imported note carries, until the import commits
 * and stores their bytes.
 *
 * A resource is { key, name, mimeType, size } plus where its bytes are: a
 * `blob` (decoded from an export as it was read) or a `file` (a SourceFile to
 * read on commit).
 *
 * DOM-free so it runs under `node --test`.
 */

import { extension } from './paths.js'

const MIME_TYPES = Object.freeze({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html',
  zip: 'application/zip', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', amr: 'audio/amr',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
})

const EXTENSIONS = Object.freeze(Object.fromEntries(
  Object.entries(MIME_TYPES).filter(([ext]) => !['jpeg', 'jpe', 'tif'].includes(ext)).map(([ext, type]) => [type, ext])
))

/** A MIME type from a file name's extension. */
export function mimeTypeFor (name) {
  return MIME_TYPES[extension(String(name ?? ''))] || 'application/octet-stream'
}

/** The usual extension for a MIME type, with its dot, or ''. */
export function extensionFor (mimeType) {
  const ext = EXTENSIONS[String(mimeType ?? '').toLowerCase()]
  return ext ? `.${ext}` : ''
}

// What a photo block can show. TIFF and other image types become files.
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/svg+xml'])

export function isPhotoType (mimeType) {
  return PHOTO_TYPES.has(String(mimeType ?? '').toLowerCase())
}

/** A resource from a base64 image data URL, or null. */
export function dataUrlResource (src, key) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(src ?? ''))
  if (!match) return null
  try {
    const binary = atob(match[2].replace(/\s+/g, ''))
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const mimeType = match[1].toLowerCase()
    return { key, name: `photo${extensionFor(mimeType)}`, mimeType, size: bytes.length, blob: new Blob([bytes], { type: mimeType }) }
  } catch {
    return null
  }
}

/** A resource's bytes. */
export async function readResource (resource) {
  if (resource.blob) return new Uint8Array(await resource.blob.arrayBuffer())
  if (resource.file) return resource.file.bytes()
  throw new Error(`No bytes for ${resource.name}`)
}
