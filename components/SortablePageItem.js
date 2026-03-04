import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PageItem from './PageItem'

export default function SortablePageItem({ id, disabled, theme, ...pageItemProps }) {
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
      type: 'page',
      folderId: pageItemProps.page?.folderId || null,
      sortable: { containerId: pageItemProps.page?.folderId || 'root' },
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

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full min-w-0">
      {isOver && !isDragging && (
        <div
          className={`absolute top-0 left-2 right-2 h-0.5 -translate-y-0.5 rounded-full ${
            theme === 'fallout' ? 'bg-green-500' : 'bg-blue-500'
          }`}
        />
      )}
      <PageItem {...pageItemProps} theme={theme} />
    </div>
  )
}
