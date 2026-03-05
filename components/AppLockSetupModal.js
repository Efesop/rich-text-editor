import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck, X, Fingerprint, AlertCircle, AlertTriangle } from 'lucide-react'
import PasswordStrengthMeter from './PasswordStrengthMeter'

const TIMEOUT_OPTIONS = [
  { label: '1 Minute', value: 1 },
  { label: '5 Minutes', value: 5 },
  { label: '15 Minutes', value: 15 },
  { label: '30 Minutes', value: 30 },
  { label: 'Never', value: 0 }
]

export default function AppLockSetupModal({ isOpen, onClose, onConfirm, biometricAvailable, theme }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedTimeout, setSelectedTimeout] = useState(5)
  const [isCustomTimeout, setIsCustomTimeout] = useState(false)
  const [customTimeoutValue, setCustomTimeoutValue] = useState(2)
  const [customTimeoutUnit, setCustomTimeoutUnit] = useState('hours')
  const [enableBiometric, setEnableBiometric] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
    if (isOpen) {
      setPassword('')
      setConfirmPassword('')
      setSelectedTimeout(5)
      setIsCustomTimeout(false)
      setCustomTimeoutValue(2)
      setCustomTimeoutUnit('hours')
      setEnableBiometric(false)
      setError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!password.trim()) {
      setError('Password is required')
      return
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    const effectiveTimeout = isCustomTimeout
      ? customTimeoutUnit === 'days'
        ? customTimeoutValue * 24 * 60
        : customTimeoutUnit === 'hours'
          ? customTimeoutValue * 60
          : customTimeoutValue
      : selectedTimeout
    onConfirm(password, effectiveTimeout, enableBiometric)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && password && confirmPassword) {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

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
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  Set Up App Lock
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}
                `}>
                  Protect your notes when idle
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
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Password */}
          <div>
            <label className={`
              block text-sm font-medium mb-1.5
              ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
            `}>
              Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Create a password..."
              className={`
                w-full px-4 py-2.5 text-sm rounded-xl transition-all duration-200
                focus:outline-none focus:ring-2
                ${isFallout
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-700 font-mono focus:ring-green-500/50'
                  : isDarkBlue
                    ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50'
                    : isDark
                      ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50'
                      : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30'
                }
              `}
            />
            {password && (
              <div className="mt-2">
                <PasswordStrengthMeter password={password} />
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className={`
              block text-sm font-medium mb-1.5
              ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
            `}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Confirm password..."
              className={`
                w-full px-4 py-2.5 text-sm rounded-xl transition-all duration-200
                focus:outline-none focus:ring-2
                ${isFallout
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-700 font-mono focus:ring-green-500/50'
                  : isDarkBlue
                    ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50'
                    : isDark
                      ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50'
                      : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30'
                }
              `}
            />
          </div>

          {/* Password warning */}
          <div className={`
            flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs leading-relaxed
            ${isFallout
              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-mono'
              : isDarkBlue
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : isDark
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
            }
          `}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Your notes will be encrypted with this password. There is no way to recover it. If you forget it and don&apos;t have biometric unlock enabled, you will permanently lose access to your notes.</span>
          </div>

          {/* Timeout selection */}
          <div>
            <label className={`
              block text-sm font-medium mb-2
              ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
            `}>
              Lock after inactivity
            </label>
            <div className="space-y-1.5">
              {TIMEOUT_OPTIONS.map((opt) => {
                const isSelected = !isCustomTimeout && selectedTimeout === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => { setSelectedTimeout(opt.value); setIsCustomTimeout(false) }}
                    className={`
                      w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all
                      ${isSelected
                        ? isFallout
                          ? 'bg-green-500/20 border-2 border-green-500/60 text-green-300'
                          : isDarkBlue
                            ? 'bg-blue-500/20 border-2 border-blue-500/60 text-[#e0e6f0]'
                            : isDark
                              ? 'bg-blue-500/20 border-2 border-blue-500/60 text-white'
                              : 'bg-blue-50 border-2 border-blue-500 text-gray-900'
                        : isFallout
                          ? 'bg-gray-800/50 border border-green-500/20 text-green-400 hover:border-green-500/40'
                          : isDarkBlue
                            ? 'bg-[#0c1017]/50 border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                            : isDark
                              ? 'bg-[#2f2f2f]/50 border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                              : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <span>{opt.label}</span>
                  </button>
                )
              })}
              <button
                onClick={() => setIsCustomTimeout(true)}
                className={`
                  w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isCustomTimeout
                    ? isFallout
                      ? 'bg-green-500/20 border-2 border-green-500/60 text-green-300'
                      : isDarkBlue
                        ? 'bg-blue-500/20 border-2 border-blue-500/60 text-[#e0e6f0]'
                        : isDark
                          ? 'bg-blue-500/20 border-2 border-blue-500/60 text-white'
                          : 'bg-blue-50 border-2 border-blue-500 text-gray-900'
                    : isFallout
                      ? 'bg-gray-800/50 border border-green-500/20 text-green-400 hover:border-green-500/40'
                      : isDarkBlue
                        ? 'bg-[#0c1017]/50 border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                        : isDark
                          ? 'bg-[#2f2f2f]/50 border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                          : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span>Custom</span>
              </button>
              {isCustomTimeout && (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="1"
                    max={customTimeoutUnit === 'days' ? 365 : customTimeoutUnit === 'hours' ? 8760 : 525600}
                    value={customTimeoutValue}
                    onChange={(e) => setCustomTimeoutValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className={`
                      w-20 px-3 py-2 rounded-lg text-sm text-center
                      focus:outline-none focus:ring-2
                      ${isFallout
                        ? 'bg-gray-800 border border-green-500/40 text-green-400 font-mono focus:ring-green-500/50'
                        : isDarkBlue
                          ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] focus:ring-blue-500/50'
                          : isDark
                            ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white focus:ring-blue-500/50'
                            : 'bg-white border border-gray-200 text-gray-900 focus:ring-blue-500/30'
                      }
                    `}
                  />
                  <div className={`flex rounded-lg overflow-hidden border ${isFallout ? 'border-green-500/40' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-200'}`}>
                    {['minutes', 'hours', 'days'].map((unit) => (
                      <button
                        key={unit}
                        onClick={() => setCustomTimeoutUnit(unit)}
                        className={`
                          px-3 py-2 text-sm font-medium transition-all
                          ${customTimeoutUnit === unit
                            ? isFallout
                              ? 'bg-green-500/20 text-green-300'
                              : isDarkBlue
                                ? 'bg-blue-500/20 text-[#e0e6f0]'
                                : isDark
                                  ? 'bg-blue-500/20 text-white'
                                  : 'bg-blue-50 text-blue-700'
                            : isFallout
                              ? 'bg-gray-800 text-green-500 hover:bg-gray-700'
                              : isDarkBlue
                                ? 'bg-[#0c1017] text-[#5d6b88] hover:bg-[#141825]'
                                : isDark
                                  ? 'bg-[#2f2f2f] text-[#6b6b6b] hover:bg-[#3a3a3a]'
                                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }
                        `}
                      >
                        {unit.charAt(0).toUpperCase() + unit.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Biometric toggle */}
          {biometricAvailable && (
            <button
              onClick={() => setEnableBiometric(!enableBiometric)}
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all
                ${enableBiometric
                  ? isFallout
                    ? 'bg-green-500/20 border-2 border-green-500/60 text-green-300'
                    : isDarkBlue
                      ? 'bg-blue-500/20 border-2 border-blue-500/60 text-[#e0e6f0]'
                      : isDark
                        ? 'bg-blue-500/20 border-2 border-blue-500/60 text-white'
                        : 'bg-blue-50 border-2 border-blue-500 text-gray-900'
                  : isFallout
                    ? 'bg-gray-800/50 border border-green-500/20 text-green-400 hover:border-green-500/40'
                    : isDarkBlue
                      ? 'bg-[#0c1017]/50 border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                      : isDark
                        ? 'bg-[#2f2f2f]/50 border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                        : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Fingerprint className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Enable Touch ID</div>
                <div className={`
                  text-xs mt-0.5
                  ${isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}
                `}>
                  Use biometrics as an alternative to password
                </div>
              </div>
            </button>
          )}

          {/* Error */}
          {error && (
            <div className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              ${isFallout
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : isDarkBlue
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                  : isDark
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                    : 'bg-red-50 text-red-600 border border-red-200'
              }
            `}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`
          px-6 py-4 flex gap-3
          ${isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'}
        `}>
          <button
            onClick={onClose}
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
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!password.trim() || !confirmPassword.trim()}
            className={`
              flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isFallout
                ? 'bg-green-500 text-gray-900 hover:bg-green-400 disabled:hover:bg-green-500 font-mono'
                : isDarkBlue
                  ? 'bg-blue-500 text-white hover:bg-blue-400 disabled:hover:bg-blue-500'
                  : isDark
                    ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:hover:bg-blue-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600'
              }
            `}
          >
            Enable App Lock
          </button>
        </div>
      </div>
    </div>
  )
}
