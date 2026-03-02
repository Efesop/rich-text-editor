import React, { useState, useEffect } from 'react'
import { Settings, X, Fingerprint, AlertCircle, Check } from 'lucide-react'

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
  theme
}) {
  const [activeTab, setActiveTab] = useState('timeout')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

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
                Lock Settings
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
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {activeTab === 'timeout' && (
            <>
              <div className="space-y-1.5">
                {TIMEOUT_OPTIONS.map((opt) => {
                  const isSelected = currentTimeout === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onUpdateTimeout(opt.value)}
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
              </div>

              {/* Biometric toggle */}
              {biometricAvailable && (
                <button
                  onClick={() => onToggleBiometric(!biometricEnabled)}
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
                Disable Auto-Lock
              </button>
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
        </div>
      </div>
    </div>
  )
}
