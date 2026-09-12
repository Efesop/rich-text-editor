import React, { useLayoutEffect, useRef, useState } from 'react'
import { REDUCED_TIMING, WIPE_TIMING, bitState, cellsForLines, fieldCells, glyphAdvance } from '@/lib/selfDestructWipe'

// When the open page self-destructs, its text turns into binary, like the
// field behind the dashnote.io hero, then crumbles and falls down the page. The
// page is already gone from storage when this starts; this is only what the
// person sees. RichTextEditor marks the text to turn into bits with
// data-sd-source (and fades it out), and the areas it sits in with
// data-sd-area: "page" gets a faint field of bits too, "header" only clips.

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

// Each theme's own ink, and the brighter ink bits flash as they let go
const PALETTES = {
  light: { ink: '13,13,13', accent: '0,0,0', field: 0.05 },
  dark: { ink: '236,236,236', accent: '255,255,255', field: 0.055 },
  darkblue: { ink: '224,230,240', accent: '255,255,255', field: 0.055 },
  fallout: { ink: '74,222,128', accent: '220,252,231', field: 0.07 }
}

const FIELD_GLOW = 0.4 // extra opacity of a field bit as it lets go
const TEXT_REST = 0.9 // opacity of a text bit, against its text colour

function parseColor (value, fallback) {
  const match = /rgba?\(([^)]+)\)/.exec(value || '')
  const parts = match ? match[1].split(/[\s,/]+/).filter(Boolean).map(Number) : []
  if (parts.length < 3 || parts.slice(0, 3).some(n => !Number.isFinite(n))) return { rgb: fallback, alpha: 1 }
  return { rgb: parts.slice(0, 3).map(Math.round).join(','), alpha: Number.isFinite(parts[3]) ? parts[3] : 1 }
}

function visibleRect (el, viewport) {
  const r = el.getBoundingClientRect()
  const left = Math.max(r.left, 0)
  const top = Math.max(r.top, 0)
  const right = Math.min(r.right, viewport.width)
  const bottom = Math.min(r.bottom, viewport.height)
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null
}

// Where the page's text is on screen, read the moment it starts to go.
function measurePage (palette) {
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const styles = []
  const styleIds = new Map()
  const styleFor = (size, rgb, alpha, weight) => {
    const key = `${size}|${rgb}|${alpha}|${weight}`
    if (!styleIds.has(key)) {
      styleIds.set(key, styles.length)
      styles.push({ size, rgb, alpha, weight })
    }
    return styleIds.get(key)
  }
  const lines = []
  for (const source of document.querySelectorAll('[data-sd-source]')) {
    const area = source.closest('[data-sd-area]')
    const clip = visibleRect(area || document.documentElement, viewport)
    if (!clip) continue
    // Text in a clipped or scrolled box (a truncated title, a wide table)
    // only turns into bits where it can be seen
    const clips = new Map()
    const clipFor = (el) => {
      if (!el || el === area || el === document.documentElement) return clip
      if (clips.has(el)) return clips.get(el)
      let box = clipFor(el.parentElement)
      const computed = window.getComputedStyle(el)
      if (box && (computed.overflowX !== 'visible' || computed.overflowY !== 'visible')) {
        const r = el.getBoundingClientRect()
        const left = Math.max(box.x, r.left)
        const top = Math.max(box.y, r.top)
        const right = Math.min(box.x + box.width, r.right)
        const bottom = Math.min(box.y + box.height, r.bottom)
        box = right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null
      }
      clips.set(el, box)
      return box
    }
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!parent || !node.nodeValue.trim()) continue
      const box = clipFor(parent)
      if (!box) continue
      const computed = window.getComputedStyle(parent)
      if (computed.visibility === 'hidden' || Number(computed.opacity) === 0) continue
      const size = Math.round((parseFloat(computed.fontSize) || 16) * 2) / 2
      const color = parseColor(computed.color, palette.ink)
      const style = styleFor(size, color.rgb, color.alpha, Number(computed.fontWeight) >= 600 ? 700 : 400)
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) {
        const middle = r.top + r.height / 2
        const left = Math.max(r.left, box.x)
        const right = Math.min(r.right, box.x + box.width)
        if (r.height < 2 || right - left < 2 || middle < box.y || middle > box.y + box.height) continue
        lines.push({ x: left, y: r.top, width: right - left, height: r.height, fontSize: size, style })
      }
    }
    // Photos and embeds become blocks of small bits
    for (const media of source.querySelectorAll('img, video, canvas, iframe')) {
      const box = clipFor(media.parentElement)
      if (!box) continue
      const r = media.getBoundingClientRect()
      const top = Math.max(r.top, box.y)
      const bottom = Math.min(r.bottom, box.y + box.height)
      const left = Math.max(r.left, box.x)
      const right = Math.min(r.right, box.x + box.width)
      if (right - left < 24 || bottom - top < 24) continue
      const style = styleFor(10, palette.ink, 0.55, 400)
      for (let y = top; y + 14 <= bottom; y += 14) lines.push({ x: left, y, width: right - left, height: 14, fontSize: 10, style })
    }
  }
  lines.sort((a, b) => a.y - b.y)

  const areas = Array.from(document.querySelectorAll('[data-sd-area]'))
    .map(el => ({ kind: el.getAttribute('data-sd-area'), rect: visibleRect(el, viewport) }))
    .filter(a => a.rect)
  const page = areas.find(a => a.kind === 'page')?.rect || { x: 0, y: 0, ...viewport }
  const all = areas.length ? areas.map(a => a.rect) : [page]
  const x = Math.min(...all.map(r => r.x))
  const y = Math.min(...all.map(r => r.y))
  const union = { x, y, width: Math.max(...all.map(r => r.x + r.width)) - x, height: Math.max(...all.map(r => r.y + r.height)) - y }
  return { lines, styles, page, union }
}

