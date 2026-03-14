import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck, X, Fingerprint, AlertCircle, AlertTriangle, ShieldAlert, ChevronDown, Clock, Eye, EyeOff, Trash2 } from 'lucide-react'
import PasswordStrengthMeter from './PasswordStrengthMeter'

const TIMEOUT_PRESETS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: 'Never', value: 0 }
]

export default function AppLockSetupModal({ isOpen, onClose, onConfirm, biometricAvailable, onSetDuress, theme }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedTimeout, setSelectedTimeout] = useState(5)
  const [isCustomTimeout, setIsCustomTimeout] = useState(false)
  const [customValue, setCustomValue] = useState(2)
  const [customUnit, setCustomUnit] = useState('hours')
  const [enableBiometric, setEnableBiometric] = useState(true)
  const [error, setError] = useState('')
  const [showDuress, setShowDuress] = useState(false)
  const [duressPassword, setDuressPassword] = useState('')
  const [duressConfirm, setDuressConfirm] = useState('')
  const [duressAction, setDuressAction] = useState('hide')
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
      setShowPassword(false)
      setSelectedTimeout(5)
      setIsCustomTimeout(false)
      setCustomValue(2)
      setCustomUnit('hours')
      setEnableBiometric(true)
      setError('')
      setShowDuress(false)
      setDuressPassword('')
      setDuressConfirm('')
      setDuressAction('hide')
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
    if (showDuress && duressPassword.trim()) {
      if (duressPassword.length < 4) {
        setError('Decoy password must be at least 4 characters')
        return
      }
      if (duressPassword !== duressConfirm) {
        setError('Decoy passwords do not match')
        return
      }
      if (duressPassword === password) {
        setError('Decoy password must be different from your main password')
        return
      }
    }
    const effectiveTimeout = isCustomTimeout
      ? customUnit === 'days' ? customValue * 24 * 60 : customUnit === 'hours' ? customValue * 60 : customValue
      : selectedTimeout
    onConfirm(password, effectiveTimeout, enableBiometric)
    if (showDuress && duressPassword.trim() && onSetDuress) {
      onSetDuress(duressPassword, duressAction)
    }
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

  // Theme helpers
  const cardBg = isFallout
    ? 'bg-gray-800/50 border border-green-500/20'
    : isDarkBlue
      ? 'bg-[#0c1017]/50 border border-[#1c2438]'
      : isDark
        ? 'bg-[#232323] border border-[#3a3a3a]/50'
        : 'bg-gray-50/80 border border-gray-200/60'

  const inputClasses = isFallout
    ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-700 font-mono focus:ring-green-500/50 focus:border-green-500/60'
    : isDarkBlue
      ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50 focus:border-blue-500/40'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50 focus:border-blue-500/40'
        : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-400'

  const labelClasses = isFallout
    ? 'text-green-400 font-mono'
    : isDarkBlue
      ? 'text-[#e0e6f0]'
      : isDark
        ? 'text-[#c0c0c0]'
        : 'text-gray-700'

  const subtextClasses = isFallout
    ? 'text-green-600 font-mono'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-gray-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      <div
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
        className={`
          relative w-full max-w-lg transform transition-all duration-200
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
                <p className={`text-xs mt-0.5 ${subtextClasses}`}>
                  Encrypt all your notes with a single password
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
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">

          {/* Section 1: Password */}
          <div className={`rounded-xl p-4 space-y-3 ${cardBg}`}>
            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${labelClasses}`}>
                  Password
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    onKeyDown={handleKeyDown}
                    placeholder="Create a password..."
                    className={`w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg transition-all focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${subtextClasses} hover:opacity-80`}
                  >
                    {showPassword
                      ? <EyeOff className="w-4 h-4" />
                      : <Eye className="w-4 h-4" />
                    }
                  </button>
                </div>
                {password && (
                  <div className="mt-2">
                    <PasswordStrengthMeter password={password} />
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${labelClasses}`}>
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="Confirm password..."
                  className={`w-full px-3.5 py-2.5 text-sm rounded-lg transition-all focus:outline-none focus:ring-2 ${inputClasses}`}
                />
              </div>
            </div>

            <div className={`
              flex items-start gap-2 px-3 py-2 rounded-lg text-xs leading-relaxed
              ${isFallout
                ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-mono'
                : isDarkBlue
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : isDark
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
              }
            `}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>This password encrypts your notes. There is no recovery — if you forget it, your data is lost.</span>
            </div>
          </div>

          {/* Section 2: Options */}
          <div className={`rounded-xl p-4 space-y-3 ${cardBg}`}>
            {/* Biometric toggle */}
            {biometricAvailable && (
              <button
                onClick={() => setEnableBiometric(!enableBiometric)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${enableBiometric
                    ? isFallout
                      ? 'bg-green-500/15 border border-green-500/50 text-green-300'
                      : isDarkBlue
                        ? 'bg-blue-500/15 border border-blue-500/50 text-[#e0e6f0]'
                        : isDark
                          ? 'bg-blue-500/15 border border-blue-500/50 text-white'
                          : 'bg-blue-50 border border-blue-400 text-gray-900'
                    : isFallout
                      ? 'border border-green-500/15 text-green-400 hover:border-green-500/30'
                      : isDarkBlue
                        ? 'border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                        : isDark
                          ? 'border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                          : 'border border-gray-200 text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Fingerprint className="w-4 h-4 flex-shrink-0" />
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Touch ID</div>
                  <div className={`text-xs mt-0.5 ${subtextClasses}`}>
                    Use fingerprint to unlock
                  </div>
                </div>
                <div className={`
                  w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0
                  ${enableBiometric
                    ? isFallout ? 'bg-green-500' : isDarkBlue ? 'bg-blue-500' : isDark ? 'bg-blue-500' : 'bg-blue-600'
                    : isFallout ? 'bg-gray-700' : isDarkBlue ? 'bg-[#232b42]' : isDark ? 'bg-[#3a3a3a]' : 'bg-gray-300'
                  }
                `}>
                  <div className={`
                    absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform
                    ${enableBiometric ? 'translate-x-[14px]' : 'translate-x-[2px]'}
                  `} />
                </div>
              </button>
            )}

            {/* Auto-lock timeout */}
            <div>
              <div className={`flex items-center gap-1.5 mb-2 ${labelClasses}`}>
                <Clock className="w-3.5 h-3.5" />
                <label className="text-xs font-medium">Lock after inactivity</label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TIMEOUT_PRESETS.map((opt) => {
                  const isSelected = !isCustomTimeout && selectedTimeout === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { setSelectedTimeout(opt.value); setIsCustomTimeout(false) }}
                      className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${isSelected
                          ? isFallout
                            ? 'bg-green-500/20 border border-green-500/60 text-green-300'
                            : isDarkBlue
                              ? 'bg-blue-500/20 border border-blue-500/60 text-[#e0e6f0]'
                              : isDark
                                ? 'bg-blue-500/20 border border-blue-500/60 text-white'
                                : 'bg-blue-50 border border-blue-500 text-blue-700'
                          : isFallout
                            ? 'border border-green-500/20 text-green-400 hover:border-green-500/40'
                            : isDarkBlue
                              ? 'border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                              : isDark
                                ? 'border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                                : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  )
                })}
                <button
                  onClick={() => setIsCustomTimeout(true)}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${isCustomTimeout
                      ? isFallout
                        ? 'bg-green-500/20 border border-green-500/60 text-green-300'
                        : isDarkBlue
                          ? 'bg-blue-500/20 border border-blue-500/60 text-[#e0e6f0]'
                          : isDark
                            ? 'bg-blue-500/20 border border-blue-500/60 text-white'
                            : 'bg-blue-50 border border-blue-500 text-blue-700'
                      : isFallout
                        ? 'border border-green-500/20 text-green-400 hover:border-green-500/40'
                        : isDarkBlue
                          ? 'border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                          : isDark
                            ? 'border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                            : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                    }
                  `}
                >
                  Custom
                </button>
              </div>
              {isCustomTimeout && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min="1"
                    value={customValue}
                    onChange={(e) => setCustomValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className={`w-16 px-2.5 py-1.5 rounded-lg text-xs text-center focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 appearance-none cursor-pointer ${inputClasses}`}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Decoy Password (optional, collapsible) */}
          <div className={`rounded-xl overflow-hidden ${cardBg}`}>
            <button
              type="button"
              onClick={() => setShowDuress(!showDuress)}
              className={`
                w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-all
                ${isFallout
                  ? 'text-green-400 hover:bg-green-500/10 font-mono'
                  : isDarkBlue
                    ? 'text-[#8b99b5] hover:bg-[#1a2035]'
                    : isDark
                      ? 'text-[#c0c0c0] hover:bg-[#2f2f2f]'
                      : 'text-gray-700 hover:bg-gray-100/50'
                }
              `}
            >
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left font-medium">Decoy Password</span>
              <span className={`text-xs ${subtextClasses}`}>Optional</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDuress ? 'rotate-180' : ''}`} />
            </button>

            {showDuress && (
              <div className="px-4 pb-4 space-y-3">
                <p className={`text-xs leading-relaxed ${subtextClasses}`}>
                  A secondary password that shows decoy notes instead of your real data when entered at the lock screen.
                </p>

                <div className="space-y-2">
                  <input
                    type="password"
                    value={duressPassword}
                    onChange={(e) => { setDuressPassword(e.target.value); setError('') }}
                    placeholder="Decoy password..."
                    className={`w-full px-3.5 py-2.5 text-sm rounded-lg transition-all focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                  <input
                    type="password"
                    value={duressConfirm}
                    onChange={(e) => { setDuressConfirm(e.target.value); setError('') }}
                    placeholder="Confirm decoy password..."
                    className={`w-full px-3.5 py-2.5 text-sm rounded-lg transition-all focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                </div>

                <div>
                  <label className={`text-xs font-medium mb-1.5 block ${labelClasses}`}>
                    When decoy password is entered:
                  </label>
                  <div className="space-y-1.5">
                    {[
                      { value: 'hide', icon: EyeOff, label: 'Show Decoy Notes', desc: 'Fake notes are shown — real data stays encrypted on disk' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDuressAction(opt.value)}
                        className={`
                          w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                          ${duressAction === opt.value
                            ? isFallout
                              ? 'bg-green-500/15 border border-green-500/50 text-green-300'
                              : isDarkBlue
                                ? 'bg-blue-500/12 border border-blue-500/40 text-[#e0e6f0]'
                                : isDark
                                  ? 'bg-blue-500/12 border border-blue-500/40 text-white'
                                  : 'bg-blue-50 border border-blue-400 text-gray-900'
                            : isFallout
                              ? 'border border-green-500/15 text-green-500 hover:border-green-500/30'
                              : isDarkBlue
                                ? 'border border-[#1c2438] text-[#5d6b88] hover:border-[#232b42]'
                                : isDark
                                  ? 'border border-[#3a3a3a]/50 text-[#8e8e8e] hover:border-[#4a4a4a]'
                                  : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                          }
                        `}
                      >
                        <opt.icon className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium">{opt.label}</div>
                          <div className={`text-xs mt-0.5 ${subtextClasses}`}>{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

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
              flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
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
              flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
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
