import React, { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { MoreVertical, Lock } from 'lucide-react'

const PageItem = ({ page, isActive, onSelect, onRename, onDelete, onToggleLock, sidebarOpen, theme, tags }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

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

  return (
    <div
      className={`flex items-center justify-between py-0.5 px-2 cursor-pointer text-sm ${
        isActive
          ? theme === 'dark'
            ? 'bg-gray-700'
            : 'bg-gray-200'
          : theme === 'dark'
          ? 'hover:bg-gray-800'
          : 'hover:bg-gray-200'
      }`}
      onClick={() => onSelect(page)}
    >
      <div className="flex items-center flex-1 min-w-0">
        {sidebarOpen && (
          <>
            <span className="truncate mr-2">{page.title}</span>
            <div className="flex flex-wrap gap-0.5">
              {page.tagNames && page.tagNames.map((tagName, index) => {
                const tag = tags.find(t => t.name === tagName)
                if (!tag) return null
                return (
                  <span
                    key={index}
                    className="px-1 rounded text-xs"
                    style={{ backgroundColor: tag.color.background, border: `1px solid ${tag.color.border}` }}
                  >
                    {tag.name}
                  </span>
                )
              })}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center space-x-1">
        {page.password && page.password.hash && (
          <Lock className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
        )}
        <div ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              setIsDropdownOpen(!isDropdownOpen)
            }}
          >
            <MoreVertical className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
          </Button>
          {isDropdownOpen && (
            <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            } ring-1 ring-black ring-opacity-5`}>
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
                  {page.password ? 'Unlock' : 'Lock'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PageItem