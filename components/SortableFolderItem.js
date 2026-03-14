import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FolderItem } from './FolderItem'

export default function SortableFolderItem({ id, disabled, theme, isDndEnabled, folderPageIds, dropPosition = 'above', dragTargetFolderId, ...folderItemProps }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id,
    disabled,
    data: {
      type: 'folder',
      folderId: id,
      sortable: { containerId: 'root' },
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    cursor: disabled ? undefined : 'grab',
    position: 'relative',
  }

  // Show drop target highlight if dnd-kit says isOver OR if this folder is the active drag target
  const isFolderDropTarget = (isOver && !isDragging) || dragTargetFolderId === id

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full min-w-0">
      {isOver && !isDragging && !dragTargetFolderId && (
        <div
          className={`absolute left-2 right-2 h-0.5 rounded-full ${
            theme === 'fallout' ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={dropPosition === 'below' ? { bottom: 0, transform: 'translateY(50%)' } : { top: 0, transform: 'translateY(-50%)' }}
        />
      )}
      <FolderItem
        {...folderItemProps}
        theme={theme}
        isDropTarget={isFolderDropTarget}
        isDndEnabled={isDndEnabled}
        folderPageIds={folderPageIds}
      />
    </div>
  )
}
