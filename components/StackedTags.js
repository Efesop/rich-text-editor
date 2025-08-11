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
  tagColorMap = {}
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

    const colors = [
      // Light mode colors, Dark mode colors, Fallout mode colors
      { 
        light: 'bg-blue-100 text-blue-800 border-blue-200', 
        dark: 'bg-blue-900 text-blue-200 border-blue-700',
        fallout: 'bg-gray-800 text-green-400 border-green-600'
      },
      { 
        light: 'bg-green-100 text-green-800 border-green-200', 
        dark: 'bg-green-900 text-green-200 border-green-700',
        fallout: 'bg-gray-800 text-green-300 border-green-600'
      },
      { 
        light: 'bg-purple-100 text-purple-800 border-purple-200', 
        dark: 'bg-purple-900 text-purple-200 border-purple-700',
        fallout: 'bg-gray-800 text-green-400 border-green-600'
      },
      { 
        light: 'bg-orange-100 text-orange-800 border-orange-200', 
        dark: 'bg-orange-900 text-orange-200 border-orange-700',
        fallout: 'bg-gray-800 text-green-300 border-green-600'
      },
      { 
        light: 'bg-pink-100 text-pink-800 border-pink-200', 
        dark: 'bg-pink-900 text-pink-200 border-pink-700',
        fallout: 'bg-gray-800 text-green-400 border-green-600'
      },
      { 
        light: 'bg-indigo-100 text-indigo-800 border-indigo-200', 
        dark: 'bg-indigo-900 text-indigo-200 border-indigo-700',
        fallout: 'bg-gray-800 text-green-300 border-green-600'
      },
      { 
        light: 'bg-teal-100 text-teal-800 border-teal-200', 
        dark: 'bg-teal-900 text-teal-200 border-teal-700',
        fallout: 'bg-gray-800 text-green-400 border-green-600'
      },
      { 
        light: 'bg-red-100 text-red-800 border-red-200', 
        dark: 'bg-red-900 text-red-200 border-red-700',
        fallout: 'bg-gray-800 text-green-300 border-green-600'
      },
    ]
    
    // Use tag name to generate consistent color
    const colorIndex = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    const colorSet = colors[colorIndex]
    const classes = currentTheme === 'fallout' ? colorSet.fallout : currentTheme === 'dark' ? colorSet.dark : colorSet.light
    return { classes, style: undefined }
  }

  const getTagClasses = (tag, index, isHidden = false) => {
    const baseClasses = `
      inline-flex items-center rounded-lg font-medium
      border transition-all duration-200 ease-in-out
      ${size === 'xs' ? 'px-1.5 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'}
    `

    const colorToken = getTagColor(tag, index)
    const colorClasses = typeof colorToken === 'string' ? colorToken : colorToken.classes

    // Overlap via negative left margin, newest on top
    const overlapClasses = 'relative'
    return { classes: `${baseClasses} ${colorClasses} ${overlapClasses}`, style: colorToken.style }
  }

  const getTagStyles = (index) => ({
    marginLeft: index === 0 ? 0 : -12,
    zIndex: 10 + index
  })

  const getContainerHeight = () => {
    if (tags.length <= 1) return 'h-6'
    return 'h-7'
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
            inline-flex items-center justify-center rounded-lg text-xs font-medium border h-6 px-2
            ml-1 transition-all duration-200 relative
            ${currentTheme === 'fallout' 
              ? 'bg-gray-800 text-green-400 border-green-600'
              : currentTheme === 'dark' 
                ? 'bg-gray-700 text-gray-300 border-gray-600' 
                : 'bg-gray-200 text-gray-600 border-gray-300'
            }
          `}
          style={{ zIndex: 15, marginLeft: visibleTags.length === 0 ? 0 : -12, lineHeight: '1.25rem' }}
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