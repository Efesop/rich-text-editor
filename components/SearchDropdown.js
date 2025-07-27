import React, { useState, useRef, useEffect } from 'react'
import { Search, FileText, Folder, Tag, Clock } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function SearchDropdown({ 
  searchTerm, 
  onSearchTermChange, 
  suggestions = [], 
  pages = [], 
  folders = [], 
  tags = [],
  onSelectSuggestion,
  onSelectPage,
  onSelectFolder,
  onSelectTag,
  className = ""
}) {
  const { theme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  // Filter suggestions based on search term
  const filteredSuggestions = React.useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return []

    const searchLower = searchTerm.toLowerCase()
    const results = []

    // Add page suggestions
    const matchingPages = pages
      .filter(page => 
        page.title.toLowerCase().includes(searchLower) ||
        (page.content?.blocks || []).some(block => 
          block.data?.text?.toLowerCase().includes(searchLower)
        )
      )
      .slice(0, 3)
      .map(page => ({
        type: 'page',
        title: page.title,
        subtitle: `Page • ${page.tagNames?.join(', ') || 'No tags'}`,
        icon: FileText,
        data: page
      }))

    // Add folder suggestions
    const matchingFolders = folders
      .filter(folder => folder.title.toLowerCase().includes(searchLower))
      .slice(0, 2)
      .map(folder => ({
        type: 'folder',
        title: folder.title,
        subtitle: 'Folder',
        icon: Folder,
        data: folder
      }))

    // Add tag suggestions
    const matchingTags = tags
      .filter(tag => tag.toLowerCase().includes(searchLower))
      .slice(0, 3)
      .map(tag => ({
        type: 'tag',
        title: tag,
        subtitle: 'Tag',
        icon: Tag,
        data: tag
      }))

    // Add word suggestions (from suggestions prop)
    const wordSuggestions = suggestions
      .filter(suggestion => suggestion.toLowerCase().includes(searchLower))
      .slice(0, 2)
      .map(suggestion => ({
        type: 'word',
        title: suggestion,
        subtitle: 'Search term',
        icon: Search,
        data: suggestion
      }))

    // Combine all results with priority order
    results.push(...matchingPages)
    results.push(...matchingFolders)
    results.push(...matchingTags)
    results.push(...wordSuggestions)

    return results.slice(0, 8) // Limit to 8 total suggestions
  }, [searchTerm, pages, folders, tags, suggestions])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev < filteredSuggestions.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
          break
        case 'Enter':
          e.preventDefault()
          if (selectedIndex >= 0 && filteredSuggestions[selectedIndex]) {
            handleSelectSuggestion(filteredSuggestions[selectedIndex])
          }
          break
        case 'Escape':
          setIsOpen(false)
          setSelectedIndex(-1)
          inputRef.current?.blur()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, filteredSuggestions])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e) => {
    const value = e.target.value
    onSearchTermChange(value)
    setIsOpen(value.length >= 2)
    setSelectedIndex(-1)
  }

  const handleInputFocus = () => {
    if (searchTerm.length >= 2) {
      setIsOpen(true)
    }
  }

  const handleSelectSuggestion = (suggestion) => {
    switch (suggestion.type) {
      case 'page':
        onSelectPage?.(suggestion.data)
        break
      case 'folder':
        onSelectFolder?.(suggestion.data)
        break
      case 'tag':
        onSelectTag?.(suggestion.data)
        break
      case 'word':
        onSelectSuggestion?.(suggestion.data)
        break
    }
    
    onSearchTermChange(suggestion.title)
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.blur()
  }

  const getSuggestionIcon = (suggestion) => {
    const IconComponent = suggestion.icon
    let iconClass
    
    if (theme === 'fallout') {
      // All icons use green in fallout theme for terminal consistency
      iconClass = `h-4 w-4 ${
        suggestion.type === 'page' ? 'text-green-400' :
        suggestion.type === 'folder' ? 'text-green-500' :
        suggestion.type === 'tag' ? 'text-green-300' :
        'text-green-400'
      }`
    } else {
      iconClass = `h-4 w-4 ${
        suggestion.type === 'page' ? 'text-blue-500' :
        suggestion.type === 'folder' ? 'text-yellow-500' :
        suggestion.type === 'tag' ? 'text-green-500' :
        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
      }`
    }
    
    return <IconComponent className={iconClass} />
  }

  const getInputClasses = () => {
    const baseClasses = 'w-full pl-10 pr-4 py-2 rounded-md border text-sm focus:outline-none focus:ring-2'
    
    switch (theme) {
      case 'fallout':
        return `${baseClasses} bg-gray-900 border-green-600 text-green-400 placeholder-green-500 focus:ring-green-500`
      case 'dark':
        return `${baseClasses} bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:ring-blue-500`
      default:
        return `${baseClasses} bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500`
    }
  }

  const getDropdownClasses = () => {
    const baseClasses = 'absolute top-full left-0 right-0 mt-1 rounded-md border shadow-lg z-50 max-h-64 overflow-auto'
    
    switch (theme) {
      case 'fallout':
        return `${baseClasses} bg-gray-900 border-green-600`
      case 'dark':
        return `${baseClasses} bg-gray-800 border-gray-700`
      default:
        return `${baseClasses} bg-white border-gray-200`
    }
  }

  const getSuggestionClasses = (index) => {
    const baseClasses = 'w-full text-left px-3 py-2 text-sm hover:bg-opacity-80 focus:outline-none flex items-center space-x-3'
    const isSelected = index === selectedIndex
    
    switch (theme) {
      case 'fallout':
        return `${baseClasses} ${isSelected ? 'bg-gray-800' : 'hover:bg-gray-800'}`
      case 'dark':
        return `${baseClasses} ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-700'}`
      default:
        return `${baseClasses} ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}`
    }
  }

  const getTitleClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-400'
      case 'dark':
        return 'text-white'
      default:
        return 'text-gray-900'
    }
  }

  const getSubtitleClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-500'
      case 'dark':
        return 'text-gray-400'
      default:
        return 'text-gray-500'
    }
  }

  const getIconClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-400'
      case 'dark':
        return 'text-gray-400'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${getIconClasses()}`} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search everything"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          className={getInputClasses()}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
        />
      </div>

      {isOpen && filteredSuggestions.length > 0 && (
        <div className={getDropdownClasses()}>
          <div className="py-1">
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.title}-${index}`}
                id={`suggestion-${index}`}
                className={getSuggestionClasses(index)}
                onClick={() => handleSelectSuggestion(suggestion)}
                role="option"
                aria-selected={index === selectedIndex}
              >
                <div className="flex-shrink-0">
                  {getSuggestionIcon(suggestion)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${getTitleClasses()}`}>
                    {suggestion.title}
                  </div>
                  <div className={`text-xs truncate ${getSubtitleClasses()}`}>
                    {suggestion.subtitle}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 