import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal, Download, Share2, History, FolderInput, Copy, Import, FileInput, Smartphone, Bug, Trash2, Pin, PinOff, LayoutTemplate } from 'lucide-react'
import { getThemeClasses } from '@/utils/themeUtils'
import Tooltip from './Tooltip'

// Desktop page overflow menu (⋯). Holds the page actions that are not
// one-click affordances plus the rare app-level actions that used to
// crowd the header (import, phone setup, bug report, update).

const MENU_WIDTH = 256

export default function PageMenu ({
  theme,
  buttonClassName = '',
  pageActionsAvailable = true,
  updateAvailable,
  updateVersion,
  onShowUpdate,
  onShare,
  onVersionHistory,
  onMoveToFolder,
  onDuplicate,
  isPinned = false,
  onTogglePin,
  onSaveAsTemplate,
  onImportBundle,
  onImportNotes,
  isImporting,
  showPhoneSetup,
  onPhoneSetup,
  onReportBug,
  onDelete
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const classes = getThemeClasses(theme)
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'
  const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
    setPos({ top: rect.bottom + 6, left })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    const handleKey = (event) => { if (event.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const itemText = isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#c0c0c0]' : 'text-neutral-600'
  const itemHover = isFallout ? 'hover:bg-gray-800 hover:text-green-300' : isDarkBlue ? 'hover:bg-[#232b42] hover:text-[#e0e6f0]' : isDark ? 'hover:bg-[#3a3a3a] hover:text-[#ececec]' : 'hover:bg-neutral-100 hover:text-neutral-900'
  const primaryText = isFallout ? 'text-green-300' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-neutral-900'
  const kbdClass = isFallout ? 'text-green-700' : isDarkBlue ? 'text-[#445068]' : isDark ? 'text-[#6b6b6b]' : 'text-neutral-400'
  const dividerClass = isFallout ? 'bg-green-600/30' : isDarkBlue ? 'bg-[#1c2438]' : isDark ? 'bg-[#3a3a3a]' : 'bg-neutral-200'
  const accentDot = isFallout ? 'bg-green-500' : 'bg-blue-500'
  const accentIcon = isFallout ? 'text-green-400' : 'text-blue-500'
  const dangerClass = isFallout ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-500/10'

  // Plain render helper, deliberately NOT a nested component: a component
  // defined inside render gets a new identity on every re-render, which
  // remounts the button between mousedown and mouseup (the editor blurs on
  // mousedown and re-renders the app) — and the click never fires.
  const renderItem = ({ icon: Icon, label, kbd, onClick, className = '', iconClass = '', disabled = false, trailing = null }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => { setIsOpen(false); onClick && onClick() }}
      className={`w-full flex items-center gap-3 h-9 px-3 rounded-lg text-[14px] transition-colors disabled:opacity-50 ${className}`}
    >
      <Icon className={`h-4 w-4 flex-shrink-0 pointer-events-none ${iconClass}`} />
      <span className="flex-1 text-left truncate">{label}</span>
      {trailing}
      {kbd && <span className={`text-[11px] tracking-wide ${kbdClass}`}>{kbd}</span>}
    </button>
  )

  return (
    <>
      <Tooltip text="More">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(open => !open)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={`relative p-2 rounded-lg transition-colors cursor-pointer ${buttonClassName}`}
        >
          <MoreHorizontal className="h-4 w-4 pointer-events-none" />
          {updateAvailable && (
            <span className={`absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full pointer-events-none ${accentDot} ${isDark ? 'ring-2 ring-[#0d0d0d]' : isDarkBlue ? 'ring-2 ring-[#0c1017]' : isFallout ? 'ring-2 ring-gray-900' : 'ring-2 ring-white'}`} />
          )}
        </button>
      </Tooltip>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className={`fixed z-[70] rounded-xl border p-1.5 ${classes.dropdown}`}
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH, animation: 'dash-dropdown-in 120ms ease-out forwards' }}
          // Keep focus (and the caret) in the editor: a menu shouldn't steal it.
          onMouseDown={(event) => event.preventDefault()}
        >
          {updateAvailable && (
            <>
              {renderItem({
                icon: Download,
                iconClass: accentIcon,
                label: `Update to Dash ${updateVersion || ''}`.trim(),
                className: `${primaryText} ${itemHover}`,
                onClick: onShowUpdate,
                trailing: <span className={`inline-block w-[7px] h-[7px] rounded-full ${accentDot}`} />
              })}
              <div className={`h-px my-1 mx-1.5 ${dividerClass}`} />
            </>
          )}
          {pageActionsAvailable && (
            <>
              {renderItem({ icon: Share2, label: 'Share encrypted note…', className: `${itemText} ${itemHover}`, onClick: onShare })}
              {renderItem({ icon: History, label: 'Version history', className: `${itemText} ${itemHover}`, onClick: onVersionHistory })}
              {renderItem({ icon: FolderInput, label: 'Move to folder…', className: `${itemText} ${itemHover}`, onClick: onMoveToFolder })}
              {renderItem({ icon: Copy, label: 'Duplicate', kbd: `${mod}⇧D`, className: `${itemText} ${itemHover}`, onClick: onDuplicate })}
              {onTogglePin && renderItem({ icon: isPinned ? PinOff : Pin, label: isPinned ? 'Unpin note' : 'Pin note', kbd: `${mod}⇧P`, className: `${itemText} ${itemHover}`, onClick: onTogglePin })}
              {onSaveAsTemplate && renderItem({ icon: LayoutTemplate, label: 'Save as template…', className: `${itemText} ${itemHover}`, onClick: onSaveAsTemplate })}
              <div className={`h-px my-1 mx-1.5 ${dividerClass}`} />
            </>
          )}
          {onImportNotes && renderItem({ icon: FileInput, label: 'Import notes…', disabled: isImporting, className: `${itemText} ${itemHover}`, onClick: onImportNotes })}
          {renderItem({ icon: Import, label: isImporting ? 'Importing…' : 'Import encrypted bundle…', disabled: isImporting, className: `${itemText} ${itemHover}`, onClick: onImportBundle })}
          {showPhoneSetup && renderItem({ icon: Smartphone, label: 'Use on your phone…', className: `${itemText} ${itemHover}`, onClick: onPhoneSetup })}
          {renderItem({ icon: Bug, label: 'Report a bug', className: `${itemText} ${itemHover}`, onClick: onReportBug })}
          {pageActionsAvailable && (
            <>
              <div className={`h-px my-1 mx-1.5 ${dividerClass}`} />
              {renderItem({ icon: Trash2, label: 'Move to Trash', kbd: `${mod}⇧⌫`, className: dangerClass, onClick: onDelete })}
            </>
          )}
        </div>
      )}
    </>
  )
}
