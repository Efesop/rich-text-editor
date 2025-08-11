import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import { ChevronDown, ChevronRight, Tag, X } from 'lucide-react'
import { Button } from './ui/button'

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

  // Generate colors for tags - same as StackedTags
  const getTagColor = (tag, index) => {
    const colors = [
      // Light mode colors, Dark mode colors
      { light: 'bg-blue-100 text-blue-800 border-blue-200', dark: 'bg-blue-900 text-blue-200 border-blue-700' },
      { light: 'bg-green-100 text-green-800 border-green-200', dark: 'bg-green-900 text-green-200 border-green-700' },
      { light: 'bg-purple-100 text-purple-800 border-purple-200', dark: 'bg-purple-900 text-purple-200 border-purple-700' },
      { light: 'bg-orange-100 text-orange-800 border-orange-200', dark: 'bg-orange-900 text-orange-200 border-orange-700' },
      { light: 'bg-pink-100 text-pink-800 border-pink-200', dark: 'bg-pink-900 text-pink-200 border-pink-700' },
      { light: 'bg-indigo-100 text-indigo-800 border-indigo-200', dark: 'bg-indigo-900 text-indigo-200 border-indigo-700' },
      { light: 'bg-teal-100 text-teal-800 border-teal-200', dark: 'bg-teal-900 text-teal-200 border-teal-700' },
      { light: 'bg-red-100 text-red-800 border-red-200', dark: 'bg-red-900 text-red-200 border-red-700' },
    ]
    
    // Use tag name to generate consistent color
    const colorIndex = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    const colorSet = colors[colorIndex]
    
    return theme === 'dark' ? colorSet.dark : colorSet.light
  }

  const getTagClasses = (tag) => {
    const isSelected = selectedTags.includes(tag)
    const baseColorClasses = getTagColor(tag)
    
    return `
      inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium
      border cursor-pointer transition-all duration-150 ease-in-out
      hover:scale-105 active:scale-95
      ${isSelected 
        ? `${baseColorClasses} opacity-75 ring-2 ${theme === 'dark' ? 'ring-white/20' : 'ring-black/10'}`
        : baseColorClasses
      }
    `
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