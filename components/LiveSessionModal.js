import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Shield, Copy, Check, QrCode, Users, Clock, Lock } from 'lucide-react'

const DURATION_OPTIONS = [
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '6 hours', value: 6 * 60 * 60 * 1000 },
  { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  { label: '1 week', value: 7 * 24 * 60 * 60 * 1000 },
  { label: 'No limit', value: null },
]

export default function LiveSessionModal ({ isOpen, onClose, onStartSession, theme, participants = 0 }) {
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [started, setStarted] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [showQR, setShowQR] = useState(false)
  const [duration, setDuration] = useState(DURATION_OPTIONS[0].value)
  const [sessionPassword, setSessionPassword] = useState('')
  const copiedTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setLink('')
      setCopied(false)
      setStarted(false)
      setQrDataUrl(null)
      setShowQR(false)
      setDuration(DURATION_OPTIONS[0].value)
      setSessionPassword('')
    }
  }, [isOpen])

  const handleStart = useCallback(async () => {
    const { createSessionCredentials, buildSessionLink } = await import('@/lib/liveSession')
    const { roomId, key } = createSessionCredentials()
    const sessionLink = buildSessionLink(roomId, key)
    setLink(sessionLink)
    setStarted(true)
    onStartSession({ roomId, keyStr: key, link: sessionLink, duration, sessionPassword: sessionPassword || null })
  }, [onStartSession, duration, sessionPassword])

  const handleCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleShowQR = async () => {
    if (!link) return
    if (qrDataUrl) {
      setShowQR(!showQR)
      return
    }
    try {
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(link, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
      setShowQR(true)
    } catch { /* QR library not available */ }
  }

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      <div
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
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
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  Start Live Session
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}
                `}>
                  Collaborate on this note in real-time
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
        <div className="p-6">
          {/* Privacy Info */}
          <div className={`
            flex items-start gap-3 p-4 rounded-xl mb-4
            ${isFallout
              ? 'bg-green-500/10 border border-green-500/20'
              : isDarkBlue
                ? 'bg-blue-500/5 border border-blue-500/10'
                : isDark
                  ? 'bg-blue-500/5 border border-blue-500/10'
                  : 'bg-blue-50 border border-blue-100'
            }
          `}>
            <Shield className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'
              }`}>
                End-to-end encrypted
              </p>
              <p className={`text-xs mt-1 leading-relaxed ${
                isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'
              }`}>
                The server never sees your content. All data is encrypted on your device before being sent. When the session ends, you keep the editable original — guests keep a read-only copy. To edit again, they'll need to request access.
              </p>
            </div>
          </div>

          {!started ? (
            <div>
              {/* Duration Picker */}
              <div className="mb-4">
                <label className={`flex items-center gap-1.5 text-sm font-medium mb-2 ${
                  isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  Session duration
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setDuration(opt.value)}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm transition-colors
                        ${duration === opt.value
                          ? isFallout
                            ? 'bg-green-500/30 border border-green-500/60 text-green-400 font-mono'
                            : isDarkBlue
                              ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400'
                              : isDark
                                ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400'
                                : 'bg-blue-100 border border-blue-300 text-blue-700'
                          : isFallout
                            ? 'bg-gray-800 border border-green-500/20 text-green-500/70 hover:border-green-500/40 font-mono'
                            : isDarkBlue
                              ? 'bg-[#0c1017] border border-[#1c2438] text-[#5d6b88] hover:border-[#2a3555]'
                              : isDark
                                ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#8e8e8e] hover:border-[#555]'
                                : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-300'
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className={`text-xs mt-2 ${
                  isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
                }`}>
                  {duration ? 'Session auto-ends to protect your encryption key' : 'Session stays open until manually ended'}
                </p>
              </div>

              {/* Session Password (optional) */}
              <div className="mb-4">
                <label className={`flex items-center gap-1.5 text-sm font-medium mb-2 ${
                  isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'
                }`}>
                  <Lock className="w-3.5 h-3.5" />
                  Session password
                  <span className={`font-normal ${
                    isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
                  }`}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={sessionPassword}
                  onChange={(e) => setSessionPassword(e.target.value)}
                  placeholder="Leave empty for open access"
                  className={`
                    w-full px-3 py-2 rounded-lg text-sm transition-colors outline-none
                    ${isFallout
                      ? 'bg-gray-800 border border-green-500/30 text-green-400 placeholder-green-700 font-mono focus:border-green-500/60'
                      : isDarkBlue
                        ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#3d4f6f] focus:border-[#2a3555]'
                        : isDark
                          ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] placeholder-[#555] focus:border-[#555]'
                          : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-gray-300'
                    }
                  `}
                />
                <p className={`text-xs mt-1.5 ${
                  isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
                }`}>
                  Guests will need to enter this password to join
                </p>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStart}
                className={`
                  w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2
                  ${isFallout
                    ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                    : isDarkBlue
                      ? 'bg-blue-500 text-white hover:bg-blue-400'
                      : isDark
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                  }
                `}
              >
                <Users className="w-4 h-4" />
                Start Live Session
              </button>
            </div>
          ) : (
            /* Session Started — Show Link */
            <div>
              {/* Session Link */}
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-2 ${
                  isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'
                }`}>
                  Share this link
                </label>
                <div className="flex gap-2">
                  <div className={`
                    flex-1 px-3 py-2.5 text-xs rounded-xl overflow-hidden break-all select-all leading-relaxed
                    ${isFallout
                      ? 'bg-gray-800 border border-green-500/40 text-green-400 font-mono'
                      : isDarkBlue
                        ? 'bg-[#0c1017] border border-[#1c2438] text-[#8b99b5]'
                        : isDark
                          ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0]'
                          : 'bg-gray-50 border border-gray-200 text-gray-600'
                    }
                  `}>
                    {link}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`
                      flex-shrink-0 p-2.5 rounded-xl transition-colors
                      ${isFallout
                        ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700'
                        : isDarkBlue
                          ? 'bg-[#0c1017] border border-[#1c2438] text-[#8b99b5] hover:bg-[#1a2035]'
                          : isDark
                            ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
                            : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }
                    `}
                    title="Copy link"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* QR Code Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleShowQR}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors
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
                  <QrCode className="w-4 h-4" />
                  {showQR ? 'Hide QR' : 'Show QR Code'}
                </button>
              </div>

              {/* QR Code */}
              {showQR && qrDataUrl && (
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-3 rounded-xl">
                    <img src={qrDataUrl} alt="Session QR Code" className="w-[180px] h-[180px]" />
                  </div>
                </div>
              )}

              {/* Info */}
              <div className={`flex items-center gap-2 text-xs ${
                isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
              }`}>
                {participants > 1 ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className={isFallout ? 'text-green-400' : isDarkBlue || isDark ? 'text-blue-400' : 'text-blue-600'}>
                      {participants} participant{participants !== 2 ? 's' : ''} connected
                    </span>
                  </>
                ) : (
                  <>
                    <Users className="w-3.5 h-3.5" />
                    <span>Waiting for someone to join...</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Cancel / Close */}
          {started && (
            <div className="flex gap-3 mt-4">
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
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
