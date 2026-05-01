import React, { useState, useEffect } from 'react'
import { Archive, X, Folder, Download, AlertCircle, Check } from 'lucide-react'
import {
  SCHEDULE_OFF, SCHEDULE_DAILY, SCHEDULE_WEEKLY, SCHEDULE_MONTHLY,
  formatBackupAge,
  nextBackupAt,
  defaultBackupSettings
} from '../lib/backupSchedule.js'

/**
 * Backup settings modal — lets user pick schedule, see last backup status,
 * choose backup folder (Electron only), and trigger an export now.
 *
 * Theme matches the rest of the modal family.
 */

const SCHEDULE_OPTIONS = [
  { value: SCHEDULE_OFF, label: 'Off' },
  { value: SCHEDULE_DAILY, label: 'Daily' },
  { value: SCHEDULE_WEEKLY, label: 'Weekly' },
  { value: SCHEDULE_MONTHLY, label: 'Monthly' }
]

const formatNextBackup = (settings) => {
  const next = nextBackupAt(settings)
  if (next === null) return 'Off'
  const ms = next - Date.now()
  if (ms <= 0) return 'Soon'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days >= 1) return `In ${days} day${days === 1 ? '' : 's'}`
  const hours = Math.floor(ms / (60 * 60 * 1000))
  return `In ${hours} hour${hours === 1 ? '' : 's'}`
}

export default function BackupSettingsModal ({
  isOpen,
  onClose,
  settings,
  isExporting,
  lastError,
  onUpdateSettings,
  onExportNow,
  onPickFolder,
  defaultFolder,
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [exportSuccess, setExportSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) setExportSuccess(false)
  }, [isOpen])

  if (!isOpen) return null

  const s = settings || defaultBackupSettings()

  const bgContainer = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white shadow-2xl'

  const headerBorder = isFallout ? 'border-b border-green-500/30'
    : isDarkBlue ? 'border-b border-[#1c2438]'
      : isDark ? 'border-b border-[#3a3a3a]'
        : 'border-b border-gray-100'

  const titleClasses = isFallout ? 'text-green-400 font-mono'
    : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'

  const subtitleClasses = isFallout ? 'text-green-600 font-mono text-xs'
    : isDarkBlue ? 'text-[#8b99b5] text-xs' : isDark ? 'text-[#8e8e8e] text-xs' : 'text-gray-500 text-xs'

  const closeBtn = isFallout ? 'text-green-600 hover:bg-green-900/30'
    : isDarkBlue ? 'text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'text-[#c0c0c0] hover:bg-[#2a2a2a]'
        : 'text-gray-500 hover:bg-gray-100'

  const iconContainerClasses = isFallout
    ? 'bg-green-500/20 border border-green-500/40 text-green-400'
    : isDarkBlue ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
      : isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
        : 'bg-amber-50 border border-amber-100 text-amber-600'

  const cardClasses = isFallout ? 'bg-gray-800/50 border border-green-500/20'
    : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438]'
      : isDark ? 'bg-[#222] border border-[#3a3a3a]/40'
        : 'bg-gray-50 border border-gray-100'

  const sectionLabelClasses = isFallout
    ? 'text-green-600 font-mono text-[10px] uppercase tracking-wider'
    : isDarkBlue ? 'text-[#5d6b88] text-[10px] uppercase tracking-wider font-medium'
      : isDark ? 'text-[#8e8e8e] text-[10px] uppercase tracking-wider font-medium'
        : 'text-gray-400 text-[10px] uppercase tracking-wider font-medium'

  const primaryBtn = isFallout
    ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
    : isDarkBlue ? 'bg-blue-500 text-white hover:bg-blue-400'
      : isDark ? 'bg-blue-600 text-white hover:bg-blue-500'
        : 'bg-blue-600 text-white hover:bg-blue-700'

  const secondaryBtn = isFallout ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
    : isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  const handleExport = async () => {
    setExportSuccess(false)
    const result = await onExportNow?.()
    if (result?.success) {
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden ${bgContainer}`}
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
      >
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${headerBorder}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconContainerClasses}`}>
                <Archive className="w-5 h-5 pointer-events-none" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>Backups</h2>
                <p className={subtitleClasses}>Encrypted local copy of all your notes.</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtn}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {lastError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
              <p className="text-xs text-red-400 leading-relaxed">{lastError}</p>
            </div>
          )}

          {/* Status card */}
          <div className={`p-4 rounded-xl ${cardClasses}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className={`text-sm font-medium ${titleClasses}`}>Last backup</p>
                <p className={subtitleClasses}>{formatBackupAge(s.lastBackupAt)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${titleClasses}`}>Next</p>
                <p className={subtitleClasses}>{formatNextBackup(s)}</p>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`w-full mt-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 ${exportSuccess ? secondaryBtn : primaryBtn}`}
            >
              {exportSuccess ? <Check className="w-4 h-4 pointer-events-none" /> : <Download className="w-4 h-4 pointer-events-none" />}
              {isExporting ? 'Exporting…' : exportSuccess ? 'Backup saved' : 'Export now'}
            </button>
          </div>

          {/* Schedule */}
          <div>
            <span className={sectionLabelClasses}>Schedule</span>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {SCHEDULE_OPTIONS.map(opt => {
                const active = s.schedule === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => onUpdateSettings?.({ ...s, schedule: opt.value })}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${active ? primaryBtn : secondaryBtn}`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Folder (Electron only) */}
          {onPickFolder && (
            <div>
              <span className={sectionLabelClasses}>Folder</span>
              <div className={`mt-2 p-3 rounded-lg ${cardClasses} flex items-center justify-between gap-3`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Folder className={`w-4 h-4 flex-shrink-0 pointer-events-none ${subtitleClasses}`} />
                  <span className={`text-xs truncate ${titleClasses}`} title={s.folderPath || defaultFolder}>
                    {s.folderPath || defaultFolder || 'Default'}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    const folder = await onPickFolder()
                    if (folder) onUpdateSettings?.({ ...s, folderPath: folder })
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-medium ${secondaryBtn}`}
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Retention */}
          <div>
            <span className={sectionLabelClasses}>Keep last</span>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[5, 12, 30, 60].map(n => {
                const active = s.retentionCount === n
                return (
                  <button
                    key={n}
                    onClick={() => onUpdateSettings?.({ ...s, retentionCount: n })}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${active ? primaryBtn : secondaryBtn}`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>

          <p className={`text-[11px] leading-relaxed ${subtitleClasses}`}>
            Backups are encrypted with your app-lock password (or a passphrase you set when sync is on). Without the password, the file is unreadable. Restore via Settings → Import.
          </p>
        </div>
      </div>
    </div>
  )
}
