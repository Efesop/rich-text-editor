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
  variant = 'danger', // 'danger' | 'warning' | 'info'
  showCancel = true // Set to false for info-only modals that just need "OK"
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

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-description"
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal */}
      <div
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

          {/* Actions */}
          <div className="flex gap-3">
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
                  flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
