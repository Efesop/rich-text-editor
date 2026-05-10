import React, { useState, useEffect, useRef } from 'react'
import { KeyRound, X, AlertCircle, Eye, EyeOff } from 'lucide-react'

/**
 * Sync passphrase prompt — used in two flows:
 *
 *   1. SETUP: when enabling sync on a device that doesn't have app-lock
 *      configured (PWA path) — user picks a fresh passphrase that wraps
 *      the vault key. Requires confirm-passphrase pair.
 *
 *   2. UNLOCK: when the app starts and the vault is passphrase-wrapped,
 *      prompt for the existing passphrase to re-derive the wrapping key.
 *      Single field; no confirm.
 *
 * Caller passes `mode: 'setup' | 'unlock'` and a `onSubmit(passphrase)`
 * callback that returns Promise<{ ok: boolean, error?: string }>. The
 * modal shows the error inline and stays open on failure.
 *
 * Theme matches the rest of the modal family.
 */

export default function SyncPassphraseModal ({
  isOpen,
  onClose,
  mode = 'setup',         // 'setup' | 'unlock'
  title,
  subtitle,
  onSubmit,
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showText, setShowText] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setPassphrase('')
      setConfirm('')
      setError(null)
      setBusy(false)
      setShowText(false)
      // Focus first input after the modal animates in
      const t = setTimeout(() => inputRef.current?.focus(), 150)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async () => {
    setError(null)
    if (mode === 'setup') {
      if (passphrase.length < 8) {
        setError('Pick a passphrase at least 8 characters long.')
        return
      }
      if (passphrase !== confirm) {
        setError('Passphrases don\'t match.')
        return
      }
    } else {
      if (passphrase.length === 0) {
        setError('Enter your passphrase.')
        return
      }
    }
    setBusy(true)
    try {
      const result = await onSubmit?.(passphrase)
      if (result?.ok === false) {
        setError(result.error || 'Couldn\'t verify passphrase.')
        setBusy(false)
        return
      }
      // success — caller closes the modal
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setBusy(false)
    }
  }

  const bgContainer = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white shadow-2xl'

  const headerBorder = isFallout ? 'border-b border-green-500/30'
    : isDarkBlue ? 'border-b border-[#1c2438]'
      : isDark ? 'border-b border-[#3a3a3a]'
        : 'border-b border-gray-100'

  const titleClasses = isFallout ? 'text-green-400 font-mono'
    : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'

  const subtitleClasses = isFallout ? 'text-green-600 font-mono text-xs'
    : isDarkBlue ? 'text-[#8b99b5] text-xs' : isDark ? 'text-[#8e8e8e] text-xs' : 'text-gray-500 text-xs'

  const closeBtn = isFallout ? 'text-green-600 hover:bg-green-900/30'
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

  const secondaryBtn = isFallout ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
    : isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  const defaultTitle = mode === 'setup' ? 'Pick a passphrase for this device' : 'Unlock vault'
  const defaultSubtitle = mode === 'setup'
    ? 'This is local — different from your other devices.'
    : 'Enter your passphrase to resume sync.'

  return (
    <div className="dash-mobile-bottom-sheet fixed inset-0 z-[60] flex items-center justify-center p-4">
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
                <KeyRound className="w-5 h-5 pointer-events-none" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>{title || defaultTitle}</h2>
                <p className={subtitleClasses}>{subtitle || defaultSubtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtn}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          {mode === 'setup' && (
            <>
              <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
                Each device wraps the synced vault key with its own passphrase. Pick anything you'll remember — it doesn't need to match other devices.
              </p>
              <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
                <strong className={titleClasses}>Write it down somewhere safe.</strong> If you forget it and lose all your devices, your synced notes are unrecoverable.
              </p>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="relative">
            <input
              ref={inputRef}
              type={showText ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (mode !== 'setup' || passphrase === confirm)) handleSubmit()
              }}
              placeholder={mode === 'setup' ? 'Passphrase (8+ characters)' : 'Passphrase'}
              className={`w-full px-4 py-3 pr-10 text-sm rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 ${inputClasses}`}
              autoComplete="off"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowText(s => !s)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md ${closeBtn}`}
              aria-label={showText ? 'Hide passphrase' : 'Show passphrase'}
            >
              {showText
                ? <EyeOff className="w-4 h-4 pointer-events-none" />
                : <Eye className="w-4 h-4 pointer-events-none" />}
            </button>
          </div>

          {mode === 'setup' && (
            <input
              type={showText ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="Confirm passphrase"
              className={`w-full px-4 py-3 text-sm rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 ${inputClasses}`}
              autoComplete="off"
              disabled={busy}
            />
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={busy}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium ${secondaryBtn}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy || passphrase.length === 0 || (mode === 'setup' && passphrase !== confirm)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 ${primaryBtn}`}
            >
              {busy ? 'Working…' : (mode === 'setup' ? 'Continue' : 'Unlock')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
