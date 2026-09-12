/**
 * Pictures of text that no embedded font can draw in a PDF (utils/pdfText.js):
 * emoji, scripts jsPDF can't shape such as Devanagari or Thai, and rare
 * characters. The browser draws them on a canvas with the device's own
 * fonts, so they look as they do in the note.
 */

// Pixels per point, so the pictures stay sharp in print
const SCALE = 4
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
const MONO = 'ui-monospace, Menlo, Consolas, monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'

/** A rasterizer for createPdfText, or null where there is no canvas. */
export function canvasRasterizer () {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null
  const pictures = new Map()
  const fontFor = ({ size, bold, italic, mono }) => `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${size * SCALE}px ${mono ? MONO : SANS}`

  return {
    /** The text's width in points. */
    measure (text, style) {
      context.font = fontFor(style)
      return context.measureText(text).width / SCALE
    },

    /**
     * The text as a PNG. `width` is how far the text advances and `ascent`
     * how far the picture reaches above the baseline, in points; the picture
     * starts `offset` points left of the text and is `imageWidth` points wide.
     */
    draw (text, style) {
      const font = fontFor(style)
      const key = `${font}|${style.rtl ? 'rtl' : 'ltr'}|${text}`
      if (pictures.has(key)) return pictures.get(key)
      context.font = font
      context.direction = style.rtl ? 'rtl' : 'ltr'
      const metrics = context.measureText(text)
      const px = style.size * SCALE
      const ascent = Math.ceil(Math.max(metrics.actualBoundingBoxAscent || 0, metrics.fontBoundingBoxAscent || 0, px * 0.95))
      const descent = Math.ceil(Math.max(metrics.actualBoundingBoxDescent || 0, metrics.fontBoundingBoxDescent || 0, px * 0.3))
      const left = Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft || 0))
      const right = Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight || 0))
      canvas.width = Math.max(1, left + right)
      canvas.height = Math.max(1, ascent + descent)
      // Resizing a canvas resets its context
      context.font = font
      context.direction = style.rtl ? 'rtl' : 'ltr'
      context.textAlign = 'left'
      context.textBaseline = 'alphabetic'
      context.fillStyle = '#000'
      context.fillText(text, left, ascent)
      const picture = {
        dataUrl: canvas.toDataURL('image/png'),
        width: metrics.width / SCALE,
        imageWidth: canvas.width / SCALE,
        offset: left / SCALE,
        height: canvas.height / SCALE,
        ascent: ascent / SCALE,
        alias: `dash-text-${pictures.size}`
      }
      pictures.set(key, picture)
      return picture
    }
  }
}
