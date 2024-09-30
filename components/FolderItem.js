import React, { useState, useEffect, useRef } from 'react'
import { Folder, FolderOpen, FolderPlus, Trash2, MoreVertical, Pencil, FolderOpenDot, FolderOpenIcon } from 'lucide-react'
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
  pagesCount  // Add this line
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newFolderName, setNewFolderName] = useState(folder.title)
  const dropdownRef = useRef(null)
  const folderRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
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
    if (isOpen) {
      positionDropdown()
      window.addEventListener('scroll', positionDropdown)
      window.addEventListener('resize', positionDropdown)
    }

    return () => {
      window.removeEventListener('scroll', positionDropdown)
      window.removeEventListener('resize', positionDropdown)
    }
  }, [isOpen])

  return (
    <div className="my-3" ref={folderRef} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div
        className={`flex items-center justify-between px-2 h-8 cursor-pointer text-sm ${
          theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'
        }`}
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
                  <span className={`text-xs px-1 ml-1 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200 text-gray-900'}`}>
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
        {isHovered && sidebarOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            className="h-6 w-6 p-0 mr-0"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isOpen && (
        <div 
          ref={dropdownRef} 
          className={`fixed w-48 rounded-md shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ring-1 ring-black ring-opacity-5`}
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            zIndex: 1000
          }}
        >
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddPage(folder.id)
                setIsOpen(false)
              }}
              className={`block px-4 py-2 text-sm w-full text-left ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
              role="menuitem"
            >
              <FolderPlus className="h-4 w-4 inline mr-2" />
              Add Page
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteFolder(folder.id)
                setIsOpen(false)
              }}
              className={`block px-4 py-2 text-sm w-full text-left ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
              role="menuitem"
            >
              <Trash2 className="h-4 w-4 inline mr-2" />
              Delete Folder
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsRenaming(true)
                setIsOpen(false)
              }}
              className={`block px-4 py-2 text-sm w-full text-left ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
              role="menuitem"
            >
              <Pencil className="h-4 w-4 inline mr-2" />
              Rename Folder
            </button>
          </div>
        </div>
      )}
      {isExpanded && (
        <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}`}>
          {pages.filter(page => page.folderId === folder.id).map(page => (
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
              folderTheme={theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}
            />
          ))}
        </div>
      )}
    </div>
  )
}