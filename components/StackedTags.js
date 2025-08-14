import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { getTagChipStyle, ensureHex } from '@/utils/colorUtils'

export default function StackedTags({ 
  tags = [], 
  maxVisible = 2, 
  onRemoveTag,
  size = 'sm',
  showRemove = false,
  className = '',
  theme, // Accept theme as prop
  tagColorMap = {},
  hovered = false
}) {
  const { theme: contextTheme } = useTheme()
  const currentTheme = theme || contextTheme // Use prop theme if provided, otherwise context theme
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const popupRef = useRef(null)

  if (tags.length === 0) return null

  const visibleTags = tags.slice(0, maxVisible)
  const hiddenTags = tags.slice(maxVisible)
  const hasHiddenTags = hiddenTags.length > 0
  

  // Utils
  // using shared color helpers via colorUtils

  // Close popup when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (!popupRef.current) return
      if (!popupRef.current.contains(e.target)) setIsPopupOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Resolve color for a tag. Prefer explicit color map; otherwise fall back to theme palette hashing.
  const getTagColor = (tag, index) => {
    const explicit = tagColorMap && typeof tagColorMap[tag] === 'string' ? ensureHex(tagColorMap[tag]) : null
    if (explicit) {
      return {
        classes: `${currentTheme === 'dark' ? 'text-gray-100' : 'text-gray-800'}`,
        style: getTagChipStyle(explicit, currentTheme)
      }
    }

    // Fallback: generate a pleasant deterministic color from the tag name
    const palette = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#F97316']
    const colorIndex = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % palette.length
    const hex = palette[colorIndex]
    return {
      classes: '',
      style: getTagChipStyle(hex, currentTheme)
    }
  }

  const getTagClasses = (tag, index, isHidden = false) => {
    const baseClasses = `
      inline-flex items-center rounded-md font-medium
      border transition-all duration-150 ease-out
      ${size === 'xs' ? 'px-1 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-1.5 py-0.5 text-xs'}
    `

    const colorToken = getTagColor(tag, index)
    const colorClasses = typeof colorToken === 'string' ? colorToken : colorToken.classes

    // Overlap via negative left margin, newest on top
    const overlapClasses = 'relative'
    return { classes: `${baseClasses} ${colorClasses} ${overlapClasses}`, style: colorToken.style }
  }

  const fanStep = 1
  const getTagStyles = (index) => ({
    marginLeft: index === 0 ? 0 : -20,
    // First tag should be frontmost; later tags progressively behind
    zIndex: 100 - index,
    transform: hovered ? `translateX(${index * fanStep}px)` : 'none',
    transition: 'transform 120ms ease-out'
  })

  const getContainerHeight = () => {
    if (tags.length <= 1) return 'h-5'
    return 'h-6'
  }

  return (
    <div 
      className={`relative inline-flex items-center ${getContainerHeight()} ${className}`}
      style={{ minWidth: hasHiddenTags ? '80px' : 'auto' }}
    >
      {/* Visible tags */}
      {visibleTags.map((tag, index) => {
        const token = getTagClasses(tag, index)
        return (
          <span
            key={`${tag}-${index}`}
            className={token.classes}
            style={{ ...(token.style || {}), ...getTagStyles(index) }}
          >
            {tag}
          </span>
        )
      })}

      {/* Hidden tags - show on hover */}
      {/* Count indicator and popup for hidden tags */}
      {hasHiddenTags && (
        <span
          className={`
            inline-flex items-center justify-center rounded-md text-xs font-medium border h-5 px-1.5
            ml-1 transition-all duration-200 relative
            ${currentTheme === 'fallout' 
              ? 'bg-gray-800 text-green-400 border-green-600'
              : currentTheme === 'dark' 
                ? 'bg-gray-700 text-gray-300 border-gray-600' 
                : 'bg-gray-200 text-gray-600 border-gray-300'
            }
          `}
          style={{ 
            // Put count chip at the very back of the stack
            zIndex: 0,
            marginLeft: visibleTags.length === 0 ? 0 : -6,
            lineHeight: '1.25rem',
            transform: hovered ? `translateX(${visibleTags.length * fanStep}px)` : 'none',
            transition: 'transform 120ms ease-out'
          }}
          onClick={() => setIsPopupOpen(v => !v)}
        >
          +{hiddenTags.length}
        </span>
      )}

      {isPopupOpen && (
        <div
          ref={popupRef}
          className={`absolute top-full left-0 mt-1 rounded-md border shadow-lg z-50 p-2 ${
            currentTheme === 'fallout' ? 'bg-gray-900 border-green-600' : currentTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
          role="dialog"
        >
          <div className="flex flex-wrap gap-1 max-w-xs max-h-40 overflow-auto">
            {hiddenTags.map((tag, index) => {
              const token = getTagClasses(tag, visibleTags.length + index, true)
              return (
                <span
                  key={`popup-${tag}-${index}`}
                  className={token.classes}
                  style={token.style}
                >
                  {tag}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
} 