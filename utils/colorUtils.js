// Small helpers to keep tag chip colors consistent across the app

function normalizeHex (hex) {
  if (typeof hex !== 'string') return null
  const c = hex.replace('#', '').trim()
  if (c.length === 3) {
    const full = c.split('').map(ch => ch + ch).join('')
    return `#${full.toLowerCase()}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c.toLowerCase()}`
  return null
}

function hexToRgb (hex) {
  const n = normalizeHex(hex)
  if (!n) return null
  const r = parseInt(n.slice(1, 3), 16)
  const g = parseInt(n.slice(3, 5), 16)
  const b = parseInt(n.slice(5, 7), 16)
  return { r, g, b }
}

function toHex (n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

export function lightenHex (hex, percent = 78) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const p = Math.max(0, Math.min(100, percent)) / 100
  const lr = rgb.r + (255 - rgb.r) * p
  const lg = rgb.g + (255 - rgb.g) * p
  const lb = rgb.b + (255 - rgb.b) * p
  return `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`
}

function luminance (hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 1
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

export function getTagChipStyle (hex, theme) {
  const base = normalizeHex(hex) || '#a3a3a3'
  const bg = lightenHex(base, 78)
  const lum = luminance(bg)
  // Choose readable text color based on background luminance
  const textColor = lum > 0.6 ? '#111827' : '#F9FAFB'
  return { backgroundColor: bg, borderColor: base, color: textColor }
}

export function ensureHex (hex, fallback = '#a3a3a3') {
  return normalizeHex(hex) || fallback
}

export default {
  lightenHex,
  getTagChipStyle,
  ensureHex
}


