import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Fuse from 'fuse.js'

// Debounce utility
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function useAdvancedSearch(pages = [], initialFilter = 'all') {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchFilter, setSearchFilter] = useState(initialFilter)
  const [dateRange, setDateRange] = useState({ start: null, end: null })
  const [selectedTags, setSelectedTags] = useState([])
  const [hasPassword, setHasPassword] = useState(null) // null, true, false
  const [wordCountRange, setWordCountRange] = useState({ min: 0, max: Infinity })
  const [sortBy, setSortBy] = useState('newest')
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const searchCache = useRef(new Map())

  // Create search index for different content types
  const searchIndices = useMemo(() => {
    const titleFuse = new Fuse(pages, {
      keys: ['title'],
      threshold: 0.3,
      includeScore: true,
      includeMatches: true
    })

    const contentFuse = new Fuse(pages, {
      keys: ['content.blocks.data.text'],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true
    })

    const tagsFuse = new Fuse(pages, {
      keys: ['tagNames'],
      threshold: 0.2,
      includeScore: true,
      includeMatches: true
    })

    const allFuse = new Fuse(pages, {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'content.blocks.data.text', weight: 0.3 },
        { name: 'tagNames', weight: 0.3 }
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true
    })

    return { titleFuse, contentFuse, tagsFuse, allFuse }
  }, [pages])

  // Extract text content for word counting
  const extractTextContent = useCallback((content) => {
    if (!content || !Array.isArray(content.blocks)) return ''
    
    return content.blocks
      .map(block => {
        if (block.data?.text) return block.data.text
        if (block.data?.items) {
          return Array.isArray(block.data.items) 
            ? block.data.items.map(item => 
                typeof item === 'string' ? item : item.text || ''
              ).join(' ')
            : ''
        }
        if (block.data?.code) return block.data.code
        return ''
      })
      .join(' ')
  }, [])

  // Count words in text
  const countWords = useCallback((text) => {
    return text.trim() ? text.trim().split(/\s+/).length : 0
  }, [])

  // Apply date filter
  const applyDateFilter = useCallback((pages, dateRange) => {
    if (!dateRange.start && !dateRange.end) return pages
    
    return pages.filter(page => {
      const pageDate = new Date(page.createdAt)
      const start = dateRange.start ? new Date(dateRange.start) : null
      const end = dateRange.end ? new Date(dateRange.end) : null
      
      if (start && pageDate < start) return false
      if (end && pageDate > end) return false
      return true
    })
  }, [])

  // Apply tag filter
  const applyTagFilter = useCallback((pages, selectedTags) => {
    if (selectedTags.length === 0) return pages
    
    return pages.filter(page => 
      selectedTags.every(tag => 
        page.tagNames && page.tagNames.includes(tag)
      )
    )
  }, [])

  // Apply password filter
  const applyPasswordFilter = useCallback((pages, hasPassword) => {
    if (hasPassword === null) return pages
    
    return pages.filter(page => 
      hasPassword ? Boolean(page.password) : !page.password
    )
  }, [])

  // Apply word count filter
  const applyWordCountFilter = useCallback((pages, wordCountRange) => {
    if (wordCountRange.min === 0 && wordCountRange.max === Infinity) return pages
    
    return pages.filter(page => {
      const text = extractTextContent(page.content)
      const wordCount = countWords(text)
      return wordCount >= wordCountRange.min && wordCount <= wordCountRange.max
    })
  }, [extractTextContent, countWords])

  // Sort pages
  const sortPages = useCallback((pages, sortBy) => {
    const sorted = [...pages]
    
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case 'wordCount':
        return sorted.sort((a, b) => {
          const aWords = countWords(extractTextContent(a.content))
          const bWords = countWords(extractTextContent(b.content))
          return bWords - aWords
        })
      case 'lastModified':
        return sorted.sort((a, b) => {
          const aTime = a.content?.time || 0
          const bTime = b.content?.time || 0
          return bTime - aTime
        })
      default:
        return sorted
    }
  }, [countWords, extractTextContent])

  // Main search function
  const performSearch = useCallback((term, filter, filters) => {
    // Create cache key
    const cacheKey = JSON.stringify({ term, filter, filters })
    
    // Check cache first
    if (searchCache.current.has(cacheKey)) {
      return searchCache.current.get(cacheKey)
    }

    let results = pages

    // Apply search term if provided
    if (term.trim()) {
      let searchResults = []
      
      switch (filter) {
        case 'title':
          searchResults = searchIndices.titleFuse.search(term)
          break
        case 'content':
          searchResults = searchIndices.contentFuse.search(term)
          break
        case 'tags':
          searchResults = searchIndices.tagsFuse.search(term)
          break
        case 'all':
        default:
          searchResults = searchIndices.allFuse.search(term)
          break
      }
      
      results = searchResults.map(result => ({
        ...result.item,
        searchScore: result.score,
        searchMatches: result.matches
      }))
    }

    // Apply additional filters
    results = applyDateFilter(results, filters.dateRange)
    results = applyTagFilter(results, filters.selectedTags)
    results = applyPasswordFilter(results, filters.hasPassword)
    results = applyWordCountFilter(results, filters.wordCountRange)

    // Sort results
    results = sortPages(results, filters.sortBy)

    // Cache results
    searchCache.current.set(cacheKey, results)
    
    // Clean cache if it gets too large
    if (searchCache.current.size > 100) {
      const keys = Array.from(searchCache.current.keys())
      keys.slice(0, 50).forEach(key => searchCache.current.delete(key))
    }

    return results
  }, [pages, searchIndices, applyDateFilter, applyTagFilter, applyPasswordFilter, applyWordCountFilter, sortPages])

  // Get search results
  const searchResults = useMemo(() => {
    return performSearch(debouncedSearchTerm, searchFilter, {
      dateRange,
      selectedTags,
      hasPassword,
      wordCountRange,
      sortBy
    })
  }, [
    debouncedSearchTerm,
    searchFilter,
    dateRange,
    selectedTags,
    hasPassword,
    wordCountRange,
    sortBy,
    performSearch
  ])

  // Clear cache when pages change
  useEffect(() => {
    searchCache.current.clear()
  }, [pages])

  // Get search statistics
  const searchStats = useMemo(() => {
    return {
      totalPages: pages.length,
      filteredPages: searchResults.length,
      hasActiveFilters: Boolean(
        debouncedSearchTerm ||
        dateRange.start ||
        dateRange.end ||
        selectedTags.length > 0 ||
        hasPassword !== null ||
        wordCountRange.min > 0 ||
        wordCountRange.max < Infinity
      )
    }
  }, [pages.length, searchResults.length, debouncedSearchTerm, dateRange, selectedTags, hasPassword, wordCountRange])

  // Get available tags for filtering
  const availableTags = useMemo(() => {
    const tagSet = new Set()
    pages.forEach(page => {
      if (page.tagNames) {
        page.tagNames.forEach(tag => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  }, [pages])

  // Search suggestion based on current input
  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return []
    
    const suggestions = new Set()
    
    // Add title suggestions
    searchIndices.titleFuse.search(searchTerm).slice(0, 3).forEach(result => {
      suggestions.add(result.item.title)
    })
    
    // Add tag suggestions
    availableTags
      .filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 3)
      .forEach(tag => suggestions.add(tag))
    
    return Array.from(suggestions).slice(0, 5)
  }, [searchTerm, searchIndices, availableTags])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchTerm('')
    setDateRange({ start: null, end: null })
    setSelectedTags([])
    setHasPassword(null)
    setWordCountRange({ min: 0, max: Infinity })
  }, [])

  // Export search results
  const exportSearchResults = useCallback((format = 'json') => {
    const exportData = searchResults.map(page => ({
      title: page.title,
      content: extractTextContent(page.content),
      tags: page.tagNames,
      createdAt: page.createdAt,
      wordCount: countWords(extractTextContent(page.content))
    }))

    switch (format) {
      case 'csv':
        const csvHeaders = 'Title,Content,Tags,Created,Word Count\n'
        const csvRows = exportData.map(page => 
          `"${page.title}","${page.content.replace(/"/g, '""')}","${page.tags.join(';')}","${page.createdAt}",${page.wordCount}`
        ).join('\n')
        return csvHeaders + csvRows
      
      case 'json':
      default:
        return JSON.stringify(exportData, null, 2)
    }
  }, [searchResults, extractTextContent, countWords])

  return {
    // Search state
    searchTerm,
    setSearchTerm,
    searchFilter,
    setSearchFilter,
    
    // Filter state
    dateRange,
    setDateRange,
    selectedTags,
    setSelectedTags,
    hasPassword,
    setHasPassword,
    wordCountRange,
    setWordCountRange,
    sortBy,
    setSortBy,
    
    // Results
    searchResults,
    searchStats,
    availableTags,
    searchSuggestions,
    
    // Actions
    clearAllFilters,
    exportSearchResults,
    
    // Utilities
    extractTextContent,
    countWords
  }
} 