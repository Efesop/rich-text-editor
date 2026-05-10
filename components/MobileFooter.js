import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import {
  MoreHorizontal,
  List,
  Sparkles,
  Keyboard,
  Trash2,
  Archive,
  Cloud,
  Bug
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
  syncStatus // { enabled, unlocked, stage, lastError } — drives the trailing dot
}) {
  const { theme } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

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
                aria-label="More"
              >
                <MoreHorizontal className="w-5 h-5 pointer-events-none" />
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
        title="More"
        icon={MoreHorizontal}
      >
        {currentPage?.createdAt && (
          <div className={`px-5 py-2 text-xs ${
            isFallout ? 'text-green-600/80' :
            isDark ? 'text-[#6b6b6b]' :
            isDarkBlue ? 'text-[#5d6b88]' :
            'text-neutral-400'
          }`}>
            Created {format(new Date(currentPage.createdAt), 'MMM d, yyyy')}
          </div>
        )}
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
        <ActionSheetItem
          icon={Keyboard}
          label="Keyboard shortcuts"
          onClick={() => { onOpenShortcuts(); setMoreOpen(false) }}
        />
        <ActionSheetSeparator />
        {trashCount > 0 && (
          <ActionSheetItem
            icon={Trash2}
            label={`Trash · ${trashCount}`}
            onClick={() => { onOpenTrash(); setMoreOpen(false) }}
          />
        )}
        <ActionSheetItem
          icon={Archive}
          label="Backup settings"
          onClick={() => { onOpenBackup(); setMoreOpen(false) }}
        />
        {syncEnabled && (() => {
          // Identical look + feel to MobileHeaderMenu's Sync settings row:
          // Cloud icon, "Sync settings" label, trailing colored dot
          // showing live status (green=synced, red=error, yellow=locked,
          // gray=disabled). Single source-of-truth derivation here +
          // MobileHeaderMenu so both sheets stay in sync.
          const enabled = !!syncStatus?.enabled
          const unlocked = !!syncStatus?.unlocked
          const errored = syncStatus?.stage === 'error' || syncStatus?.stage === 'rate-limited' || !!syncStatus?.lastError
          let dotClass = 'bg-gray-400'
          let dotTitle = 'Sync off'
          if (enabled && unlocked && !errored) { dotClass = 'bg-green-500'; dotTitle = 'Synced' }
          else if (enabled && errored) { dotClass = 'bg-red-500'; dotTitle = 'Sync error' }
          else if (enabled && !unlocked) { dotClass = 'bg-yellow-400'; dotTitle = 'Vault locked' }
          return (
            <ActionSheetItem
              icon={Cloud}
              label="Sync settings"
              onClick={() => { onOpenSync(); setMoreOpen(false) }}
              trailing={
                <span
                  title={dotTitle}
                  className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`}
                />
              }
            />
          )
        })()}
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={Bug}
          label="Report a bug"
          onClick={() => {
            window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer')
            setMoreOpen(false)
          }}
        />
      </ActionSheet>
    </>
  )
}
