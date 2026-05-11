import React, { useState, useEffect, useRef } from 'react'
import { Smartphone, X, KeyRound, Check, AlertCircle, Lock } from 'lucide-react'
import { decryptPairPacket } from '../lib/syncCrypto.js'

// QR camera scan disabled in build 53: @capacitor-mlkit/barcode-scanning
// pulls GoogleToolboxForMac 2.3.2 transitively, which lacks the privacy
// manifest Apple now requires (ITMS-91061). Plugin removed pending a
// path to a privacy-compliant GoogleMLKit. Manual pair link paste still
// works on every platform.
const QR_SCAN_ENABLED = false

/**
 * Guest-side pair flow.
 *
 * New device either scans a QR code with the camera (Capacitor native) or
 * pastes the encrypted pair link. Plus the 6-digit code. We decrypt the
 * packet, hand the resulting vault key + metadata back to the caller via
 * `onPaired`.
 *
 * Caller is responsible for:
 *   - Persisting the new vault metadata (with this device's freshly-minted
 *     deviceId added to pairedDevices).
 *   - Calling /sync/vault/register on the relay.
 *   - Triggering an initial pull.
 */

export default function AcceptPairModal ({
  isOpen,
  onClose,
  onPaired,    // ({ vaultPacket, pairCode }) => void — called on successful decrypt
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [pairLink, setPairLink] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [scanning, setScanning] = useState(false)
  const codeInputRef = useRef(null)

  // QR scan disabled — see QR_SCAN_ENABLED note above. Manual link paste only.
  const scanQR = async () => {}

  useEffect(() => {
    if (isOpen) {
      setPairLink('')
      setPairCode('')
      setError(null)
      setBusy(false)
      setSuccess(false)
      setScanning(false)
    }
  }, [isOpen])

  const handlePair = async () => {
    setError(null)
    if (!pairLink) {
      setError('Paste the pair link from your other device.')
      return
    }
    if (!/^\d{6}$/.test(pairCode)) {
      setError('Pair code must be 6 digits.')
      return
    }
    setBusy(true)
    try {
      // Strip the dash-pair: prefix if present
      let b64 = pairLink.trim()
      if (b64.startsWith('dash-pair:')) b64 = b64.slice('dash-pair:'.length)
      // Restore base64url to base64
      const standard = b64.replace(/-/g, '+').replace(/_/g, '/')
      const padding = '='.repeat((4 - standard.length % 4) % 4)
      const wireBytes = (() => {
        const bin = atob(standard + padding)
        const out = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
        return out
      })()
      const wireStr = new TextDecoder().decode(wireBytes)
      const encryptedPacket = JSON.parse(wireStr)
      // Diagnostic: log what we received + what build is decoding it.
      // Without this, "unsupported schema version 2" gives no clue
      // whether (a) the desktop produced a v2 packet OR (b) this iOS
      // build's decoder doesn't know v2 (stale cache).
      console.log('[pair] decoder build', (typeof window !== 'undefined' && window.__DASH_BUILD__) || 'unknown')
      console.log('[pair] packet shape', {
        v: encryptedPacket?.v,
        cipher: encryptedPacket?.cipher,
        saltType: typeof encryptedPacket?.salt,
        ivType: typeof encryptedPacket?.iv,
        dataType: typeof encryptedPacket?.data
      })
      const decryptedPacket = await decryptPairPacket(encryptedPacket, pairCode)
      // Sanity check: decryptedPacket must have vaultId, vaultKey, relayUrl
      if (!decryptedPacket.vaultId || !Array.isArray(decryptedPacket.vaultKey) || !decryptedPacket.relayUrl) {
        throw new Error('Decrypted packet is malformed.')
      }
      setSuccess(true)
      // Brief success animation, then dispatch
      setTimeout(() => {
        onPaired?.({ vaultPacket: decryptedPacket, pairCode })
      }, 600)
    } catch (err) {
      console.error('AcceptPairModal: decrypt failed', err)
      // Surface diagnostics in the error message itself — Safari Web
      // Inspector isn't always available on the device that's failing,
      // and screenshots of the error in the modal are the only feedback
      // path. Including build marker lets us see if a stale-cache iOS
      // is running an old bundle.
      const buildMarker = (typeof window !== 'undefined' && window.__DASH_BUILD__) || 'unknown'
      const baseMsg = /wrong pair code/i.test(err.message)
        ? 'That code didn\'t work. Double-check the digits.'
        : err.message
      setError(`${baseMsg} (build ${buildMarker})`)
    } finally {
      setBusy(false)
    }
  }

  if (!isOpen) return null

  // Theme classes (matches PairDeviceModal)
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
                <KeyRound className="w-5 h-5 pointer-events-none" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>Enter a sync code</h2>
                <p className={subtitleClasses}>Use the code shown on your other Dash to connect.</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtn}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${iconContainerClasses}`}>
                <Check className="w-7 h-7 pointer-events-none" />
              </div>
              <p className={`text-base font-semibold ${titleClasses}`}>Paired</p>
              <p className={subtitleClasses}>Setting up sync…</p>
              <p className={`text-xs leading-relaxed mt-2 max-w-xs ${subtitleClasses}`}>
                The first sync can take a few minutes — your existing notes
                are being encrypted and uploaded. Sync runs in the background;
                you can keep using the app.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
                  <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              {/* Scan QR — gated off in build 12 pending CocoaPods env fix. */}
              {QR_SCAN_ENABLED && (typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()) && (
                <button
                  onClick={scanQR}
                  disabled={scanning || busy}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 ${secondaryBtn}`}
                >
                  {scanning ? 'Scanning…' : 'Scan QR code'}
                </button>
              )}

              {/* Pair link input */}
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${subtitleClasses}`}>Pair link</label>
                <textarea
                  value={pairLink}
                  onChange={(e) => setPairLink(e.target.value)}
                  placeholder="Paste the dash-pair: link from your other device"
                  rows={3}
                  className={`w-full px-4 py-3 text-sm rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 resize-none ${inputClasses}`}
                />
                <p className={`text-[11px] mt-1 ${subtitleClasses}`}>
                  Tap "Copy pair link" on your other device, then paste here. Or scan the QR if it's on screen.
                </p>
              </div>

              {/* Pair code input */}
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${subtitleClasses}`}>6-digit pair code</label>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={pairCode}
                  onChange={(e) => setPairCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className={`w-full px-4 py-3 text-2xl tracking-widest font-mono rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 text-center ${inputClasses}`}
                />
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400 pointer-events-none" />
                <p className="text-[11px] leading-relaxed text-blue-400">
                  The pair link is encrypted with the code. Only this device + the device that generated it ever see your vault key.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium ${secondaryBtn}`}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePair}
                  disabled={busy || !pairLink || pairCode.length !== 6}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 ${primaryBtn}`}
                >
                  {busy ? 'Decrypting…' : 'Connect'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