function glyph (cache, char, size, rgb, weight, dpr) {
  const key = `${char}|${size}|${rgb}|${weight}`
  let sprite = cache.get(key)
  if (sprite) return sprite
  const w = Math.ceil(glyphAdvance(size) + 2)
  const h = Math.ceil(size * 1.4)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w * dpr))
  canvas.height = Math.max(1, Math.ceil(h * dpr))
  const g = canvas.getContext('2d')
  g.scale(dpr, dpr)
  g.font = `${weight} ${size}px ${MONO}`
  g.textBaseline = 'middle'
  g.fillStyle = `rgb(${rgb})`
  g.fillText(char, 1, h / 2)
  sprite = { canvas, w, h }
  cache.set(key, sprite)
  return sprite
}

export default function SelfDestructOverlay ({ theme, onComplete }) {
  const canvasRef = useRef(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const [phase, setPhase] = useState('bits')
  const [pageBox, setPageBox] = useState(null)
  const isFallout = theme === 'fallout'

  useLayoutEffect(() => {
    const palette = PALETTES[theme] || PALETTES.light
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timing = reduced ? REDUCED_TIMING : WIPE_TIMING
    const timers = [
      setTimeout(() => setPhase('message'), timing.message),
      setTimeout(() => setPhase('exit'), timing.exit),
      setTimeout(() => { if (onCompleteRef.current) onCompleteRef.current() }, timing.done)
    ]
    let raf = 0
    let measured = null
    try {
      measured = measurePage(palette)
      setPageBox(measured.page)
    } catch (err) {
      console.warn('self-destruct: could not measure the page', err)
    }

    const canvas = canvasRef.current
    const ctx = canvas && canvas.getContext('2d')
    if (!reduced && measured && ctx) {
      const width = window.innerWidth
      const height = window.innerHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const phone = width < 768
      const textBits = cellsForLines(measured.lines, { maxCells: phone ? 5000 : 9000 })
      const fieldBits = fieldCells(measured.page, phone ? { cell: 13, line: 22, maxCells: 2500 } : { maxCells: 6000 })
      const fieldSize = phone ? 12 : 13
      const sprites = new Map()

      const paint = (x, y, bit, size, rgb, weight, opacity, accent) => {
        if (opacity <= 0.003) return
        const char = bit ? '1' : '0'
        if (accent < 1) {
          const ink = glyph(sprites, char, size, rgb, weight, dpr)
          ctx.globalAlpha = opacity * (1 - accent)
          ctx.drawImage(ink.canvas, x, y - ink.h / 2, ink.w, ink.h)
        }
        if (accent > 0) {
          const hot = glyph(sprites, char, size, palette.accent, weight, dpr)
          ctx.globalAlpha = Math.min(1, 0.35 + opacity) * accent
          ctx.drawImage(hot.canvas, x, y - hot.h / 2, hot.w, hot.h)
        }
      }

      const start = performance.now()
      const { union } = measured
      const frame = (now) => {
        const elapsed = now - start
        ctx.clearRect(0, 0, width, height)
        if (elapsed >= WIPE_TIMING.fallEnd) return
        // Bits fall off the bottom of the page, not over the toolbar or sidebar
        ctx.save()
        ctx.beginPath()
        ctx.rect(union.x, union.y, union.width, union.height)
        ctx.clip()
        for (const bit of fieldBits) {
          const state = bitState(bit, elapsed, union)
          if (state.alpha <= 0) continue
          if (Math.random() < state.flicker) bit.bit ^= 1
          const opacity = Math.min(1, palette.field * bit.shade + FIELD_GLOW * state.glow) * state.alpha
          paint(bit.x + state.dx, bit.y + state.dy, bit.bit, fieldSize, palette.ink, 400, opacity, state.accent)
        }
        for (const bit of textBits) {
          const state = bitState(bit, elapsed, union)
          if (state.alpha <= 0) continue
          if (Math.random() < state.flicker) bit.bit ^= 1
          const style = measured.styles[bit.style]
          const rest = TEXT_REST * bit.shade
          const opacity = Math.min(1, style.alpha * (rest + (1 - rest) * state.glow)) * state.alpha
          paint(bit.x + state.dx, bit.y + state.dy, bit.bit, style.size, style.rgb, style.weight, opacity, state.accent)
        }
        ctx.restore()
        ctx.globalAlpha = 1
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    }

    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
    }
    // Runs once, when the page starts to go
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eyebrowClass = isFallout ? 'text-green-500' : theme === 'dark' ? 'text-[#6b6b6b]' : theme === 'darkblue' ? 'text-[#5d6b88]' : 'text-neutral-400'
  const messageClass = isFallout ? 'text-green-400 font-mono' : theme === 'dark' ? 'text-[#c0c0c0]' : theme === 'darkblue' ? 'text-[#c0ccdf]' : 'text-neutral-600'
  const showMessage = phase === 'message'

  return (
    <>
      {/* Covers the window while the page goes, so nothing can be clicked mid-way */}
      <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-50" style={{ width: '100vw', height: '100vh' }} />
      <div
        role="status"
        aria-live="polite"
        className="fixed z-50 pointer-events-none text-center px-6"
        style={{
          left: pageBox ? pageBox.x + pageBox.width / 2 : '50%',
          top: pageBox ? pageBox.y + pageBox.height / 2 : '50%',
          width: pageBox ? Math.min(pageBox.width, 420) : 'min(420px, 100vw)',
          transform: `translate(-50%, ${showMessage ? '-50%' : 'calc(-50% + 8px)'})`,
          opacity: showMessage ? 1 : 0,
          transition: 'opacity 450ms ease, transform 450ms ease'
        }}
      >
        <p className={`font-mono text-[11px] font-medium uppercase tracking-[0.18em] ${eyebrowClass}`}>
          {isFallout ? 'Purge complete' : 'Self-destructed'}
        </p>
        <p className={`mt-2 text-[15px] ${messageClass}`}>
          {isFallout ? 'DOCUMENT PURGED. DATA IRRECOVERABLE.' : 'Page deleted. Nothing to recover.'}
        </p>
      </div>
    </>
  )
}
