import React, { useState, useEffect } from 'react'
import { Settings, X, Fingerprint, AlertCircle, Check, ShieldAlert } from 'lucide-react'

const TIMEOUT_OPTIONS = [
  { label: '1 Minute', value: 1 },
  { label: '5 Minutes', value: 5 },
  { label: '15 Minutes', value: 15 },
  { label: '30 Minutes', value: 30 },
  { label: 'Never', value: 0 }
]

export default function AppLockSettingsModal({
  isOpen,
  onClose,
  currentTimeout,
  biometricEnabled,
  biometricAvailable,
  onUpdateTimeout,
  onChangePassword,
  onToggleBiometric,
  onDisable,
  duressEnabled,
  duressAction,
  onSetDuress,
  onClearDuress,
  checkIsRealPassword,
  theme
}) {
  const [activeTab, setActiveTab] = useState('timeout')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isCustomTimeout, setIsCustomTimeout] = useState(false)
  const [customTimeoutValue, setCustomTimeoutValue] = useState(2)
  const [customTimeoutUnit, setCustomTimeoutUnit] = useState('hours')
  const [biometricPassword, setBiometricPassword] = useState('')
  const [showBiometricPassword, setShowBiometricPassword] = useState(false)
  const [duressPassword, setDuressPassword] = useState('')
  const [duressConfirm, setDuressConfirm] = useState('')
  const [duressSelectedAction, setDuressSelectedAction] = useState(duressAction || 'hide')

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  useEffect(() => {
    if (isOpen) {
      setActiveTab('timeout')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
      setSuccess('')
      setIsCustomTimeout(false)
      setCustomTimeoutValue(2)
      setCustomTimeoutUnit('hours')
      setBiometricPassword('')
      setShowBiometricPassword(false)
      setDuressPassword('')
      setDuressConfirm('')
      setDuressSelectedAction(duressAction || 'hide')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      setError('All fields are required')
      return
    }
    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    const changed = await onChangePassword(currentPassword, newPassword)
    if (changed) {
      setSuccess('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
      setTimeout(() => setSuccess(''), 3000)
    } else {
      setError('Current password is incorrect')
    }
  }

  const handleDisable = () => {
    onDisable()
    onClose()
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const inputClasses = `
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
  `

  const tabClasses = (isActive) => `
    flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all
    ${isActive
      ? isFallout
        ? 'bg-green-500/20 text-green-300'
        : isDarkBlue
          ? 'bg-blue-500/20 text-blue-300'
          : isDark
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-blue-100 text-blue-700'
      : isFallout
        ? 'text-green-600 hover:text-green-400'
        : isDarkBlue
          ? 'text-[#5d6b88] hover:text-[#8b99b5]'
          : isDark
            ? 'text-[#6b6b6b] hover:text-[#c0c0c0]'
            : 'text-gray-500 hover:text-gray-700'
    }
  `

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

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
                <Settings className="w-5 h-5" />
              </div>
              <h2 className={`
                text-lg font-semibold
                ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
              `}>
                App Lock Settings
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
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <div className={`
            flex gap-1 p-1 rounded-lg
            ${isFallout ? 'bg-gray-800' : isDarkBlue ? 'bg-[#0c1017]' : isDark ? 'bg-[#2f2f2f]' : 'bg-gray-100'}
          `}>
            <button onClick={() => setActiveTab('timeout')} className={tabClasses(activeTab === 'timeout')}>
              Timeout
            </button>
            <button onClick={() => setActiveTab('password')} className={tabClasses(activeTab === 'password')}>
              Password
            </button>
            <button onClick={() => setActiveTab('duress')} className={tabClasses(activeTab === 'duress')}>
              Duress
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {activeTab === 'timeout' && (
            <>
              <div className="space-y-1.5">
                {TIMEOUT_OPTIONS.map((opt) => {
                  const isSelected = !isCustomTimeout && currentTimeout === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { onUpdateTimeout(opt.value); setIsCustomTimeout(false) }}
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
                      {isSelected && <Check className="w-4 h-4" />}
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
                  {isCustomTimeout && <Check className="w-4 h-4" />}
                </button>
                {isCustomTimeout && (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min="1"
                      max={customTimeoutUnit === 'days' ? 365 : customTimeoutUnit === 'hours' ? 8760 : 525600}
                      value={customTimeoutValue}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1)
                        setCustomTimeoutValue(val)
                        const minutes = customTimeoutUnit === 'days' ? val * 24 * 60 : customTimeoutUnit === 'hours' ? val * 60 : val
                        onUpdateTimeout(minutes)
                      }}
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
                          onClick={() => {
                            setCustomTimeoutUnit(unit)
                            const minutes = unit === 'days' ? customTimeoutValue * 24 * 60 : unit === 'hours' ? customTimeoutValue * 60 : customTimeoutValue
                            onUpdateTimeout(minutes)
                          }}
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

              {/* Biometric toggle */}
              {biometricAvailable && (
                <div>
                  <button
                    onClick={() => {
                      if (biometricEnabled) {
                        // Disabling — no password needed
                        onToggleBiometric(false)
                        setBiometricPassword('')
                        setShowBiometricPassword(false)
                      } else {
                        // Enabling — need password for safeStorage
                        setShowBiometricPassword(true)
                      }
                    }}
                    className={`
                      w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all
                      ${biometricEnabled
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
                    <span className="font-medium">Touch ID</span>
                    {biometricEnabled && <Check className="w-4 h-4 ml-auto" />}
                  </button>
                  {showBiometricPassword && !biometricEnabled && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="password"
                        value={biometricPassword}
                        onChange={(e) => setBiometricPassword(e.target.value)}
                        placeholder="Enter password to enable..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && biometricPassword.trim()) {
                            onToggleBiometric(true, biometricPassword)
                            setBiometricPassword('')
                            setShowBiometricPassword(false)
                          }
                        }}
                        className={inputClasses}
                      />
                      <button
                        onClick={() => {
                          if (biometricPassword.trim()) {
                            onToggleBiometric(true, biometricPassword)
                            setBiometricPassword('')
                            setShowBiometricPassword(false)
                          }
                        }}
                        disabled={!biometricPassword.trim()}
                        className={`
                          px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap
                          disabled:opacity-40 disabled:cursor-not-allowed
                          ${isFallout
                            ? 'bg-green-500 text-gray-900 hover:bg-green-400'
                            : isDarkBlue
                              ? 'bg-blue-500 text-white hover:bg-blue-400'
                              : isDark
                                ? 'bg-blue-600 text-white hover:bg-blue-500'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                          }
                        `}
                      >
                        Enable
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Disable */}
              <button
                onClick={handleDisable}
                className={`
                  w-full px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isFallout
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                    : isDarkBlue
                      ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                      : isDark
                        ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                        : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                  }
                `}
              >
                Disable App Lock
              </button>
              <p className={`text-xs mt-1 text-center ${isFallout ? 'text-green-600/60' : isDarkBlue ? 'text-[#5d6b88]/80' : isDark ? 'text-[#6b6b6b]/80' : 'text-gray-400'}`}>
                This will decrypt all your notes and store them as plaintext
              </p>
            </>
          )}

          {activeTab === 'password' && (
            <>
              <div>
                <label className={`
                  block text-sm font-medium mb-1.5
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
                `}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setError(''); setSuccess('') }}
                  placeholder="Enter current password..."
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={`
                  block text-sm font-medium mb-1.5
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
                `}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); setSuccess('') }}
                  placeholder="Enter new password..."
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={`
                  block text-sm font-medium mb-1.5
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
                `}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); setSuccess('') }}
                  placeholder="Confirm new password..."
                  className={inputClasses}
                />
              </div>

              {error && (
                <div className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  ${isFallout ? 'bg-red-500/10 text-red-400 border border-red-500/30' : isDarkBlue ? 'bg-red-500/10 text-red-400 border border-red-500/30' : isDark ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-600 border border-red-200'}
                `}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  ${isFallout ? 'bg-green-500/10 text-green-400 border border-green-500/30' : isDarkBlue ? 'bg-green-500/10 text-green-400 border border-green-500/30' : isDark ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-600 border border-green-200'}
                `}>
                  <Check className="w-4 h-4 flex-shrink-0" />
                  {success}
                </div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()}
                className={`
                  w-full px-4 py-3 rounded-xl font-medium transition-all duration-200
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
                Change Password
              </button>
            </>
          )}

          {activeTab === 'duress' && (
            <>
              <p className={`text-sm mb-3 ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}`}>
                A duress password silently triggers a panic action when entered at the lock screen instead of your real password.
              </p>

              {duressEnabled ? (
                <>
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
                    isFallout ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : isDarkBlue ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
                        : isDark ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
                          : 'bg-blue-50 border border-blue-200 text-blue-700'
                  }`}>
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    Duress password is active (hide data)
                  </div>
                  <button
                    onClick={() => { onClearDuress(); }}
                    className={`
                      w-full px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all
                      ${isFallout
                        ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                        : isDarkBlue
                          ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                          : isDark
                            ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                            : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                      }
                    `}
                  >
                    Remove Duress Password
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}`}>
                      Duress Password
                    </label>
                    <input
                      type="password"
                      value={duressPassword}
                      onChange={(e) => { setDuressPassword(e.target.value); setError(''); setSuccess('') }}
                      placeholder="Enter duress password..."
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}`}>
                      Confirm Duress Password
                    </label>
                    <input
                      type="password"
                      value={duressConfirm}
                      onChange={(e) => { setDuressConfirm(e.target.value); setError(''); setSuccess('') }}
                      placeholder="Confirm duress password..."
                      className={inputClasses}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}`}>
                      Action
                    </label>
                    <div className={`px-3.5 py-2.5 rounded-xl text-sm ${isFallout ? 'bg-green-500/10 border border-green-500/30 text-green-400' : isDarkBlue ? 'bg-blue-500/10 border border-blue-500/30 text-[#8b99b5]' : isDark ? 'bg-blue-500/10 border border-blue-500/30 text-[#c0c0c0]' : 'bg-blue-50 border border-blue-200 text-gray-600'}`}>
                      Shows an empty app when the duress password is entered. Your data stays safely encrypted on disk and is recoverable by restarting and entering your real password.
                    </div>
                  </div>

                  {error && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isFallout ? 'bg-red-500/10 text-red-400 border border-red-500/30' : isDarkBlue ? 'bg-red-500/10 text-red-400 border border-red-500/30' : isDark ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isFallout ? 'bg-green-500/10 text-green-400 border border-green-500/30' : isDarkBlue ? 'bg-green-500/10 text-green-400 border border-green-500/30' : isDark ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-600 border border-green-200'}`}>
                      <Check className="w-4 h-4 flex-shrink-0" />
                      {success}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (!duressPassword.trim()) {
                        setError('Duress password is required')
                        return
                      }
                      if (duressPassword.length < 4) {
                        setError('Password must be at least 4 characters')
                        return
                      }
                      if (duressPassword !== duressConfirm) {
                        setError('Passwords do not match')
                        return
                      }
                      if (checkIsRealPassword && checkIsRealPassword(duressPassword)) {
                        setError('Duress password must be different from your app lock password')
                        return
                      }
                      onSetDuress(duressPassword, 'hide')
                      setDuressPassword('')
                      setDuressConfirm('')
                      setSuccess('Duress password set')
                      setError('')
                      setTimeout(() => setSuccess(''), 3000)
                    }}
                    disabled={!duressPassword.trim() || !duressConfirm.trim()}
                    className={`
                      w-full px-4 py-3 rounded-xl font-medium transition-all duration-200
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
                    Set Duress Password
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
