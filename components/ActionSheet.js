import React, { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { X } from 'lucide-react'

/**
 * Mobile-friendly centered modal for actions.
 * Styled to match RenameModal/FolderModal for consistency.
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

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
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

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto"
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

      {/* Modal - centered like RenameModal/FolderModal */}
      <div
        ref={modalRef}
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
        className={`
          relative w-full max-w-sm transform transition-all duration-200
          ${isFallout
            ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
            : isDarkBlue
              ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
              : isDark
                ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
                : 'bg-white border border-gray-200 shadow-2xl'
          }
          rounded-2xl overflow-hidden
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {title && (
          <div className={`
            px-6 pt-6 pb-4
            ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#2a2a2a]' : 'border-b border-gray-100'}
          `}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className={`
                    p-2.5 rounded-xl
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
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className={`
                  p-2 rounded-lg transition-colors
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

        {/* Content - action items */}
        <div className="py-2 max-h-[60vh] overflow-y-auto">
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
        w-full flex items-center gap-3 px-6 py-3.5 text-left
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
  const isDarkBlue = theme === 'darkblue'

  return (
    <div
      className={`
        my-1 mx-6 h-px
        ${isFallout ? 'bg-green-500/30' : isDarkBlue ? 'bg-[#1c2438]' : isDark ? 'bg-[#2f2f2f]' : 'bg-gray-100'}
      `}
    />
  )
}

export default ActionSheet
