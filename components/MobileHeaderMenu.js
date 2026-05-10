import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import {
  FileText,
  FileDown,
  Smartphone,
  Import,
  Lock,
  LockKeyhole,
  Unlock,
  Share2,
  Cloud,
  Timer,
  TimerOff,
  MoreVertical
} from 'lucide-react'
import { ActionSheet, ActionSheetItem, ActionSheetSeparator } from './ActionSheet'
import { shouldShowMobileInstall } from '@/utils/deviceUtils'

/**
 * Mobile top-bar consolidated menu — single Sliders icon opens an
 * ActionSheet with every per-page action. Replaces the row of icons
 * (Lock, Timer, Share, Cloud, Export-dropdown) that didn't fit on small
 * screens. Theme toggle stays a separate icon on the bar so it's
 * one-tap.
 */
export function MobileHeaderMenu ({
  onLockPage,
  onTimer,
  onShare,
  onSyncSettings,
  onExport,
  onImportBundle,
  onPhoneSetup,
  currentPageLocked = false,
  currentPageHasTimer = false,
  syncAvailable = false,
  syncStatus = null, // { enabled, unlocked, stage, lastError } from useSyncQueue
  pageActionsAvailable = true, // false on live-session pages or no current page
  isImporting = false
}) {
  const { theme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const exportOptions = [
    { label: 'PDF', value: 'pdf', icon: FileText },
    { label: 'Markdown', value: 'markdown', icon: FileText },
    { label: 'Plain Text', value: 'text', icon: FileText },
    { label: 'RTF', value: 'rtf', icon: FileText },
    { label: 'Word Document', value: 'docx', icon: FileText },
    { label: 'CSV', value: 'csv', icon: FileText },
    { label: 'JSON', value: 'json', icon: FileText },
    { label: 'XML', value: 'xml', icon: FileText }
  ]

  const handleExport = (format) => {
    onExport(format)
    setShowExportOptions(false)
    setIsOpen(false)
  }

  const close = () => setIsOpen(false)
  const closeAndRun = (fn) => () => { close(); fn?.() }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`
          p-2 rounded-md transition-colors
          ${isFallout
            ? 'text-green-400 hover:bg-green-500/20'
            : isDark
              ? 'text-[#c0c0c0] hover:bg-[#3a3a3a]'
              : isDarkBlue
                ? 'text-[#8b99b5] hover:bg-[#1a2035]'
                : 'text-gray-600 hover:bg-gray-100'
          }
        `}
        aria-label="Page actions"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      <ActionSheet
        isOpen={isOpen && !showExportOptions}
        onClose={() => setIsOpen(false)}
        title="Page actions"
        icon={MoreVertical}
      >
        {pageActionsAvailable && onLockPage && (
          <ActionSheetItem
            icon={currentPageLocked ? LockKeyhole : Unlock}
            label={currentPageLocked ? 'Unlock page' : 'Lock page'}
            onClick={closeAndRun(onLockPage)}
          />
        )}
        {pageActionsAvailable && onTimer && (
          <ActionSheetItem
            icon={currentPageHasTimer ? TimerOff : Timer}
            label={currentPageHasTimer ? 'Cancel self-destruct' : 'Self-destruct'}
            onClick={closeAndRun(onTimer)}
          />
        )}
        {pageActionsAvailable && onShare && (
          <ActionSheetItem
            icon={Share2}
            label="Share encrypted note"
            onClick={closeAndRun(onShare)}
          />
        )}

        {/* Sync settings — sits above the divider so the page-action
            block (lock/timer/share/sync) is one logical group, and the
            export/import block is on the other side of the line. */}
        {syncAvailable && onSyncSettings && (() => {
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
              onClick={closeAndRun(onSyncSettings)}
              trailing={
                <span
                  title={dotTitle}
                  className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`}
                />
              }
            />
          )
        })()}

        {((pageActionsAvailable && (onLockPage || onTimer || onShare)) || (syncAvailable && onSyncSettings)) && (onExport || onImportBundle) && (
          <ActionSheetSeparator />
        )}

        {onExport && (
          <ActionSheetItem
            icon={FileDown}
            label="Export current page"
            onClick={() => setShowExportOptions(true)}
          />
        )}
        {onExport && (
          <ActionSheetItem
            icon={Lock}
            label="Export all (encrypted)"
            onClick={closeAndRun(() => onExport('dashpack'))}
          />
        )}
        {onImportBundle && (
          <ActionSheetItem
            icon={Import}
            label={isImporting ? 'Importing…' : 'Import encrypted bundle'}
            onClick={closeAndRun(onImportBundle)}
            disabled={isImporting}
          />
        )}

        {shouldShowMobileInstall() && onPhoneSetup && (
          <>
            <ActionSheetSeparator />
            <ActionSheetItem
              icon={Smartphone}
              label="Use on your phone"
              onClick={closeAndRun(onPhoneSetup)}
            />
          </>
        )}
      </ActionSheet>

      <ActionSheet
        isOpen={showExportOptions}
        onClose={() => setShowExportOptions(false)}
        title="Export format"
        icon={FileDown}
      >
        {exportOptions.map((option) => (
          <ActionSheetItem
            key={option.value}
            icon={option.icon}
            label={option.label}
            onClick={() => handleExport(option.value)}
          />
        ))}
      </ActionSheet>
    </>
  )
}

export default MobileHeaderMenu
