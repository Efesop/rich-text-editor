import React, { useState, useEffect, useRef } from 'react'
import { Folder, FolderOpen, Trash2, MoreVertical, Edit3, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import SortablePageItem from './SortablePageItem'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { isMobileDevice, isSmallScreen } from '@/utils/deviceUtils'
import { ActionSheet, ActionSheetItem, ActionSheetSeparator } from './ActionSheet'

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
  onDuplicate,
  onMoveToFolder,
  pagesCount,
  isDropTarget = false,
  isDndEnabled = false,
  folderPageIds = [],
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newFolderName, setNewFolderName] = useState(folder.title)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const folderRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false)

  const isMobile = isMobileDevice() || isSmallScreen()

  // Auto-expand folder when dragging a page over it
  useEffect(() => {
    if (isDropTarget && !isExpanded) {
      const timer = setTimeout(() => setIsExpanded(true), 500)
      return () => clearTimeout(timer)
    }
  }, [isDropTarget, isExpanded])

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

      if (top + dropdownRect.height > viewportHeight) {
        top = folderRect.top - dropdownRect.height
      }

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
        return 'hover:bg-[#232323] text-[#c0c0c0]'
      default:
        return 'hover:bg-neutral-100 text-neutral-700'
    }
  }

  const getFolderCountClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-800 text-green-300 border border-green-600/30'
      case 'dark':
        return 'bg-[#2a2a2a] text-[#6b6b6b]'
      default:
        return 'bg-neutral-200 text-neutral-500'
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

  const getFolderIconClasses = () => {
    if (isExpanded) {
      switch (theme) {
        case 'fallout':
          return 'text-green-400'
        case 'dark':
          return 'text-blue-500'
        default:
          return 'text-blue-600'
      }
    }
    switch (theme) {
      case 'fallout':
        return 'text-green-500'
      case 'dark':
        return 'text-[#8e8e8e]'
      default:
        return 'text-neutral-400'
    }
  }

  const getChevronClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-600'
      case 'dark':
        return 'text-[#6b6b6b]'
      default:
        return 'text-neutral-400'
    }
  }

  return (
    <div className={`my-1 transition-all duration-150 ${isDropTarget ? `rounded-lg ${theme === 'fallout' ? 'ring-2 ring-green-500/50' : 'ring-2 ring-blue-500/50'}` : ''}`} ref={folderRef} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div
        className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm rounded-lg mx-1 transition-colors duration-150 ${getFolderHoverClasses()}`}
        onClick={toggleExpand}
      >
        <div className="flex items-center flex-grow min-w-0">
          <span className={`mr-1 ${getChevronClasses()}`}>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-3 w-3" strokeWidth={2} />
            )}
          </span>
          {isExpanded ? (
            <FolderOpen className={`h-4 w-4 mr-2 flex-shrink-0 ${getFolderIconClasses()}`} strokeWidth={1.5} />
          ) : (
            <Folder className={`h-4 w-4 mr-2 flex-shrink-0 ${getFolderIconClasses()}`} strokeWidth={1.5} />
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
              className="bg-transparent outline-none flex-1 min-w-0"
              autoFocus
              maxLength={20}
            />
          ) : (
            sidebarOpen ? (
              <div className="flex items-center min-w-0">
                <span className="truncate text-sm font-medium mr-1" title={folder.title}>
                  {folder.title.length > 20 ? `${folder.title.slice(0, 17)}...` : folder.title}
                </span>
                {pagesCount > 0 && (
                  <span className={`text-xs px-1.5 ml-1 rounded-full ${getFolderCountClasses()}`}>
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
            aria-controls={`folder-menu-${folder.id}`}
            aria-label={`Actions for folder ${folder.title}`}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {isExpanded && (
        <SortableContext
          items={folderPageIds}
          strategy={verticalListSortingStrategy}
          disabled={!isDndEnabled}
        >
          <div className="mt-0.5" style={{ minHeight: '4px' }}>
            {folderPageIds.map(pageId => {
              const page = (pages || []).find(p => p.id === pageId)
              if (!page) return null
              return (
                <SortablePageItem
                  key={page.id}
                  id={page.id}
                  disabled={!isDndEnabled}
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
                  onMoveToFolder={onMoveToFolder}
                />
              )
            })}
          </div>
        </SortableContext>
      )}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          id={`folder-menu-${folder.id}`}
          role="menu"
          aria-label={`Actions for folder ${folder.title}`}
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
                setIsRenaming(true)
                setNewFolderName(folder.title)
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
                onAddPage(folder.id)
                setIsDropdownOpen(false)
              }}
            >
              <Plus className="h-4 w-4 inline mr-2" aria-hidden="true" />
              Add Page
            </button>
            <button
              role="menuitem"
              className={`block px-4 py-2 text-sm w-full text-left ${getDropdownItemClasses()}`}
              onClick={(e) => {
                e.stopPropagation()
                onDeleteFolder(folder.id)
                setIsDropdownOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4 inline mr-2" aria-hidden="true" />
              Delete Folder
            </button>
          </div>
        </div>
      )}

      {/* Mobile Action Sheet */}
      <ActionSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        title={folder.title}
        icon={Folder}
      >
        <ActionSheetItem
          icon={Edit3}
          label="Rename"
          onClick={() => {
            setIsRenaming(true)
            setNewFolderName(folder.title)
            setIsActionSheetOpen(false)
          }}
        />
        <ActionSheetItem
          icon={Plus}
          label="Add Page"
          onClick={() => {
            onAddPage(folder.id)
            setIsActionSheetOpen(false)
          }}
        />
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={Trash2}
          label="Delete Folder"
          variant="danger"
          onClick={() => {
            onDeleteFolder(folder.id)
            setIsActionSheetOpen(false)
          }}
        />
      </ActionSheet>
    </div>
  )
}
