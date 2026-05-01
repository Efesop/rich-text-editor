import React, { useState, useEffect } from 'react'
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
  Trash2,
  ChevronRight
} from 'lucide-react'

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
  onEnableSync,
  onDisableSync,
  onUnlock,
  onLock,
  onPairNewDevice,    // → opens PairDeviceModal (host side)
  onAcceptPair,       // → opens AcceptPairModal (guest side)
  onSyncNow,
  onPurgeCloud,       // requires confirm
  onRevokeDevice,
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [confirmDisable, setConfirmDisable] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setConfirmDisable(false)
      setConfirmPurge(false)
    }
  }, [isOpen])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />
      <div
        className={`relative w-full max-w-lg rounded-2xl overflow-hidden ${bgContainer}`}
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
          {!status?.enabled && (
            <DisabledState
              isFallout={isFallout}
              titleClasses={titleClasses}
              subtitleClasses={subtitleClasses}
              cardClasses={cardClasses}
              primaryBtn={primaryBtn}
              secondaryBtn={secondaryBtn}
              onEnableSync={onEnableSync}
              onAcceptPair={onAcceptPair}
            />
          )}

          {status?.enabled && !status?.unlocked && (
            <LockedState
              isFallout={isFallout}
              titleClasses={titleClasses}
              subtitleClasses={subtitleClasses}
              cardClasses={cardClasses}
              primaryBtn={primaryBtn}
              onUnlock={onUnlock}
            />
          )}

          {status?.enabled && status?.unlocked && (
            <UnlockedState
              status={status}
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
              onPairNewDevice={onPairNewDevice}
              onLock={onLock}
              onRevokeDevice={onRevokeDevice}
              onDisableSync={onDisableSync}
              onPurgeCloud={onPurgeCloud}
              confirmDisable={confirmDisable}
              setConfirmDisable={setConfirmDisable}
              confirmPurge={confirmPurge}
              setConfirmPurge={setConfirmPurge}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components — one per stage to keep the main render clean
// ────────────────────────────────────────────────────────────────────────────

function DisabledState ({ isFallout, titleClasses, subtitleClasses, cardClasses, primaryBtn, secondaryBtn, onEnableSync, onAcceptPair }) {
  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-xl ${cardClasses}`}>
        <h3 className={`text-sm font-semibold mb-2 ${titleClasses}`}>How sync works</h3>
        <ul className={`text-xs space-y-1.5 ${subtitleClasses.replace('text-xs', '')} text-xs leading-relaxed`}>
          <li className="flex items-start gap-2"><span>•</span><span>Notes encrypted on your device with a key only you have.</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>Server stores opaque ciphertext — never sees titles, content, or filenames.</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>Pair devices with a QR code + 6-digit code.</span></li>
          <li className="flex items-start gap-2"><span>•</span><span>500 MB free vault. Auto-syncs after each save.</span></li>
        </ul>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={onEnableSync}
          className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 ${primaryBtn}`}
        >
          {isFallout ? 'INITIALIZE VAULT' : 'Set up sync on this device'}
        </button>
        <button
          onClick={onAcceptPair}
          className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-200 ${secondaryBtn}`}
        >
          {isFallout ? 'JOIN EXISTING VAULT' : 'I have another device — pair to it'}
        </button>
      </div>

      <p className={`text-[11px] leading-relaxed ${subtitleClasses}`}>
        Sync is opt-in. Your existing notes never leave this device until you turn it on. If you lose all your devices, you can restore from a local backup file (see Backup settings).
      </p>
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
  status, StageIcon, stageColor, titleClasses, subtitleClasses, sectionLabelClasses,
  cardClasses, primaryBtn, secondaryBtn, dangerBtn, isFallout,
  onSyncNow, onPairNewDevice, onLock, onRevokeDevice, onDisableSync, onPurgeCloud,
  confirmDisable, setConfirmDisable, confirmPurge, setConfirmPurge
}) {
  const stageLabel = STAGE_LABELS[status.stage] || 'Idle'
  const isAnimating = status.stage === 'flushing' || status.stage === 'pulling' || status.stage === 'queued'

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className={`p-4 rounded-xl ${cardClasses}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StageIcon className={`w-4 h-4 pointer-events-none ${stageColor} ${isAnimating ? 'animate-spin' : ''}`} />
            <div>
              <p className={`text-sm font-medium ${titleClasses}`}>{stageLabel}</p>
              <p className={subtitleClasses}>
                {status.lastSuccessAt ? `Last sync ${formatRelativeTime(status.lastSuccessAt)}` : 'Never synced'}
                {status.pendingCount > 0 && ` · ${status.pendingCount} pending`}
              </p>
            </div>
          </div>
          <button
            onClick={onSyncNow}
            disabled={isAnimating}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${secondaryBtn} ${isAnimating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Sync now
          </button>
        </div>
        {status.lastError && (
          <div className="mt-3 pt-3 border-t border-red-500/20 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
            <p className="text-xs text-red-400 leading-relaxed">{status.lastError}</p>
          </div>
        )}
      </div>

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
          {(status.pairedDevices || []).map(d => (
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
          ))}
          {(!status.pairedDevices || status.pairedDevices.length === 0) && (
            <p className={`text-xs italic ${subtitleClasses}`}>No other devices yet. Tap "Add device" to pair your phone, tablet, or another computer.</p>
          )}
        </div>
      </div>

      {/* Advanced */}
      <div className="space-y-2 pt-2">
        <span className={sectionLabelClasses}>Advanced</span>
        <button
          onClick={onLock}
          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${cardClasses} hover:opacity-90`}
        >
          <span className={titleClasses}>Lock vault now</span>
          <ChevronRight className={`w-4 h-4 pointer-events-none ${subtitleClasses}`} />
        </button>

        {!confirmPurge ? (
          <button
            onClick={() => setConfirmPurge(true)}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${cardClasses} hover:opacity-90`}
          >
            <span className={titleClasses}>Purge cloud copy</span>
            <ChevronRight className={`w-4 h-4 pointer-events-none ${subtitleClasses}`} />
          </button>
        ) : (
          <div className={`p-3 rounded-lg ${cardClasses}`}>
            <p className={`text-xs mb-2 ${subtitleClasses}`}>This will delete the cloud copy from the relay. Other devices will lose sync until they re-pair. Local notes are unaffected.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmPurge(false)}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium ${secondaryBtn}`}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmPurge(false); onPurgeCloud?.() }}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium ${dangerBtn}`}
              >
                Purge
              </button>
            </div>
          </div>
        )}

        {!confirmDisable ? (
          <button
            onClick={() => setConfirmDisable(true)}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${cardClasses} hover:opacity-90`}
          >
            <span className="text-red-400">Disable sync on this device</span>
            <ChevronRight className="w-4 h-4 pointer-events-none text-red-400" />
          </button>
        ) : (
          <div className={`p-3 rounded-lg ${cardClasses}`}>
            <p className={`text-xs mb-2 ${subtitleClasses}`}>This device will stop syncing. Local notes are kept. Other paired devices continue normally.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDisable(false)}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium ${secondaryBtn}`}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmDisable(false); onDisableSync?.() }}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium ${dangerBtn}`}
              >
                Disable
              </button>
            </div>
          </div>
        )}
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
