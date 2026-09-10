import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpLeft, Lock } from 'lucide-react'

// Phase 2 of backlinks: the same references as the foot-of-note section,
// reachable from anywhere via a status-bar chip. Presentation only — the
// scan lives in lib/backlinks.js and the result is computed once by
// RichTextEditor and shared with BacklinksSection.
//
// Opens UPWARD from the status bar, so it is positioned by `bottom` rather
// than `top` the way SettingsPopover is.
//
// Theme classes are written out here rather than pulled from
// utils/themeUtils.js on purpose: `utils/` is not in the Tailwind content
// globs, so arbitrary values used only there are never generated.

const POPOVER_WIDTH = 340
const GAP = 8

export default function BacklinksPopover ({ isOpen, onClose, anchorRef, backlinks, theme, onNavigate }) {
  const popoverRef = useRef(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const left = Math.max(GAP, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - GAP))
    setPos({ bottom: Math.max(GAP, window.innerHeight - rect.top + 6), left })
  }, [isOpen, anchorRef])

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target) &&
          anchorRef?.current && !anchorRef.current.contains(event.target)) {
        onClose()
      }
    }
    const handleKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose, anchorRef])

  if (!isOpen || !backlinks || backlinks.length === 0) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const surfaceClass = isFallout
    ? 'bg-gray-900 border-green-600/40 shadow-xl shadow-black/50'
    : isDarkBlue
      ? 'bg-[#1a2035] border-[#1c2438] shadow-xl shadow-black/50'
      : isDark
        ? 'bg-[#2f2f2f] border-[#3a3a3a] shadow-xl shadow-black/50'
        : 'bg-white border-neutral-200 shadow-lg shadow-neutral-200/50'

  const labelClass = isFallout
    ? 'text-green-600'
    : isDarkBlue
      ? 'text-[#8d9bb2]'
      : isDark
        ? 'text-[#8e8e8e]'
        : 'text-neutral-400'

  const accentClass = isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#7dafe8]' : isDark ? 'text-[#c0c0c0]' : 'text-neutral-500'

  const badgeClass = isFallout
    ? 'text-green-400 bg-green-500/15'
    : isDarkBlue
      ? 'text-[#7dafe8] bg-[#3b82f6]/[0.16]'
      : isDark
        ? 'text-[#d8d8d8] bg-white/10'
        : 'text-blue-700 bg-blue-500/10'

  const rowHover = isFallout
    ? 'hover:bg-gray-800'
    : isDarkBlue
      ? 'hover:bg-[#232b45]'
      : isDark
        ? 'hover:bg-[#3a3a3a]'
        : 'hover:bg-neutral-100'

  const titleClass = isFallout ? 'text-green-300' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-neutral-900'
  const snippetClass = isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#9aa8bf]' : isDark ? 'text-[#9a9a9a]' : 'text-neutral-500'
  const markClass = isFallout ? 'text-green-300' : isDarkBlue ? 'text-[#7dafe8]' : isDark ? 'text-[#d8d8d8]' : 'text-blue-700'

  return (
    <div
      ref={popoverRef}
      role='dialog'
      aria-label='Linked references'
      className={`fixed z-[70] rounded-xl border p-2 ${surfaceClass}`}
      style={{ bottom: pos.bottom, left: pos.left, width: POPOVER_WIDTH, maxHeight: '60vh', overflowY: 'auto' }}
    >
      <div className='flex items-center gap-2 px-2 pt-1 pb-2'>
        <ArrowUpLeft className={`h-3.5 w-3.5 flex-shrink-0 ${accentClass}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelClass}`}>Linked references</span>
        <span className={`ml-auto text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${badgeClass}`}>{backlinks.length}</span>
      </div>

      <div className='flex flex-col gap-0.5'>
        {backlinks.map(ref => (
          <button
            type='button'
            key={ref.pageId}
            onClick={() => { onClose(); onNavigate?.(ref.pageId) }}
            className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${rowHover}`}
          >
            <span className='flex items-center gap-1.5'>
              {ref.isLocked && <Lock className={`h-3 w-3 flex-shrink-0 ${labelClass}`} />}
              <span className={`text-[13px] font-semibold truncate ${titleClass}`}>{ref.title}</span>
              {ref.count > 1 && (
                <span className={`ml-auto flex-shrink-0 text-[11px] font-medium ${labelClass}`}>{ref.count}</span>
              )}
            </span>
            {ref.isLocked ? (
              <span className={`block mt-1 text-[12.5px] leading-snug ${labelClass}`}>Locked</span>
            ) : (
              ref.snippets.slice(0, 1).map((snippet, index) => (
                <span key={index} className={`block mt-1 text-[12.5px] leading-snug ${snippetClass}`}>
                  {snippet.before}
                  <span className={markClass}>{snippet.linkText}</span>
                  {snippet.after}
                </span>
              ))
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
