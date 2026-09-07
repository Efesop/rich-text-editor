import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import {
  List,
  Sparkles,
  Keyboard,
  Trash2,
  Bug,
  SunMoon,
  Lock,
  RefreshCw,
  HardDrive,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react'
import { format } from 'date-fns'
import EncryptionStatusIndicator from './EncryptionStatusIndicator'
import SelfDestructBadge from './SelfDestructBadge'
import { ActionSheet, ActionSheetItem, ActionSheetSeparator } from './ActionSheet'

/**
 * Mobile-specific compact footer.
 * Shows: encryption status (left) — words + save status + overflow "···" (right).
 * Overflow sheet exposes outline, AI, features, shortcuts, sync, trash, backup.
 */
export default function MobileFooter ({
  currentPage,
  appLockEnabled,
  wordCount,
  saveStatus,
  onEncryptPage,
  onCancelSelfDestruct,
  onToggleOutline,
  showOutline,
  onOpenAi,
  onOpenFeatures,
  onOpenShortcuts,
  onOpenTrash,
  trashCount,
  onOpenBackup,
  onOpenSync,
  syncEnabled,
  syncStatusText,
  syncStatus, // { enabled, unlocked, stage, lastError } — drives the trailing dot
  // Settings sheet (Sep 2026 UI refresh)
  onOpenAppearance,
  themeLabel = '',
  onOpenAppLock,
  backupLabel = '',
  appVersion = '',
  syncLabel = ''
}) {
  const { theme } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  // Local AI needs a localhost model server, unreachable inside the iOS/Android
  // Capacitor WebView — hide the footer shortcut there (App Review 2.1(a)).
  const isNativeApp = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const mutedClass = isFallout ? 'text-green-600' : isDark ? 'text-[#8e8e8e]' : isDarkBlue ? 'text-[#5d6b88]' : 'text-gray-500'
  const faintClass = isFallout ? 'text-green-700' : isDark ? 'text-[#6b6b6b]' : isDarkBlue ? 'text-[#445068]' : 'text-gray-400'
  // Trailing "value ›" slot for Settings rows.
  const Trailing = ({ value, dot }) => (
    <span className="inline-flex items-center gap-1.5">
      {dot && <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />}
      {value && <span className={`text-sm ${mutedClass}`}>{value}</span>}
      <ChevronRight className={`w-4 h-4 ${faintClass}`} />
    </span>
  )

  const chipClass = `flex items-center justify-center h-10 w-10 rounded-lg transition-colors ${
    isFallout ? 'text-green-500 hover:text-green-400 hover:bg-green-900/30' :
    isDark ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2a2a2a]' :
    isDarkBlue ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#1c2438]' :
    'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
  }`

  return (
    <>
      <div
        className={`footer-fixed flex justify-between items-center gap-2 px-3 py-2 text-sm ${
          isFallout ? 'bg-gray-900/95 border-t border-green-600/20' :
          isDark ? 'bg-[#0d0d0d]/95 border-t border-[#2e2e2e]' :
          isDarkBlue ? 'bg-[#0c1017]/95 border-t border-[#1c2438]' :
          'bg-white/95 border-t border-neutral-100'
        } safe-area-bottom backdrop-blur`}
      >
        {/* Left: encryption + self destruct */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink overflow-hidden">
          <EncryptionStatusIndicator
            currentPage={currentPage}
            onEncryptPage={onEncryptPage}
            appLockEnabled={appLockEnabled}
          />
          {currentPage?.selfDestructAt && (
            <button
              onClick={onCancelSelfDestruct}
              className="cursor-pointer hover:opacity-80 transition-opacity flex items-center flex-shrink-0"
              title="Remove self-destruct timer"
            >
              <SelfDestructBadge selfDestructAt={currentPage.selfDestructAt} theme={theme} />
            </button>
          )}
        </div>

        {/* Right: words + save status + AI shortcut + more */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`whitespace-nowrap px-1 ${
            isFallout ? 'text-green-600' :
            isDark ? 'text-[#6b6b6b]' :
            isDarkBlue ? 'text-[#5d6b88]' :
            'text-neutral-500'
          }`}>
            {wordCount} words
          </span>
          <span aria-live="polite" aria-atomic="true" className="px-1">
            {saveStatus === 'saving' && <span className={isFallout ? 'text-yellow-400' : 'text-yellow-500'}>Saving…</span>}
            {saveStatus === 'saved' && <span className={
              isFallout ? 'text-green-400' :
              isDark ? 'text-[#6b6b6b]' :
              isDarkBlue ? 'text-[#445068]' :
              'text-neutral-400'
            }>Saved</span>}
            {saveStatus === 'error' && <span className="text-red-500">Error</span>}
          </span>
          {!isNativeApp && (
          <button
            onClick={onOpenAi}
            className={chipClass}
            aria-label="Local AI"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="pointer-events-none">
              <defs><filter id="fo-bl-mob"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
              <clipPath id="fo-cp-mob"><circle cx="12" cy="12" r="10"/></clipPath>
              <g clipPath="url(#fo-cp-mob)" filter="url(#fo-bl-mob)">
                <circle cx="9" cy="9" r="8" fill="rgba(70,120,255,0.9)"/>
                <circle cx="16" cy="10" r="7" fill="rgba(140,80,250,0.8)"/>
                <circle cx="12" cy="16" r="6" fill="rgba(230,90,180,0.7)"/>
                <circle cx="7" cy="14" r="6" fill="rgba(40,180,255,0.65)"/>
              </g>
              <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"/>
            </svg>
          </button>
          )}
          {(() => {
            // Status dot on the More button — color tracks SYNC state
            // (matches the sync chip in the page-actions sheet + desktop
            // footer), not trash count. Pre-fix it was a generic blue
            // "you have unread items" dot keyed off trashCount, which
            // was opaque to the user. Now: green=synced, red=error,
            // yellow=locked, gray=disabled / alone — same vocabulary as
            // the chip in MobileHeaderMenu / SyncSettings.
            const enabled = !!syncStatus?.enabled
            const unlocked = !!syncStatus?.unlocked
            const errored = syncStatus?.stage === 'error' || syncStatus?.stage === 'rate-limited'
            const paired = Array.isArray(syncStatus?.pairedDevices) ? syncStatus.pairedDevices : []
            const showDot = enabled
            let dotClass = 'bg-gray-400'
            if (enabled && errored) dotClass = 'bg-red-500'
            else if (enabled && !unlocked) dotClass = 'bg-yellow-400'
            else if (enabled && unlocked && paired.length > 1) dotClass = 'bg-green-500'
            return (
              <button
                onClick={() => setMoreOpen(true)}
                className={`${chipClass} relative`}
                aria-label="Settings"
              >
                <SlidersHorizontal className="w-5 h-5 pointer-events-none" />
                {showDot && (
                  <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${dotClass}`} />
                )}
              </button>
            )
          })()}
        </div>
      </div>

      <ActionSheet
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Settings"
        icon={SlidersHorizontal}
      >
        <ActionSheetItem
          icon={SunMoon}
          label="Appearance"
          onClick={() => { setMoreOpen(false); onOpenAppearance?.() }}
          trailing={<Trailing value={themeLabel} />}
        />
        <ActionSheetItem
          icon={Lock}
          label="App lock"
          onClick={() => { setMoreOpen(false); onOpenAppLock?.() }}
          trailing={<Trailing value={appLockEnabled ? 'On' : 'Off'} />}
        />
        {syncEnabled && (() => {
          // Same status vocabulary as MobileHeaderMenu's Sync settings row:
          // green=synced, red=error, yellow=locked, gray=off.
          const enabled = !!syncStatus?.enabled
          const unlocked = !!syncStatus?.unlocked
          const errored = syncStatus?.stage === 'error' || syncStatus?.stage === 'rate-limited' || !!syncStatus?.lastError
          let dotClass = 'bg-gray-400'
          if (enabled && unlocked && !errored) dotClass = 'bg-green-500'
          else if (enabled && errored) dotClass = 'bg-red-500'
          else if (enabled && !unlocked) dotClass = 'bg-yellow-400'
          return (
            <ActionSheetItem
              icon={RefreshCw}
              label="Dash Sync"
              onClick={() => { onOpenSync(); setMoreOpen(false) }}
              trailing={<Trailing value={syncLabel} dot={dotClass} />}
            />
          )
        })()}
        <ActionSheetItem
          icon={HardDrive}
          label="Backups"
          onClick={() => { onOpenBackup(); setMoreOpen(false) }}
          trailing={<Trailing value={backupLabel} />}
        />
        <ActionSheetItem
          icon={Trash2}
          label="Trash"
          onClick={() => { onOpenTrash(); setMoreOpen(false) }}
          trailing={<Trailing value={trashCount > 0 ? `${trashCount} item${trashCount === 1 ? '' : 's'}` : ''} />}
        />
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={List}
          label={showOutline ? 'Hide table of contents' : 'Show table of contents'}
          onClick={() => { onToggleOutline(); setMoreOpen(false) }}
        />
        <ActionSheetItem
          icon={Sparkles}
          label="Features"
          onClick={() => { onOpenFeatures(); setMoreOpen(false) }}
        />
        {!isNativeApp && (
          <ActionSheetItem
            icon={Keyboard}
            label="Keyboard shortcuts"
            onClick={() => { onOpenShortcuts(); setMoreOpen(false) }}
          />
        )}
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={Bug}
          label="Report a bug"
          onClick={() => {
            window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer')
            setMoreOpen(false)
          }}
        />
        <div className={`px-5 pt-2 pb-1 text-xs text-center ${faintClass} ${isFallout ? 'font-mono' : ''}`}>
          {[appVersion ? `Dash ${appVersion}` : 'Dash', currentPage?.createdAt ? `Created ${format(new Date(currentPage.createdAt), 'MMM d, yyyy')}` : null].filter(Boolean).join(' · ')}
        </div>
      </ActionSheet>
    </>
  )
}
