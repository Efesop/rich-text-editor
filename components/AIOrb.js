import React, { useRef, useEffect, useCallback } from 'react'

const IDLE_BLOBS = [
  { color: [70, 120, 255], a: 0.9, r: 0.55, sx: 0.3, sy: 0.25, ax: 0.28, ay: 0.24, ph: 0 },
  { color: [140, 80, 250], a: 0.8, r: 0.45, sx: -0.25, sy: 0.4, ax: 0.24, ay: 0.3, ph: 1.8 },
  { color: [230, 90, 180], a: 0.65, r: 0.38, sx: 0.2, sy: -0.3, ax: 0.22, ay: 0.2, ph: 3.6 },
  { color: [40, 180, 255], a: 0.6, r: 0.37, sx: -0.15, sy: 0.2, ax: 0.18, ay: 0.26, ph: 5.2 },
  { color: [170, 110, 255], a: 0.5, r: 0.3, sx: 0.22, sy: 0.18, ax: 0.16, ay: 0.18, ph: 7.0 }
]

const GEN_BLOBS = [
  { color: [20, 80, 255], a: 0.95, r: 0.5, sx: 1.6, sy: 1.1, ax: 0.36, ay: 0.32, ph: 0 },
  { color: [0, 190, 250], a: 0.85, r: 0.44, sx: -1.3, sy: 1.8, ax: 0.32, ay: 0.38, ph: 0.8 },
  { color: [200, 50, 210], a: 0.7, r: 0.38, sx: 1.9, sy: -1.4, ax: 0.34, ay: 0.28, ph: 1.6 },
  { color: [80, 100, 255], a: 0.75, r: 0.4, sx: -1.1, sy: 1.5, ax: 0.28, ay: 0.34, ph: 2.8 },
  { color: [160, 70, 240], a: 0.6, r: 0.32, sx: 1.4, sy: -1.8, ax: 0.3, ay: 0.26, ph: 4.0 },
  { color: [40, 220, 240], a: 0.5, r: 0.28, sx: -1.7, sy: 1.2, ax: 0.26, ay: 0.32, ph: 5.5 }
]

const IDLE_PARAMS = { speed: 0.004, wobble: 0.25, blur: 28, deform: 0.2 }
const GEN_PARAMS = { speed: 0.025, wobble: 0.5, blur: 18, deform: 0.4 }
const LERP_RATE = 0.035
const SEGMENTS = 80

function fbm (x, y, z) {
  let v = 0, amp = 1, freq = 1
  for (let i = 0; i < 4; i++) {
    v += amp * (Math.sin(x * freq * 1.1 + z) * Math.cos(y * freq * 0.9 + z * 0.7) +
      Math.sin(x * freq * 0.6 - z * 1.3) * Math.sin(y * freq * 1.4 + z * 0.5)) / 2
    amp *= 0.5
    freq *= 2.1
  }
  return v
}

function lerp (a, b, t) { return a + (b - a) * t }

// Theme-aware glass colors
const GLASS = {
  light: {
    frost: [[255,255,255,0.1], [255,255,255,0.18], [255,255,255,0.26], [255,255,255,0.35]],
    rim: 'rgba(180,190,220,0.4)',
    spec: [[255,255,255,0.55], [255,255,255,0.2], [255,255,255,0]],
    shadow: 'rgba(100,120,180,0.2)'
  },
  dark: {
    frost: [[160,170,200,0.04], [140,150,180,0.08], [120,140,180,0.12], [100,130,200,0.18]],
    rim: 'rgba(140,160,220,0.3)',
    spec: [[180,200,255,0.35], [160,180,240,0.1], [140,160,220,0]],
    shadow: 'rgba(0,0,0,0.3)'
  },
  darkblue: {
    frost: [[100,140,220,0.05], [80,120,200,0.1], [60,100,200,0.15], [50,90,200,0.22]],
    rim: 'rgba(80,130,240,0.35)',
    spec: [[140,180,255,0.4], [100,150,240,0.12], [80,130,220,0]],
    shadow: 'rgba(0,10,40,0.35)'
  },
  fallout: {
    frost: [[74,222,128,0.04], [60,200,110,0.08], [50,180,100,0.13], [40,160,90,0.2]],
    rim: 'rgba(74,222,128,0.35)',
    spec: [[150,255,180,0.38], [100,220,140,0.12], [74,200,120,0]],
    shadow: 'rgba(0,20,0,0.3)'
  }
}

