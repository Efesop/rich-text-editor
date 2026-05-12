import React, { useState, useEffect, useCallback } from 'react'
import {
  Cloud,
  CloudOff,
  X,
  Plus,
  RefreshCw,
  Check,
  AlertCircle,
  Smartphone,
  Laptop,
  Monitor,
  Trash2
} from 'lucide-react'
import { useEntitlement } from '@/hooks/useEntitlement'
import PaywallModal from './PaywallModal'
import SignInModal from './SignInModal'
import { signOut as identitySignOut, getEmail as getIdentityEmail } from '@/lib/identity'
import { getMacEntitlementEmail, setMacEntitlementEmail } from '@/lib/entitlementId'

/**
 * Sync settings panel — opens from main Settings, controls all sync behavior.
 *
 * Matches Dash's modal pattern (rounded-2xl, backdrop blur, four-theme styling)
 * — see STYLE_GUIDE.md and AppLockSettingsModal.js for reference.
 *
 * Stages:
 *   - Disabled (default) → "Enable sync" CTA
 *   - Enabling → choose pair-method (this device first OR pair to existing)
 *   - Enabled, locked → "Unlock vault" prompt
 *   - Enabled, unlocked → device list, status, controls
 */

const formatRelativeTime = (ts) => {
  if (!ts) return 'Never'
  const ms = Date.now() - ts
  if (ms < 5000) return 'Just now'
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

const STAGE_LABELS = {
  idle: 'Synced',
  queued: 'Pending',
  flushing: 'Syncing…',
  pulling: 'Receiving…',
  'retry-backoff': 'Retrying',
  'rate-limited': 'Rate limited',
  paused: 'Paused',
  error: 'Error'
}

const STAGE_ICON = {
  idle: Check,
  queued: RefreshCw,
  flushing: RefreshCw,
  pulling: RefreshCw,
  'retry-backoff': RefreshCw,
  'rate-limited': AlertCircle,
  paused: CloudOff,
  error: AlertCircle
}

export default function SyncSettingsPanel ({
  isOpen,
  onClose,
  status,
  relayConfigured = true, // false = open-source build, no relay URL baked in
  onEnableSync,
  onDisableSync,
  onUnlock,
  onLock, // kept for back-compat — Lock vault button removed from UI; auto-pause via app-lock still works
  onPairNewDevice,    // → opens PairDeviceModal (host side)
  onAcceptPair,       // → opens AcceptPairModal (guest side)
  onSyncNow,
  onPurgeCloud,       // requires confirm
  onRevokeDevice,
  fetchVaultUsage,    // returns { totalBytes, deviceCount, ... }
  fetchQuota,         // returns { lifetimeUsed, lifetimeLimit, ... }
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [confirmStop, setConfirmStop] = useState(false) // unified stop flow
  const [usage, setUsage] = useState(null)
  const [quota, setQuota] = useState(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const { hasSync, signedInEmail, refresh: refreshEntitlement } = useEntitlement()

  // Cross-platform entitlement gate (v1.5 Option C).
  //
  // iOS: native paywall via PaywallModal (RC SDK in-app purchase).
  // Mac/PWA/Linux/Windows: SignInModal (to prove email) + redirect to
  //   dashnote.io/subscribe for the actual Stripe checkout.
  //
  // hasSync comes from useEntitlement which resolves both iOS (RC SDK)
  // and non-iOS (server /auth/me) paths.
  const isNativeIOS = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() === 'ios'

  const openSubscribePage = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = 'https://dashnote.io/subscribe'
    // Electron: prefer shell.openExternal so it opens in the user's
    // default browser instead of the app's WKWebView/Chromium.
    if (window.electron?.openExternal) {
      try { window.electron.openExternal(url); return } catch {}
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const gate = useCallback((fn) => () => {
    if (hasSync) { fn?.(); return }
    if (isNativeIOS) {
      // iOS: in-app purchase. PaywallModal handles RC flow.
      setShowPaywall(true)
    } else {
      // Mac/PWA/Linux: sign in first so we can detect an existing
      // subscription. If no entitlement after sign-in, the subscribe
      // CTA in the disabled state will route them to dashnote.io.
      setShowSignIn(true)
    }
  }, [hasSync, isNativeIOS])
  const gatedEnableSync = useCallback(gate(onEnableSync), [gate, onEnableSync])
  const gatedAcceptPair = useCallback(gate(onAcceptPair), [gate, onAcceptPair])
  const gatedPairNewDevice = useCallback(gate(onPairNewDevice), [gate, onPairNewDevice])

  const handleSignOut = useCallback(async () => {
    try { await identitySignOut() } catch {}
    refreshEntitlement?.()
  }, [refreshEntitlement])

  const handleSignedIn = useCallback(async () => {
    setShowSignIn(false)
    await refreshEntitlement?.()
  }, [refreshEntitlement])

  useEffect(() => {
    if (!isOpen) return
    setConfirmStop(false)
    setUsage(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Fetch quota whenever the panel opens (one-shot; cheap, no auth needed).
  // Used by DisabledState to show "X of N sync setups used today" so users
  // get warned before hitting the per-IP lifetime limit.
  useEffect(() => {
    if (!isOpen || typeof fetchQuota !== 'function') return
    let cancelled = false
    fetchQuota().then(q => { if (!cancelled) setQuota(q) }).catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Poll vault usage while sync is enabled + unlocked. Bound to enabled +
  // unlocked deps so the interval shuts down the moment the user disables
  // sync — without that, the closed-over fetchVaultUsage keeps hitting
  // the (now-no-credentials) endpoint and spams the console.
  useEffect(() => {
    if (!isOpen) return
    if (!(status?.enabled && status?.unlocked && typeof fetchVaultUsage === 'function')) {
      // Clear stale usage (e.g. paired-devices list) when sync flips off so
      // the modal doesn't show an old device list after Stop sync.
      setUsage(null)
      return
    }
    let cancelled = false
    const refresh = () => {
      fetchVaultUsage().then(u => { if (!cancelled) setUsage(u) }).catch(() => {})
    }
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, status?.enabled, status?.unlocked])

  if (!isOpen) return null

  const StageIcon = STAGE_ICON[status?.stage] || Cloud

  // ── Theme classes ──
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
    : isDarkBlue
      ? 'text-[#e0e6f0]'
      : isDark
        ? 'text-white'
        : 'text-gray-900'

  const subtitleClasses = isFallout
    ? 'text-green-600 font-mono text-xs'
    : isDarkBlue
      ? 'text-[#8b99b5] text-xs'
      : isDark
        ? 'text-[#8e8e8e] text-xs'
        : 'text-gray-500 text-xs'

  const closeBtnClasses = isFallout
    ? 'text-green-600 hover:bg-green-900/30'
    : isDarkBlue
      ? 'text-[#8b99b5] hover:bg-[#232b42]'
      : isDark
        ? 'text-[#c0c0c0] hover:bg-[#2a2a2a]'
        : 'text-gray-500 hover:bg-gray-100'

  const iconContainerClasses = isFallout
    ? 'bg-green-500/20 border border-green-500/40 text-green-400'
    : isDarkBlue
      ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
      : isDark
        ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
        : 'bg-blue-50 border border-blue-100 text-blue-600'

  const sectionLabelClasses = isFallout
    ? 'text-green-600 font-mono text-[10px] uppercase tracking-wider'
    : isDarkBlue
      ? 'text-[#5d6b88] text-[10px] uppercase tracking-wider font-medium'
      : isDark
        ? 'text-[#8e8e8e] text-[10px] uppercase tracking-wider font-medium'
        : 'text-gray-400 text-[10px] uppercase tracking-wider font-medium'

  const cardClasses = isFallout
    ? 'bg-gray-800/50 border border-green-500/20'
    : isDarkBlue
      ? 'bg-[#0c1017] border border-[#1c2438]'
      : isDark
        ? 'bg-[#222] border border-[#3a3a3a]/40'
        : 'bg-gray-50 border border-gray-100'

  const primaryBtn = isFallout
    ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
    : isDarkBlue
      ? 'bg-blue-500 text-white hover:bg-blue-400'
      : isDark
        ? 'bg-blue-600 text-white hover:bg-blue-500'
        : 'bg-blue-600 text-white hover:bg-blue-700'

  const secondaryBtn = isFallout
    ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
    : isDarkBlue
      ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  const dangerBtn = isFallout
    ? 'bg-red-900/40 border border-red-500/40 text-red-400 hover:bg-red-900/60 font-mono'
    : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'

  const stageColor = (() => {
    if (status?.stage === 'error' || status?.stage === 'rate-limited') return 'text-red-400'
    if (status?.stage === 'flushing' || status?.stage === 'pulling' || status?.stage === 'queued') return 'text-blue-400'
    if (status?.stage === 'paused') return 'text-yellow-400'
    return isFallout ? 'text-green-400' : 'text-emerald-500'
  })()

  return (
    <>
    <PaywallModal
      isOpen={showPaywall}
      onClose={() => setShowPaywall(false)}
      onPurchased={() => { setShowPaywall(false); refreshEntitlement?.() }}
      onSignInExisting={() => { setShowPaywall(false); setShowSignIn(true) }}
      isDarkMode={isDark || isDarkBlue || isFallout}
    />
    <SignInModal
      isOpen={showSignIn}
      onClose={() => setShowSignIn(false)}
      onSignedIn={handleSignedIn}
      theme={theme}
      reason="Sign in to use sync. No password — we email you a 6-digit code."
    />
    <div className="dash-mobile-bottom-sheet fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />
      <div
        className={`transform relative w-full max-w-lg rounded-2xl overflow-hidden ${bgContainer}`}
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
      >
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${headerBorder}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconContainerClasses}`}>
                <Cloud className="w-5 h-5 pointer-events-none" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>Sync across devices</h2>
                <p className={subtitleClasses}>End-to-end encrypted. We can never read your notes.</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtnClasses}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {!relayConfigured && (
            <RelayMissingState
              titleClasses={titleClasses}
              subtitleClasses={subtitleClasses}
              cardClasses={cardClasses}
              primaryBtn={primaryBtn}
              secondaryBtn={secondaryBtn}
            />
          )}
          {relayConfigured && !status?.enabled && (
            <DisabledState
              isFallout={isFallout}
              titleClasses={titleClasses}
              subtitleClasses={subtitleClasses}
              cardClasses={cardClasses}
              primaryBtn={primaryBtn}
              secondaryBtn={secondaryBtn}
              onEnableSync={gatedEnableSync}
              onAcceptPair={gatedAcceptPair}
              quota={quota}
              hasSync={hasSync}
              signedInEmail={signedInEmail}
              isNativeIOS={isNativeIOS}
              onSubscribe={openSubscribePage}
              onOpenSignIn={() => setShowSignIn(true)}
              onSignOut={handleSignOut}
              onOpenPaywall={() => setShowPaywall(true)}
            />
          )}

          {relayConfigured && status?.enabled && !status?.unlocked && (
            <LockedState
              isFallout={isFallout}
              titleClasses={titleClasses}
              subtitleClasses={subtitleClasses}
              cardClasses={cardClasses}
              primaryBtn={primaryBtn}
              onUnlock={onUnlock}
            />
          )}

          {relayConfigured && status?.enabled && status?.unlocked && (
            <UnlockedState
              status={status}
              usage={usage}
              StageIcon={StageIcon}
              stageColor={stageColor}
              titleClasses={titleClasses}
              subtitleClasses={subtitleClasses}
              sectionLabelClasses={sectionLabelClasses}
              cardClasses={cardClasses}
              primaryBtn={primaryBtn}
              secondaryBtn={secondaryBtn}
              dangerBtn={dangerBtn}
              isFallout={isFallout}
              onSyncNow={onSyncNow}
              onPairNewDevice={gatedPairNewDevice}
              onRevokeDevice={onRevokeDevice}
              onDisableSync={onDisableSync}
              confirmStop={confirmStop}
              setConfirmStop={setConfirmStop}
            />
          )}
        </div>
      </div>
    </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components — one per stage to keep the main render clean
// ────────────────────────────────────────────────────────────────────────────

function DisabledState ({
  isFallout, titleClasses, subtitleClasses, cardClasses, primaryBtn, secondaryBtn,
  onEnableSync, onAcceptPair, quota,
  // v1.5 Option C — entitlement + identity props
  hasSync, signedInEmail, isNativeIOS, onSubscribe, onOpenSignIn, onSignOut, onOpenPaywall
}) {
  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-xl ${cardClasses}`}>
        <h3 className={`text-sm font-semibold mb-2 ${titleClasses}`}>How sync works</h3>
        <ul className={`text-xs space-y-1.5 ${subtitleClasses.replace('text-xs', '')} text-xs leading-relaxed`}>
          <li className="flex items-start gap-2"><span>•</span><span>Notes encrypted on your device with a key only you have.</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>Server stores opaque ciphertext — never sees titles, content, or filenames.</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>Pair devices with a 6-digit code.</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>500 MB included. Auto-syncs after each save.</span></li>
        </ul>
      </div>

      {/* ── Account / entitlement panel ───────────────────────────── */}
      {!isNativeIOS && (
        <AccountPanel
          hasSync={hasSync}
          signedInEmail={signedInEmail}
          subtitleClasses={subtitleClasses}
          titleClasses={titleClasses}
          cardClasses={cardClasses}
          primaryBtn={primaryBtn}
          secondaryBtn={secondaryBtn}
          onSubscribe={onSubscribe}
          onOpenSignIn={onOpenSignIn}
          onSignOut={onSignOut}
        />
      )}

      <div className="space-y-2.5">
        <button
          onClick={onEnableSync}
          className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 ${primaryBtn}`}
        >
          {isFallout ? 'INITIALIZE VAULT' : 'Sync your notes'}
        </button>
        <button
          onClick={onAcceptPair}
          className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 ${secondaryBtn}`}
        >
          {isFallout ? 'JOIN EXISTING VAULT' : 'Enter a sync code'}
        </button>
        {isNativeIOS && !hasSync && (
          <button
            onClick={onOpenPaywall}
            className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 ${secondaryBtn}`}
          >
            See subscription options
          </button>
        )}
        <p className={`text-[11px] text-center ${subtitleClasses}`}>
          Already have Dash on another device? Use the code from there.
        </p>
      </div>

      <QuotaBadge quota={quota} subtitleClasses={subtitleClasses} cardClasses={cardClasses} titleClasses={titleClasses} />

      <p className={`text-[11px] leading-relaxed ${subtitleClasses}`}>
        Sync is opt-in. Your existing notes never leave this device until you turn it on. If you lose all your devices, you can restore from a local backup file (see Backup settings).
      </p>
    </div>
  )
}

// Renders the sign-in / subscribe state above the sync buttons on
// non-iOS platforms. iOS keeps using PaywallModal for in-app purchase.
function AccountPanel ({ hasSync, signedInEmail, subtitleClasses, titleClasses, cardClasses, primaryBtn, secondaryBtn, onSubscribe, onOpenSignIn, onSignOut }) {
  if (!signedInEmail) {
    return (
      <div className={`p-4 rounded-xl ${cardClasses} space-y-3`}>
        <h3 className={`text-sm font-semibold ${titleClasses}`}>Sync requires a subscription</h3>
        <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
          $4.99/mo or $47.99/yr (20% off). 7-day free trial. Cancel anytime. Existing subscribers — sign in.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSubscribe} className={`px-3 py-2 rounded-lg text-sm font-medium ${primaryBtn}`}>
            Subscribe
          </button>
          <button onClick={onOpenSignIn} className={`px-3 py-2 rounded-lg text-sm font-medium ${secondaryBtn}`}>
            Sign in
          </button>
        </div>
      </div>
    )
  }
  // Signed in but no entitlement — must subscribe.
  if (!hasSync) {
    return (
      <div className={`p-4 rounded-xl ${cardClasses} space-y-3`}>
        <h3 className={`text-sm font-semibold ${titleClasses}`}>No active subscription</h3>
        <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
          Signed in as <strong>{signedInEmail}</strong>, but we don't see a Dash Sync subscription on this email.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSubscribe} className={`px-3 py-2 rounded-lg text-sm font-medium ${primaryBtn}`}>
            Subscribe
          </button>
          <button onClick={onSignOut} className={`px-3 py-2 rounded-lg text-sm font-medium ${secondaryBtn}`}>
            Sign out
          </button>
        </div>
      </div>
    )
  }
  // Signed in + entitled.
  return (
    <div className={`p-3 rounded-xl ${cardClasses} flex items-center justify-between gap-3`}>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${subtitleClasses}`}>Signed in</p>
        <p className={`text-sm truncate ${titleClasses}`}>{signedInEmail}</p>
      </div>
      <button onClick={onSignOut} className={`px-3 py-2 rounded-lg text-xs font-medium ${secondaryBtn}`}>
        Sign out
      </button>
    </div>
  )
}

// IP-bucketed quota indicator. Hidden if quota fetch failed (older relay
// deploy without the /sync/vault/quota endpoint) or limits aren't approached.
function QuotaBadge ({ quota, subtitleClasses, cardClasses, titleClasses }) {
  if (!quota || typeof quota.lifetimeUsed !== 'number' || typeof quota.lifetimeLimit !== 'number') return null
  const used = quota.lifetimeUsed
  const max = quota.lifetimeLimit
  const remaining = Math.max(0, max - used)
  const warn = used >= Math.max(1, Math.floor(max * 0.8))
  const reached = remaining === 0
  const tone = reached
    ? 'border-red-500/40 text-red-400'
    : warn
      ? 'border-yellow-500/40 text-yellow-400'
      : ''
  return (
    <div className={`px-3 py-2 rounded-lg border text-[11px] ${cardClasses} ${tone}`}>
      <span className={!reached && !warn ? subtitleClasses : ''}>
        {reached
          ? `Sync setup limit reached (${used} of ${max} used). Try again later.`
          : `${used} of ${max} sync setups used on this network${warn ? ' — running low' : ''}.`}
      </span>
    </div>
  )
}

function LockedState ({ isFallout, titleClasses, subtitleClasses, cardClasses, primaryBtn, onUnlock }) {
  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-xl ${cardClasses}`}>
        <h3 className={`text-sm font-semibold mb-1 ${titleClasses}`}>Vault locked</h3>
        <p className={subtitleClasses}>Sync is paused while the app is locked. Unlock to resume.</p>
      </div>
      <button
        onClick={onUnlock}
        className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 ${primaryBtn}`}
      >
        Unlock vault
      </button>
    </div>
  )
}

function UnlockedState ({
  status, usage, StageIcon, stageColor, titleClasses, subtitleClasses, sectionLabelClasses,
  cardClasses, primaryBtn, secondaryBtn, dangerBtn, isFallout,
  onSyncNow, onPairNewDevice, onRevokeDevice, onDisableSync,
  confirmStop, setConfirmStop
}) {
  const isAnimating = status.stage === 'flushing' || status.stage === 'pulling' || status.stage === 'queued'
  const hasError = status.stage === 'error' || status.stage === 'rate-limited'
  const stageLabel = hasError ? 'Couldn\'t sync'
    : isAnimating ? 'Syncing…'
    : status.lastSuccessAt ? `Synced ${formatRelativeTime(status.lastSuccessAt)}`
    : 'Ready to sync'

  // Format vault usage as e.g. "12 MB used of 500 MB" (only if we have a number)
  const usageText = (() => {
    if (!usage || typeof usage.totalBytes !== 'number') return null
    const mb = usage.totalBytes / (1024 * 1024)
    const display = mb < 0.1 ? '0 MB' : mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`
    return `${display} used of 500 MB`
  })()

  return (
    <div className="space-y-5">
      {/* Status pill — auto-sync runs in background. Stop sync sits inline so
          the destructive action is one tap from the visible status, not buried
          in an Advanced section. Pending count has a tooltip-style title attr. */}
      <div className={`px-4 py-3 rounded-xl flex items-center justify-between gap-3 ${cardClasses}`}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <StageIcon className={`w-4 h-4 pointer-events-none flex-shrink-0 ${stageColor} ${isAnimating ? 'animate-spin' : ''}`} />
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${titleClasses}`}>{stageLabel}</p>
            {usageText && (
              <p className={`${subtitleClasses} truncate`}>{usageText}</p>
            )}
            {status.pendingCount > 0 && (
              <p className={subtitleClasses} title="Edits queued to upload — clears once they reach the server">
                {status.pendingCount} pending
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasError && (
            <button
              onClick={onSyncNow}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${secondaryBtn}`}
            >
              Retry
            </button>
          )}
          {!confirmStop && (
            <button
              onClick={() => setConfirmStop(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
              aria-label="Stop sync"
            >
              Stop sync
            </button>
          )}
        </div>
      </div>

      {confirmStop && (
        <div className={`p-3 rounded-lg space-y-3 ${cardClasses} border border-red-500/20`}>
          <p className={`text-xs ${subtitleClasses}`}>
            <strong className={titleClasses}>Stop sync on this device?</strong> Local notes stay on every device. If this is the last device paired with the cloud vault, the cloud copy is deleted automatically.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmStop(false)}
              className={`px-3 py-2 rounded-md text-xs font-medium ${secondaryBtn}`}
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmStop(false); onDisableSync?.() }}
              className={`px-3 py-2 rounded-md text-xs font-medium ${dangerBtn}`}
            >
              Stop sync
            </button>
          </div>
        </div>
      )}

      {hasError && status.lastError && (
        <div className="px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
          <p className="text-xs text-red-400 leading-relaxed">{status.lastError}</p>
        </div>
      )}

      {/* Devices */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={sectionLabelClasses}>Paired devices</span>
          <button
            onClick={onPairNewDevice}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${secondaryBtn}`}
          >
            <Plus className="w-3 h-3 pointer-events-none" />
            Add device
          </button>
        </div>
        <div className="space-y-1.5">
          {/* Self */}
          <DeviceRow
            label={status.deviceName || 'This device'}
            sublabel="This device"
            icon={Laptop}
            cardClasses={cardClasses}
            titleClasses={titleClasses}
            subtitleClasses={subtitleClasses}
            isSelf
          />
          {(() => {
            // Server is the source of truth for the device list — `usage`
            // comes from GET /sync/vault/index. Local `status.pairedDevices`
            // only updates when this device generated/joined a pair, so it
            // stays empty on the host side until a refresh. Prefer server
            // list when available; fall back to local. Drop self.
            const selfId = status.deviceId
            const fromServer = Array.isArray(usage?.pairedDevices) ? usage.pairedDevices : null
            const list = (fromServer || status.pairedDevices || [])
              .filter(d => d.deviceId !== selfId)
            return list.map(d => (
              <DeviceRow
                key={d.deviceId}
                label={d.deviceName || 'Untitled device'}
                sublabel={d.lastSeenAt ? `Last seen ${formatRelativeTime(new Date(d.lastSeenAt).getTime())}` : 'Not yet synced'}
                icon={Smartphone}
                cardClasses={cardClasses}
                titleClasses={titleClasses}
                subtitleClasses={subtitleClasses}
                onRevoke={() => onRevokeDevice?.(d.deviceId)}
                dangerBtn={dangerBtn}
              />
            ))
          })()}
          {(() => {
            const selfId = status.deviceId
            const fromServer = Array.isArray(usage?.pairedDevices) ? usage.pairedDevices : null
            const list = (fromServer || status.pairedDevices || [])
              .filter(d => d.deviceId !== selfId)
            if (list.length > 0) return null
            return (
              <p className={`text-xs italic ${subtitleClasses}`}>No other devices yet. Tap "Add device" to pair your phone, tablet, or another computer.</p>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function DeviceRow ({ label, sublabel, icon: Icon, cardClasses, titleClasses, subtitleClasses, isSelf, onRevoke, dangerBtn }) {
  return (
    <div className={`p-3 rounded-lg flex items-center justify-between ${cardClasses}`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 pointer-events-none ${subtitleClasses}`} />
        <div>
          <p className={`text-sm font-medium ${titleClasses}`}>{label}</p>
          <p className={subtitleClasses}>{sublabel}</p>
        </div>
      </div>
      {!isSelf && onRevoke && (
        <button
          onClick={onRevoke}
          className={`p-1.5 rounded-md transition-all opacity-60 hover:opacity-100 ${dangerBtn}`}
          aria-label="Revoke device"
          title="Revoke this device"
        >
          <Trash2 className="w-3 h-3 pointer-events-none" />
        </button>
      )}
    </div>
  )
}

// Open-source build with no relay URL configured at build time. Sync
// requires a relay; we don't ship one for free to avoid funding random
// forks. Two paths: self-host (free) or buy a Dash subscription.
function RelayMissingState ({ titleClasses, subtitleClasses, cardClasses, primaryBtn, secondaryBtn }) {
  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-xl ${cardClasses}`}>
        <h3 className={`text-sm font-semibold mb-2 ${titleClasses}`}>Sync needs a relay server</h3>
        <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
          The relay is the encrypted dropbox your devices push to. We don't bundle one with the open-source build — you can self-host one for free, or get a Dash subscription that includes a managed relay.
        </p>
      </div>

      <div className="space-y-2.5">
        <a
          href="https://dashnote.io/?utm_source=sync-cta"
          target="_blank"
          rel="noopener noreferrer"
          className={`block w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 text-center ${primaryBtn}`}
        >
          Get a Dash subscription
        </a>
        <a
          href="https://github.com/Efesop/rich-text-editor/blob/main/SYNC.md#self-hosting"
          target="_blank"
          rel="noopener noreferrer"
          className={`block w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 text-center ${secondaryBtn}`}
        >
          Self-host instructions
        </a>
      </div>

      <p className={`text-[11px] leading-relaxed ${subtitleClasses}`}>
        Your notes always stay on your device — sync just lets multiple devices share the same encrypted vault. Local backups in Settings → Backup work without any of this.
      </p>
    </div>
  )
}
