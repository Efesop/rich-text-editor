/**
 * Strip EXIF/metadata from an image file by re-encoding through Canvas.
 * Canvas only stores pixel data, so all metadata (GPS, camera, timestamps) is removed.
 *
 * Also auto-shrinks oversize images to MAX_DIM (longest edge) so iPhone
 * photos (commonly 6-8 MB at 4032 px) fit comfortably within the 5 MB
 * editor cap after re-encoding. Pre-fix: shooting from iPhone Photos
 * threw "Image too large." for almost every recent photo. Now JPEG
 * re-encode at 2048 px typically lands at 0.5-2 MB.
 *
 * HEIC/HEIF inputs route through this same canvas path. WKWebView
 * iOS 17+ decodes HEIC natively via <img>; output is forced to JPEG.
 *
 * @param {File} file - Image file to strip + optionally shrink
 * @returns {Promise<string>} Clean base64 data URL with no metadata
 */
const MAX_DIM = 2048

export function stripImageMetadata (file) {
  // Skip GIFs (would lose animation) and SVGs (no EXIF, vector preserved)
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to load image (unsupported format on this platform — try JPEG or PNG)'))
      img.onload = () => {
        try {
          // Compute output dimensions. If either edge exceeds MAX_DIM,
          // scale proportionally so the longest edge becomes MAX_DIM.
          let w = img.naturalWidth
          let h = img.naturalHeight
          if (w > MAX_DIM || h > MAX_DIM) {
            const scale = MAX_DIM / Math.max(w, h)
            w = Math.round(w * scale)
            h = Math.round(h * scale)
          }

          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)

          // Preserve PNG (lossless) format. Force JPEG for HEIC/HEIF
          // (browsers can DECODE but not ENCODE HEIC). webp passes
          // through. Everything else → JPEG (smaller files).
          const isHeicLike = file.type === 'image/heic' || file.type === 'image/heif'
          const outputType = file.type === 'image/png' ? 'image/png'
            : file.type === 'image/webp' ? 'image/webp'
              : (isHeicLike ? 'image/jpeg' : 'image/jpeg')
          const quality = outputType === 'image/png' ? undefined : 0.92
          const dataUrl = canvas.toDataURL(outputType, quality)
          resolve(dataUrl)
        } catch (err) {
          reject(err)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
