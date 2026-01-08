import React, { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { Lock, Unlock, X, ShieldCheck, AlertCircle } from 'lucide-react'
import PasswordStrengthMeter from './PasswordStrengthMeter'

const PasswordModal = ({ isOpen, onClose, onConfirm, action, error, onPasswordChange, password }) => {
  const { theme } = useTheme()
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && password.trim()) {
      if (action === 'lock') {
        onConfirm('lock', password)
      } else {
        onConfirm('open', password)
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isLocking = action === 'lock'

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className={`
          relative w-full max-w-md transform transition-all duration-200
          ${isFallout 
            ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]' 
            : isDark 
              ? 'bg-gray-900 border border-gray-700/50 shadow-2xl' 
              : 'bg-white border border-gray-200 shadow-2xl'
          }
          rounded-2xl overflow-hidden
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`
          px-6 pt-6 pb-4
          ${isFallout ? 'border-b border-green-500/30' : isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'}
        `}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`
                p-2.5 rounded-xl
                ${isFallout 
                  ? 'bg-green-500/20 text-green-400' 
                  : isLocking
                    ? isDark 
                      ? 'bg-amber-500/20 text-amber-400' 
                      : 'bg-amber-100 text-amber-600'
                    : isDark
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-blue-100 text-blue-600'
                }
              `}>
                {isLocking ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  {isLocking ? 'Lock Page' : 'Unlock Page'}
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDark ? 'text-gray-400' : 'text-gray-500'}
                `}>
                  {isLocking ? 'Protect this page with a password' : 'Enter password to access'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`
                p-2 rounded-lg transition-colors
                ${isFallout 
                  ? 'text-green-500 hover:bg-green-500/20' 
                  : isDark 
                    ? 'text-gray-400 hover:bg-gray-800' 
                    : 'text-gray-400 hover:bg-gray-100'
                }
              `}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Security info for locking */}
          {isLocking && (
            <div className={`
              mb-5 p-4 rounded-xl flex items-start gap-3
              ${isFallout 
                ? 'bg-green-500/10 border border-green-500/30' 
                : isDark 
                  ? 'bg-blue-500/10 border border-blue-500/30' 
                  : 'bg-blue-50 border border-blue-200'
              }
            `}>
              <ShieldCheck className={`
                w-5 h-5 flex-shrink-0 mt-0.5
                ${isFallout ? 'text-green-400' : isDark ? 'text-blue-400' : 'text-blue-500'}
              `} />
              <p className={`
                text-sm
                ${isFallout ? 'text-green-300 font-mono' : isDark ? 'text-blue-300' : 'text-blue-700'}
              `}>
                Your page will be encrypted with AES-256. Remember your password - it cannot be recovered!
              </p>
            </div>
          )}

          {/* Password input */}
          <div className="mb-4">
            <label className={`
              block text-sm font-medium mb-2
              ${isFallout ? 'text-green-400 font-mono' : isDark ? 'text-gray-300' : 'text-gray-700'}
            `}>
              Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLocking ? 'Create a strong password...' : 'Enter password...'}
              className={`
                w-full px-4 py-3 text-base rounded-xl transition-all duration-200
                focus:outline-none focus:ring-2
                ${isFallout 
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-600 font-mono focus:ring-green-500/50 focus:border-green-400' 
                  : isDark 
                    ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:ring-blue-500/50 focus:border-blue-500' 
                    : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500'
                }
              `}
            />
          </div>

          {/* Strength meter for locking */}
          {isLocking && (
            <div className="mb-4">
              <PasswordStrengthMeter password={password} />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className={`
              mb-4 p-3 rounded-xl flex items-center gap-2
              ${isFallout 
                ? 'bg-red-500/10 border border-red-500/30' 
                : isDark 
                  ? 'bg-red-500/10 border border-red-500/30' 
                  : 'bg-red-50 border border-red-200'
              }
            `}>
              <AlertCircle className={`
                w-4 h-4 flex-shrink-0
                ${isFallout ? 'text-red-400' : isDark ? 'text-red-400' : 'text-red-500'}
              `} />
              <p className={`
                text-sm
                ${isFallout ? 'text-red-400 font-mono' : isDark ? 'text-red-400' : 'text-red-600'}
              `}>
                {error}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`
                flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                ${isFallout 
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono' 
                  : isDark 
                    ? 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              Cancel
            </button>
            {isLocking ? (
              <button
                onClick={() => onConfirm('lock', password)}
                disabled={!password.trim()}
                className={`
                  flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${isFallout 
                    ? 'bg-green-500 text-gray-900 hover:bg-green-400 disabled:hover:bg-green-500 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]' 
                    : isDark 
                      ? 'bg-amber-600 text-white hover:bg-amber-500 disabled:hover:bg-amber-600' 
                      : 'bg-amber-600 text-white hover:bg-amber-700 disabled:hover:bg-amber-600'
                  }
                `}
              >
                Lock Page
              </button>
            ) : (
              <>
                <button
                  onClick={() => onConfirm('open', password)}
                  disabled={!password.trim()}
                  className={`
                    flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${isFallout 
                      ? 'bg-green-500 text-gray-900 hover:bg-green-400 disabled:hover:bg-green-500 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]' 
                      : isDark 
                        ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:hover:bg-blue-600' 
                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600'
                    }
                  `}
                >
                  Unlock
                </button>
                <button
                  onClick={() => onConfirm('removeLock', password)}
                  disabled={!password.trim()}
                  className={`
                    px-4 py-3 rounded-xl font-medium transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${isFallout 
                      ? 'bg-red-600 text-white hover:bg-red-500 disabled:hover:bg-red-600 font-mono' 
                      : isDark 
                        ? 'bg-red-600 text-white hover:bg-red-500 disabled:hover:bg-red-600' 
                        : 'bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600'
                    }
                  `}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PasswordModal