export default function AIOrb ({ state = 'idle', size = 36, theme = 'dark' }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const stateRef = useRef({
    t: 0,
    speed: IDLE_PARAMS.speed,
    wobble: IDLE_PARAMS.wobble,
    blur: IDLE_PARAMS.blur,
    deform: IDLE_PARAMS.deform,
    targetState: 'idle'
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const pxSize = size * 2 // retina
    const cx = pxSize / 2
    const cy = pxSize / 2
    const R = pxSize / 2 - 4

    const s = stateRef.current
    const target = s.targetState === 'generating' ? GEN_PARAMS : IDLE_PARAMS
    s.speed = lerp(s.speed, target.speed, LERP_RATE)
    s.wobble = lerp(s.wobble, target.wobble, LERP_RATE)
    s.blur = lerp(s.blur, target.blur, LERP_RATE)
    s.deform = lerp(s.deform, target.deform, LERP_RATE)
    s.t += s.speed

    const blobs = s.targetState === 'generating' ? GEN_BLOBS : IDLE_BLOBS

    // Create offscreen canvas for liquid
    const offscreen = document.createElement('canvas')
    offscreen.width = pxSize
    offscreen.height = pxSize
    const oCtx = offscreen.getContext('2d')

    // Clip to circle inset
    oCtx.save()
    oCtx.beginPath()
    oCtx.arc(cx, cy, R - 8, 0, Math.PI * 2)
    oCtx.clip()

    // Draw blobs
    for (const blob of blobs) {
      const sloshX = Math.sin(s.t * blob.sx + blob.ph) * R * blob.ax +
        fbm(blob.ph, s.t * 0.6, blob.ph + 3) * R * s.wobble * 0.25
      const sloshY = Math.cos(s.t * blob.sy * 1.15 + blob.ph + 1) * R * blob.ay +
        fbm(blob.ph + 7, s.t * 0.5, blob.ph + 9) * R * s.wobble * 0.25

      const bx = cx + sloshX
      const by = cy + sloshY
      const baseR = blob.r * R

      // Build deformed shape
      oCtx.beginPath()
      for (let i = 0; i <= SEGMENTS; i++) {
        const angle = (i / SEGMENTS) * Math.PI * 2
        const ca = Math.cos(angle)
        const sa = Math.sin(angle)

        const n1 = fbm(ca * 2, sa * 2, s.t * 1.2 + blob.ph)
        const n2 = fbm(ca * 3.5 + 10, sa * 3.5 + 10, s.t * 0.7 + blob.ph + 5)
        const wave = Math.sin(angle * 3 + s.t * 2 + blob.ph) * 0.08 +
          Math.sin(angle * 5 - s.t * 3 + blob.ph * 2) * 0.04

        const r = baseR * (1 + s.deform * (n1 * 0.5 + n2 * 0.3) + wave)
        const px = bx + ca * r
        const py = by + sa * r

        if (i === 0) oCtx.moveTo(px, py)
        else oCtx.lineTo(px, py)
      }
      oCtx.closePath()

      // Radial gradient fill
      const grad = oCtx.createRadialGradient(bx, by, 0, bx, by, baseR * 1.2)
      const [cr, cg, cb] = blob.color
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${blob.a})`)
      grad.addColorStop(0.6, `rgba(${cr},${cg},${cb},${blob.a * 0.5})`)
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
      oCtx.fillStyle = grad
      oCtx.fill()
    }
    oCtx.restore()

    // Blur + composite pass
    const blurCanvas = document.createElement('canvas')
    blurCanvas.width = pxSize
    blurCanvas.height = pxSize
    const bCtx = blurCanvas.getContext('2d')

    bCtx.save()
    bCtx.beginPath()
    bCtx.arc(cx, cy, R - 8, 0, Math.PI * 2)
    bCtx.clip()

    // Scale blur for retina
    const scaledBlur = s.blur * (pxSize / (size * 2))
    bCtx.filter = `blur(${scaledBlur}px)`
    bCtx.drawImage(offscreen, 0, 0)
    bCtx.filter = 'none'

    // Overlay composite — extra color spots for blending
    bCtx.globalCompositeOperation = 'overlay'
    for (let i = 0; i < 3; i++) {
      const blob = blobs[i % blobs.length]
      const ox = cx + Math.sin(s.t * 0.3 + i * 2.1) * R * 0.2
      const oy = cy + Math.cos(s.t * 0.25 + i * 1.7) * R * 0.2
      const oGrad = bCtx.createRadialGradient(ox, oy, 0, ox, oy, R * 0.6)
      const [cr, cg, cb] = blob.color
      oGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`)
      oGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
      bCtx.fillStyle = oGrad
      bCtx.beginPath()
      bCtx.arc(ox, oy, R * 0.6, 0, Math.PI * 2)
      bCtx.fill()
    }
    bCtx.globalCompositeOperation = 'source-over'
    bCtx.restore()

    // Theme glass colors
    const g = GLASS[theme] || GLASS.dark
    const rgba = (c) => `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`

    // Final composite on main canvas
    ctx.clearRect(0, 0, pxSize, pxSize)

    // Drop shadow
    ctx.save()
    ctx.shadowColor = g.shadow
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 10
    ctx.beginPath()
    ctx.arc(cx, cy, R - 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.01)'
    ctx.fill()
    ctx.restore()

    // Draw blurred liquid clipped to sphere
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R - 4, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(blurCanvas, 0, 0)

    // Frost overlay
    const frostGrad = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R - 4)
    frostGrad.addColorStop(0, rgba(g.frost[0]))
    frostGrad.addColorStop(0.5, rgba(g.frost[1]))
    frostGrad.addColorStop(0.8, rgba(g.frost[2]))
    frostGrad.addColorStop(1, rgba(g.frost[3]))
    ctx.fillStyle = frostGrad
    ctx.beginPath()
    ctx.arc(cx, cy, R - 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Rim stroke
    ctx.beginPath()
    ctx.arc(cx, cy, R - 4, 0, Math.PI * 2)
    ctx.strokeStyle = g.rim
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Specular highlight
    const specGrad = ctx.createRadialGradient(
      cx - R * 0.28, cy - R * 0.3, 0,
      cx - R * 0.28, cy - R * 0.3, R * 0.5
    )
    specGrad.addColorStop(0, rgba(g.spec[0]))
    specGrad.addColorStop(0.4, rgba(g.spec[1]))
    specGrad.addColorStop(1, rgba(g.spec[2]))
    ctx.fillStyle = specGrad
    ctx.beginPath()
    ctx.ellipse(cx - R * 0.28, cy - R * 0.3, R * 0.35, R * 0.25, -0.5, 0, Math.PI * 2)
    ctx.fill()

    animRef.current = requestAnimationFrame(draw)
  }, [size, theme])

  useEffect(() => {
    stateRef.current.targetState = state === 'generating' || state === 'active' ? 'generating' : 'idle'
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = size * 2
    canvas.height = size * 2
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [draw, size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, borderRadius: '50%' }}
    />
  )
}
