import React from 'react'
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'

/**
 * Compact sync status chip for the desktop editor footer. Sits next to
 * the "Saved" indicator. Matches the mobile MobileHeaderMenu pattern:
 * cloud icon + colored status dot + short label ("Sync" or "Synced").
 *
 * Detail (last sync timestamp, pending envelope count, error message) is
 * intentionally NOT shown here — it lives inside SyncSettingsPanel which
 * opens on click. This footer chip is a status glance, not a status
 * dump.
 *
 * Click → opens the SyncSettingsPanel.
 */
export default function SyncStatusIndicator ({ status, onClick, theme }) {
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

  // Resolve label + dot color + spinning-icon state from sync status.
  // `lastError` is INFORMATIONAL only — surfaced via tooltip detail.
  // The chip itself flips to error red ONLY when the queue stage is
  // actively errored. Pre-fix the chip lit red on any stale lastError
  // (left over from a transient 401 that auto-recovered) → user saw
  // "Sync error" with green dot tooltip — confusing and wrong.
  const enabled = !!status?.enabled
  const unlocked = !!status?.unlocked
  const stage = status?.stage
  const errored = stage === 'error' || stage === 'rate-limited'

  let label = 'Sync'
  let dotClass = isDark || isDarkBlue ? 'bg-gray-600' : 'bg-gray-400'
  let Icon = Cloud
  let isAnimating = false

  if (!enabled) {
    label = 'Sync'
    dotClass = isDark || isDarkBlue ? 'bg-gray-600' : 'bg-gray-400'
    Icon = Cloud
  } else if (errored) {
    label = stage === 'rate-limited' ? 'Rate limited' : 'Sync error'
    dotClass = 'bg-red-500'
    Icon = AlertCircle
  } else if (!unlocked) {
    label = 'Vault locked'
    dotClass = 'bg-yellow-400'
    Icon = CloudOff
  } else if (stage === 'flushing' || stage === 'pulling' || stage === 'queued') {
    label = stage === 'pulling' ? 'Receiving' : 'Syncing'
    dotClass = isFallout ? 'bg-green-400' : 'bg-blue-400'
    Icon = RefreshCw
    isAnimating = true
  } else if (stage === 'paused') {
    label = 'Sync paused'
    dotClass = 'bg-yellow-400'
    Icon = CloudOff
  } else {
    // idle + enabled + unlocked + no error.
    // Differentiate "actively synced with at least one peer" (green)
    // from "sync enabled but only this device paired" (gray). Pre-fix
    // the chip said "Synced" even after a peer hit Stop sync from
    // their device — implies data was syncing somewhere when in fact
    // there was no peer to sync TO. `pairedDevices` includes this
    // device, so length <= 1 means we're alone.
    const paired = Array.isArray(status?.pairedDevices) ? status.pairedDevices : []
    if (paired.length <= 1) {
      label = 'Sync'
      dotClass = isDark || isDarkBlue ? 'bg-gray-600' : 'bg-gray-400'
      Icon = Cloud
    } else {
      label = 'Synced'
      dotClass = 'bg-green-500'
      Icon = Cloud
    }
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors text-xs ${baseColor} ${hoverBg}`}
    >
      <Icon className={`w-3 h-3 pointer-events-none ${isAnimating ? 'animate-spin' : ''}`} />
      <span className="pointer-events-none whitespace-nowrap">{label}</span>
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 rounded-full pointer-events-none ${dotClass}`}
      />
    </button>
  )
}
