import React, { useState, useEffect, useRef } from 'react'
import { Folder, FolderOpen, FolderPlus, Trash2, MoreVertical, Pencil } from 'lucide-react'
import { Button } from './ui/button'
import PageItem from './PageItem'

export function FolderItem({ folder, onAddPage, onDeleteFolder, onRenameFolder, theme, pages, onSelectPage, currentPageId, onRemovePageFromFolder, tags, tempUnlockedPages, sidebarOpen, onDelete, onRename, onToggleLock }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newFolderName, setNewFolderName] = useState(folder.title)
  const dropdownRef = useRef(null)

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

  const expandedBgColor = theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'

  const handleRename = () => {
    onRenameFolder(folder.id, newFolderName)
    setIsRenaming(false)
  }

  return (
    <div className="py-1"> {/* Added padding to the folder container */}
      <div
        className="flex items-center justify-between px-2 h-8 cursor-pointer text-sm" // Adjusted height to match PageItem
        onClick={toggleExpand}
      >
        <div className="flex items-center">
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 mr-2" />
          ) : (
            <Folder className="h-4 w-4 mr-2" />
          )}
          {isRenaming ? (
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleRename}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleRename()
                }
              }}
              className="font-bold text-sm bg-transparent"
              autoFocus
            />
          ) : (
            <span className="font-bold text-sm">{folder.title}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setIsOpen(!isOpen)
          }}
          className="h-6 w-6 p-0" // Adjusted size to match PageItem
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
      {isOpen && (
        <div ref={dropdownRef} className={`absolute right-2 mt-2 w-48 rounded-md shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ring-1 ring-black ring-opacity-5`}>
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
        <div> {/* Removed the ml-4 class */}
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
            />
          ))}
        </div>
      )}
    </div>
  )
}