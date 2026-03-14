import React, { useEffect, useState, useRef } from 'react'
import { Timer } from 'lucide-react'

export default function SelfDestructOverlay ({ theme, onComplete }) {
  // Phases: 'enter' (0-400ms) → 'pulse' (400-1400ms) → 'burst' (1400-2200ms) → 'message' (2200-3400ms) → 'fade' (3400-4200ms)
  const [phase, setPhase] = useState('enter')
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('pulse'), 400),
      setTimeout(() => setPhase('burst'), 1400),
      setTimeout(() => setPhase('message'), 2200),
      setTimeout(() => setPhase('fade'), 3400),
      setTimeout(() => {
        if (onCompleteRef.current) onCompleteRef.current()
      }, 4200),
    ]

    return () => timers.forEach(clearTimeout)
  }, [])

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const accentColor = isFallout ? '#22c55e' : '#ef4444'
  const textClass = isFallout
    ? 'text-green-400 font-mono'
    : isDark
      ? 'text-[#ececec]'
      : isDarkBlue
        ? 'text-[#e0e6f0]'
        : 'text-neutral-700'

  const iconColor = isFallout ? 'text-green-500' : isDark || isDarkBlue ? 'text-red-400' : 'text-red-500'
  const subtextClass = isFallout ? 'text-green-600' : isDark ? 'text-[#666]' : isDarkBlue ? 'text-[#5d6b88]' : 'text-neutral-400'

  const showBurst = phase === 'burst' || phase === 'message' || phase === 'fade'
  const showMessage = phase === 'message' || phase === 'fade'
  const isFading = phase === 'fade'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        backgroundColor: isFallout ? 'rgba(0,0,0,0.9)' : isDark ? 'rgba(0,0,0,0.85)' : isDarkBlue ? 'rgba(8,12,20,0.9)' : 'rgba(255,255,255,0.92)',
        animation: 'dash-sd2-backdrop 500ms ease-out forwards',
        backdropFilter: 'blur(12px)',
        opacity: isFading ? 0 : undefined,
        transition: isFading ? 'opacity 800ms ease' : undefined,
      }}
    >
      {/* Ring burst effect */}
      {showBurst && (
        <>
          <div className="absolute" style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: `2px solid ${accentColor}`,
            animation: 'dash-sd2-ring-burst 800ms ease-out forwards',
          }} />
          <div className="absolute" style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: `1px solid ${accentColor}50`,
            animation: 'dash-sd2-ring-burst 800ms ease-out 120ms forwards',
            opacity: 0,
          }} />
        </>
      )}

      {/* Icon */}
      <div
        className={iconColor}
        style={{
          animation: phase === 'enter'
            ? 'dash-sd2-icon-enter 400ms ease-out forwards'
            : phase === 'pulse'
              ? 'dash-sd2-icon-breathe 500ms ease-in-out infinite alternate'
              : showBurst
                ? 'dash-sd2-icon-burst 400ms ease-out forwards'
                : 'none',
        }}
      >
        <Timer className="h-12 w-12" strokeWidth={1.5} />
      </div>

      {/* Message */}
      <div className="mt-8 text-center" style={{
        opacity: showMessage ? 1 : 0,
        transform: showMessage ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 400ms ease, transform 400ms ease',
      }}>
        <p className={`text-lg font-medium tracking-wide ${textClass}`}>
          {isFallout ? 'DOCUMENT PURGED' : 'This page has self-destructed'}
        </p>
        <p className={`mt-2 text-xs ${subtextClass}`}>
          {isFallout ? 'DATA IRRECOVERABLE' : 'This page has been permanently deleted'}
        </p>
      </div>
    </div>
  )
}
