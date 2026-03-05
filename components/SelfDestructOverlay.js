import React, { useEffect, useState, useRef } from 'react'
import { Timer } from 'lucide-react'

export default function SelfDestructOverlay ({ theme, onComplete }) {
  const [phase, setPhase] = useState('enter') // 'enter' | 'icon' | 'text'
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const iconTimer = setTimeout(() => setPhase('icon'), 200)
    const textTimer = setTimeout(() => setPhase('text'), 800)
    const completeTimer = setTimeout(() => {
      if (onCompleteRef.current) onCompleteRef.current()
    }, 3500)

    return () => {
      clearTimeout(iconTimer)
      clearTimeout(textTimer)
      clearTimeout(completeTimer)
    }
  }, [])

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const bgClass = isFallout
    ? 'bg-black/80'
    : isDark
      ? 'bg-black/70'
      : isDarkBlue
        ? 'bg-[#080c14]/80'
        : 'bg-white/80'

  const textClass = isFallout
    ? 'text-green-400 font-mono'
    : isDark
      ? 'text-[#ececec]'
      : isDarkBlue
        ? 'text-[#e0e6f0]'
        : 'text-neutral-700'

  const iconClass = isFallout
    ? 'text-green-500'
    : isDark
      ? 'text-red-400'
      : isDarkBlue
        ? 'text-red-400'
        : 'text-red-500'

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${bgClass}`}
      style={{
        animation: 'dash-sd-overlay-fade-anim 500ms ease forwards',
        backdropFilter: 'blur(8px)'
      }}
    >
      <div
        className={iconClass}
        style={{
          animation: phase !== 'enter' ? 'dash-sd-overlay-icon-anim 600ms ease forwards' : 'none',
          opacity: 1
        }}
      >
        <Timer className="h-12 w-12" />
      </div>
      <p
        className={`mt-6 text-lg font-medium ${textClass}`}
        style={{
          animation: phase === 'text' ? 'dash-sd-overlay-text-anim 400ms ease forwards' : 'none',
          opacity: phase === 'text' ? undefined : 0
        }}
      >
        {isFallout ? 'DOCUMENT PURGED' : 'This page has self-destructed'}
      </p>
    </div>
  )
}
