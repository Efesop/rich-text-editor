import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FolderItem } from './FolderItem'

export default function SortableFolderItem({ id, disabled, theme, isDndEnabled, folderPageIds, ...folderItemProps }) {
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
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full min-w-0">
      <FolderItem
        {...folderItemProps}
        theme={theme}
        isDropTarget={isOver && !isDragging}
        isDndEnabled={isDndEnabled}
        folderPageIds={folderPageIds}
      />
    </div>
  )
}
