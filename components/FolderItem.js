import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Folder, FolderOpen, Trash2, MoreVertical, Edit3, Plus } from 'lucide-react'
import SortablePageItem from './SortablePageItem'
import Tooltip from './Tooltip'
import { RenameFolderModal } from './RenameFolderModal'
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
  onSelfDestruct,
  onCancelSelfDestruct,
  selfDestructingPages,
  completeSelfDestruct,
  pagesCount,
  isDropTarget = false,
  isDndEnabled = false,
  folderPageIds = [],
  isDraggingFolder = false,
  liveSessionPageId,
  liveAvatarColors = [],
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState(folder.title)
  const [newFolderEmoji, setNewFolderEmoji] = useState(folder.emoji || null)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const folderRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false)

  const isMobile = isMobileDevice() || isSmallScreen()

  // Auto-expand folder when dragging a page over it (not when dragging a folder)
  useEffect(() => {
    if (isDropTarget && !isExpanded && !isDraggingFolder) {
      const timer = setTimeout(() => setIsExpanded(true), 500)
      return () => clearTimeout(timer)
    }
  }, [isDropTarget, isExpanded, isDraggingFolder])

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
    onRenameFolder(folder.id, newFolderName, newFolderEmoji)
    setIsRenameModalOpen(false)
  }

  const openRenameModal = () => {
    setNewFolderName(folder.title)
    setNewFolderEmoji(folder.emoji || null)
    setIsRenameModalOpen(true)
  }

  const positionDropdown = () => {
    if (buttonRef.current && dropdownRef.current) {
      const btnRect = buttonRef.current.getBoundingClientRect()
      const dropdownRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      let top = btnRect.bottom + 4
      let left = btnRect.right - dropdownRect.width

      if (top + dropdownRect.height > viewportHeight) {
        top = btnRect.top - dropdownRect.height
      }

      if (left < 0) {
        left = btnRect.left
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
      case 'darkblue':
        return 'hover:bg-[#161c2e] text-[#8b99b5]'
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
      case 'darkblue':
        return 'bg-[#1e2740] text-[#8b99b5]'
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

  const getFolderIconClasses = () => {
    if (isExpanded) {
      switch (theme) {
        case 'fallout':
          return 'text-green-400'
        case 'dark':
        case 'darkblue':
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
      case 'darkblue':
        return 'text-[#5d6b88]'
      default:
        return 'text-neutral-400'
    }
  }


  return (
    <div className={`my-1 transition-all duration-150 ${isDropTarget && !isDraggingFolder ? `rounded-lg mx-1 ${theme === 'fallout' ? 'bg-green-500/10 border border-dashed border-green-500/40' : theme === 'dark' ? 'bg-blue-500/10 border border-dashed border-blue-400/30' : theme === 'darkblue' ? 'bg-blue-500/10 border border-dashed border-blue-400/30' : 'bg-blue-50 border border-dashed border-blue-300/60'}` : ''}`} ref={folderRef} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} data-theme={theme}>
      <div
        className={`flex items-center ${sidebarOpen ? 'justify-between px-3 py-2' : 'justify-center px-0 py-1'} cursor-pointer text-sm rounded-lg mx-1 transition-colors duration-150 overflow-hidden ${getFolderHoverClasses()}`}
        onClick={toggleExpand}
      >
        {sidebarOpen ? (
        <div className="flex items-center flex-grow min-w-0" style={{ marginRight: isHovered ? 0 : -24, transition: 'margin-right 150ms' }}>
          {folder.emoji ? (
            <span className="h-4 w-4 mr-1.5 flex-shrink-0 text-sm leading-4 text-center">{folder.emoji}</span>
          ) : isExpanded ? (
            <FolderOpen className={`h-4 w-4 mr-1.5 flex-shrink-0 ${getFolderIconClasses()}`} strokeWidth={1.5} />
          ) : (
            <Folder className={`h-4 w-4 mr-1.5 flex-shrink-0 ${getFolderIconClasses()}`} strokeWidth={1.5} />
          )}
          <span className="truncate text-sm font-medium flex-1 min-w-0" title={folder.title}>
            {folder.title}
          </span>
          {pagesCount > 0 && (
            <span className={`text-xs px-1.5 ml-1 rounded-full flex-shrink-0 ${getFolderCountClasses()}`}>
              {pagesCount}
            </span>
          )}
        </div>
        ) : (
        <Tooltip text={`${folder.title}${pagesCount > 0 ? ` (${pagesCount})` : ''}`} side="right" delay={150}>
        <div className="relative flex items-center justify-center">
          {folder.emoji ? (
            <span className="h-3.5 w-3.5 text-sm leading-[14px] text-center">{folder.emoji}</span>
          ) : isExpanded ? (
            <FolderOpen className={`h-3.5 w-3.5 ${getFolderIconClasses()}`} strokeWidth={1.5} />
          ) : (
            <Folder className={`h-3.5 w-3.5 ${getFolderIconClasses()}`} strokeWidth={1.5} />
          )}
        </div>
        </Tooltip>
        )}
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
            className="h-6 w-6 p-0 inline-flex items-center justify-center rounded-md flex-shrink-0"
            style={{ opacity: isMobile || isHovered ? 1 : 0, transition: 'opacity 150ms' }}
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen || isActionSheetOpen}
            aria-controls={`folder-menu-${folder.id}`}
            aria-label={`Actions for folder ${folder.title}`}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {isExpanded && (
        <SortableContext
          items={folderPageIds}
          strategy={verticalListSortingStrategy}
          disabled={!isDndEnabled}
        >
          <div className="mt-0.5" style={{ minHeight: '4px' }}>
            {folderPageIds.map((pageId, index) => {
              const page = (pages || []).find(p => p.id === pageId)
              if (!page) return null
              return (
                <div key={page.id} style={{ animation: `dash-folder-item-in 150ms ease-out ${index * 30}ms both` }}>
                <SortablePageItem
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
                  onSelfDestruct={onSelfDestruct}
                  onCancelSelfDestruct={onCancelSelfDestruct}
                  isSelfDestructing={selfDestructingPages && selfDestructingPages.has(page.id)}
                  onSelfDestructComplete={completeSelfDestruct}
                  isLiveSession={liveSessionPageId === page.id}
                  liveAvatarColors={liveSessionPageId === page.id ? liveAvatarColors : []}
                />
                </div>
              )
            })}
          </div>
        </SortableContext>
      )}
      {isDropdownOpen && createPortal(
        <div
          ref={dropdownRef}
          id={`folder-menu-${folder.id}`}
          role="menu"
          aria-label={`Actions for folder ${folder.title}`}
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
                openRenameModal()
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
        </div>,
        document.body
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
            openRenameModal()
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

      <RenameFolderModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onConfirm={handleRename}
        title={newFolderName}
        onTitleChange={setNewFolderName}
        emoji={newFolderEmoji}
        onEmojiChange={setNewFolderEmoji}
      />
    </div>
  )
}
