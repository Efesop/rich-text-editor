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
      hover:scale-105 active:scale-95
      ${isSelected 
        ? `opacity-75 ring-2 ${theme === 'dark' ? 'ring-white/20' : 'ring-black/10'}`
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
        className={`w-full flex items-center justify-between p-2 text-sm font-medium rounded-md transition-colors ${
          theme === 'dark'
            ? 'hover:bg-gray-800 text-gray-200'
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      >
        <div className="flex items-center space-x-2">
          <Tag className="h-4 w-4" />
          <span>Filter by Tags</span>
          {selectedTags.length > 0 && (
            <span className={`
              inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-medium
              ${theme === 'dark' 
                ? 'bg-blue-600 text-white' 
                : 'bg-blue-500 text-white'
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
                theme === 'dark' 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                  : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
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
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
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
          <div className="max-h-48 overflow-y-auto">
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