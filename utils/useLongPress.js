import { useRef, useCallback } from 'react'
import { hapticLight } from './nativeBridge'

/**
 * Long-press hook for touch + mouse. Calls `onLongPress` after the user
 * holds for `delay` ms without significant movement. Calls `onClick` on a
 * normal short tap (if provided).
 *
 * Cancels on touchmove > moveTolerance px to avoid firing during scroll.
 *
 * Usage:
 *   const lp = useLongPress({ onLongPress: () => openMenu(), delay: 450 })
 *   <div {...lp}>...</div>
 */
export function useLongPress ({
  onLongPress,
  onClick,
  delay = 450,
  moveTolerance = 8
} = {}) {
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const firedRef = useRef(false)
  // Track whether the finger moved past the click-tolerance threshold during
  // the press. Without this, scrolling a list would still fire `onClick` on
  // touchend (the move handler only cancels the long-press timer, not the
  // click intent) — symptom on the mobile sidebar: every scroll attempt
  // navigated to whichever page item the finger lifted off of, then the
  // sidebar auto-closed on selection.
  const movedRef = useRef(false)

  const start = useCallback((e) => {
    firedRef.current = false
    movedRef.current = false
    const touch = e.touches?.[0]
    startRef.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : { x: e.clientX, y: e.clientY }
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      // Native haptic on Capacitor; web fallback via Vibration API.
      hapticLight()
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(10) } catch { /* ignore */ }
      }
      onLongPress?.(e)
    }, delay)
  }, [onLongPress, delay])

  const move = useCallback((e) => {
    if (!startRef.current) return
    const touch = e.touches?.[0]
    const x = touch ? touch.clientX : e.clientX
    const y = touch ? touch.clientY : e.clientY
    const dx = x - startRef.current.x
    const dy = y - startRef.current.y
    if (Math.hypot(dx, dy) > moveTolerance) {
      movedRef.current = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [moveTolerance])

  const end = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Only fire click if neither long-press nor a scroll-style move happened.
    if (!firedRef.current && !movedRef.current && onClick) {
      onClick(e)
    }
    firedRef.current = false
    movedRef.current = false
    startRef.current = null
  }, [onClick])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    firedRef.current = false
    movedRef.current = false
    startRef.current = null
  }, [])

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: cancel,
    onContextMenu: (e) => { e.preventDefault() }
  }
}
