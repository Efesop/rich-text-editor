import React, { useState, useEffect, useRef } from 'react'
import { Lock, Fingerprint, AlertCircle } from 'lucide-react'

export default function AppLockScreen({ onUnlock, onBiometricUnlock, biometricAvailable, biometricEnabled, theme }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(() => {
    try { return parseInt(sessionStorage.getItem('dash-lock-attempts') || '0', 10) } catch { return 0 }
  })
  const [lockedUntil, setLockedUntil] = useState(() => {
    try { return parseInt(sessionStorage.getItem('dash-lock-until') || '0', 10) } catch { return 0 }
  })
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const inputRef = useRef(null)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  // Cooldown timer
  useEffect(() => {
    if (lockedUntil <= Date.now()) {
      setCooldownRemaining(0)
      return
    }
    setCooldownRemaining(Math.ceil((lockedUntil - Date.now()) / 1000))
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setCooldownRemaining(0)
        clearInterval(interval)
      } else {
        setCooldownRemaining(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  useEffect(() => {
    if (inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [])

  // Auto-prompt biometric (biometricAvailable may resolve after mount)
  const autoPromptedRef = useRef(false)
  useEffect(() => {
    if (biometricAvailable && biometricEnabled && !autoPromptedRef.current) {
      autoPromptedRef.current = true
      handleBiometric()
    }
  }, [biometricAvailable, biometricEnabled])

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!password.trim()) return
    if (cooldownRemaining > 0) return

    const success = onUnlock(password)
    if (success) {
      setPassword('')
      setError('')
      setAttempts(0)
      try { sessionStorage.removeItem('dash-lock-attempts'); sessionStorage.removeItem('dash-lock-until') } catch {}
    } else {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      try { sessionStorage.setItem('dash-lock-attempts', String(newAttempts)) } catch {}

      // Increasing cooldowns: 3 attempts = 1s, 5 = 5s, 7 = 15s, 9+ = 30s
      if (newAttempts >= 9) {
        const until = Date.now() + 30000
        setLockedUntil(until)
        try { sessionStorage.setItem('dash-lock-until', String(until)) } catch {}
        setError('Too many attempts. Please wait 30 seconds.')
      } else if (newAttempts >= 7) {
        const until = Date.now() + 15000
        setLockedUntil(until)
        try { sessionStorage.setItem('dash-lock-until', String(until)) } catch {}
        setError('Too many attempts. Please wait 15 seconds.')
      } else if (newAttempts >= 5) {
        const until = Date.now() + 5000
        setLockedUntil(until)
        try { sessionStorage.setItem('dash-lock-until', String(until)) } catch {}
        setError('Too many attempts. Please wait 5 seconds.')
      } else if (newAttempts >= 3) {
        const until = Date.now() + 1000
        setLockedUntil(until)
        try { sessionStorage.setItem('dash-lock-until', String(until)) } catch {}
        setError('Incorrect password. Please try again carefully.')
      } else {
        setError('Incorrect password')
      }
      setPassword('')
      inputRef.current?.focus()
    }
  }

  const handleBiometric = async () => {
    try {
      const result = await onBiometricUnlock()
      if (result === 'needs-password') {
        setError('Enter your password once to re-link Touch ID')
        inputRef.current?.focus()
      } else if (!result) {
        setError('Biometric authentication failed')
      }
    } catch {
      setError('Biometric authentication unavailable')
    }
  }

  return (
    <div className={`
      fixed inset-0 z-[100] flex items-center justify-center
      ${isFallout
        ? 'bg-gray-950'
        : isDarkBlue
          ? 'bg-[#0a0e18]'
          : isDark
            ? 'bg-[#0d0d0d]'
            : 'bg-gray-50'
      }
    `}>
      <div className="flex flex-col items-center w-full max-w-sm px-6">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className={`
            p-4 rounded-2xl mb-4 flex items-center gap-3
            ${isFallout
              ? 'bg-green-500/10 border border-green-500/30'
              : isDarkBlue
                ? 'bg-blue-500/10 border border-blue-500/20'
                : isDark
                  ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50'
                  : 'bg-white border border-gray-200 shadow-lg'
            }
          `}>
            <img src="./icons/dash-logo.png" alt="Dash" className="h-10 w-10 rounded-xl" />
            <Lock className={`
              w-5 h-5
              ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
            `} />
          </div>
          <h1 className={`
            text-xl font-semibold mb-1
            ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
          `}>
            Dash is Locked
          </h1>
          <p className={`
            text-sm
            ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}
          `}>
            Enter your password to unlock
          </p>
        </div>

        {/* Password input */}
        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Enter password..."
            autoFocus
            className={`
              w-full px-4 py-3 text-base rounded-xl transition-all duration-200
              focus:outline-none focus:ring-2
              ${isFallout
                ? 'bg-gray-900 border border-green-500/40 text-green-400 placeholder-green-700 font-mono focus:ring-green-500/50 focus:border-green-400'
                : isDarkBlue
                  ? 'bg-[#141825] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50 focus:border-blue-500'
                  : isDark
                    ? 'bg-[#1a1a1a] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50 focus:border-blue-500'
                    : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500 shadow-sm'
              }
            `}
          />

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

          <button
            type="submit"
            disabled={!password.trim() || cooldownRemaining > 0}
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
            {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : 'Unlock'}
          </button>

          {biometricAvailable && biometricEnabled && (
            <button
              type="button"
              onClick={handleBiometric}
              className={`
                w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2
                ${isFallout
                  ? 'bg-gray-900 border border-green-500/40 text-green-400 hover:bg-gray-800 font-mono'
                  : isDarkBlue
                    ? 'bg-[#141825] border border-[#1c2438] text-[#8b99b5] hover:bg-[#1a2035]'
                    : isDark
                      ? 'bg-[#1a1a1a] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#2f2f2f]'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'
                }
              `}
            >
              <Fingerprint className="w-5 h-5" />
              Unlock with Touch ID
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
