/**
 * The binary field behind the app lock screen, drawn by
 * components/LockScreenField.js. It is dashnote.io's BitsField
 * (DashLandingPage/app/components/BitsField.tsx): a grid of 0s and 1s in the
 * theme's own ink, a diagonal "decrypt" sweep that brightens and flips the
 * bits it passes, and a soft clearing behind the words. A wrong password
 * scrambles the bits around the password field. Unlocking isn't drawn here: it
 * is a CSS transition (.dash-lock.is-leaving in styles/globals.css) that runs
 * on the compositor, so it stays smooth while Dash decrypts notes and draws
 * the app underneath.
 *
 * DOM-free so it runs under `node --test`.
 */

export const FIELD = Object.freeze({
  cell: 12.4, // px between bits across
  line: 21, // px between rows
  font: 13, // px
  period: 7, // seconds for the sweep to cross the window
  sweepBand: 60, // px either side of the sweep front that light up
  fps: 12, // resting frame rate, as on the site
  activeFps: 30 // while a wrong password scrambles the field
})

export const SCRAMBLE = Object.freeze({ radius: 300, duration: 560 })

/** A field covering width × height px: where each bit sits, and its first 0 or 1. */
export function createField (width, height, { random = Math.random } = {}) {
  const cols = width > 0 ? Math.ceil(width / FIELD.cell) : 0
  const rows = height > 0 ? Math.ceil(height / FIELD.line) : 0
  const n = cols * rows
  const field = {
    width,
    height,
    cols,
    rows,
    xs: new Float32Array(n),
    ys: new Float32Array(n),
    bits: new Uint8Array(n),
    glow: new Float32Array(n),
    alpha: new Float32Array(n)
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      field.xs[i] = c * FIELD.cell
      field.ys[i] = r * FIELD.line
      field.bits[i] = random() < 0.5 ? 1 : 0
    }
  }
  return field
}

/** Where the sweep is at `time` seconds, as the line x + 0.6y = front. It starts off screen to the top left. */
export function sweepFront (time, width, height, period = FIELD.period) {
  const span = width + height * 0.6 + 300
  const t = ((time % period) + period) % period
  return (t / period) * span - 150
}

/** How much of a bit shows inside the clearing behind the lock screen's words: 0.12 at its centre, all of it outside. */
export function clearFactor (clear, x, y) {
  if (!clear || !(clear.rx > 0) || !(clear.ry > 0)) return 1
  const dx = (x - clear.x) / clear.rx
  const dy = (y - clear.y) / clear.ry
  const rr = dx * dx + dy * dy
  return rr < 1 ? 0.12 + 0.88 * rr : 1
}

/** The scrambles still playing at `now` (ms). */
export function liveEffects (effects, now) {
  return (effects || []).filter(effect => now - effect.start < effect.duration)
}

/**
 * Move the field on by `dt` seconds and work out how strongly each bit shows,
 * into `field.alpha`. `time` is the sweep's clock in seconds and `now` the
 * scrambles' clock in ms. `still` (Reduce Motion) keeps the resting field: no
 * sweep, no flips and no scrambles.
 */
export function stepField (field, { time = 0, dt = 0, now = 0, effects = [], base = 0.06, peak = 0.3, clear = null, still = false, random = Math.random } = {}) {
  const frames = still ? 0 : Math.max(0, dt) * FIELD.fps
  const front = sweepFront(time, field.width, field.height)
  const band = FIELD.sweepBand
  const { xs, ys, bits, glow, alpha } = field
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]
    const y = ys[i]
    let a = base
    // What a wrong password adds. The clearing behind the words only halves
    // it, so a wrong password shows right around the field.
    let lit = 0
    if (frames > 0) {
      const d = Math.abs(x + y * 0.6 - front)
      if (d < band) {
        const k = 1 - d / band
        a += peak * k
        if (random() < 0.12 * frames) bits[i] ^= 1
        if (k > glow[i]) glow[i] = k
      } else if (glow[i] > 0) {
        // The bits the sweep has passed fade back slowly
        a += peak * 0.7 * glow[i]
        glow[i] = Math.max(0, glow[i] - 0.025 * frames)
      }
      if (random() < 0.0006 * frames) bits[i] ^= 1
      for (let j = 0; j < effects.length; j++) {
        const effect = effects[j]
        const p = (now - effect.start) / effect.duration
        if (!(p >= 0 && p < 1)) continue
        const dx = x - effect.x
        const dy = y - effect.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < effect.radius) {
          const q = (1 - dist / effect.radius) * Math.pow(1 - p, 0.7)
          lit += peak * 1.25 * q
          if (random() < 0.6 * q * frames) bits[i] ^= 1
        }
      }
    }
    const c = clear ? clearFactor(clear, x, y) : 1
    a = a * c + lit * (0.5 + 0.5 * c)
    alpha[i] = a < 0 ? 0 : a > 1 ? 1 : a
  }
  return alpha
}
