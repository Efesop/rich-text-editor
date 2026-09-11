import { imageDimensions, sniffImageType } from '@/lib/attachmentRefs'

/**
 * Strip EXIF/metadata from an image file by re-encoding it through a canvas.
 * A canvas holds only pixels, so location, camera and timestamps are gone.
 *
 * Also shrinks oversize images to MAX_DIM on the longest edge, so a 4032 px
 * iPhone photo lands at roughly 0.5-2 MB, and keeps shrinking further while
 * the result is over `maxBytes`.
 *
 * HEIC/HEIF inputs take the same canvas path: WKWebView on iOS 17+ decodes
 * HEIC natively, and the output is JPEG.
 *
 * @param {File} file - image to clean and shrink
 * @param {object} [options]
 * @param {number} [options.maxBytes] - largest acceptable result
 * @returns {Promise<{bytes: Uint8Array, mimeType: string, width?: number, height?: number}>}
 */
const MAX_DIM = 2048
const SHRINK_STEPS = 6

function readAsDataUrl (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function decode (dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image (unsupported format on this platform — try JPEG or PNG)'))
    img.src = dataUrl
  })
}

function encode (canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to encode image')), type, quality)
  })
}

export async function stripImageMetadata (file, { maxBytes = Infinity } = {}) {
  // GIFs keep their animation and SVGs stay vector: they're stored as they are.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
      const err = new Error('Image too large')
      err.name = 'ImageTooLargeError'
      throw err
    }
    const size = imageDimensions(bytes)
    return { bytes, mimeType: sniffImageType(bytes) || file.type, width: size?.width, height: size?.height }
  }

  const img = await decode(await readAsDataUrl(file))

  // Keep PNG lossless and WebP as WebP. Browsers decode HEIC/HEIF but can't
  // encode it, so that and everything else becomes JPEG.
  const outputType = file.type === 'image/png' ? 'image/png'
    : file.type === 'image/webp' ? 'image/webp'
      : 'image/jpeg'
  const quality = outputType === 'image/png' ? undefined : 0.92

  let longest = MAX_DIM
  for (let step = 0; step < SHRINK_STEPS; step++) {
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (w > longest || h > longest) {
      const scale = longest / Math.max(w, h)
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    const blob = await encode(canvas, outputType, quality)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (bytes.byteLength <= maxBytes) {
      // Safari has no WebP encoder and quietly hands back PNG: go by the bytes.
      return { bytes, mimeType: sniffImageType(bytes) || blob.type || outputType, width: w, height: h }
    }
    longest = Math.round(Math.max(w, h) * 0.75)
  }

  const err = new Error('Image too large')
  err.name = 'ImageTooLargeError'
  throw err
}
