import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EFFECTS, FIELD, createField, liveEffects, stepField } from '@/lib/lockField'

// The binary field behind the app lock screen (lib/lockField.js), in the
// theme's own ink. It only draws while the lock screen is up: 12 frames a
// second at rest and 30 while a wrong password or an unlock plays. It stops
// while the window is hidden and holds still with Reduce Motion on.

const FAMILY = 'Dash Bits'
const FONT_STACK = `"${FAMILY}", ui-monospace, SFMono-Regular, Menlo, monospace`
let fontReady = null

// Geist Mono, dashnote.io's typeface, ships in public/fonts/geist. Like the
// PDF fonts (utils/pdfFonts.js) it is read relative to the page, so it loads
// from file:, capacitor: and a web base path. If it can't load, the bits use
// the system's monospace face.
function loadBitsFont () {
  if (typeof window === 'undefined' || typeof window.FontFace === 'undefined' || !document.fonts) return Promise.resolve()
  if (!fontReady) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH
    const url = base ? `${base}/fonts/geist/GeistMonoVF.woff` : new URL('fonts/geist/GeistMonoVF.woff', document.baseURI).href
    fontReady = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then(data => new window.FontFace(FAMILY, data).load())
      .then(face => { document.fonts.add(face) })
      .catch(() => {})
  }
  return fontReady
}

function glyph (char, ink, dpr) {
  const size = FIELD.font * dpr
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(size * 0.8) + 2
  canvas.height = Math.ceil(size * 1.4) + 2
  const g = canvas.getContext('2d')
  g.font = `${size}px ${FONT_STACK}`
  g.textBaseline = 'top'
  g.fillStyle = `rgb(${ink})`
  g.fillText(char, 1, 1)
  return canvas
}

const LockScreenField = forwardRef(function LockScreenField ({ ink, base, peak, clearRef }, ref) {
  const canvasRef = useRef(null)
  const effectsRef = useRef([])
  const sizeRef = useRef({ width: 0, height: 0 })
  const wakeRef = useRef(() => {})

  useImperativeHandle(ref, () => ({
    // A wrong password: the bits around (x, y) scramble, then settle
    scramble (x, y) {
      effectsRef.current.push({ type: 'scramble', x, y, radius: EFFECTS.scramble.radius, duration: EFFECTS.scramble.duration, start: performance.now() })
      wakeRef.current()
    },
    // Unlocked: the field decrypts outward from (x, y) and stays empty
    unlock (x, y) {
      const { width, height } = sizeRef.current
      effectsRef.current.push({ type: 'unlock', x, y, radius: Math.hypot(width, height) + 140, duration: EFFECTS.unlock.duration, start: performance.now() })
      wakeRef.current()
    }
  }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas ? canvas.getContext('2d') : null
    if (!ctx) return
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let field = null
    let sprites = null
    let dpr = 1
    let time = Math.random() * FIELD.period
    let last = 0
    let timer = 0
    let frame = 0
    let empty = false
    let disposed = false

    const setup = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      sizeRef.current = { width, height }
      field = createField(width, height)
      sprites = [glyph('0', ink, dpr), glyph('1', ink, dpr)]
    }

    // Where the words are, so the field clears softly behind them
    const clearing = () => {
      const words = clearRef && clearRef.current
      if (!words) return null
      const box = words.getBoundingClientRect()
      const own = canvas.getBoundingClientRect()
      return { x: box.left - own.left + box.width / 2, y: box.top - own.top + box.height / 2, rx: box.width / 2 + 120, ry: box.height / 2 + 90 }
    }

    const draw = (dt) => {
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!field) return
      const now = performance.now()
      const { live, unlocked } = liveEffects(effectsRef.current, now)
      effectsRef.current = live
      if (unlocked) empty = true
      if (empty) return
      const alpha = stepField(field, { time, dt, now, effects: live, base, peak, clear: clearing(), still })
      const { xs, ys, bits } = field
      for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] <= 0.004) continue
        ctx.globalAlpha = alpha[i]
        ctx.drawImage(sprites[bits[i]], xs[i] * dpr, ys[i] * dpr)
      }
      ctx.globalAlpha = 1
    }

    const schedule = () => {
      if (disposed || still || empty || timer || frame) return
      const fps = effectsRef.current.length ? FIELD.activeFps : FIELD.fps
      timer = window.setTimeout(() => {
        timer = 0
        frame = window.requestAnimationFrame(tick)
      }, 1000 / fps)
    }

    function tick () {
      frame = 0
      if (disposed || document.hidden) {
        last = 0
        return
      }
      const now = performance.now()
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 1 / FIELD.fps
      last = now
      time += dt
      draw(dt)
      schedule()
    }

    // An effect starts on the next frame rather than after a resting one
    wakeRef.current = () => {
      if (disposed || still) return
      if (timer) {
        window.clearTimeout(timer)
        timer = 0
      }
      if (!frame) frame = window.requestAnimationFrame(tick)
    }

    const onResize = () => {
      setup()
      draw(0)
    }
    const onVisibility = () => {
      if (!document.hidden) schedule()
    }

    loadBitsFont().then(() => {
      if (disposed) return
      setup()
      draw(0)
      schedule()
    })
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      wakeRef.current = () => {}
    }
  }, [ink, base, peak, clearRef])

  return <canvas ref={canvasRef} aria-hidden="true" className="dash-lock-field" />
})

export default LockScreenField
