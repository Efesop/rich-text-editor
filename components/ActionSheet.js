import React, { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { X } from 'lucide-react'

/**
 * Mobile-friendly bottom sheet for actions.
 * Used instead of dropdowns on touch devices for better UX.
 */
export function ActionSheet({
  isOpen,
  onClose,
  title,
  children
}) {
  const { theme } = useTheme()
  const sheetRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when sheet is open
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

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0
          ${isFallout ? 'bg-black/80' : isDark ? 'bg-black/60' : 'bg-black/40'}
          backdrop-blur-sm
        `}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
          relative w-full max-w-lg mx-4 mb-4 rounded-2xl overflow-hidden
          transform transition-transform duration-200 ease-out
          ${isFallout
            ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.2)]'
            : isDark
              ? 'bg-gray-900 border border-gray-700 shadow-2xl'
              : 'bg-white border border-gray-200 shadow-2xl'
          }
        `}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar for visual affordance */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className={`
              w-10 h-1 rounded-full
              ${isFallout ? 'bg-green-500/40' : isDark ? 'bg-gray-600' : 'bg-gray-300'}
            `}
          />
        </div>

        {/* Header */}
        {title && (
          <div className={`
            px-4 py-3 flex items-center justify-between
            ${isFallout ? 'border-b border-green-500/30' : isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'}
          `}>
            <h2 className={`
              text-base font-semibold
              ${isFallout ? 'text-green-400 font-mono' : isDark ? 'text-white' : 'text-gray-900'}
            `}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className={`
                p-2 -mr-2 rounded-lg transition-colors
                ${isFallout
                  ? 'text-green-500 hover:bg-green-500/20'
                  : isDark
                    ? 'text-gray-400 hover:bg-gray-800'
                    : 'text-gray-400 hover:bg-gray-100'
                }
              `}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content - action items */}
        <div className="py-2">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * Individual action item for ActionSheet
 */
export function ActionSheetItem({
  icon: Icon,
  label,
  onClick,
  variant = 'default', // 'default' | 'danger'
  disabled = false
}) {
  const { theme } = useTheme()
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'

  const getItemClasses = () => {
    if (disabled) {
      return isFallout
        ? 'text-green-800 cursor-not-allowed'
        : isDark
          ? 'text-gray-600 cursor-not-allowed'
          : 'text-gray-300 cursor-not-allowed'
    }

    if (variant === 'danger') {
      return isFallout
        ? 'text-red-400 hover:bg-red-500/20 active:bg-red-500/30'
        : isDark
          ? 'text-red-400 hover:bg-red-500/20 active:bg-red-500/30'
          : 'text-red-600 hover:bg-red-50 active:bg-red-100'
    }

    return isFallout
      ? 'text-green-400 hover:bg-green-500/20 active:bg-green-500/30'
      : isDark
        ? 'text-gray-200 hover:bg-gray-800 active:bg-gray-700'
        : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-4 py-3.5 text-left
        transition-colors duration-150
        ${getItemClasses()}
        ${isFallout ? 'font-mono' : ''}
      `}
    >
      {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
      <span className="text-base">{label}</span>
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

  return (
    <div
      className={`
        my-1 mx-4 h-px
        ${isFallout ? 'bg-green-500/30' : isDark ? 'bg-gray-800' : 'bg-gray-100'}
      `}
    />
  )
}

export default ActionSheet
