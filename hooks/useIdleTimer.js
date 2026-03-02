import { useEffect, useRef, useCallback } from 'react'

export function useIdleTimer({ timeoutMinutes, isEnabled, onIdle }) {
  const timerRef = useRef(null)
  const lastResetRef = useRef(0)
  const timeoutMs = timeoutMinutes * 60 * 1000
  const THROTTLE_MS = 10000 // Throttle activity resets to once per 10 seconds

  const resetTimer = useCallback(() => {
    if (!isEnabled || timeoutMinutes === 0) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      onIdle?.()
    }, timeoutMs)
  }, [isEnabled, timeoutMinutes, timeoutMs, onIdle])

  useEffect(() => {
    if (!isEnabled || timeoutMinutes === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart']

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastResetRef.current < THROTTLE_MS) return
      lastResetRef.current = now
      resetTimer()
    }

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    // Start the initial timer
    resetTimer()

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isEnabled, timeoutMinutes, resetTimer])
}
