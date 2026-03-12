/**
 * Strip EXIF/metadata from an image file by re-encoding through Canvas.
 * Canvas only stores pixel data, so all metadata (GPS, camera, timestamps) is removed.
 *
 * @param {File} file - Image file to strip
 * @returns {Promise<string>} Clean base64 data URL with no metadata
 */
export function stripImageMetadata (file) {
  // Skip GIFs (would lose animation) and SVGs (no EXIF)
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
      img.onerror = () => reject(new Error('Failed to load image'))
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)

          // Preserve PNG format, use JPEG for others (smaller file size)
          const outputType = file.type === 'image/png' ? 'image/png'
            : file.type === 'image/webp' ? 'image/webp'
              : 'image/jpeg'
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
