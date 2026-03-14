import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X, FileText, Folder, Tag, ArrowUp, ArrowDown, CornerDownLeft, Lock } from 'lucide-react'
import { getTagChipStyle, getTagColorHex, ensureHex } from '@/utils/colorUtils'

export default function SearchModal ({
  isOpen,
  onClose,
  searchTerm,
  onSearchTermChange,
  selectedTags,
  onTagToggle,
  onClearAllTags,
  allTags = [],
  pages = [],
  folders = [],
  onSelectPage,
  onSelectFolder,
  tagColorMap = {},
  theme
}) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)

  const getTagColor = (tag) => {
    const explicit = tagColorMap && typeof tagColorMap[tag] === 'string' ? ensureHex(tagColorMap[tag]) : null
    return explicit || getTagColorHex(tag)
  }

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Filter results
  const results = useMemo(() => {
    const hasSearch = searchTerm && searchTerm.length >= 1
    const hasTags = selectedTags.length > 0
    if (!hasSearch && !hasTags) return []

    const searchLower = hasSearch ? searchTerm.toLowerCase() : ''
    const items = []

    const safePages = Array.isArray(pages) ? pages : []
    const safeFolders = Array.isArray(folders) ? folders : []

    // Pages — filter by tags (OR logic) AND search term
    safePages
      .filter(page => {
        if (hasTags) {
          const pageTagNames = Array.isArray(page.tagNames) ? page.tagNames : []
          const hasMatchingTag = selectedTags.some(st =>
            pageTagNames.some(pt => pt.toLowerCase() === st.toLowerCase())
          )
          if (!hasMatchingTag) return false
        }
        if (hasSearch) {
          return String(page.title || '').toLowerCase().includes(searchLower) ||
            (Array.isArray(page.content?.blocks) ? page.content.blocks : []).some(block =>
              String(block?.data?.text || '').toLowerCase().includes(searchLower)
            )
        }
        return true
      })
      .slice(0, 5)
      .forEach(page => {
        const isLocked = Boolean(page.password?.hash)
        items.push({
          type: 'page',
          id: page.id,
          title: page.title || 'Untitled',
          subtitle: isLocked ? 'Locked' : page.tagNames?.length ? page.tagNames.join(', ') : 'No tags',
          icon: isLocked ? Lock : FileText,
          isLocked,
          data: page
        })
      })

    // Folders — only show when searching
    if (hasSearch) {
      safeFolders
        .filter(folder => String(folder.title || '').toLowerCase().includes(searchLower))
        .slice(0, 3)
        .forEach(folder => {
          items.push({
            type: 'folder',
            id: folder.id,
            title: folder.title || 'Untitled Folder',
            subtitle: 'Folder',
            icon: Folder,
            data: folder
          })
        })
    }

    return items.slice(0, 8)
  }, [searchTerm, selectedTags, pages, folders])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => prev < results.length - 1 ? prev + 1 : prev)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
      } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault()
        handleSelectResult(results[selectedIndex])
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, results])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll('[data-result-item]')
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleSelectResult = (result) => {
    if (result.type === 'page') {
      onSelectPage?.(result.data)
    } else if (result.type === 'folder') {
      onSelectFolder?.(result.data)
    }
    onClose()
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen) return null

  const sortedTags = [...allTags].sort((a, b) => a.localeCompare(b))

  // Theme classes
  const containerClasses = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue
      ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark
        ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white border border-gray-200 shadow-2xl'

  const inputBgClasses = isFallout
    ? 'bg-transparent text-green-400 placeholder-green-600'
    : isDarkBlue
      ? 'bg-transparent text-[#e0e6f0] placeholder-[#5d6b88]'
      : isDark
        ? 'bg-transparent text-[#ececec] placeholder-[#6b6b6b]'
        : 'bg-transparent text-neutral-900 placeholder-neutral-400'

  const borderClasses = isFallout
    ? 'border-green-500/30'
    : isDarkBlue
      ? 'border-[#1c2438]'
      : isDark
        ? 'border-[#3a3a3a]'
        : 'border-gray-100'

  const subtitleClasses = isFallout
    ? 'text-green-500/70'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-neutral-400'

  const titleClasses = isFallout
    ? 'text-green-400'
    : isDarkBlue
      ? 'text-[#e0e6f0]'
      : isDark
        ? 'text-[#ececec]'
        : 'text-neutral-900'

  const iconSearchClasses = isFallout
    ? 'text-green-400'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-neutral-400'

  const getResultHoverClasses = (index) => {
    const isSelected = index === selectedIndex
    if (isFallout) return isSelected ? 'bg-gray-800' : 'hover:bg-gray-800'
    if (isDarkBlue) return isSelected ? 'bg-[#232b42]' : 'hover:bg-[#232b42]'
    if (isDark) return isSelected ? 'bg-[#2f2f2f]' : 'hover:bg-[#2f2f2f]'
    return isSelected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
  }

  const getResultIconClasses = (type, isLocked) => {
    if (isLocked) {
      if (isFallout) return 'text-green-600'
      if (isDarkBlue) return 'text-amber-400'
      if (isDark) return 'text-amber-400'
      return 'text-amber-500'
    }
    if (isFallout) return type === 'folder' ? 'text-green-500' : 'text-green-400'
    if (isDarkBlue) return type === 'folder' ? 'text-yellow-400' : 'text-blue-400'
    if (isDark) return type === 'folder' ? 'text-yellow-500' : 'text-blue-400'
    return type === 'folder' ? 'text-yellow-500' : 'text-blue-500'
  }

  const tagChipSelectedRing = isFallout
    ? 'ring-2 ring-green-500/40'
    : isDarkBlue
      ? 'ring-2 ring-blue-500/40'
      : isDark
        ? 'ring-2 ring-white/20'
        : 'ring-2 ring-black/10'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4"
      onClick={handleOverlayClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      {/* Modal */}
      <div
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
        className={`relative w-full max-w-xl rounded-2xl overflow-hidden ${containerClasses}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input area — wraps when many tags */}
        <div className={`flex flex-wrap items-center gap-2 px-4 py-3 border-b ${borderClasses} max-h-28 overflow-y-auto`}>
          <Search className={`h-5 w-5 flex-shrink-0 ${iconSearchClasses}`} />

          {/* Selected tag chips inline */}
          {selectedTags.map(tag => {
            const color = getTagColor(tag)
            const style = getTagChipStyle(color, theme)
            return (
              <button
                key={tag}
                onClick={() => onTagToggle?.(tag)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border flex-shrink-0 cursor-pointer transition-colors"
                style={style}
              >
                {tag}
                <X className="h-3 w-3" />
              </button>
            )
          })}

          <input
            ref={inputRef}
            type="text"
            placeholder={selectedTags.length > 0 ? 'Search...' : 'Search everything...'}
            value={searchTerm}
            onChange={(e) => {
              onSearchTermChange(e.target.value)
              setSelectedIndex(-1)
            }}
            className={`flex-1 min-w-[120px] text-sm border-0 outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none ${inputBgClasses}`}
            style={{ boxShadow: 'none' }}
          />

          {(searchTerm || selectedTags.length > 0) && (
            <button
              onClick={() => {
                onSearchTermChange('')
                onClearAllTags?.()
                inputRef.current?.focus()
              }}
              className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                isFallout ? 'text-green-500 hover:bg-green-500/20'
                  : isDarkBlue ? 'text-[#5d6b88] hover:bg-[#232b42]'
                    : isDark ? 'text-[#6b6b6b] hover:bg-[#2f2f2f]'
                      : 'text-neutral-400 hover:bg-neutral-100'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tags section */}
        {allTags.length > 0 && (
          <div className={`px-5 py-3 border-b ${borderClasses}`}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Tag className={`h-3.5 w-3.5 ${subtitleClasses}`} />
                <span className={`text-xs font-medium uppercase tracking-wide ${subtitleClasses}`}>Tags</span>
              </div>
              {selectedTags.length > 0 && (
                <button
                  onClick={() => onClearAllTags?.()}
                  className={`text-xs transition-colors ${
                    isFallout ? 'text-green-500 hover:text-green-400'
                      : isDarkBlue ? 'text-[#5d6b88] hover:text-[#8b99b5]'
                        : isDark ? 'text-[#6b6b6b] hover:text-[#ececec]'
                          : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {sortedTags.map(tag => {
                const isSelected = selectedTags.includes(tag)
                const color = getTagColor(tag)
                const style = getTagChipStyle(color, theme)
                return (
                  <button
                    key={tag}
                    onClick={() => onTagToggle?.(tag)}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all ${
                      isSelected ? tagChipSelectedRing : ''
                    }`}
                    style={style}
                  >
                    {tag}
                    {isSelected && <X className="ml-1 h-3 w-3" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Results section */}
        <div ref={resultsRef} className="max-h-72 overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-1">
              {results.map((result, index) => {
                const IconComponent = result.icon
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    data-result-item
                    onClick={() => handleSelectResult(result)}
                    className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${getResultHoverClasses(index)}`}
                  >
                    <IconComponent className={`h-4 w-4 flex-shrink-0 ${getResultIconClasses(result.type, result.isLocked)}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${titleClasses}`}>
                        {result.title}
                      </div>
                      <div className={`text-xs truncate ${subtitleClasses}`}>
                        {result.subtitle}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (searchTerm || selectedTags.length > 0) ? (
            <div className={`py-10 text-center text-sm ${subtitleClasses}`}>
              No results found
            </div>
          ) : (
            <div className={`py-10 text-center text-sm ${subtitleClasses}`}>
              Type to search or select tags to filter
            </div>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className={`px-5 py-2.5 border-t ${borderClasses} flex items-center gap-4`}>
          <div className={`flex items-center gap-1.5 text-xs ${subtitleClasses}`}>
            <div className="flex items-center gap-0.5">
              <ArrowUp className="h-3 w-3" />
              <ArrowDown className="h-3 w-3" />
            </div>
            <span>navigate</span>
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${subtitleClasses}`}>
            <CornerDownLeft className="h-3 w-3" />
            <span>select</span>
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${subtitleClasses}`}>
            <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
              isFallout ? 'bg-gray-800 text-green-500'
                : isDarkBlue ? 'bg-[#1a2035] text-[#5d6b88]'
                  : isDark ? 'bg-[#2f2f2f] text-[#6b6b6b]'
                    : 'bg-neutral-100 text-neutral-400'
            }`}>esc</span>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
