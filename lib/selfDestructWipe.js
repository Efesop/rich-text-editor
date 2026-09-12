/**
 * The self-destruct animation: when the open page self-destructs, its text
 * turns into binary, then crumbles and falls away down the page.
 * components/SelfDestructOverlay.js measures the page and draws it; this file
 * holds the layout and the motion, DOM-free so it runs under `node --test`.
 */

/** Milliseconds from the moment the page self-destructs. */
export const WIPE_TIMING = Object.freeze({
  encode: 700, // the text has turned into bits, top of the page first
  releaseStart: 800, // the first bits let go
  releaseEnd: 1900, // the last bits let go
  message: 2250, // "Page deleted" fades in
  fallEnd: 2750, // every bit has fallen away
  exit: 3500, // the message fades out
  done: 3900 // the next page opens
})

/** Under reduced motion there are no bits: the message shows straight away. */
export const REDUCED_TIMING = Object.freeze({ message: 0, exit: 1300, done: 1700 })

const STAGGER = 260 // ms between the top and the bottom of the page turning into bits
const APPEAR = 420 // ms for one line of text to turn into bits
const WARM = 160 // ms a bit glows before it lets go
const LIFE_MIN = 520 // ms a falling bit takes to fade away
const LIFE_MAX = 850

const GONE = Object.freeze({ alpha: 0, glow: 0, accent: 0, dx: 0, dy: 0, flicker: 0 })
const EVEN = Object.freeze([0.5, 0.5, 0.5, 0.5, 0.5])

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const easeOut = (p) => 1 - (1 - p) * (1 - p)
const seeds = (random) => [random(), random(), random(), random(), random()]

/** Horizontal space one binary digit takes at a font size. */
export function glyphAdvance (fontSize) {
  return fontSize * 0.62
}

/**
 * Bits standing in for lines of text: one 0 or 1 per character-sized slot,
 * spread evenly across each line's box. `lines` are client rects
 * `{ x, y, width, height, fontSize, style }`; each cell's `y` is the middle
 * of its line, and `seed` gives it its own timing and fall.
 */
export function cellsForLines (lines, { maxCells = 9000, random = Math.random } = {}) {
  const cells = []
  for (const line of lines || []) {
    if (!line || !(line.width >= 2) || !(line.height >= 2) || !(line.fontSize > 0)) continue
    const count = Math.max(1, Math.round(line.width / glyphAdvance(line.fontSize)))
    const step = line.width / count
    const y = line.y + line.height / 2
    for (let i = 0; i < count; i++) {
      if (cells.length >= maxCells) return cells
      cells.push({ x: line.x + i * step, y, size: line.fontSize, style: line.style, bit: random() < 0.5 ? 1 : 0, shade: 0.72 + random() * 0.28, seed: seeds(random) })
    }
  }
  return cells
}

/** A faint grid of bits over an area, like the field behind the dashnote.io hero. */
export function fieldCells (area, { cell = 12.4, line = 21, maxCells = 6000, random = Math.random } = {}) {
  const cells = []
  if (!area || !(area.width > 0) || !(area.height > 0)) return cells
  const cols = Math.ceil(area.width / cell)
  const rows = Math.ceil(area.height / line)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells.length >= maxCells) return cells
      cells.push({ x: area.x + c * cell, y: area.y + r * line + line / 2, bit: random() < 0.5 ? 1 : 0, shade: 0.6 + random() * 0.4, seed: seeds(random) })
    }
  }
  return cells
}

/** When a bit lets go: the top of the page first on the whole, some bits a little early or late. */
export function releaseTime (bit, area, timing = WIPE_TIMING) {
  const fromTop = area && area.height > 0 ? clamp01((bit.y - area.y) / area.height) : 0
  const jitter = (bit.seed || EVEN)[0]
  return timing.releaseStart + (fromTop * 0.55 + jitter * 0.45) * (timing.releaseEnd - timing.releaseStart)
}

/**
 * How one bit looks `elapsed` ms in:
 * - alpha: how much of it is left (0 = gone), multiplying its resting opacity
 * - glow: 0–1, how much brighter it is as it lets go
 * - accent: 0–1, how much of the accent colour it takes as it lets go
 * - dx, dy: px it has drifted and fallen
 * - flicker: the chance it flips between 0 and 1 this frame
 */
export function bitState (bit, elapsed, area, timing = WIPE_TIMING) {
  if (!bit || !area || elapsed >= timing.fallEnd) return GONE
  const fromTop = area.height > 0 ? clamp01((bit.y - area.y) / area.height) : 0
  const appear = easeOut(clamp01((elapsed - fromTop * STAGGER) / APPEAR))
  if (appear <= 0) return GONE
  const seed = bit.seed || EVEN
  const release = releaseTime(bit, area, timing)
  if (elapsed < release) {
    const warm = clamp01(1 - (release - elapsed) / WARM)
    return { alpha: appear, glow: warm * 0.5, accent: warm * 0.7, dx: 0, dy: 0, flicker: elapsed < timing.encode ? 0.06 : 0.008 + warm * 0.25 }
  }
  const life = LIFE_MIN + seed[3] * (LIFE_MAX - LIFE_MIN)
  const k = (elapsed - release) / life
  if (k >= 1) return GONE
  const t = (elapsed - release) / 1000
  const speed = 30 + seed[1] * 90 // px/s as it lets go
  const gravity = 1400 + seed[2] * 1000 // px/s²
  const drift = (seed[4] - 0.5) * 80 // px/s sideways
  return {
    alpha: appear * (1 - k) * (1 - k),
    glow: clamp01(0.5 - k * 1.5),
    accent: clamp01(0.7 - k * 2),
    dx: drift * t,
    dy: speed * t + 0.5 * gravity * t * t,
    flicker: 0.2
  }
}
