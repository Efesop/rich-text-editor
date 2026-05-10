import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from 'next-themes'

export default function Tooltip({ children, text, delay = 400, side = 'top' }) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState(null)
  const [placement, setPlacement] = useState(side)
  // Horizontal shift applied AFTER measurement so tooltip never extends
  // past the viewport edge. Pre-fix the chip near the right edge of
  // the editor footer (e.g. Backup) had its tooltip clipped — the
  // -50% transform centered on the trigger, but with no clamp it ran
  // straight off-screen. We measure the rendered tooltip in
  // useLayoutEffect and shift left when it would overflow.
  const [shiftX, setShiftX] = useState(0)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const timerRef = useRef(null)
  const { theme } = useTheme()

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const showTooltip = useCallback(() => {
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (side === 'right') {
        setPlacement('right')
        setCoords({
          x: rect.right,
          y: rect.top + rect.height / 2
        })
      } else {
        // If too close to top of viewport, show below instead
        const showBelow = rect.top < 40
        setPlacement(showBelow ? 'bottom' : 'top')
        setCoords({
          x: rect.left + rect.width / 2,
          y: showBelow ? rect.bottom : rect.top
        })
      }
      setShow(true)
    }, delay)
  }, [delay, side])

  const hideTooltip = useCallback(() => {
    clearTimeout(timerRef.current)
    setShow(false)
    setCoords(null)
    setShiftX(0)
  }, [])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  // Measure the rendered tooltip and shift horizontally if it overflows
  // the viewport. Runs synchronously after layout so the user never
  // sees a frame with the tooltip clipped. `right`-side tooltips don't
  // need this — they extend rightward from the trigger anyway.
  useLayoutEffect(() => {
    if (!show || !coords || placement === 'right') {
      if (shiftX !== 0) setShiftX(0)
      return
    }
    const el = tooltipRef.current
    if (!el) return
    const margin = 8
    const tipRect = el.getBoundingClientRect()
    // After translate(-50%, ...), tooltip's natural left edge:
    const naturalLeft = coords.x - tipRect.width / 2
    const naturalRight = coords.x + tipRect.width / 2
    let shift = 0
    if (naturalRight > window.innerWidth - margin) {
      shift = window.innerWidth - margin - naturalRight
    } else if (naturalLeft < margin) {
      shift = margin - naturalLeft
    }
    if (shift !== shiftX) setShiftX(shift)
  }, [show, coords, placement, shiftX, text])

  if (!text) return children

  const bg = isFallout ? 'bg-gray-900 text-green-400 border border-green-500/30'
    : isDark ? 'bg-[#2f2f2f] text-[#e0e0e0] border border-[#3a3a3a]'
    : isDarkBlue ? 'bg-[#1c2438] text-[#c0ccdf] border border-[#2a3452]'
    : 'bg-neutral-800 text-white'

  const arrowUp = isFallout ? 'border-b-gray-900'
    : isDark ? 'border-b-[#2f2f2f]'
    : isDarkBlue ? 'border-b-[#1c2438]'
    : 'border-b-neutral-800'

  const arrowDown = isFallout ? 'border-t-gray-900'
    : isDark ? 'border-t-[#2f2f2f]'
    : isDarkBlue ? 'border-t-[#1c2438]'
    : 'border-t-neutral-800'

  const arrowLeft = isFallout ? 'border-r-gray-900'
    : isDark ? 'border-r-[#2f2f2f]'
    : isDarkBlue ? 'border-r-[#1c2438]'
    : 'border-r-neutral-800'

  const getStyle = () => {
    if (placement === 'right') {
      return {
        left: coords.x,
        top: coords.y,
        transform: 'translate(0, -50%)'
      }
    }
    if (placement === 'bottom') {
      return {
        left: coords.x + shiftX,
        top: coords.y,
        transform: 'translate(-50%, 0)'
      }
    }
    return {
      left: coords.x + shiftX,
      top: coords.y,
      transform: 'translate(-50%, -100%)'
    }
  }

  const isBottom = placement === 'bottom'
  const isRight = placement === 'right'

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onMouseDown={hideTooltip}
        className="inline-flex"
      >
        {children}
      </span>
      {show && coords && typeof window !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={getStyle()}
        >
          <div className={`relative px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg ${isRight ? 'ml-1.5' : isBottom ? 'mt-1.5' : 'mb-1.5'} ${bg}`} style={{ animation: 'dash-tooltip-in 120ms ease-out forwards' }}>
            {text}
            {/* Arrow stays anchored to the TRIGGER, not the (possibly
                shifted) tooltip body. When the tooltip is clamped to the
                viewport edge, shiftX is non-zero — subtract it from the
                arrow's left so the arrow keeps pointing at the chip
                instead of drifting toward the bubble's center. */}
            {isRight ? (
              <div className={`absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-b-[5px] border-r-[5px] border-t-transparent border-b-transparent ${arrowLeft}`} />
            ) : isBottom ? (
              <div
                className={`absolute bottom-full w-0 h-0 border-l-[5px] border-r-[5px] border-b-[5px] border-l-transparent border-r-transparent ${arrowUp}`}
                style={{ left: `calc(50% - ${shiftX}px)`, transform: 'translateX(-50%)' }}
              />
            ) : (
              <div
                className={`absolute top-full w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent ${arrowDown}`}
                style={{ left: `calc(50% - ${shiftX}px)`, transform: 'translateX(-50%)' }}
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
