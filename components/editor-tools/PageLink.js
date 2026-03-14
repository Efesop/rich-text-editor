import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

const PAGE_LINK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-4 -4 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>'

// Editor.js Inline Tool for page linking via toolbar
export class PageLinkInlineTool {
  static get isInline() {
    return true
  }

  static get title() {
    return 'Page Link'
  }

  constructor({ api, config }) {
    this.api = api
    this.config = config
    this._button = null
    this._state = false
    this._savedRange = null
  }

  render() {
    this._button = document.createElement('button')
    this._button.type = 'button'
    this._button.innerHTML = PAGE_LINK_ICON
    this._button.classList.add('ce-inline-tool')
    return this._button
  }

  surround(range) {
    if (this._state) {
      // Already a page link — unwrap it
      const link = this.api.selection.findParentTag('A', 'page-link')
      if (link) {
        this.api.selection.expandToTag(link)
        const text = link.textContent
        const textNode = document.createTextNode(text)
        link.parentNode.replaceChild(textNode, link)
      }
      this._state = false
      return
    }

    // Save the range and open the page picker via custom event
    this._savedRange = range.cloneRange()
    const rect = range.getBoundingClientRect()
    window.dispatchEvent(new CustomEvent('dash-page-link-toolbar', {
      detail: {
        top: rect.bottom + 4,
        left: rect.left,
        range: this._savedRange,
        text: range.toString()
      }
    }))
  }

  checkState(selection) {
    const link = this.api.selection.findParentTag('A', 'page-link')
    this._state = !!link
    this._button.classList.toggle('ce-inline-tool--active', this._state)
    return this._state
  }

  // Static method to complete the link insertion from outside
  static insertLink(range, page) {
    if (!range || !page) return

    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const selectedText = range.toString()
    const link = document.createElement('a')
    link.setAttribute('data-page-id', page.id)
    link.className = 'page-link'
    link.href = '#'
    link.textContent = selectedText || page.title

    range.deleteContents()
    range.insertNode(link)

    // Place cursor after the link
    const spaceAfter = document.createTextNode('\u00A0')
    link.parentNode.insertBefore(spaceAfter, link.nextSibling)
    const newRange = document.createRange()
    newRange.setStart(spaceAfter, 1)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)

