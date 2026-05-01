import React from 'react'
import { Cloud, CloudOff, RefreshCw, AlertCircle, Check } from 'lucide-react'

/**
 * Compact sync status chip for the editor footer. Sits next to "Saved"
 * indicator. Only renders when sync is enabled.
 *
 * Click → opens the SyncSettingsPanel.
 */

const formatTimestamp = (ts) => {
  if (!ts) return null
  const ms = Date.now() - ts
  if (ms < 5000) return 'Just synced'
  if (ms < 60000) return `Synced ${Math.floor(ms / 1000)}s ago`
  if (ms < 3600000) return `Synced ${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000) return `Synced ${Math.floor(ms / 3600000)}h ago`
  return `Synced ${Math.floor(ms / 86400000)}d ago`
}

export default function SyncStatusIndicator ({ status, onClick, theme }) {
  if (!status?.enabled) return null

  const isFallout = theme === 'fallout'
  const isDarkBlue = theme === 'darkblue'
  const isDark = theme === 'dark'

  const baseColor = isFallout
    ? 'text-green-600 hover:text-green-400'
    : isDarkBlue ? 'text-[#5d6b88] hover:text-[#8b99b5]'
      : isDark ? 'text-[#6b6b6b] hover:text-[#c0c0c0]'
        : 'text-neutral-400 hover:text-neutral-600'

  const hoverBg = isFallout ? 'hover:bg-green-900/30'
    : isDarkBlue ? 'hover:bg-[#1c2438]'
      : isDark ? 'hover:bg-[#2a2a2a]'
        : 'hover:bg-neutral-100'

  let Icon, iconClass, label

  if (!status.unlocked) {
    Icon = CloudOff
    iconClass = baseColor
    label = 'Vault locked'
  } else if (status.stage === 'flushing' || status.stage === 'pulling' || status.stage === 'queued') {
    Icon = RefreshCw
    iconClass = isFallout ? 'text-green-400' : 'text-blue-400'
    label = status.stage === 'pulling' ? 'Receiving…' : 'Syncing…'
  } else if (status.stage === 'error' || status.stage === 'rate-limited') {
    Icon = AlertCircle
    iconClass = 'text-red-400'
    label = status.stage === 'rate-limited' ? 'Rate limited' : (status.lastError || 'Error')
  } else if (status.stage === 'paused') {
    Icon = CloudOff
    iconClass = 'text-yellow-400'
    label = 'Sync paused'
  } else {
    // idle
    Icon = status.lastSuccessAt ? Check : Cloud
    iconClass = isFallout ? 'text-green-500' : 'text-emerald-500'
    label = status.lastSuccessAt ? formatTimestamp(status.lastSuccessAt) : 'Ready to sync'
  }

  const isAnimating = status.stage === 'flushing' || status.stage === 'pulling' || status.stage === 'queued'

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors text-xs ${baseColor} ${hoverBg}`}
      title={label + (status.pendingCount > 0 ? ` · ${status.pendingCount} pending` : '')}
    >
      <Icon className={`w-3 h-3 pointer-events-none ${iconClass} ${isAnimating ? 'animate-spin' : ''}`} />
      <span className="pointer-events-none whitespace-nowrap">
        {label}
        {status.pendingCount > 0 && ` (${status.pendingCount})`}
      </span>
    </button>
  )
}
