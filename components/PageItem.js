import React, { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { FileText, Lock, Unlock, Trash2, MoreVertical, FolderMinus, Copy, Edit3 } from 'lucide-react'
import StackedTags from './StackedTags'

const PageItem = ({ 
  page, 
  isActive, 
  onSelect, 
  onRename, 
  onDelete, 
  onToggleLock, 
  onRemoveFromFolder, 
  sidebarOpen, 
  theme, 
  tags, 
  tempUnlockedPages, 
  className, 
  isInsideFolder = false,
  onDuplicate,
  //folderTheme = ''
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const pageItemRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const truncatePageTitle = (title) => {
    if (title.length > 10 && page.tagNames && page.tagNames.length > 0) {
      return title.slice(0, 10) + '...';
    }
    return title;
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const positionDropdown = () => {
    if (pageItemRef.current && dropdownRef.current) {
      const pageRect = pageItemRef.current.getBoundingClientRect()
      const dropdownRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      let top = pageRect.bottom
      let left = pageRect.right - dropdownRect.width

      // Adjust vertical position if dropdown would go off-screen
      if (top + dropdownRect.height > viewportHeight) {
        top = pageRect.top - dropdownRect.height
      }

      // Adjust horizontal position if dropdown would go off-screen
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
    const baseClasses = 'flex items-center justify-between px-2 py-2 cursor-pointer text-sm w-full'
    
    if (isActive) {
      if (theme === 'fallout') {
        return `${baseClasses} bg-green-700 text-gray-900`
      } else if (theme === 'dark') {
        return `${baseClasses} bg-blue-700 text-white`
      } else {
        return `${baseClasses} bg-blue-600 text-white`
      }
    } else {
      if (theme === 'fallout') {
        return `${baseClasses} hover:bg-gray-800 text-green-400 ${isInsideFolder ? 'bg-gray-900' : ''}`
      } else if (theme === 'dark') {
        return `${baseClasses} hover:bg-gray-800 text-white ${isInsideFolder ? 'bg-gray-800' : ''}`
      } else {
        return `${baseClasses} hover:bg-gray-200 text-black ${isInsideFolder ? 'bg-gray-200' : ''}`
      }
    }
  }

  const getIconClasses = () => {
    if (isActive) {
      return theme === 'fallout' ? 'text-gray-900' : 'text-white'
    } else {
      switch (theme) {
        case 'fallout':
          return 'text-green-400'
        case 'dark':
          return 'text-gray-400'
        default:
          return 'text-gray-600'
      }
    }
  }

  const getDropdownClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 border border-green-600 text-green-400'
      case 'dark':
        return 'bg-gray-800 text-white'
      default:
        return 'bg-white text-gray-900'
    }
  }

  const getDropdownItemClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-400 hover:bg-gray-800'
      case 'dark':
        return 'text-gray-300 hover:bg-gray-700'
      default:
        return 'text-gray-700 hover:bg-gray-100'
    }
  }

  return (
    <div
      ref={pageItemRef}
      className={`${getPageItemClasses()} ${className}`}
      onClick={() => onSelect(page)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ minHeight: '2.5rem' }} // Ensure consistent height
    >
      <div className="flex items-center flex-1 min-w-0">
        {sidebarOpen ? (
          <>
            <FileText className={`h-4 w-4 mr-2 flex-shrink-0 ${getIconClasses()}`} />
            <span className="mr-2 truncate" title={page.title}>
              {page.title}
            </span>
            {Array.isArray(page.tagNames) && page.tagNames.length > 0 && (
              <StackedTags 
                tags={page.tagNames}
                maxVisible={3}
                className="ml-auto flex-shrink-0"
                theme={theme}
                tagColorMap={(tags || []).reduce((acc, t) => { acc[t.name] = t.color; return acc }, {})}
                hovered={isHovered}
              />
            )}
          </>
        ) : (
          <span className="truncate mr-2" title={page.title}>
            {page.title.slice(0, 3)}...
          </span>
        )}
      </div>
      <div className="flex items-center space-x-1">
        {page.password && page.password.hash && !tempUnlockedPages.has(page.id) && (
          <Lock className={`h-4 w-4 ${getIconClasses()}`} />
        )}
        {sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              setIsDropdownOpen(!isDropdownOpen)
            }}
            className={`h-6 w-6 p-0 opacity-0 ${isHovered ? 'opacity-100' : ''}`}
          >
            <MoreVertical className={`h-4 w-4 ${getIconClasses()}`} />
          </Button>
        )}
      </div>
      {isDropdownOpen && (
        <div 
          ref={dropdownRef}
          className={`fixed w-48 rounded-md shadow-lg ${getDropdownClasses()}`}
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            zIndex: 1000
          }}
        >
          <div className="py-1">
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onRename(page)
                setIsDropdownOpen(false)
              }}
            >
              <Edit3 className="h-4 w-4 inline mr-2" />
              Rename
            </button>
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(page)
                setIsDropdownOpen(false)
              }}
            >
              <Copy className="h-4 w-4 inline mr-2" />
              Duplicate
            </button>
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleLock(page)
                setIsDropdownOpen(false)
              }}
            >
              {page.password && page.password.hash ? (
                <>
                  <Unlock className="h-4 w-4 inline mr-2" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 inline mr-2" />
                  Lock
                </>
              )}
            </button>
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(page)
                setIsDropdownOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4 inline mr-2" />
              Delete
            </button>
            {onRemoveFromFolder && (
              <button
                className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveFromFolder()
                  setIsDropdownOpen(false)
                }}
              >
                <FolderMinus className="h-4 w-4 inline mr-2" />
                Remove from Folder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PageItem