import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PageItem from './PageItem'

export default function SortablePageItem({ id, disabled, theme, dropPosition = 'above', ...pageItemProps }) {
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
    // Allow native vertical scroll to pass through dnd-kit's touch listeners.
    // dnd-kit's TouchSensor has a 250ms long-press delay before drag activates,
    // but without `touch-action: pan-y` iOS WKWebView blocks scroll for that
    // window — symptom: scrolling the sidebar feels like it "closes" because
    // the gesture doesn't take effect and the user lifts onto the backdrop.
    touchAction: 'pan-y',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full min-w-0">
      {isOver && !isDragging && (
        <div
          className={`absolute left-2 right-2 h-0.5 rounded-full ${
            theme === 'fallout' ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={dropPosition === 'below' ? { bottom: 0, transform: 'translateY(50%)' } : { top: 0, transform: 'translateY(-50%)' }}
        />
      )}
      <PageItem {...pageItemProps} theme={theme} />
    </div>
  )
}