    // Trigger Editor.js save
    const editorEl = link.closest('.codex-editor')
    if (editorEl) {
      editorEl.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
}

// Hook that intercepts [[ in the editor and shows an autocomplete dropdown
export function usePageLinkInterceptor({ pages, onSelectPage, editorHolder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const rangeRef = useRef(null)
  const triggerNodeRef = useRef(null)
  const triggerOffsetRef = useRef(null)

  const filteredPages = (pages || [])
    .filter(p => p.type !== 'folder')
    .filter(p => {
      if (!query) return true
      return p.title.toLowerCase().includes(query.toLowerCase())
    })
    .slice(0, 8)

  // Use refs to avoid stale closures in event handlers
  const filteredPagesRef = useRef(filteredPages)
  const selectedIndexRef = useRef(selectedIndex)
  const isOpenRef = useRef(isOpen)
  const queryRef = useRef(query)
  filteredPagesRef.current = filteredPages
  selectedIndexRef.current = selectedIndex
  isOpenRef.current = isOpen
  queryRef.current = query

  const insertPageLink = useCallback((page) => {
    if (!triggerNodeRef.current) return

    const node = triggerNodeRef.current
    const text = node.textContent || ''
    const currentRange = rangeRef.current

    // Find the [[ and calculate what to replace
    const cursorPos = currentRange ? currentRange.startOffset : text.length
    const textBeforeCursor = text.substring(0, cursorPos)
    const bracketPos = textBeforeCursor.lastIndexOf('[[')
    if (bracketPos === -1) return

    const after = text.substring(cursorPos)

    // Build the replacement: text before [[ + link + text after cursor
    const before = text.substring(0, bracketPos)

    const parent = node.parentElement
    if (!parent) return

    const frag = document.createDocumentFragment()

    if (before) {
      frag.appendChild(document.createTextNode(before))
    }

    const link = document.createElement('a')
    link.setAttribute('data-page-id', page.id)
    link.className = 'page-link'
    link.textContent = page.title
    link.href = '#'
    frag.appendChild(link)

    // Add a space after the link so the cursor has somewhere to go
    const spaceAfter = document.createTextNode('\u00A0' + after)
    frag.appendChild(spaceAfter)

    // Replace the text node with our fragment
    parent.replaceChild(frag, node)

    // Place cursor after the space
    const sel = window.getSelection()
    const range = document.createRange()
    range.setStart(spaceAfter, 1)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    setIsOpen(false)
    setQuery('')
    triggerNodeRef.current = null
    triggerOffsetRef.current = null
    rangeRef.current = null

    // Trigger Editor.js save by dispatching input event
    const editorEl = document.getElementById(editorHolder)
    if (editorEl) {
      editorEl.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, [editorHolder])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    triggerNodeRef.current = null
    triggerOffsetRef.current = null
    rangeRef.current = null
  }, [])

  useEffect(() => {
    const editorEl = document.getElementById(editorHolder)
    if (!editorEl) return

    const handleInput = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType !== Node.TEXT_NODE) {
        if (isOpenRef.current) close()
        return
      }

      const text = node.textContent || ''
      const cursorPos = range.startOffset
      const textBeforeCursor = text.substring(0, cursorPos)

      // Look for [[ that hasn't been closed with ]]
      const lastOpen = textBeforeCursor.lastIndexOf('[[')
      const lastClose = textBeforeCursor.lastIndexOf(']]')

      if (lastOpen !== -1 && lastOpen > lastClose) {
        // We're inside a [[ ... trigger
        const searchQuery = textBeforeCursor.substring(lastOpen + 2)

        // Don't open if there's a newline in the query
        if (searchQuery.includes('\n')) {
          if (isOpenRef.current) close()
          return
        }

        triggerNodeRef.current = node
        triggerOffsetRef.current = lastOpen
        rangeRef.current = range.cloneRange()

        setQuery(searchQuery)
        setSelectedIndex(0)

        // Position the dropdown near the caret (fixed positioning = viewport coords)
        const rect = range.getBoundingClientRect()
        setPosition({
          top: rect.bottom + 4,
          left: rect.left
        })

        setIsOpen(true)
      } else {
        if (isOpenRef.current) close()
      }
    }

    const handleKeyDown = (e) => {
      if (!isOpenRef.current) return

      const pages = filteredPagesRef.current
      const idx = selectedIndexRef.current

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(i => Math.min(i + 1, pages.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        if (pages[idx]) {
          insertPageLink(pages[idx])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }

    editorEl.addEventListener('input', handleInput)
    editorEl.addEventListener('keydown', handleKeyDown, true)

    return () => {
      editorEl.removeEventListener('input', handleInput)
      editorEl.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [editorHolder, isOpen, filteredPages, selectedIndex, insertPageLink, close])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      const dropdown = document.getElementById('page-link-dropdown')
      if (dropdown && !dropdown.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, close])

  return { isOpen, query, position, filteredPages, selectedIndex, insertPageLink, close }
}

// Dropdown component rendered via portal
export function PageLinkDropdown({ isOpen, query, position, filteredPages, selectedIndex, onSelect, onClose, showSearch, theme }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [localSelectedIndex, setLocalSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  // Reset search when opening
  useEffect(() => {
    if (isOpen && showSearch) {
      setSearchQuery('')
      setLocalSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, showSearch])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      const dropdown = document.getElementById('page-link-dropdown')
      if (dropdown && !dropdown.contains(e.target)) {
        onClose?.()
      }
    }
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Viewport boundary detection for fixed positioning
  const dropdownHeight = showSearch ? 340 : 300
  const dropdownWidth = 320
  const adjustedPosition = { ...position }

  // Flip up if dropdown would overflow bottom
  if (position.top + dropdownHeight > window.innerHeight - 8) {
    adjustedPosition.top = Math.max(8, position.top - dropdownHeight - 8)
  }

  // Shift left if dropdown would overflow right
  if (position.left + dropdownWidth > window.innerWidth - 8) {
    adjustedPosition.left = Math.max(8, window.innerWidth - dropdownWidth - 8)
  }

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const containerClasses = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
    : isDarkBlue
      ? 'bg-[#1a2035] border border-[#2a3550] shadow-xl'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] shadow-xl'
        : 'bg-white border border-gray-200 shadow-xl'

  const itemHoverClasses = isFallout
    ? 'bg-green-500/20'
    : isDarkBlue
      ? 'bg-[#232b42]'
      : isDark
        ? 'bg-[#3a3a3a]'
        : 'bg-blue-50'

  const titleClasses = isFallout
    ? 'text-green-400'
    : isDarkBlue
      ? 'text-[#e0e6f0]'
      : isDark
        ? 'text-[#ececec]'
        : 'text-gray-900'

  const hintClasses = isFallout
    ? 'text-green-600'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-gray-400'

  // When showSearch is true, filter pages locally
  const displayPages = showSearch
    ? filteredPages.filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : filteredPages
  const activeIndex = showSearch ? localSelectedIndex : selectedIndex

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setLocalSelectedIndex(i => Math.min(i + 1, displayPages.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setLocalSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (displayPages[localSelectedIndex]) {
        onSelect(displayPages[localSelectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
    }
  }

  return createPortal(
    <div
      id="page-link-dropdown"
      className={`fixed z-[9999] rounded-lg flex flex-col ${containerClasses}`}
      style={{
        top: adjustedPosition.top,
        left: adjustedPosition.left,
        minWidth: 220,
        maxWidth: 320,
        maxHeight: showSearch ? 340 : 300
      }}
    >
      {showSearch && (
        <div className={`px-2 py-1.5 border-b flex-shrink-0 ${
          isFallout ? 'border-green-500/30' : isDarkBlue ? 'border-[#2a3550]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-100'
        }`}>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setLocalSelectedIndex(0) }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search pages..."
            className={`w-full px-2 py-1 text-sm bg-transparent outline-none ${titleClasses} ${
              isFallout ? 'placeholder-green-700 font-mono' : isDarkBlue ? 'placeholder-[#5d6b88]' : isDark ? 'placeholder-[#6b6b6b]' : 'placeholder-gray-400'
            }`}
          />
        </div>
      )}
      {displayPages.length === 0 ? (
        <div className={`px-3 py-2 text-sm ${hintClasses}`}>
          No pages found
        </div>
      ) : (
        <div className="overflow-y-auto flex-1 min-h-0">
          {displayPages.map((page, i) => (
            <button
              key={page.id}
              className={`w-full text-left px-3 py-2 text-sm truncate transition-colors ${titleClasses} ${
                i === activeIndex ? itemHoverClasses : ''
              }`}
              onMouseEnter={() => { if (showSearch) setLocalSelectedIndex(i) }}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(page)
              }}
            >
              {page.title || 'Untitled'}
            </button>
          ))}
        </div>
      )}
      <div className={`px-3 py-1.5 text-xs border-t flex-shrink-0 ${hintClasses} ${
        isFallout ? 'border-green-500/30' : isDarkBlue ? 'border-[#2a3550]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-100'
      }`}>
        ↑↓ navigate · Enter select · Esc close
      </div>
    </div>,
    document.body
  )
}
