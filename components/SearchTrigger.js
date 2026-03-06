import React from 'react'
import { Search, X } from 'lucide-react'
import { getTagColorHex, ensureHex } from '@/utils/colorUtils'

export default function SearchTrigger ({ searchTerm, selectedTags = [], onClick, onClear, theme, tagColorMap = {} }) {
  const getTagColor = (tag) => {
    const explicit = tagColorMap && typeof tagColorMap[tag] === 'string' ? ensureHex(tagColorMap[tag]) : null
    return explicit || getTagColorHex(tag)
  }
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const hasActiveFilters = searchTerm || selectedTags.length > 0

  const inputClasses = isFallout
    ? 'bg-gray-900 border-green-600/40 text-green-400 placeholder-green-600'
    : isDarkBlue
      ? 'bg-[#1e2640] border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88]'
      : isDark
        ? 'bg-[#2f2f2f] border-[#3a3a3a] text-[#ececec] placeholder-[#6b6b6b]'
        : 'bg-white border-neutral-200 text-neutral-900 placeholder-neutral-400'

  const iconClasses = isFallout
    ? 'text-green-400'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-neutral-400'

  const displayTags = selectedTags.slice(0, 3)
  const extraCount = selectedTags.length - 3

  return (
    <div className="relative flex items-center">
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2 pl-3 pr-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors hover:ring-1 ${inputClasses} ${
          isFallout ? 'hover:ring-green-500/50' : isDarkBlue ? 'hover:ring-blue-500/50' : isDark ? 'hover:ring-[#4a4a4a]' : 'hover:ring-neutral-300'
        } ${hasActiveFilters ? 'pr-8' : ''}`}
      >
        <Search className={`h-4 w-4 flex-shrink-0 ${iconClasses}`} />
        <span className={`flex-1 text-left truncate ${searchTerm ? '' : isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-neutral-400'}`}>
          {searchTerm || 'Search everything'}
        </span>
        {selectedTags.length > 0 && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {displayTags.map(tag => (
              <div
                key={tag}
                className="w-2.5 h-2.5 rounded-full border border-white/20"
                style={{ backgroundColor: getTagColor(tag) }}
                title={tag}
              />
            ))}
            {extraCount > 0 && (
              <span className={`text-[10px] font-medium ml-0.5 ${iconClasses}`}>
                +{extraCount}
              </span>
            )}
          </div>
        )}
      </button>
      {hasActiveFilters && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClear?.()
          }}
          className={`absolute right-2 p-0.5 rounded transition-colors ${
            isFallout ? 'text-green-500 hover:bg-green-500/20'
              : isDarkBlue ? 'text-[#5d6b88] hover:bg-[#232b42]'
                : isDark ? 'text-[#6b6b6b] hover:bg-[#3a3a3a]'
                  : 'text-neutral-400 hover:bg-neutral-100'
          }`}
          title="Clear search and filters"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
