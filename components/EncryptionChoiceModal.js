import React, { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { ShieldCheck, LockKeyhole, X } from 'lucide-react'

export default function EncryptionChoiceModal ({ isOpen, onClose, onLockPage, onSetupAppLock }) {
  const { theme } = useTheme()

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        className={`
          relative w-full max-w-md transform transition-all duration-200
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
              <div className={`p-2.5 rounded-xl ${isFallout ? 'bg-green-500/20' : isDarkBlue ? 'bg-blue-500/20' : isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                <ShieldCheck className={`w-5 h-5 ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}`}>
                  Encrypt Your Notes
                </h2>
                <p className={`text-xs mt-0.5 ${isFallout ? 'text-green-500/60 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}`}>
                  Choose how to protect your data
                </p>
              </div>
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

        {/* Options */}
        <div className="p-6 space-y-3">
          {/* Option 1: Lock This Page */}
          <button
            onClick={() => { onLockPage(); onClose() }}
            className={`
              w-full text-left p-4 rounded-xl border-2 transition-all duration-200 group
              ${isFallout
                ? 'border-green-500/30 hover:border-green-400/60 hover:bg-green-500/10'
                : isDarkBlue
                  ? 'border-[#1c2438] hover:border-blue-500/40 hover:bg-blue-500/5'
                  : isDark
                    ? 'border-[#3a3a3a] hover:border-blue-500/40 hover:bg-blue-500/5'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
              }
            `}
          >
            <div className="flex items-start gap-3.5">
              <div className={`
                p-2 rounded-lg mt-0.5 transition-colors
                ${isFallout
                  ? 'bg-green-500/15 group-hover:bg-green-500/25'
                  : isDarkBlue
                    ? 'bg-[#232b42] group-hover:bg-blue-500/15'
                    : isDark
                      ? 'bg-[#2f2f2f] group-hover:bg-blue-500/15'
                      : 'bg-gray-100 group-hover:bg-blue-100'
                }
              `}>
                <LockKeyhole className={`w-4.5 h-4.5 ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#8b99b5] group-hover:text-blue-400' : isDark ? 'text-[#8e8e8e] group-hover:text-blue-400' : 'text-gray-500 group-hover:text-blue-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}`}>
                  Lock This Page
                </div>
                <p className={`text-xs mt-1 leading-relaxed ${isFallout ? 'text-green-500/60 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}`}>
                  Set a unique password for this page only. Other pages stay unencrypted.
                </p>
              </div>
            </div>
          </button>

          {/* Option 2: Set Up App Lock */}
          <button
            onClick={() => { onSetupAppLock(); onClose() }}
            className={`
              w-full text-left p-4 rounded-xl border-2 transition-all duration-200 group
              ${isFallout
                ? 'border-green-500/30 hover:border-green-400/60 hover:bg-green-500/10'
                : isDarkBlue
                  ? 'border-[#1c2438] hover:border-blue-500/40 hover:bg-blue-500/5'
                  : isDark
                    ? 'border-[#3a3a3a] hover:border-blue-500/40 hover:bg-blue-500/5'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
              }
            `}
          >
            <div className="flex items-start gap-3.5">
              <div className={`
                p-2 rounded-lg mt-0.5 transition-colors
                ${isFallout
                  ? 'bg-green-500/15 group-hover:bg-green-500/25'
                  : isDarkBlue
                    ? 'bg-[#232b42] group-hover:bg-blue-500/15'
                    : isDark
                      ? 'bg-[#2f2f2f] group-hover:bg-blue-500/15'
                      : 'bg-gray-100 group-hover:bg-blue-100'
                }
              `}>
                <ShieldCheck className={`w-4.5 h-4.5 ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#8b99b5] group-hover:text-blue-400' : isDark ? 'text-[#8e8e8e] group-hover:text-blue-400' : 'text-gray-500 group-hover:text-blue-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}`}>
                    Set Up App Lock
                  </span>
                  <span className={`
                    text-[10px] font-medium px-1.5 py-0.5 rounded-full
                    ${isFallout
                      ? 'bg-green-500/20 text-green-400 font-mono'
                      : isDarkBlue
                        ? 'bg-blue-500/15 text-blue-400'
                        : isDark
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'bg-blue-100 text-blue-600'
                    }
                  `}>
                    Recommended
                  </span>
                </div>
                <p className={`text-xs mt-1 leading-relaxed ${isFallout ? 'text-green-500/60 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}`}>
                  One password encrypts all your pages at once. Supports Touch ID for quick access.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
