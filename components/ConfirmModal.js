import React, { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { AlertTriangle, X } from 'lucide-react'

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'danger-outline' | 'warning' | 'info'
  showCancel = true, // Set to false for info-only modals that just need "OK"
  // Optional 3rd button rendered between Cancel and Confirm. Used by the
  // delete flow to offer "Delete Forever" alongside "Move to Trash" /
  // "Cancel". Stacked vertically on small screens for tap-target safety.
  // Shape: { text, onClick, variant: 'danger' | 'warning' | 'info' }
  secondaryAction = null
}) {
  const { theme } = useTheme()
  const confirmButtonRef = useRef(null)

  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      // Focus confirm button when modal opens for accessibility
      setTimeout(() => confirmButtonRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    // Handle escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: isFallout ? 'text-red-400' : isDarkBlue ? 'text-red-400' : isDark ? 'text-red-400' : 'text-red-500',
          iconBg: isFallout ? 'bg-red-500/20' : isDarkBlue ? 'bg-red-500/20' : isDark ? 'bg-red-500/20' : 'bg-red-100',
          confirmBtn: isFallout
            ? 'bg-red-600 text-white hover:bg-red-500'
            : isDarkBlue
              ? 'bg-red-600 text-white hover:bg-red-500'
              : isDark
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-red-600 text-white hover:bg-red-700'
        }
      case 'danger-outline':
        // Red border + subtle red bg + red text — for intermediate
        // destructive actions (e.g. soft-delete to Trash where the
        // primary danger button is "Delete forever").
        return {
          icon: isFallout ? 'text-red-400' : isDarkBlue ? 'text-red-400' : isDark ? 'text-red-400' : 'text-red-500',
          iconBg: isFallout ? 'bg-red-500/15' : isDarkBlue ? 'bg-red-500/15' : isDark ? 'bg-red-500/15' : 'bg-red-100',
          confirmBtn: isFallout
            ? 'bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 font-mono'
            : isDarkBlue
              ? 'bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20'
              : isDark
                ? 'bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20'
                : 'bg-red-50 border border-red-300 text-red-700 hover:bg-red-100'
        }
      case 'warning':
        return {
          icon: isFallout ? 'text-amber-400' : isDarkBlue ? 'text-amber-400' : isDark ? 'text-amber-400' : 'text-amber-500',
          iconBg: isFallout ? 'bg-amber-500/20' : isDarkBlue ? 'bg-amber-500/20' : isDark ? 'bg-amber-500/20' : 'bg-amber-100',
          confirmBtn: isFallout
            ? 'bg-amber-600 text-white hover:bg-amber-500'
            : isDarkBlue
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : isDark
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : 'bg-amber-600 text-white hover:bg-amber-700'
        }
      default:
        return {
          icon: isFallout ? 'text-blue-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-500',
          iconBg: isFallout ? 'bg-blue-500/20' : isDarkBlue ? 'bg-blue-500/20' : isDark ? 'bg-blue-500/20' : 'bg-blue-100',
          confirmBtn: isFallout
            ? 'bg-green-500 text-gray-900 hover:bg-green-400'
            : isDarkBlue
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : isDark
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
        }
    }
  }

  const styles = getVariantStyles()

  // Compute styles for the secondary button independently — it can have
  // a different variant from the confirm button (e.g. confirm = warning,
  // secondary = danger for the delete flow).
  const secondaryStyles = secondaryAction
    ? (() => {
        const saved = variant
        // Reuse the existing helper by temporarily swapping variant via
        // closure; it only reads from the closed-over `variant` param,
        // so capture by inlining a small clone here.
        const v = secondaryAction.variant || 'danger'
        const isFalloutS = isFallout, isDarkS = isDark, isDarkBlueS = isDarkBlue
        if (v === 'danger') return {
          confirmBtn: isFalloutS
            ? 'bg-red-600 text-white hover:bg-red-500'
            : isDarkBlueS
              ? 'bg-red-600 text-white hover:bg-red-500'
              : isDarkS
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-red-600 text-white hover:bg-red-700'
        }
        if (v === 'danger-outline') return {
          confirmBtn: isFalloutS
            ? 'bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 font-mono'
            : isDarkBlueS
              ? 'bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20'
              : isDarkS
                ? 'bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20'
                : 'bg-red-50 border border-red-300 text-red-700 hover:bg-red-100'
        }
        if (v === 'warning') return {
          confirmBtn: isFalloutS
            ? 'bg-amber-600 text-white hover:bg-amber-500'
            : isDarkBlueS
              ? 'bg-amber-600 text-white hover:bg-amber-500'
              : isDarkS
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : 'bg-amber-600 text-white hover:bg-amber-700'
        }
        return {
          confirmBtn: isFalloutS
            ? 'bg-green-500 text-gray-900 hover:bg-green-400'
            : isDarkBlueS
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : isDarkS
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
        }
      })()
    : null

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleSecondary = () => {
    secondaryAction?.onClick?.()
    onClose()
  }

  return (
    <div
      className="dash-mobile-bottom-sheet fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-description"
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      {/* Modal */}
      <div
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
        <div className={`
          px-6 pt-6 pb-4
          ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'}
        `}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${styles.iconBg}`}>
                <AlertTriangle className={`w-5 h-5 ${styles.icon}`} />
              </div>
              <h2
                id="confirm-modal-title"
                className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}
              >
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
                      ? 'text-[#8e8e8e] hover:bg-[#3a3a3a]'
                      : 'text-gray-400 hover:bg-gray-100'
                }
              `}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p
            id="confirm-modal-description"
            className={`
              text-sm mb-6
              ${isFallout ? 'text-green-300 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-600'}
            `}
          >
            {message}
          </p>

          {/* Actions — when `secondaryAction` is set, stack vertically
              (delete-confirmation pattern: 3 buttons + bigger tap targets).
              Otherwise keep the existing two-button row. */}
          <div className={`flex ${secondaryAction ? 'flex-col' : 'flex-row'} gap-3`}>
            {/* Primary confirm button shown FIRST in stacked layout so
                the safe action sits at the top (closest to the user's
                thumb on mobile). In side-by-side layout it stays last
                to preserve existing visual order. */}
            {secondaryAction && (
              <button
                ref={confirmButtonRef}
                onClick={handleConfirm}
                className={`
                  w-full px-4 py-3 rounded-xl font-medium transition-all duration-200
                  ${styles.confirmBtn}
                  ${isFallout ? 'font-mono' : ''}
                `}
              >
                {confirmText}
              </button>
            )}
            {secondaryAction && (
              <button
                onClick={handleSecondary}
                className={`
                  w-full px-4 py-3 rounded-xl font-medium transition-all duration-200
                  ${secondaryStyles.confirmBtn}
                  ${isFallout ? 'font-mono' : ''}
                `}
              >
                {secondaryAction.text}
              </button>
            )}
            {showCancel && (
              <button
                onClick={() => {
                  if (onCancel) {
                    onCancel()
                    onClose()
                  } else {
                    onClose()
                  }
                }}
                className={`
                  ${secondaryAction ? 'w-full' : 'flex-1'} px-4 py-3 rounded-xl font-medium transition-all duration-200
                  ${isFallout
                    ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
                    : isDarkBlue
                      ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
                      : isDark
                        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {cancelText}
              </button>
            )}
            {!secondaryAction && (
              <button
                ref={confirmButtonRef}
                onClick={handleConfirm}
                className={`
                  flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                  ${styles.confirmBtn}
                  ${isFallout ? 'font-mono' : ''}
                `}
              >
                {confirmText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
