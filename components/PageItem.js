import React, { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { Lock, Unlock, Trash2, MoreVertical, FolderMinus, FolderPlus, Copy, Edit3 } from 'lucide-react'
import StackedTags from './StackedTags'
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
  sidebarOpen,
  theme,
  tags,
  tempUnlockedPages,
  className,
  isInsideFolder = false,
  onDuplicate
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

  const truncatePageTitle = (title) => {
    if (title.length > 10 && page.tagNames && page.tagNames.length > 0) {
      return title.slice(0, 10) + '...';
    }
    return title;
  };

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
      ? 'ml-5 mr-2 rounded-l-none border-l-2 ' + (theme === 'fallout' ? 'border-green-500/20' : theme === 'dark' ? 'border-[#3a3a3a]' : 'border-neutral-200')
      : 'mx-2'
    const baseClasses = `flex items-center justify-between px-3 py-2 cursor-pointer text-sm rounded-lg transition-colors duration-150 ${folderStyle}`

    if (isActive) {
      if (theme === 'fallout') {
        return `${baseClasses} bg-green-700/30 text-green-300`
      } else if (theme === 'dark') {
        return `${baseClasses} bg-[#2f2f2f] text-[#ececec]`
      } else {
        return `${baseClasses} bg-neutral-200 text-neutral-900`
      }
    } else {
      if (theme === 'fallout') {
        return `${baseClasses} hover:bg-gray-800 text-green-400`
      } else if (theme === 'dark') {
        return `${baseClasses} hover:bg-[#232323] text-[#c0c0c0]`
      } else {
        return `${baseClasses} hover:bg-neutral-100 text-neutral-700`
      }
    }
  }

  const getIconClasses = () => {
    if (isActive) {
      return theme === 'fallout' ? 'text-green-300' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-neutral-500'
    } else {
      switch (theme) {
        case 'fallout':
          return 'text-green-400'
        case 'dark':
          return 'text-[#6b6b6b]'
        default:
          return 'text-neutral-400'
      }
    }
  }

  const getDropdownClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 border border-green-600/40 text-green-400'
      case 'dark':
        return 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#ececec] shadow-xl shadow-black/50'
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
      default:
        return 'text-neutral-600 hover:bg-neutral-100'
    }
  }

  return (
    <div
      ref={pageItemRef}
      className={`${getPageItemClasses()} ${className}`}
      onClick={() => onSelect(page)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ minHeight: '2.25rem' }}
    >
      <div className="flex items-center flex-1 min-w-0">
        {sidebarOpen ? (
          <>
            <span className="truncate" title={page.title}>
              {truncatePageTitle(page.title)}
            </span>
            {Array.isArray(page.tagNames) && page.tagNames.length > 0 && (
              <StackedTags
                tags={page.tagNames}
                maxVisible={2}
                className="ml-auto flex-shrink-0"
                theme={theme}
                tagColorMap={(tags || []).reduce((acc, t) => { acc[t.name] = t.color; return acc }, {})}
                hovered={isHovered}
              />
            )}
          </>
        ) : (
          <span className="truncate" title={page.title}>
            {page.title.slice(0, 3)}...
          </span>
        )}
      </div>
      <div className="flex items-center space-x-1">
        {page.password && page.password.hash && !tempUnlockedPages.has(page.id) && (
          <Lock className={`h-3.5 w-3.5 ${getIconClasses()}`} />
        )}
        {sidebarOpen && (
          <Button
            ref={buttonRef}
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              if (isMobile) {
                setIsActionSheetOpen(true)
              } else {
                setIsDropdownOpen(!isDropdownOpen)
              }
            }}
            className={`h-6 w-6 p-0 ${isMobile ? 'opacity-100' : `opacity-0 ${isHovered ? 'opacity-100' : ''}`}`}
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen || isActionSheetOpen}
            aria-controls={`page-menu-${page.id}`}
            aria-label={`Actions for ${page.title}`}
          >
            <MoreVertical className={`h-4 w-4 ${getIconClasses()}`} />
          </Button>
        )}
      </div>
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          id={`page-menu-${page.id}`}
          role="menu"
          aria-label={`Actions for ${page.title}`}
          className={`fixed w-48 rounded-lg ${getDropdownClasses()}`}
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            zIndex: 9999
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
        </div>
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
