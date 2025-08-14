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

function darkenHex (hex, percent = 20) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const p = Math.max(0, Math.min(100, percent)) / 100
  const dr = rgb.r * (1 - p)
  const dg = rgb.g * (1 - p)
  const db = rgb.b * (1 - p)
  return `#${toHex(dr)}${toHex(dg)}${toHex(db)}`
}

export function getTagChipStyle (hex, theme) {
  const base = normalizeHex(hex) || '#a3a3a3'
  
  if (theme === 'fallout') {
    // Fallout theme - keep existing green-tinted styling for consistency
    const bg = lightenHex(base, 78)
    const lum = luminance(bg)
    const textColor = lum > 0.6 ? '#111827' : '#F9FAFB'
    return { backgroundColor: bg, borderColor: base, color: textColor }
  } else if (theme === 'dark') {
    // Dark theme - dark background with bright text (like encryption indicator)
    const darkBg = darkenHex(base, 60) // Dark background
    const brightText = lightenHex(base, 40) // Bright vibrant text
    const subtleBorder = lightenHex(base, 10) // More subtle border
    return { backgroundColor: darkBg, borderColor: subtleBorder, color: brightText }
  } else {
    // Light theme - light background with vibrant text/border (like encryption indicator)
    const lightBg = lightenHex(base, 85) // Very light background  
    const vibrantText = darkenHex(base, 20) // Vibrant dark text
    const vibrantBorder = darkenHex(base, 10) // Vibrant border
    return { backgroundColor: lightBg, borderColor: vibrantBorder, color: vibrantText }
  }
}

export function ensureHex (hex, fallback = '#a3a3a3') {
  return normalizeHex(hex) || fallback
}

export default {
  lightenHex,
  getTagChipStyle,
  ensureHex
}


