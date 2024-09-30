import React, { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { FileText, Lock, Unlock, Trash2, MoreVertical, FolderMinus } from 'lucide-react'

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
  folderTheme = ''
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

  return (
    <div
      ref={pageItemRef}
      className={`flex items-center justify-between px-2 py-2 cursor-pointer text-sm w-full ${
        isActive
          ? isInsideFolder
            ? theme === 'dark'
              ? 'bg-blue-700 text-white'
              : 'bg-blue-600 text-white'
            : theme === 'dark'
              ? 'bg-blue-700 text-white'
              : 'bg-blue-600 text-white'
          : theme === 'dark'
          ? isInsideFolder
            ? 'hover:bg-gray-800'
            : 'hover:bg-gray-800'
          : 'hover:bg-gray-200'
      } ${isInsideFolder && !isActive ? theme === 'dark' ? 'text-white bg-gray-800' : 'text-black bg-gray-200' : ''} ${className}`}
      onClick={() => onSelect(page)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ minHeight: '2.5rem' }} // Ensure consistent height
    >
      <div className="flex items-center flex-1 min-w-0 pl-2">
        {sidebarOpen ? (
          <>
            <span className="mr-2" title={page.title}>
              {truncatePageTitle(page.title)}
            </span>
            {page.tagNames && page.tagNames.length > 0 && (
              <div className="flex flex-wrap gap-0.5 min-h-[0.5rem]">
                {page.tagNames.map((tagName, index) => {
                  const tag = tags.find(t => t.name === tagName)
                  if (!tag) return null
                  return (
                    <span
                      key={index}
                      className={`px-1 rounded text-xs ${
                        theme === 'dark' ? 'text-gray-900' : 'text-gray-800'
                      }`}
                      style={{ backgroundColor: tag.color.background, border: `1px solid ${tag.color.border}` }}
                    >
                      {tag.name}
                    </span>
                  )
                })}
              </div>
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
          <Lock className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            setIsDropdownOpen(!isDropdownOpen)
          }}
          className={`h-6 w-6 p-0 opacity-0 ${isHovered ? 'opacity-100' : ''}`}
        >
          <MoreVertical className={`h-4 w-4 ${isActive ? 'text-white' : theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
        </Button>
      </div>
      {isDropdownOpen && (
        <div 
          ref={dropdownRef}
          className={`fixed w-48 rounded-md shadow-lg ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          } ring-1 ring-black ring-opacity-5`}
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            zIndex: 1000
          }}
        >
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${
                theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onRename(page)
                setIsDropdownOpen(false)
              }}
            >
              <FileText className="h-4 w-4 inline mr-2" />
              Rename
            </button>
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${
                theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(page)
                setIsDropdownOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4 inline mr-2" />
              Delete
            </button>
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${
                theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleLock(page)
                setIsDropdownOpen(false)
              }}
            >
              {page.password ? (
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
            {onRemoveFromFolder && (
              <button
                className={`block px-4 py-2 text-sm w-full text-left ${
                  theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
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