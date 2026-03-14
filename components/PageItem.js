import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Lock, LockKeyhole, Unlock, Trash2, MoreVertical, FolderMinus, FolderPlus, Copy, Edit3, Timer, TimerOff } from 'lucide-react'
import StackedTags from './StackedTags'
import Tooltip from './Tooltip'
import { isMobileDevice, isSmallScreen } from '@/utils/deviceUtils'
import { ActionSheet, ActionSheetItem, ActionSheetSeparator } from './ActionSheet'

const PageItem = ({
  page,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onToggleLock,
  onRemoveFromFolder,
  onMoveToFolder,
  onSelfDestruct,
  onCancelSelfDestruct,
  sidebarOpen,
  theme,
  tags,
  tempUnlockedPages,
  className = '',
  isInsideFolder = false,
  onDuplicate,
  isSelfDestructing = false,
  onSelfDestructComplete
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const pageItemRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [isHovered, setIsHovered] = useState(false)

  // On mobile/touch devices, always show the 3-dots button (no hover state)
  const isMobile = isMobileDevice() || isSmallScreen()

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  const positionDropdown = () => {
    if (pageItemRef.current && dropdownRef.current) {
      const pageRect = pageItemRef.current.getBoundingClientRect()
      const dropdownRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      let top = pageRect.bottom
      let left = pageRect.right - dropdownRect.width

      if (top + dropdownRect.height > viewportHeight) {
        top = pageRect.top - dropdownRect.height
      }

      if (left < 0) {
        left = pageRect.left
      } else if (left + dropdownRect.width > viewportWidth) {
        left = viewportWidth - dropdownRect.width
      }

      setDropdownPosition({ top, left })
    }
  }

  useEffect(() => {
    if (isDropdownOpen) {
      positionDropdown()
      window.addEventListener('scroll', positionDropdown)
      window.addEventListener('resize', positionDropdown)
    }

    return () => {
      window.removeEventListener('scroll', positionDropdown)
      window.removeEventListener('resize', positionDropdown)
    }
  }, [isDropdownOpen])

  const getPageItemClasses = () => {
    const folderStyle = isInsideFolder
      ? (sidebarOpen ? 'ml-5 mr-1 rounded-l-none border-l-2 ' : 'mx-1 ') + (theme === 'fallout' ? 'border-green-500/20' : theme === 'dark' ? 'border-[#3a3a3a]' : theme === 'darkblue' ? 'border-[#2a3454]' : 'border-neutral-200')
      : 'mx-1'
    const baseClasses = `flex items-center ${sidebarOpen ? 'justify-between px-3 py-2' : 'justify-center px-0 py-1'} cursor-pointer text-sm rounded-lg transition-colors duration-150 overflow-hidden ${folderStyle}`

    if (isActive) {
      if (theme === 'fallout') {
        return `${baseClasses} bg-green-700/30 text-green-300`
      } else if (theme === 'dark') {
        return `${baseClasses} bg-[#2f2f2f] text-[#ececec]`
      } else if (theme === 'darkblue') {
        return `${baseClasses} bg-[#1e2740] text-[#e0e6f0]`
      } else {
        return `${baseClasses} bg-neutral-200 text-neutral-900`
      }
    } else {
      if (theme === 'fallout') {
        return `${baseClasses} hover:bg-gray-800 text-green-400`
      } else if (theme === 'dark') {
        return `${baseClasses} hover:bg-[#232323] text-[#c0c0c0]`
      } else if (theme === 'darkblue') {
        return `${baseClasses} hover:bg-[#161c2e] text-[#8b99b5]`
      } else {
        return `${baseClasses} hover:bg-neutral-100 text-neutral-700`
      }
    }
  }

  const getIconClasses = () => {
    if (isActive) {
      return theme === 'fallout' ? 'text-green-300' : theme === 'dark' ? 'text-[#8e8e8e]' : theme === 'darkblue' ? 'text-[#8b99b5]' : 'text-neutral-500'
    } else {
      switch (theme) {
        case 'fallout':
          return 'text-green-400'
        case 'dark':
          return 'text-[#6b6b6b]'
        case 'darkblue':
          return 'text-[#5d6b88]'
        default:
          return 'text-neutral-400'
      }
    }
  }

  const getSelfDestructIconClasses = () => {
    if (!page.selfDestructAt) return getIconClasses()
    const remaining = page.selfDestructAt - Date.now()
    if (remaining <= 5 * 60 * 1000) {
      // Under 5 min: red with brief pulse every ~minute (CSS handles timing)
      return 'text-red-500 dash-sd-icon-blink'
    }
    if (remaining <= 2 * 60 * 60 * 1000) {
      // Under 2 hours: orange/red
      return theme === 'fallout' ? 'text-red-400' : 'text-orange-500'
    }
    return getIconClasses()
  }

  const getDropdownClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 border border-green-600/40 text-green-400'
      case 'dark':
        return 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#ececec] shadow-xl shadow-black/50'
      case 'darkblue':
        return 'bg-[#1e2740] border border-[#2a3452] text-[#e0e6f0] shadow-xl shadow-black/50'
      default:
        return 'bg-white border border-neutral-200 text-neutral-900 shadow-lg shadow-neutral-200/50'
    }
  }

  const getDropdownItemClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-400 hover:bg-gray-800'
      case 'dark':
        return 'text-[#c0c0c0] hover:bg-[#3a3a3a]'
      case 'darkblue':
        return 'text-[#8b99b5] hover:bg-[#232b42]'
      default:
        return 'text-neutral-600 hover:bg-neutral-100'
    }
  }

  return (
    <div
      ref={pageItemRef}
      className={`${getPageItemClasses()} ${className} ${isSelfDestructing ? 'dash-sd-dissolve' : ''}`}
      onClick={() => !isSelfDestructing && onSelect(page)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onAnimationEnd={(e) => {
        if (e.animationName.startsWith('dash-sd-dissolve') && onSelfDestructComplete) {
          onSelfDestructComplete(page.id)
        }
      }}
      style={{ minHeight: isSelfDestructing ? undefined : '2.25rem' }}
    >
      {sidebarOpen ? (
      <div className="flex items-center flex-1 min-w-0" style={{ marginRight: isHovered ? 0 : -24, transition: 'margin-right 150ms' }}>
        {page.selfDestructAt && (
          <Timer className={`h-3 w-3 flex-shrink-0 mr-1.5 ${getSelfDestructIconClasses()}`} strokeWidth={2} />
        )}
            <span className="flex-1 truncate min-w-0" title={page.title}>
              {page.title}
            </span>
            {Array.isArray(page.tagNames) && page.tagNames.length > 0 && (
              <StackedTags
                tags={page.tagNames}
                maxVisible={2}
                className="ml-2 flex-shrink-0"
                theme={theme}
                tagColorMap={(tags || []).reduce((acc, t) => { acc[t.name] = t.color; return acc }, {})}
                hovered={isHovered}
              />
            )}
            {page.password && page.password.hash && !tempUnlockedPages.has(page.id) && (
              <LockKeyhole className={`h-3 w-3 flex-shrink-0 ml-3 ${theme === 'fallout' ? 'text-green-500' : 'text-blue-500'}`} strokeWidth={2.5} style={{ opacity: isHovered ? 1 : 0, transform: isHovered ? 'rotate(0deg)' : 'rotate(-15deg)', transition: 'opacity 150ms, transform 150ms' }} />
            )}
      </div>
      ) : (
      <Tooltip text={page.title} side="right" delay={150}>
      <div className="flex items-center justify-center flex-1 relative">
        <div
          className={`w-8 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold leading-none transition-all ${
            isActive
              ? theme === 'fallout' ? 'bg-green-500/25 text-green-400'
                : theme === 'darkblue' ? 'bg-[#2a3452] text-[#c0ccdf]'
                : theme === 'dark' ? 'bg-[#3a3a3a] text-[#e0e0e0]'
                : 'bg-neutral-200 text-neutral-700'
              : theme === 'fallout' ? 'bg-green-500/5 text-green-700 hover:bg-green-500/20 hover:text-green-400'
                : theme === 'darkblue' ? 'bg-[#161c2e] text-[#4a5670] hover:bg-[#1e2740] hover:text-[#8b99b5]'
                : theme === 'dark' ? 'bg-[#222] text-[#555] hover:bg-[#2f2f2f] hover:text-[#aaa]'
                : 'bg-neutral-50 text-neutral-300 hover:bg-neutral-200 hover:text-neutral-600'
          }`}
        >
          {page.title.slice(0, 3)}
        </div>
        {page.password && page.password.hash && !tempUnlockedPages.has(page.id) && (
          <LockKeyhole className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${getIconClasses()}`} />
        )}
        {page.selfDestructAt && (
          <Timer className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${getSelfDestructIconClasses()}`} />
        )}
      </div>
      </Tooltip>
      )}

      <div className="flex items-center flex-shrink-0">
        {sidebarOpen && (
          <button
            ref={buttonRef}
            onClick={(e) => {
              e.stopPropagation()
              if (isMobile) {
                setIsActionSheetOpen(true)
              } else {
                setIsDropdownOpen(!isDropdownOpen)
              }
            }}
            className="h-6 w-6 p-0 inline-flex items-center justify-center rounded-md"
            style={{ opacity: isMobile || isHovered ? 1 : 0, transition: 'opacity 150ms' }}
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen || isActionSheetOpen}
            aria-controls={`page-menu-${page.id}`}
            aria-label={`Actions for ${page.title}`}
          >
            <MoreVertical className={`h-4 w-4 ${getIconClasses()}`} />
          </button>
        )}
      </div>
      {isDropdownOpen && createPortal(
        <div
          ref={dropdownRef}
          id={`page-menu-${page.id}`}
          role="menu"
          aria-label={`Actions for ${page.title}`}
          className={`fixed w-48 rounded-lg ${getDropdownClasses()}`}
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            zIndex: 9999,
            animation: 'dash-dropdown-in 120ms ease-out forwards'
          }}
        >
          <div className="py-1">
            <button
              role="menuitem"
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onRename(page)
                setIsDropdownOpen(false)
              }}
            >
              <Edit3 className="h-4 w-4 inline mr-2" aria-hidden="true" />
              Rename
            </button>
            <button
              role="menuitem"
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(page)
                setIsDropdownOpen(false)
              }}
            >
              <Copy className="h-4 w-4 inline mr-2" aria-hidden="true" />
              Duplicate
            </button>
            {onMoveToFolder && (
              <button
                role="menuitem"
                className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveToFolder(page)
                  setIsDropdownOpen(false)
                }}
              >
                <FolderPlus className="h-4 w-4 inline mr-2" aria-hidden="true" />
                Move to Folder
              </button>
            )}
            <button
              role="menuitem"
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleLock(page)
                setIsDropdownOpen(false)
              }}
            >
              {page.password && page.password.hash ? (
                <>
                  <Unlock className="h-4 w-4 inline mr-2" aria-hidden="true" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 inline mr-2" aria-hidden="true" />
                  Lock
                </>
              )}
            </button>
            {page.selfDestructAt ? (
              <button
                role="menuitem"
                className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onCancelSelfDestruct?.(page)
                  setIsDropdownOpen(false)
                }}
              >
                <TimerOff className="h-4 w-4 inline mr-2" aria-hidden="true" />
                Cancel Self-Destruct
              </button>
            ) : (
              <button
                role="menuitem"
                className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelfDestruct?.(page)
                  setIsDropdownOpen(false)
                }}
              >
                <Timer className="h-4 w-4 inline mr-2" aria-hidden="true" />
                Self-Destruct
              </button>
            )}
            <button
              role="menuitem"
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(page)
                setIsDropdownOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4 inline mr-2" aria-hidden="true" />
              Delete
            </button>
            {onRemoveFromFolder && (
              <button
                role="menuitem"
                className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveFromFolder()
                  setIsDropdownOpen(false)
                }}
              >
                <FolderMinus className="h-4 w-4 inline mr-2" aria-hidden="true" />
                Remove from Folder
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Mobile Action Sheet */}
      <ActionSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        title={page.title}
      >
        <ActionSheetItem
          icon={Edit3}
          label="Rename"
          onClick={() => {
            onRename(page)
            setIsActionSheetOpen(false)
          }}
        />
        <ActionSheetItem
          icon={Copy}
          label="Duplicate"
          onClick={() => {
            onDuplicate(page)
            setIsActionSheetOpen(false)
          }}
        />
        {onMoveToFolder && (
          <ActionSheetItem
            icon={FolderPlus}
            label="Move to Folder"
            onClick={() => {
              onMoveToFolder(page)
              setIsActionSheetOpen(false)
            }}
          />
        )}
        <ActionSheetItem
          icon={page.password && page.password.hash ? Unlock : Lock}
          label={page.password && page.password.hash ? 'Unlock' : 'Lock'}
          onClick={() => {
            onToggleLock(page)
            setIsActionSheetOpen(false)
          }}
        />
        <ActionSheetItem
          icon={page.selfDestructAt ? TimerOff : Timer}
          label={page.selfDestructAt ? 'Cancel Self-Destruct' : 'Self-Destruct'}
          onClick={() => {
            if (page.selfDestructAt) {
              onCancelSelfDestruct?.(page)
            } else {
              onSelfDestruct?.(page)
            }
            setIsActionSheetOpen(false)
          }}
        />
        {onRemoveFromFolder && (
          <>
            <ActionSheetSeparator />
            <ActionSheetItem
              icon={FolderMinus}
              label="Remove from Folder"
              onClick={() => {
                onRemoveFromFolder()
                setIsActionSheetOpen(false)
              }}
            />
          </>
        )}
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={Trash2}
          label="Delete"
          variant="danger"
          onClick={() => {
            onDelete(page)
            setIsActionSheetOpen(false)
          }}
        />
      </ActionSheet>
    </div>
  )
}

export default PageItem
