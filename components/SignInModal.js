import React, { useState, useEffect, useRef } from 'react'
import { Mail, X, Check, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react'
import { requestCode, verifyCode } from '@/lib/identity'

// Cross-platform sign-in via 6-digit code emailed by the relay.
//
// Used on Mac (Electron), PWA, and iOS — same UI, same backend
// (server/auth.ts → Resend). Email-only; no passwords.
//
// Two steps:
//   1. Enter email → /auth/code/request → email delivered with 6-digit code
//   2. Enter 6-digit code → /auth/code/verify → server returns opaque
//      bearer token. Stored in localStorage. onSignedIn() fires.
//
// The privacy story: email is used SOLELY to look up entitlement state
// (Stripe sync sub or RevenueCat iOS sub or, historically, Mac one-time
// in legacy installs). Vault contents stay E2E encrypted with a key the
// server never sees. See pages/privacy.js.
//
// Theme support matches AcceptPairModal (light, dark, darkblue, fallout).

export default function SignInModal ({
  isOpen,
  onClose,
  onSignedIn, // ({ email, token }) => void
  theme,
  initialEmail = '',
  reason // optional descriptive text e.g. "to use sync" or "to restore your purchase"
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [step, setStep] = useState('email') // 'email' | 'code' | 'done'
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const codeInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setStep('email')
      setEmail(initialEmail || '')
      setCode('')
      setError(null)
      setBusy(false)
    }
  }, [isOpen, initialEmail])

  useEffect(() => {
    if (step === 'code' && codeInputRef.current) {
      setTimeout(() => codeInputRef.current?.focus(), 100)
    }
  }, [step])

  const sendCode = async (e) => {
    if (e) e.preventDefault()
    setError(null)
    const normalized = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Enter a valid email.')
      return
    }
    setBusy(true)
    try {
      await requestCode(normalized)
      setEmail(normalized)
      setStep('code')
    } catch (err) {
      setError(err?.message || 'Could not send code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e) => {
    if (e) e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setBusy(true)
    try {
      const result = await verifyCode(email, code)
      setStep('done')
      setTimeout(() => {
        onSignedIn?.(result)
      }, 500)
    } catch (err) {
      setError(err?.message || 'Incorrect or expired code.')
    } finally {
      setBusy(false)
    }
  }

  if (!isOpen) return null

  // ── Theme classes (match AcceptPairModal) ─────────────────────────
  const bgContainer = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white shadow-2xl'

  const headerBorder = isFallout
    ? 'border-b border-green-500/30'
    : isDarkBlue ? 'border-b border-[#1c2438]'
      : isDark ? 'border-b border-[#3a3a3a]'
        : 'border-b border-gray-100'

  const titleClasses = isFallout
    ? 'text-green-400 font-mono'
    : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'

  const subtitleClasses = isFallout
    ? 'text-green-600 font-mono text-xs'
    : isDarkBlue ? 'text-[#8b99b5] text-xs' : isDark ? 'text-[#8e8e8e] text-xs' : 'text-gray-500 text-xs'

  const closeBtn = isFallout
    ? 'text-green-600 hover:bg-green-900/30'
    : isDarkBlue ? 'text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'text-[#c0c0c0] hover:bg-[#2a2a2a]'
        : 'text-gray-500 hover:bg-gray-100'

  const iconContainerClasses = isFallout
    ? 'bg-green-500/20 border border-green-500/40 text-green-400'
    : isDarkBlue ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
      : isDark ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
        : 'bg-blue-50 border border-blue-100 text-blue-600'

  const inputClasses = isFallout
    ? 'bg-gray-900 border border-green-500/40 text-green-400 placeholder-green-700 font-mono focus:ring-green-500/50'
    : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50'
      : isDark ? 'bg-[#1a1a1a] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50'
        : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30'

  const primaryBtn = isFallout
    ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
    : isDarkBlue ? 'bg-blue-500 text-white hover:bg-blue-400'
      : isDark ? 'bg-blue-600 text-white hover:bg-blue-500'
        : 'bg-blue-600 text-white hover:bg-blue-700'

  const secondaryBtn = isFallout
    ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
    : isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden ${bgContainer}`}
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
      >
        <div className={`px-6 pt-6 pb-4 ${headerBorder}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconContainerClasses}`}>
                {step === 'code' ? <KeyRound className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>
                  {step === 'email' && 'Sign in to Dash'}
                  {step === 'code' && 'Enter your code'}
                  {step === 'done' && 'Signed in'}
                </h2>
                <p className={subtitleClasses}>
                  {step === 'email' && (reason || 'No passwords — we email you a 6-digit code.')}
                  {step === 'code' && `Sent to ${email}`}
                  {step === 'done' && 'You can close this window.'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtn}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${subtitleClasses}`}>Email</label>
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full px-4 py-3 text-sm rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 ${inputClasses}`}
                />
              </div>
              <button
                type="submit"
                disabled={busy || !email}
                className={`w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 ${primaryBtn}`}
              >
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
              <p className={`text-[11px] leading-relaxed text-center ${subtitleClasses}`}>
                We send a 6-digit code that expires in 10 minutes. Email is used only to verify your subscription — your notes stay end-to-end encrypted.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={submitCode} className="space-y-4">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${subtitleClasses}`}>6-digit code</label>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className={`w-full px-4 py-3 text-2xl tracking-widest font-mono rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 text-center ${inputClasses}`}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode('') }}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium ${secondaryBtn}`}
                  disabled={busy}
                >
                  <ArrowLeft className="inline w-4 h-4 mr-1 -mt-0.5" /> Back
                </button>
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 ${primaryBtn}`}
                >
                  {busy ? 'Verifying…' : 'Sign in'}
                </button>
              </div>
              <p className={`text-[11px] leading-relaxed text-center ${subtitleClasses}`}>
                Didn't get it? Check your spam folder, or{' '}
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode('') }}
                  className="underline"
                >
                  use a different email
                </button>.
              </p>
            </form>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${iconContainerClasses}`}>
                <Check className="w-7 h-7" />
              </div>
              <p className={`text-sm ${titleClasses}`}>Signed in as <strong>{email}</strong></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
