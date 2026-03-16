import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Lock, Link2, QrCode, Share2, Check, AlertTriangle, Shield, Copy } from 'lucide-react'

export default function ShareModal ({ isOpen, onClose, noteContent, noteTitle, theme }) {
  const [shareLink, setShareLink] = useState('')
  const [shareLinkProtected, setShareLinkProtected] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(null)
  const [error, setError] = useState(null)
  const [tooLarge, setTooLarge] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [passwordProtected, setPasswordProtected] = useState(false)
  const copiedTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const encrypt = useCallback(async () => {
    if (!noteContent) return
    if (typeof window !== 'undefined' && window.__DASH_DEBUG) {
      console.log('[share] encrypting — title:', noteTitle, 'blocks:', noteContent?.blocks?.length, 'types:', noteContent?.blocks?.map(b => b.type).join(', '))
      if (noteContent?.blocks?.[0]) console.log('[share] first block:', JSON.stringify(noteContent.blocks[0]).slice(0, 200))
    }
    setLoading(true)
    setError(null)
    setTooLarge(false)
    try {
      const { generateShareLink } = await import('@/utils/shareUtils')
      const result = await generateShareLink(noteContent, noteTitle)
      if (result.tooLarge) {
        setTooLarge(true)
      } else {
        setShareLink(result.link)
        setShareLinkProtected(result.linkProtected)
        setPassphrase(result.passphrase)
      }
    } catch (err) {
      setError('Failed to encrypt note: ' + err.message)
    }
    setLoading(false)
  }, [noteContent, noteTitle])

  useEffect(() => {
    if (isOpen && noteContent) {
      encrypt()
      setCopied(null)
      setQrDataUrl(null)
      setShowQR(false)
      setShareLink('')
      setShareLinkProtected('')
      setPassphrase('')
      setPasswordProtected(false)
    }
  }, [isOpen, noteContent, encrypt])

  const activeLink = passwordProtected ? shareLinkProtected : shareLink

  const setCopiedWithTimer = (value) => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    setCopied(value)
    copiedTimerRef.current = setTimeout(() => setCopied(null), 2000)
  }

  const handleCopyLink = async () => {
    if (!activeLink) return
    try {
      await navigator.clipboard.writeText(activeLink)
      setCopiedWithTimer('link')
    } catch { /* ignore */ }
  }

  const handleCopyPassword = async () => {
    if (!passphrase) return
    try {
      await navigator.clipboard.writeText(passphrase)
      setCopiedWithTimer('password')
    } catch { /* ignore */ }
  }

  const handleShare = async () => {
    if (!activeLink) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: noteTitle || 'Encrypted Note',
          url: activeLink
        })
      } else {
        handleCopyLink()
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        handleCopyLink()
      }
    }
  }

  // QR only available in password-protected mode (encodes just the password)
  const handleToggleQR = async () => {
    if (showQR) { setShowQR(false); return }
    setShowQR(true)
    if (qrDataUrl) return
    try {
      const { generateShareQR } = await import('@/utils/shareUtils')
      const dataUrl = await generateShareQR(passphrase)
      setQrDataUrl(dataUrl)
    } catch (err) {
      setError('Failed to generate QR: ' + err.message)
    }
  }

  const handleTogglePasswordProtected = () => {
    setPasswordProtected(!passwordProtected)
    setCopied(null)
    setShowQR(false)
    setQrDataUrl(null)
  }

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const containerClass = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue
      ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark
        ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white border border-gray-200 shadow-2xl'

  const textClass = isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-gray-900'
  const subtextClass = isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'
  const inputClass = isFallout
    ? 'bg-gray-800 border-green-500/30 text-green-400'
    : isDarkBlue
      ? 'bg-[#0c1017] border-[#1c2438] text-[#e0e6f0]'
      : isDark
        ? 'bg-[#0d0d0d] border-[#3a3a3a] text-[#ececec]'
        : 'bg-gray-50 border-gray-200 text-gray-900'

  const btnClass = isFallout
    ? 'bg-green-900/40 border border-green-500/30 text-green-400 hover:bg-green-900/60'
    : isDarkBlue
      ? 'bg-[#1a2035] border border-[#1c2438] text-[#e0e6f0] hover:bg-[#232b42]'
      : isDark
        ? 'bg-[#262626] border border-[#3a3a3a] text-[#ececec] hover:bg-[#333]'
        : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'

  const primaryBtnClass = isFallout
    ? 'bg-green-600 text-black hover:bg-green-500'
    : 'bg-blue-600 text-white hover:bg-blue-500'

  const cardClass = isFallout ? 'bg-gray-800/60 border border-green-500/20' : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438]' : isDark ? 'bg-[#0d0d0d] border border-[#2a2a2a]' : 'bg-gray-50 border border-gray-200'

  const ready = !loading && !error && !tooLarge && shareLink

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      <div style={{ animation: 'dash-modal-in 150ms ease-out forwards' }} className={`relative w-full max-w-md rounded-2xl p-6 max-h-[85vh] overflow-y-auto ${containerClass}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isFallout ? 'bg-green-900/40' : isDarkBlue ? 'bg-blue-900/20' : isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
              <Lock className={`h-5 w-5 ${isFallout ? 'text-green-400' : 'text-blue-500'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${textClass}`}>Share Note</h2>
              <p className={`text-xs ${subtextClass}`}>End-to-end encrypted link</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${btnClass}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className={`text-center py-8 ${subtextClass}`}>Encrypting...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : tooLarge ? (
          <div className={`text-center py-6 ${subtextClass}`}>
            <AlertTriangle className={`h-8 w-8 mx-auto mb-3 ${isFallout ? 'text-green-500' : 'text-amber-500'}`} />
            <p className={`text-sm font-medium mb-1 ${textClass}`}>Note too large for link sharing</p>
            <p className="text-xs">This note contains too much data (likely images) to share via link. Try removing images or use a file export instead.</p>
          </div>
        ) : (
          <>
            {/* Link display */}
            <div className={`flex items-center gap-2 p-2.5 rounded-xl mb-3 ${cardClass}`}>
              <Link2 className={`h-4 w-4 flex-shrink-0 ${subtextClass}`} />
              <div className={`flex-1 text-xs font-mono truncate select-all ${inputClass.split(' ').find(c => c.startsWith('text-')) || textClass}`}>
                {activeLink}
              </div>
              <button
                onClick={handleCopyLink}
                disabled={!ready}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium disabled:opacity-40 ${
                  copied === 'link' ? primaryBtnClass : btnClass
                }`}
              >
                {copied === 'link' ? <Check className="h-3.5 w-3.5" style={{ animation: 'dash-copy-pop 200ms ease-out' }} /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                disabled={!ready}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl transition-colors disabled:opacity-40 ${primaryBtnClass}`}
              >
                <Share2 className="h-4 w-4" />
                <span className="text-sm font-medium">Share</span>
              </button>

              <button
                onClick={handleCopyLink}
                disabled={!ready}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl transition-colors disabled:opacity-40 ${
                  copied === 'link' ? primaryBtnClass : btnClass
                }`}
              >
                {copied === 'link' ? <Check className="h-4 w-4" style={{ animation: 'dash-copy-pop 200ms ease-out' }} /> : <Copy className="h-4 w-4" />}
                <span className={`text-sm font-medium ${copied === 'link' ? '' : textClass}`}>
                  {copied === 'link' ? 'Copied!' : 'Copy Link'}
                </span>
              </button>
            </div>

            {/* Password protection section */}
            <div className={`mt-4 p-3 rounded-xl transition-all duration-200 ${
              passwordProtected
                ? (isFallout
                    ? 'bg-green-900/20 border border-green-500/30'
                    : isDarkBlue
                      ? 'bg-blue-500/5 border border-blue-500/20'
                      : isDark
                        ? 'bg-blue-500/5 border border-blue-500/20'
                        : 'bg-blue-50/50 border border-blue-200')
                : (isFallout
                    ? 'border border-green-500/10'
                    : isDarkBlue
                      ? 'border border-[#1c2438]'
                      : isDark
                        ? 'border border-[#2a2a2a]'
                        : 'border border-gray-200')
            }`}>
              <button
                onClick={handleTogglePasswordProtected}
                className="w-full flex items-center gap-2.5 rounded-lg transition-colors text-left"
              >
                <Shield className={`h-4.5 w-4.5 flex-shrink-0 ${passwordProtected ? (isFallout ? 'text-green-400' : 'text-blue-500') : subtextClass}`} />
                <span className={`text-sm font-medium ${passwordProtected ? textClass : subtextClass}`}>
                  Add Password Protection
                </span>
                <div className={`ml-auto w-9 h-5 rounded-full transition-colors flex items-center ${passwordProtected ? (isFallout ? 'bg-green-600' : 'bg-blue-600') : (isFallout ? 'bg-green-900/60 border border-green-500/30' : isDark || isDarkBlue ? 'bg-[#333]' : 'bg-gray-300')}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${passwordProtected ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Password display + QR when enabled */}
              {passwordProtected && passphrase && (
                <div className={`mt-3 p-3 rounded-xl ${isFallout ? 'bg-green-900/30 border border-green-500/20' : isDarkBlue ? 'bg-blue-500/5 border border-blue-500/10' : isDark ? 'bg-blue-500/5 border border-blue-500/10' : 'bg-white border border-blue-100'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className={`text-sm font-medium ${subtextClass}`}>Password</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleToggleQR}
                        className={`px-2 py-1 rounded-md transition-colors text-xs font-medium ${
                          showQR ? primaryBtnClass : btnClass
                        }`}
                      >
                        <QrCode className="h-3 w-3 inline mr-1" />
                        QR
                      </button>
                      <button
                        onClick={handleCopyPassword}
                        className={`px-2 py-1 rounded-md transition-colors text-xs font-medium ${
                          copied === 'password' ? primaryBtnClass : btnClass
                        }`}
                      >
                        {copied === 'password' ? <Check className="h-3 w-3 inline mr-1" style={{ animation: 'dash-copy-pop 200ms ease-out' }} /> : <Copy className="h-3 w-3 inline mr-1" />}
                        {copied === 'password' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div className={`px-3 py-2 rounded-lg border text-center text-lg font-mono tracking-wide select-all ${inputClass}`}>
                    {passphrase}
                  </div>
                  <p className={`text-xs mt-1.5 ${subtextClass}`}>
                    Send this password via a different channel for best security.
                  </p>

                  {/* QR code for the password */}
                  {showQR && (
                    <div className="text-center mt-3 pt-3 border-t border-current/10">
                      {qrDataUrl ? (
                        <>
                          <img src={qrDataUrl} alt="Password QR" className="mx-auto rounded-lg" style={{ width: 180, height: 180 }} />
                          <p className={`mt-1.5 text-xs ${subtextClass}`}>
                            Scan to get the password
                          </p>
                        </>
                      ) : (
                        <p className={`py-4 text-sm ${subtextClass}`}>Generating...</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className={`text-xs mt-3 text-center ${subtextClass}`}>
              {passwordProtected
                ? 'The link alone cannot decrypt the note. The password is required.'
                : 'Only people with this link can read the note. Nothing is stored on any server.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
