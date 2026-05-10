import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from 'next-themes'
import { X } from 'lucide-react'
import { isSmallScreen as detectSmallScreen } from '@/utils/deviceUtils'

/**
 * Action sheet — bottom sheet on mobile (full width, drag handle, taller),
 * centered modal on desktop. Matches native iOS look on mobile.
 */
export function ActionSheet({
  isOpen,
  onClose,
  title,
  icon: Icon,
  children
}) {
  const { theme } = useTheme()
  const modalRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const update = () => setIsMobile(detectSmallScreen(768))
    update()
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(max-width: 768px)')
      const handler = () => update()
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const containerThemeClasses = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue
      ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark
        ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white border border-gray-200 shadow-2xl'

  const sheet = (
    <div
      className={`fixed inset-0 z-[10000] flex ${isMobile ? 'items-end justify-center' : 'items-center justify-center p-4 overflow-y-auto'}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />

      {/* Sheet */}
      <div
        ref={modalRef}
        style={{
          animation: isMobile
            ? 'dash-sheet-up 220ms cubic-bezier(0.32, 0.72, 0, 1) forwards'
            : 'dash-modal-in 150ms ease-out forwards',
          paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : undefined
        }}
        className={`
          relative transform
          ${isMobile
            ? 'w-full rounded-t-3xl max-h-[88vh] flex flex-col'
            : 'w-full max-w-sm rounded-2xl overflow-hidden'
          }
          ${containerThemeClasses}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div className="pt-2 pb-1 flex items-center justify-center flex-shrink-0">
            <div
              className={`
                h-1 w-9 rounded-full
                ${isFallout
                  ? 'bg-green-500/40'
                  : isDarkBlue
                    ? 'bg-[#2a3452]'
                    : isDark
                      ? 'bg-[#4a4a4a]'
                      : 'bg-gray-300'
                }
              `}
            />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className={`
            px-5 ${isMobile ? 'pt-3' : 'pt-6'} pb-4 flex-shrink-0
            ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#2a2a2a]' : 'border-b border-gray-100'}
          `}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                  <div className={`
                    p-2.5 rounded-xl flex-shrink-0
                    ${isFallout
                      ? 'bg-green-500/20 text-green-400'
                      : isDarkBlue
                        ? 'bg-blue-500/20 text-blue-400'
                        : isDark
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-100 text-blue-600'
                    }
                  `}>
                    <Icon className="w-5 h-5" />
                  </div>
                )}
                <h2 className={`
                  text-lg font-semibold truncate
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className={`
                  p-2 rounded-lg transition-colors flex-shrink-0
                  ${isFallout
                    ? 'text-green-500 hover:bg-green-500/20'
                    : isDarkBlue
                      ? 'text-[#8b99b5] hover:bg-[#232b42]'
                      : isDark
                        ? 'text-[#8e8e8e] hover:bg-[#2a2a2a]'
                        : 'text-gray-400 hover:bg-gray-100'
                  }
                `}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Content - action items (scrollable) */}
        <div
          className={`
            ${isMobile ? 'flex-1 overflow-y-auto py-2' : 'py-2 max-h-[60vh] overflow-y-auto'}
          `}
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          {children}
        </div>
      </div>
    </div>
  )

  // Portal to body so the sheet escapes any transformed ancestor
  // (e.g. the sidebar nav, which uses translate-x).
  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}

/**
 * Individual action item for ActionSheet
 */
export function ActionSheetItem({
  icon: Icon,
  label,
  onClick,
  variant = 'default', // 'default' | 'danger'
  disabled = false,
  // Optional trailing slot — renders to the right of the label, useful
  // for status dots / chips (e.g. green when sync is active).
  trailing = null
}) {
  const { theme } = useTheme()
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const getItemClasses = () => {
    if (disabled) {
      return isFallout
        ? 'text-green-800 cursor-not-allowed'
        : isDarkBlue
          ? 'text-[#5d6b88] cursor-not-allowed'
          : isDark
            ? 'text-[#6b6b6b] cursor-not-allowed'
            : 'text-gray-300 cursor-not-allowed'
    }

    if (variant === 'danger') {
      return isFallout
        ? 'text-red-400 hover:bg-red-500/20 active:bg-red-500/30'
        : isDarkBlue
          ? 'text-red-400 hover:bg-red-500/20 active:bg-red-500/30'
          : isDark
            ? 'text-red-400 hover:bg-red-500/20 active:bg-red-500/30'
            : 'text-red-600 hover:bg-red-50 active:bg-red-100'
    }

    return isFallout
      ? 'text-green-400 hover:bg-green-500/20 active:bg-green-500/30'
      : isDarkBlue
        ? 'text-[#e0e6f0] hover:bg-[#232b42] active:bg-[#232b42]'
        : isDark
          ? 'text-[#ececec] hover:bg-[#2a2a2a] active:bg-[#3a3a3a]'
          : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-5 py-3.5 text-left
        transition-colors duration-150
        ${getItemClasses()}
        ${isFallout ? 'font-mono' : ''}
      `}
    >
      {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
      <span className="text-base flex-1">{label}</span>
      {trailing && <span className="flex-shrink-0">{trailing}</span>}
    </button>
  )
}

/**
 * Separator for ActionSheet
 */
export function ActionSheetSeparator() {
  const { theme } = useTheme()
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  return (
    <div
      className={`
        my-1 mx-5 h-px
        ${isFallout ? 'bg-green-500/30' : isDarkBlue ? 'bg-[#1c2438]' : isDark ? 'bg-[#2f2f2f]' : 'bg-gray-100'}
      `}
    />
  )
}

export default ActionSheet
