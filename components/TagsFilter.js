import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import { ChevronDown, ChevronRight, Tag, X } from 'lucide-react'
import { Button } from './ui/button'
import { getTagChipStyle } from '@/utils/colorUtils'

export default function TagsFilter({ 
  tags = [], 
  selectedTags = [], 
  onTagToggle,
  onClearAllTags,
  className = ''
}) {
  const { theme } = useTheme()
  const [isExpanded, setIsExpanded] = useState(false)

  if (tags.length === 0) return null

  // Sort tags by usage frequency (you could extend this with actual usage data)
  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b))

  const handleTagClick = (tag) => {
    onTagToggle?.(tag)
  }

  // Generate colors for tags - consistent with StackedTags
  const getTagColor = (tag) => {
    const palette = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#F97316']
    const colorIndex = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % palette.length
    return palette[colorIndex]
  }

  const getTagClasses = (tag) => {
    const isSelected = selectedTags.includes(tag)
    
    return `
      inline-flex items-center px-2 py-1 rounded-md text-xs font-medium
      border cursor-pointer transition-all duration-150 ease-in-out
      ${isSelected
        ? `opacity-75 ring-2 ${theme === 'fallout' ? 'ring-green-500/20' : theme === 'dark' ? 'ring-white/20' : theme === 'darkblue' ? 'ring-blue-500/20' : 'ring-black/10'}`
        : ''
      }
    `
  }

  const getTagStyle = (tag) => {
    const color = getTagColor(tag)
    return getTagChipStyle(color, theme)
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors ${
          theme === 'fallout'
            ? 'hover:bg-gray-800 text-green-400'
            : theme === 'dark'
              ? 'hover:bg-[#232323] text-[#8e8e8e]'
              : theme === 'darkblue'
                ? 'hover:bg-[#232b42] text-[#8b99b5]'
                : 'hover:bg-neutral-100 text-neutral-500'
        }`}
      >
        <div className="flex items-center space-x-2">
          <Tag className="h-4 w-4" />
          <span>Filter by Tags</span>
          {selectedTags.length > 0 && (
            <span className={`
              inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-medium
              ${theme === 'fallout'
                ? 'bg-green-600 text-gray-900'
                : theme === 'dark'
                  ? 'bg-[#4a4a4a] text-[#ececec]'
                  : theme === 'darkblue'
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-400 text-white'
              }
            `}>
              {selectedTags.length}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          {selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onClearAllTags?.()
              }}
              className={`h-6 w-6 p-0 ${
                theme === 'fallout'
                  ? 'hover:bg-gray-800 text-green-600 hover:text-green-400'
                  : theme === 'dark'
                    ? 'hover:bg-[#3a3a3a] text-[#6b6b6b] hover:text-[#c0c0c0]'
                    : theme === 'darkblue'
                      ? 'hover:bg-[#232b42] text-[#5d6b88] hover:text-[#8b99b5]'
                      : 'hover:bg-neutral-200 text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      <div className={`overflow-hidden transition-all duration-200 ease-in-out ${
        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="p-2 pt-3">
          {/* Selected tags summary */}
          {selectedTags.length > 0 && (
            <div className="mb-3">
              <div className={`text-xs font-medium mb-1 ${
                theme === 'fallout' ? 'text-green-500' : theme === 'dark' ? 'text-[#6b6b6b]' : theme === 'darkblue' ? 'text-[#5d6b88]' : 'text-neutral-500'
              }`}>
                Active filters:
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleTagClick(tag)}
                    className={getTagClasses(tag)}
                    style={getTagStyle(tag)}
                  >
                    {tag}
                    <X className="ml-1 h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Available tags */}
          <div className="max-h-48 overflow-y-auto thin-scrollbar">
            <div className="flex flex-wrap gap-1">
              {sortedTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  className={getTagClasses(tag)}
                  style={getTagStyle(tag)}
                  title={`${selectedTags.includes(tag) ? 'Remove' : 'Add'} ${tag} filter`}
                >
                  {tag}
                  {selectedTags.includes(tag) && (
                    <X className="ml-1 h-3 w-3" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 