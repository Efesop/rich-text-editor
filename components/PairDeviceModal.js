import React, { useState, useEffect, useRef } from 'react'
import { Smartphone, X, Copy, Check, RefreshCw, AlertCircle } from 'lucide-react'
import {
  generatePairCode,
  encryptPairPacket
} from '../lib/syncCrypto.js'

/**
 * Host-side pair flow.
 *
 * Existing device (already opted into sync) shows a QR code + 6-digit pair
 * code. New device scans QR + types code → derives vault key from packet.
 *
 * Pair window: 60 seconds. After expiry, re-generate.
 *
 * Security note: the QR is itself encrypted with the pair code. Anyone who
 * photographs the QR can't pair without the code. Code is read aloud (or
 * displayed on this device — guest types it in on their device).
 */

const PAIR_WINDOW_MS = 60 * 1000

export default function PairDeviceModal ({
  isOpen,
  onClose,
  vaultPacket,    // { vaultId, vaultKey: number[], relayUrl, pairedDevices, ... }
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [pairCode, setPairCode] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [encryptedPacketB64, setEncryptedPacketB64] = useState(null)
  const [error, setError] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(PAIR_WINDOW_MS / 1000)
  const [linkCopied, setLinkCopied] = useState(false)
  const generatedAtRef = useRef(0)

  const generate = async () => {
    if (!vaultPacket) return
    setError(null)
    try {
      const code = generatePairCode()
      const encrypted = await encryptPairPacket(vaultPacket, code)
      // Wire format: base64-encoded JSON of the encrypted packet
      const wireBytes = new TextEncoder().encode(JSON.stringify(encrypted))
      let bin = ''
      for (let i = 0; i < wireBytes.length; i++) bin += String.fromCharCode(wireBytes[i])
      const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      setEncryptedPacketB64(b64)
      setPairCode(code)
      generatedAtRef.current = Date.now()
      setSecondsLeft(PAIR_WINDOW_MS / 1000)

      // Generate QR with the encrypted packet
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(`dash-pair:${b64}`, {
        width: 280,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M'
      })
      setQrDataUrl(dataUrl)
    } catch (err) {
      console.error('PairDeviceModal: generate failed', err)
      setError(err.message)
    }
  }

  useEffect(() => {
    if (isOpen) {
      generate()
    } else {
      setPairCode(null)
      setQrDataUrl(null)
      setEncryptedPacketB64(null)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, vaultPacket])

  // Tick down secondsLeft, regenerate when window expires
  useEffect(() => {
    if (!isOpen || !pairCode) return
    const interval = setInterval(() => {
      const elapsed = (Date.now() - generatedAtRef.current) / 1000
      const remaining = Math.max(0, (PAIR_WINDOW_MS / 1000) - elapsed)
      setSecondsLeft(Math.ceil(remaining))
      if (remaining === 0) clearInterval(interval)
    }, 250)
    return () => clearInterval(interval)
  }, [isOpen, pairCode])

  if (!isOpen) return null

  // Theme classes (compact, matches SyncSettingsPanel + AppLockSettingsModal)
  const bgContainer = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue
      ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark
        ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white shadow-2xl'

  const headerBorder = isFallout
    ? 'border-b border-green-500/30'
    : isDarkBlue
      ? 'border-b border-[#1c2438]'
      : isDark
        ? 'border-b border-[#3a3a3a]'
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

  const cardClasses = isFallout
    ? 'bg-gray-800/50 border border-green-500/20'
    : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438]'
      : isDark ? 'bg-[#222] border border-[#3a3a3a]/40'
        : 'bg-gray-50 border border-gray-100'

  const codeFontClasses = isFallout
    ? 'text-green-400 font-mono'
    : 'font-mono'

  const secondaryBtn = isFallout
    ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
    : isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  const expired = secondsLeft === 0

  const handleCopyLink = async () => {
    if (!encryptedPacketB64) return
    try {
      await navigator.clipboard.writeText(`dash-pair:${encryptedPacketB64}`)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed', err)
    }
  }

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
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${headerBorder}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconContainerClasses}`}>
                <Smartphone className="w-5 h-5 pointer-events-none" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>Pair a new device</h2>
                <p className={subtitleClasses}>Scan from your other device.</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtn}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {/* QR */}
          <div className="flex flex-col items-center gap-4">
            {qrDataUrl ? (
              <div className={`p-3 rounded-xl bg-white ${expired ? 'opacity-30' : ''}`}>
                <img src={qrDataUrl} alt="Pair QR code" width={240} height={240} draggable={false} />
              </div>
            ) : (
              <div className="w-[264px] h-[264px] flex items-center justify-center">
                <RefreshCw className={`w-6 h-6 animate-spin pointer-events-none ${subtitleClasses}`} />
              </div>
            )}

            {/* Pair code */}
            {pairCode && !expired && (
              <div className="text-center">
                <p className={`text-[10px] uppercase tracking-wider ${subtitleClasses}`}>Pair code</p>
                <p className={`text-3xl tracking-widest mt-1 ${codeFontClasses} ${titleClasses}`}>
                  {pairCode.slice(0, 3)} {pairCode.slice(3)}
                </p>
                <p className={`text-xs mt-2 ${subtitleClasses}`}>
                  Expires in {secondsLeft}s
                </p>
              </div>
            )}

            {expired && (
              <div className="text-center space-y-2">
                <p className="text-sm text-yellow-400">Pair window expired</p>
                <button
                  onClick={generate}
                  className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${secondaryBtn}`}
                >
                  Generate new code
                </button>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className={`p-3 rounded-lg ${cardClasses} space-y-1`}>
            <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
              <strong className={titleClasses}>1.</strong> On your other device, open Dash → Settings → Sync → "I have another device".
            </p>
            <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
              <strong className={titleClasses}>2.</strong> Scan this QR (or paste the link) and enter the 6-digit code.
            </p>
          </div>

          {/* Copy link fallback */}
          {encryptedPacketB64 && !expired && (
            <button
              onClick={handleCopyLink}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${secondaryBtn}`}
            >
              {linkCopied ? <Check className="w-4 h-4 pointer-events-none" /> : <Copy className="w-4 h-4 pointer-events-none" />}
              {linkCopied ? 'Copied' : 'Copy pair link instead'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
