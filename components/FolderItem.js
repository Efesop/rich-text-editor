import React, { useState, useEffect, useRef } from 'react'
import { Folder, FolderOpen, FolderPlus, Trash2, MoreVertical, Pencil, Edit3, Plus } from 'lucide-react'
import { Button } from './ui/button'
import PageItem from './PageItem'

export function FolderItem({ 
  folder, 
  onAddPage, 
  onDeleteFolder, 
  onRenameFolder, 
  theme, 
  pages, 
  onSelectPage, 
  currentPageId, 
  onRemovePageFromFolder, 
  tags, 
  tempUnlockedPages, 
  sidebarOpen, 
  onDelete, 
  onRename, 
  onToggleLock,
  onDuplicate, // Add this prop
  pagesCount 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newFolderName, setNewFolderName] = useState(folder.title)
  const dropdownRef = useRef(null)
  const folderRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

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

  const toggleExpand = (e) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleRename = () => {
    onRenameFolder(folder.id, newFolderName)
    setIsRenaming(false)
  }

  const positionDropdown = () => {
    if (folderRef.current && dropdownRef.current) {
      const folderRect = folderRef.current.getBoundingClientRect()
      const dropdownRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      let top = folderRect.bottom
      let left = folderRect.right - dropdownRect.width

      // Adjust vertical position if dropdown would go off-screen
      if (top + dropdownRect.height > viewportHeight) {
        top = folderRect.top - dropdownRect.height
      }

      // Adjust horizontal position if dropdown would go off-screen
      if (left < 0) {
        left = folderRect.left
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

  const getFolderHoverClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'hover:bg-gray-800 text-green-400'
      case 'dark':
        return 'hover:bg-gray-800 text-white'
      default:
        return 'hover:bg-gray-200 text-black'
    }
  }

  const getFolderCountClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-800 text-green-300 border border-green-600'
      case 'dark':
        return 'bg-gray-700 text-gray-200'
      default:
        return 'bg-gray-200 text-gray-900'
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
    <div className="my-3" ref={folderRef} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div
        className={`flex items-center justify-between px-2 h-8 cursor-pointer text-sm ${getFolderHoverClasses()}`}
        onClick={toggleExpand}
      >
        <div className="flex items-center flex-grow">
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 mr-2 text-blue-500" strokeWidth={2} />
          ) : (
            <Folder className="h-4 w-4 mr-2" strokeWidth={2} />
          )}
          {isRenaming ? (
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value.slice(0, 20))}
              onBlur={handleRename}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleRename()
                }
              }}
              className="bg-transparent outline-none"
              autoFocus
              maxLength={20}
            />
          ) : (
            sidebarOpen ? (
              <div className="flex items-center">
                <span className="truncate text-sm font-medium mr-1" title={folder.title}>
                  {folder.title.length > 20 ? `${folder.title.slice(0, 17)}...` : folder.title}
                </span>
                {pagesCount > 0 && (
                  <span className={`text-xs px-1 ml-1 rounded-full ${getFolderCountClasses()}`}>
                    {pagesCount}
                  </span>
                )}
              </div>
            ) : (
              <span className="truncate text-sm font-medium" title={folder.title}>
                {folder.title.slice(0, 2)}...
              </span>
            )
          )}
        </div>
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
            <MoreVertical className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isExpanded && (
        <div className="ml-6 border-l border-gray-300 dark:border-gray-600">
          {(pages || []).map((page) => (
            <PageItem
              key={page.id}
              page={page}
              isActive={currentPageId === page.id}
              onSelect={onSelectPage}
              onRename={onRename}
              onDelete={onDelete}
              onToggleLock={onToggleLock}
              onRemoveFromFolder={() => onRemovePageFromFolder(page.id, folder.id)}
              sidebarOpen={sidebarOpen}
              theme={theme}
              tags={tags}
              tempUnlockedPages={tempUnlockedPages}
              isInsideFolder={true}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      )}
      {isDropdownOpen && (
        <div 
          ref={dropdownRef}
          className={`fixed w-48 rounded-md shadow-lg ${getDropdownClasses()} ring-1 ring-black ring-opacity-5`}
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
                setIsRenaming(true)
                setNewFolderName(folder.title)
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
                onAddPage(folder.id)
                setIsDropdownOpen(false)
              }}
            >
              <Plus className="h-4 w-4 inline mr-2" />
              Add Page
            </button>
            <button
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onDeleteFolder(folder.id)
                setIsDropdownOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4 inline mr-2" />
              Delete Folder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}