import React, { useState } from 'react'
import { useTheme } from 'next-themes'

export default function StackedTags({ 
  tags = [], 
  maxVisible = 2, 
  onRemoveTag,
  size = 'sm',
  showRemove = false,
  className = '',
  theme // Accept theme as prop
}) {
  const { theme: contextTheme } = useTheme()
  const currentTheme = theme || contextTheme // Use prop theme if provided, otherwise context theme
  const [isHovered, setIsHovered] = useState(false)

  if (tags.length === 0) return null

  const visibleTags = tags.slice(0, maxVisible)
  const hiddenTags = tags.slice(maxVisible)
  const hasHiddenTags = hiddenTags.length > 0
  
  // Only enable hover effects if there are multiple tags
  const shouldFanOut = tags.length > 1

  // Generate colors for tags
  const getTagColor = (tag, index) => {
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
    
    if (currentTheme === 'fallout') {
      return colorSet.fallout
    } else if (currentTheme === 'dark') {
      return colorSet.dark
    } else {
      return colorSet.light
    }
  }

  const getTagClasses = (tag, index, isHidden = false) => {
    const baseClasses = `
      inline-flex items-center rounded-lg font-medium
      border transition-all duration-200 ease-in-out
      ${size === 'xs' ? 'px-1.5 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'}
    `
    
    const colorClasses = getTagColor(tag, index)

    const positionClasses = shouldFanOut && !isHovered && !isHidden && index > 0
      ? 'absolute left-0'
      : 'relative'

    const hoverClasses = shouldFanOut && isHovered
      ? 'transform shadow-md'
      : ''

    return `${baseClasses} ${colorClasses} ${positionClasses} ${hoverClasses}`
  }

  const getTagStyles = (index, isHidden = false) => {
    if (!shouldFanOut) return {}
    
    if (!isHovered && !isHidden && index > 0) {
      // Better stacked positioning - smaller offsets
      return {
        transform: `translateX(${index * 6}px) translateY(${-index * 1}px)`,
        zIndex: 10 - index
      }
    } else if (isHovered) {
      // Nicer fanned out positioning
      return {
        transform: `translateX(${index * 52}px) translateY(0px)`,
        zIndex: 20 + index
      }
    }
    return {}
  }

  const getContainerHeight = () => {
    if (tags.length <= 1) return 'h-6'
    if (shouldFanOut && isHovered) return 'h-8' // More space when fanned out
    return shouldFanOut ? 'h-7' : 'h-6' // Account for stacked offset only if multiple tags
  }

  return (
    <div 
      className={`relative flex items-start ${getContainerHeight()} ${className}`}
      onMouseEnter={() => shouldFanOut && setIsHovered(true)}
      onMouseLeave={() => shouldFanOut && setIsHovered(false)}
      style={{ 
        width: shouldFanOut && isHovered ? `${Math.max(tags.length * 52, 120)}px` : 'auto',
        minWidth: hasHiddenTags ? '80px' : 'auto'
      }}
    >
      {/* Visible tags */}
      {visibleTags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className={getTagClasses(tag, index)}
          style={getTagStyles(index)}
        >
          {tag}
        </span>
      ))}

      {/* Hidden tags - show on hover */}
      {hasHiddenTags && shouldFanOut && isHovered && hiddenTags.map((tag, index) => (
        <span
          key={`hidden-${tag}-${index}`}
          className={getTagClasses(tag, visibleTags.length + index, true)}
          style={getTagStyles(visibleTags.length + index, true)}
        >
          {tag}
        </span>
      ))}

      {/* Show count indicator for hidden tags when not hovered - without plus */}
      {hasHiddenTags && (!shouldFanOut || !isHovered) && (
        <span
          className={`
            inline-flex items-center justify-center min-w-[20px] h-5 rounded-lg text-xs font-medium
            ml-1 transition-all duration-200 relative
            ${currentTheme === 'fallout' 
              ? 'bg-gray-800 text-green-400 border border-green-600'
              : currentTheme === 'dark' 
                ? 'bg-gray-700 text-gray-300 border border-gray-600' 
                : 'bg-gray-200 text-gray-600 border border-gray-300'
            }
          `}
          style={{ zIndex: 15 }}
        >
          {hiddenTags.length}
        </span>
      )}
    </div>
  )
} 