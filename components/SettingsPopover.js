import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Lock, RefreshCw, HardDrive, Trash2, Keyboard, Monitor, ChevronRight, Check } from 'lucide-react'
import { getThemeClasses } from '@/utils/themeUtils'

// Desktop-only settings popover, anchored under the toolbar gear.
// Groups everything that used to be scattered across the sidebar header,
// the footer and the theme cycler: appearance, app lock, sync, backups,
// trash, shortcuts and the version / update line.

const THEME_TILES = [
  { value: 'light', label: 'Light', sidebar: '#f0f0f0', content: '#ffffff', text: '#171717', muted: '#a3a3a3', border: '#e5e5e5' },
  { value: 'dark', label: 'Dark', sidebar: '#1a1a1a', content: '#0d0d0d', text: '#ececec', muted: '#6b6b6b', border: '#2e2e2e' },
  { value: 'darkblue', label: 'Night', sidebar: '#111827', content: '#0c1017', text: '#e0e6f0', muted: '#5d6b88', border: '#1c2438' },
  { value: 'fallout', label: 'Terminal', sidebar: '#141b14', content: '#0e120e', text: '#86efac', muted: '#16a34a', border: 'rgba(34,197,94,0.3)' }
]

const POPOVER_WIDTH = 340

export default function SettingsPopover ({
  isOpen,
  onClose,
  anchorRef,
  theme,
  onChooseTheme,
  matchSystem,
  onToggleMatchSystem,
  appLockEnabled,
  biometricEnabled,
  onOpenAppLock,
  syncAvailable,
  syncLabel,
  syncDotClass,
  onOpenSync,
  backupLabel,
  onOpenBackup,
  trashCount,
  onOpenTrash,
  onOpenShortcuts,
  appVersion,
  updateAvailable,
  updateVersion,
  isCheckingForUpdates,
  canCheckForUpdates,
  onCheckForUpdates,
  onShowUpdate,
  systemName = 'macOS'
}) {
  const popoverRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const classes = getThemeClasses(theme)
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8))
    setPos({ top: rect.bottom + 6, left })
  }, [isOpen, anchorRef])

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target) &&
          anchorRef?.current && !anchorRef.current.contains(event.target)) {
        onClose()
      }
    }
    const handleKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose, anchorRef])

  if (!isOpen) return null

  const labelClass = isFallout ? 'text-green-700' : isDarkBlue ? 'text-[#445068]' : isDark ? 'text-[#6b6b6b]' : 'text-neutral-400'
  const primaryText = isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-neutral-900'
  const secondaryText = isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#8e8e8e]' : 'text-neutral-500'
  const iconClass = isFallout ? 'text-green-500' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#8e8e8e]' : 'text-neutral-400'
  const dividerClass = isFallout ? 'bg-green-600/30' : isDarkBlue ? 'bg-[#1c2438]' : isDark ? 'bg-[#3a3a3a]' : 'bg-neutral-200'
  const rowHover = isFallout ? 'hover:bg-gray-800' : isDarkBlue ? 'hover:bg-[#232b42]' : isDark ? 'hover:bg-[#3a3a3a]' : 'hover:bg-neutral-100'
  const chevronHover = isFallout ? 'group-hover:text-green-400' : isDarkBlue ? 'group-hover:text-[#8b99b5]' : isDark ? 'group-hover:text-[#c0c0c0]' : 'group-hover:text-neutral-600'
  const accentRing = isFallout ? 'ring-green-500' : 'ring-blue-500'
  const accentBg = isFallout ? 'bg-green-500' : 'bg-blue-500'
  const accentText = isFallout ? 'text-green-400' : 'text-blue-500'
  const toggleOn = isFallout ? 'bg-green-500' : 'bg-blue-500'
  const toggleOff = isFallout ? 'bg-gray-800' : isDarkBlue ? 'bg-[#232b42]' : isDark ? 'bg-[#3a3a3a]' : 'bg-neutral-300'
  const kbdClass = isFallout ? 'border-green-600/40 text-green-600' : isDarkBlue ? 'border-[#1c2438] text-[#445068]' : isDark ? 'border-[#3a3a3a] text-[#6b6b6b]' : 'border-neutral-200 text-neutral-400'

  // Plain render helper, deliberately NOT a nested component: a component
  // defined inside render gets a new identity every time the parent
  // re-renders, which remounts the button between mousedown and mouseup
  // (the editor blurs on mousedown and re-renders the app) — and the click
  // never fires. Rendering the JSX directly keeps the DOM node stable.
  const renderRow = ({ icon: Icon, label, value, dot, kbd, onClick }) => (
    <button
      type="button"
      onClick={() => { onClose(); onClick && onClick() }}
      className={`group w-full flex items-center gap-3 h-[38px] px-3 rounded-lg text-[14px] transition-colors ${primaryText} ${rowHover}`}
    >
      <Icon className={`h-4 w-4 flex-shrink-0 pointer-events-none ${iconClass}`} />
      <span className="flex-1 text-left truncate">{label}</span>
      {value && (
        <span className={`inline-flex items-center gap-1.5 text-[13px] ${secondaryText}`}>
          {dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />}
          {value}
        </span>
      )}
      {kbd
        ? <span className={`text-[11px] font-medium border rounded px-1.5 py-px ${kbdClass}`}>{kbd}</span>
        : <ChevronRight className={`h-4 w-4 flex-shrink-0 pointer-events-none transition-colors ${labelClass} ${chevronHover}`} />}
    </button>
  )

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Settings"
      className={`fixed z-[70] rounded-xl border p-2 ${classes.dropdown}`}
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH, animation: 'dash-dropdown-in 120ms ease-out forwards' }}
      // Keep focus (and the caret) in the editor: a menu shouldn't steal it.
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className={`px-3 pt-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] ${labelClass}`}>Appearance</div>
      <div className="grid grid-cols-4 gap-2 px-2 pb-2">
        {THEME_TILES.map(tile => {
          const active = theme === tile.value
          return (
            <button
              key={tile.value}
              type="button"
              onClick={() => onChooseTheme(tile.value)}
              className="flex flex-col items-center gap-1.5 group"
              aria-pressed={active}
            >
              <span
                className={`relative w-[68px] h-11 rounded-lg overflow-hidden flex ${active ? `ring-2 ${accentRing}` : 'border'} transition-transform group-hover:scale-[1.03]`}
                style={{ background: tile.content, borderColor: active ? undefined : tile.border }}
              >
                <span className="block w-6 h-full" style={{ background: tile.sidebar }} />
                <span className="flex-1 px-1.5 py-2 flex flex-col gap-1">
                  <span className="block h-[3px] w-[20px] rounded-sm" style={{ background: tile.text }} />
                  <span className="block h-[2px] w-[28px] rounded-sm" style={{ background: tile.muted }} />
                </span>
                {active && (
                  <span className={`absolute right-1 bottom-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${accentBg}`}>
                    <Check className="h-2 w-2 text-white" strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className={`text-[12px] ${active ? `font-semibold ${primaryText}` : secondaryText}`}>{tile.label}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onToggleMatchSystem}
        className={`w-full flex items-center gap-3 h-[38px] px-3 rounded-lg text-[14px] transition-colors ${secondaryText} ${rowHover}`}
        role="switch"
        aria-checked={!!matchSystem}
      >
        <Monitor className={`h-4 w-4 flex-shrink-0 pointer-events-none ${iconClass}`} />
        <span className="flex-1 text-left">Match {systemName} appearance</span>
        <span className={`relative inline-block w-[34px] h-5 rounded-full transition-colors ${matchSystem ? toggleOn : toggleOff}`}>
          <span className={`absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-all ${matchSystem ? 'left-4' : 'left-[2px]'}`} />
        </span>
      </button>
      <div className={`h-px my-1.5 mx-2 ${dividerClass}`} />
      {renderRow({ icon: Lock, label: 'App lock', value: appLockEnabled ? (biometricEnabled ? 'Touch ID · On' : 'On') : 'Off', onClick: onOpenAppLock })}
      {syncAvailable && renderRow({ icon: RefreshCw, label: 'Dash Sync', value: syncLabel, dot: syncDotClass, onClick: onOpenSync })}
      {renderRow({ icon: HardDrive, label: 'Backups', value: backupLabel, onClick: onOpenBackup })}
      {renderRow({ icon: Trash2, label: 'Trash', value: trashCount > 0 ? `${trashCount} item${trashCount === 1 ? '' : 's'}` : undefined, onClick: onOpenTrash })}
      {renderRow({ icon: Keyboard, label: 'Keyboard shortcuts', kbd: '?', onClick: onOpenShortcuts })}
      <div className={`h-px my-1.5 mx-2 ${dividerClass}`} />
      <div className={`flex items-center justify-between h-8 px-3 text-[12px] ${labelClass}`}>
        <span>{appVersion ? `Dash ${appVersion}` : 'Dash'}</span>
        {updateAvailable
          ? (
            <button type="button" onClick={() => { onClose(); onShowUpdate && onShowUpdate() }} className={`font-medium ${accentText} hover:underline`}>
              Update to {updateVersion || 'latest'}
            </button>
            )
          : (
            <button
              type="button"
              disabled={!canCheckForUpdates && !isCheckingForUpdates}
              onClick={() => { onCheckForUpdates && onCheckForUpdates() }}
              className={`${secondaryText} hover:underline disabled:opacity-50 disabled:no-underline`}
            >
              {isCheckingForUpdates ? 'Checking…' : 'Check for updates'}
            </button>
            )}
      </div>
    </div>
  )
}
