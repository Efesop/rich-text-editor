import React, { useState } from 'react'
import { Folder, FolderOpen, FolderPlus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import PageItem from './PageItem'

export function FolderItem({ folder, onAddPage, onDeleteFolder, theme, pages, onSelectPage, currentPageId, onRemovePageFromFolder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleExpand = (e) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  return (
    <div>
      <div className="flex items-center justify-between p-2 cursor-pointer" onClick={toggleExpand}>
        <div className="flex items-center">
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 mr-2" />
          ) : (
            <Folder className="h-4 w-4 mr-2" />
          )}
          <span>{folder.title}</span>
        </div>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          {isOpen && (
            <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ring-1 ring-black ring-opacity-5`}>
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
              </div>
            </div>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="ml-4">
          {pages.filter(page => page.folderId === folder.id).map(page => (
            <PageItem
              key={page.id}
              page={page}
              isActive={currentPageId === page.id}
              onSelect={onSelectPage}
              theme={theme}
              sidebarOpen={true}
              onRemoveFromFolder={() => onRemovePageFromFolder(page.id, folder.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}