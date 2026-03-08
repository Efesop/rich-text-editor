import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, FileText, FolderIcon, X, Lock } from 'lucide-react'
import Fuse from 'fuse.js'

export default function QuickSwitcher({ isOpen, onClose, pages, onSelectPage, theme }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Only include actual pages (not folders)
  const allPages = useMemo(() => {
    return (pages || []).filter(p => p.type !== 'folder')
  }, [pages])

  // Fuse.js instance
  const fuse = useMemo(() => {
    return new Fuse(allPages, {
      keys: ['title'],
      threshold: 0.4,
      includeMatches: true
    })
  }, [allPages])

  // Get results: if no query, show all pages sorted by most recent
  const results = useMemo(() => {
    if (!query.trim()) {
      return [...allPages].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : 0
        const dateB = b.createdAt ? new Date(b.createdAt) : 0
        return dateB - dateA
      }).slice(0, 20)
    }
    return fuse.search(query).map(r => r.item).slice(0, 20)
  }, [query, fuse, allPages])

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Ensure selected index is in bounds
  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1))
    }
  }, [results.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex]
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const handleSelect = useCallback((page) => {
    onSelectPage(page)
    onClose()
  }, [onSelectPage, onClose])

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [results, selectedIndex, handleSelect, onClose])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  // Find parent folder name for a page
  const getFolderName = (page) => {
    if (!page.folderId) return null
    const folder = (pages || []).find(p => p.id === page.folderId && p.type === 'folder')
    return folder?.title || null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Switcher panel */}
      <div
        className={`
          relative w-full max-w-lg rounded-xl overflow-hidden shadow-2xl
          ${isFallout
            ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
            : isDarkBlue
              ? 'bg-[#141825] border border-[#1c2438]'
              : isDark
                ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50'
                : 'bg-white border border-gray-200'
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className={`
          flex items-center gap-3 px-4 py-3
          ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'}
        `}>
          <Search className={`w-4 h-4 flex-shrink-0 ${
            isFallout ? 'text-green-500' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
          }`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            className={`
              flex-1 bg-transparent outline-none text-sm
              ${isFallout ? 'text-green-400 placeholder-green-600 font-mono' : isDarkBlue ? 'text-[#e0e6f0] placeholder-[#445068]' : isDark ? 'text-[#ececec] placeholder-[#6b6b6b]' : 'text-gray-900 placeholder-gray-400'}
            `}
          />
          <kbd className={`
            hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] rounded font-medium
            ${isFallout ? 'bg-green-500/10 text-green-500 border border-green-500/30' : isDarkBlue ? 'bg-[#1a2035] text-[#5d6b88] border border-[#1c2438]' : isDark ? 'bg-[#2f2f2f] text-[#6b6b6b] border border-[#3a3a3a]' : 'bg-gray-100 text-gray-400 border border-gray-200'}
          `}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className={`
              py-8 text-center text-sm
              ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#445068]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}
            `}>
              No pages found
            </div>
          ) : (
            results.map((page, index) => {
              const folderName = getFolderName(page)
              const isSelected = index === selectedIndex
              return (
                <button
                  key={page.id}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                    ${isSelected
                      ? isFallout
                        ? 'bg-green-500/20'
                        : isDarkBlue
                          ? 'bg-[#1a2035]'
                          : isDark
                            ? 'bg-[#2f2f2f]'
                            : 'bg-blue-50'
                      : 'hover:' + (isFallout ? 'bg-gray-800' : isDarkBlue ? 'bg-[#161c2e]' : isDark ? 'bg-[#232323]' : 'bg-gray-50')
                    }
                  `}
                  onClick={() => handleSelect(page)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {page.password?.hash ? (
                    <Lock className={`w-4 h-4 flex-shrink-0 ${
                      isFallout ? 'text-green-600' : isDarkBlue ? 'text-amber-400' : isDark ? 'text-amber-400' : 'text-amber-500'
                    }`} />
                  ) : (
                    <FileText className={`w-4 h-4 flex-shrink-0 ${
                      isFallout ? 'text-green-500' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
                    }`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className={`
                      text-sm truncate block
                      ${isFallout ? 'text-green-300 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-gray-900'}
                    `}>
                      {page.title}
                    </span>
                    {folderName && (
                      <span className={`
                        text-xs flex items-center gap-1 mt-0.5
                        ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#445068]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}
                      `}>
                        <FolderIcon className="w-3 h-3" />
                        {folderName}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        <div className={`
          px-4 py-2 flex items-center gap-4 text-[10px]
          ${isFallout ? 'border-t border-green-500/30 text-green-600 font-mono' : isDarkBlue ? 'border-t border-[#1c2438] text-[#445068]' : isDark ? 'border-t border-[#3a3a3a] text-[#6b6b6b]' : 'border-t border-gray-100 text-gray-400'}
        `}>
          <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
          <span><kbd className="font-semibold">↵</kbd> open</span>
          <span><kbd className="font-semibold">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
