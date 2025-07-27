'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText, Trash2, Search, MoreVertical, Download, X, ChevronDown, Lock, FolderPlus, RefreshCw, Bell, Bug } from 'lucide-react'
import { useTheme } from 'next-themes'
//import { Sun, Moon } from 'lucide-react'
import { RenameModal } from '@/components/RenameModal'
import ExportDropdown from '@/components/ExportDropdown'
import { 
  exportToPDF, 
  exportToMarkdown, 
  exportToPlainText,
  exportToRTF,
  exportToDocx,
  exportToCSV,
  exportToJSON,
  exportToXML,
  downloadFile 
} from '@/utils/exportUtils'
import TagModal from '@/components/TagModal'
import useTagStore from '../store/tagStore'
import { format } from 'date-fns'
import PasswordModal from '@/components/PasswordModal'
import { usePagesManager } from '@/hooks/usePagesManager'
import ThemeToggle from '@/components/ThemeToggle'
import SearchInput from '@/components/SearchInput'
import PageItem from '@/components/PageItem'
import SortDropdown from '@/components/SortDropdown'
import { FolderModal } from '@/components/FolderModal'
import { AddPageToFolderModal } from './AddPageToFolderModal'
import { FolderItem } from './FolderItem'
import { FolderIcon } from 'lucide-react'
import UpdateNotification from './UpdateNotification'
import packageJson from '../package.json'
import { useUpdateManager } from '@/hooks/useUpdateManager'
import { EditorErrorBoundary, SidebarErrorBoundary } from './ErrorBoundary'
import { useKeyboardNavigation, useScreenReader, useSkipNavigation } from '@/hooks/useKeyboardNavigation'
import TagsFilter from './TagsFilter'
// import ModeDropdown from './ModeDropdown'  // Comment out this import

const DynamicEditor = dynamic(() => import('@/components/Editor'), { ssr: false })

const searchPlaceholders = {
  all: 'Search all...',
  title: 'Search page names...',
  content: 'Search page content...',
  tags: 'Search tags...'
}

export default function RichTextEditor() {
  const {
    pages,
    setPages,
    currentPage,
    saveStatus,
    setCurrentPage,
    handleNewPage,
    savePage,
    deletePage,
    renamePage,
    lockPage,
    unlockPage,
    addTagToPage,
    removeTagFromPage,
    deleteTagFromAllPages,
    tags,
    tempUnlockedPages,
    setTempUnlockedPages,
    isPasswordModalOpen,
    setIsPasswordModalOpen,
    pageToAccess,
    setPageToAccess,
    updateTagInPages,
    createFolder,
    deleteFolder,
    addPageToFolder,
    removePageFromFolder,
    renameFolder,
    handleDuplicatePage,
  } = usePagesManager()

  const {
    showUpdateNotification,
    setShowUpdateNotification,
    updateInfo,
    isCheckingForUpdates,
    isDownloading,
    isInstalling,
    downloadProgress,
    error,
    canCheckForUpdates,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    handleBellClick,
    dismissError
  } = useUpdateManager()

  const { theme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState(null)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [sortBy, setSortBy] = useState('lastModified')
  const [sortOrder, setSortOrder] = useState('desc')
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [isAddToFolderModalOpen, setIsAddToFolderModalOpen] = useState(false)
  const [pageToAddToFolder, setPageToAddToFolder] = useState(null)
  const [tagToDeleteId, setTagToDeleteId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [passwordAction, setPasswordAction] = useState('lock')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [searchMode, setSearchMode] = useState('all')
  const [isBugReportModalOpen, setIsBugReportModalOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [pageToRename, setPageToRename] = useState(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [tagToEdit, setTagToEdit] = useState(null)
  const [searchFilter, setSearchFilter] = useState('all')
  const [selectedTagsFilter, setSelectedTagsFilter] = useState([])
  const [passwordInput, setPasswordInput] = useState('')
  const [sortOption, setSortOption] = useState('newest')
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [appVersion, setAppVersion] = useState('')

  // Theme helper functions
  const getMainContainerClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'fallout flex h-screen bg-gray-900 text-green-400 font-mono'
      case 'dark':
        return 'dark flex h-screen bg-gray-900 text-white'
      default:
        return 'flex h-screen bg-white text-black'
    }
  }

  const getSidebarClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 border-r border-green-600'
      case 'dark':
        return 'bg-gray-900'
      default:
        return 'bg-gray-100'
    }
  }

  const getButtonHoverClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'hover:bg-gray-700 hover:text-green-400 hover:shadow-[0_0_5px_rgba(0,255,0,0.4)]'
      case 'dark':
        return 'hover:bg-gray-700 hover:text-white'
      default:
        return 'hover:bg-gray-200 hover:text-primary-foreground'
    }
  }

  const getHeaderClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-800 border-green-600 text-green-400'
      case 'dark':
        return 'bg-gray-800 border-gray-700 text-white'
      default:
        return 'bg-white border-gray-200 text-black'
    }
  }

  const getMainContentClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 text-green-400'
      case 'dark':
        return 'bg-gray-800 text-white'
      default:
        return 'bg-white text-black'
    }
  }

  const getFooterClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-800 text-green-300 border-t border-green-600'
      case 'dark':
        return 'bg-gray-800 text-gray-300'
      default:
        return 'bg-white text-gray-600'
    }
  }

  const getBorderClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'border-green-600'
      case 'dark':
        return 'border-gray-700'
      default:
        return 'border-gray-300'
    }
  }

  const getTextClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-400'
      case 'dark':
        return 'text-gray-400'
      default:
        return 'text-gray-600'
    }
  }

  const getIconClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'text-green-400'
      case 'dark':
        return 'text-gray-200'
      default:
        return 'text-gray-700'
    }
  }

  const getFolderBadgeClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-700 text-green-300 border border-green-600'
      case 'dark':
        return 'bg-gray-700 text-gray-300 border border-gray-600'
      default:
        return 'bg-gray-100 text-gray-600 border border-gray-300'
    }
  }

  // Essential useEffects
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (currentPage && currentPage.content) {
      setWordCount(calculateWordCount(currentPage.content))
    }
  }, [currentPage])

  // Comment out or remove these mode-related states and functions
  /*
  const [currentMode, setCurrentMode] = useState('default')
  const [audioPlayer, setAudioPlayer] = useState(null)

  const handleModeChange = (mode) => {
    setCurrentMode(mode)
    if (mode === 'cafe') {
      playLofiMusic()
    } else {
      stopLofiMusic()
    }
  }

  const playLofiMusic = () => {
    if (!audioPlayer) {
      const audio = new Audio('https://example.com/lofi-stream.mp3') // Replace with actual stream URL
      audio.loop = true
      setAudioPlayer(audio)
    }
    audioPlayer?.play()
  }

  const stopLofiMusic = () => {
    audioPlayer?.pause()
    if (audioPlayer) {
      audioPlayer.currentTime = 0
    }
  }
  */

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    const handleFocus = () => {
      checkForUpdates()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkForUpdates])

  const handleEditorChange = useCallback(async (content) => {
    await savePage(content)
    setWordCount(calculateWordCount(content))
  }, [savePage])

  const handlePageSelect = (page) => {
    if (currentPage && currentPage.password && tempUnlockedPages.has(currentPage.id)) {
      // Relock the current page if it was temporarily unlocked
      setTempUnlockedPages(prev => {
        const newSet = new Set(prev)
        newSet.delete(currentPage.id)
        return newSet
      })
    }

    if (page.password && !tempUnlockedPages.has(page.id)) {
      setPasswordAction('access')
      setPageToAccess(page)
      setIsPasswordModalOpen(true)
    } else {
      setCurrentPage(page)
    }

    const editorContainer = document.getElementById('editorjs')
    if (editorContainer) {
      editorContainer.scrollTop = 0
    }
  }

  const calculateWordCount = useCallback((content) => {
    return content.blocks.reduce((count, block) => {
      let text = ''
      switch (block.type) {
        case 'paragraph':
        case 'header':
        case 'quote':
          text = block.data.text || ''
          break
        case 'list':
        case 'checklist':
          text = (block.data.items || []).map(item => item.text || item).join(' ')
          break
        case 'table':
          text = (block.data.content || []).flat().join(' ')
          break
        case 'code':
          text = block.data.code || ''
          break
        case 'image':
          text = block.data.caption || ''
          break
        case 'embed':
          text = block.data.caption || ''
          break
        case 'raw':
          text = block.data.html || ''
          break
        case 'nestedlist':
          const flattenNestedList = (items) => {
            return items.reduce((acc, item) => {
              acc.push(item.content || '')
              if (item.items) {
                acc = acc.concat(flattenNestedList(item.items))
              }
              return acc
            }, [])
          }
          text = flattenNestedList(block.data.items || []).join(' ')
          break
        // Add more cases for any other custom block types you might have
        default:
          text = ''
      }
      // Remove HTML tags, if any
      text = text.replace(/<[^>]*>/g, '')
      // Count words
      return count + (text.match(/\S+/g) || []).length
    }, 0)
  }, [])

  const handleExport = useCallback(async (exportType) => {
    if (!isClient || !currentPage) return

    try {
      const content = currentPage.content
      const fileName = currentPage.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()

      switch (exportType) {
        case 'pdf':
          exportToPDF(content, fileName)
          break
        case 'markdown':
          const markdown = exportToMarkdown(content)
          downloadFile(markdown, `${fileName}.md`, 'text/markdown')
          break
        case 'text':
          const text = exportToPlainText(content)
          downloadFile(text, `${fileName}.txt`, 'text/plain')
          break
        case 'rtf':
          const rtf = exportToRTF(content)
          downloadFile(rtf, `${fileName}.rtf`, 'application/rtf')
          break
        case 'docx':
          const docxBuffer = await exportToDocx(content)
          const docxBlob = new Blob([docxBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
          const docxUrl = URL.createObjectURL(docxBlob)
          const a = document.createElement('a')
          a.href = docxUrl
          a.download = `${fileName}.docx`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          break
        case 'csv':
          const csv = exportToCSV(content)
          downloadFile(csv, `${fileName}.csv`, 'text/csv')
          break
        case 'json':
          const json = exportToJSON(content)
          downloadFile(json, `${fileName}.json`, 'application/json')
          break
        case 'xml':
          const xml = exportToXML(content)
          downloadFile(xml, `${fileName}.xml`, 'application/xml')
          break
        default:
          console.error('Unsupported export type:', exportType)
      }
    } catch (error) {
      console.error('Error exporting content:', error)
    }
  }, [isClient, currentPage])

  const handleRenamePage = useCallback((page) => {
    setPageToRename(page)
    setNewPageTitle(page.title.slice(0, 20))
    setIsRenameModalOpen(true)
  }, [])

  const confirmRename = useCallback(async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
      await renamePage(pageToRename, newPageTitle.slice(0, 20))
    }
    setIsRenameModalOpen(false)
    setPageToRename(null)
    setNewPageTitle('')
  }, [pageToRename, newPageTitle, renamePage])

  const handleToggleLock = useCallback((page) => {
    if (page.password && page.password.hash) {
      setPasswordAction('unlock')
    } else {
      setPasswordAction('lock')
    }
    setPageToAccess(page)
    setIsPasswordModalOpen(true)
  }, [])

  const handlePasswordConfirm = async (actionType, password) => {
    setPasswordError('') // Clear any previous errors
    switch (actionType) {
      case 'lock':
        const lockSuccess = await lockPage(pageToAccess, password)
        if (lockSuccess) {
          setIsPasswordModalOpen(false)
          setPasswordInput('')
        } else {
          setPasswordError('Failed to lock the page. Please try again.')
        }
        break
      case 'open':
        const unlockSuccess = await unlockPage(pageToAccess, password, true) // Pass true for temporary unlock
        if (unlockSuccess) {
          setIsPasswordModalOpen(false)
          setPasswordInput('')
          // The page is now set as current in the unlockPage function
        } else {
          setPasswordError('Incorrect password. Please try again.')
        }
        break
      case 'removeLock':
        const removeLockSuccess = await unlockPage(pageToAccess, password, false)
        if (removeLockSuccess) {
          setIsPasswordModalOpen(false)
          setPasswordInput('')
          // The page is now set as current and unlocked in the unlockPage function
        } else {
          setPasswordError('Incorrect password. Unable to remove lock.')
        }
        break
    }
    setPageToAccess(null)
  }

  const handleDeletePage = useCallback((page) => {
    if (window.confirm(`Are you sure you want to delete "${page.title}"?`)) {
      deletePage(page)
    }
  }, [deletePage])

  const filteredPages = useCallback(() => {
    if (!Array.isArray(pages)) return []
    
    return pages.filter(item => {
      if (item.type === 'folder') {
        const matchingPages = (item.pages || []).filter(pageId => {
          const page = (pages || []).find(p => p.id === pageId)
          return page && matchesSearchCriteria(page, searchTerm, searchFilter) && matchesTagFilter(page, selectedTagsFilter)
        })
        return matchingPages.length > 0 || item.title.toLowerCase().includes(searchTerm.toLowerCase())
      } else if (!item.folderId) {
        return matchesSearchCriteria(item, searchTerm, searchFilter) && matchesTagFilter(item, selectedTagsFilter)
      }
      return false
    })
  }, [pages, searchTerm, searchFilter, selectedTagsFilter])

  const matchesSearchCriteria = (page, searchTerm, searchFilter) => {
    const lowercaseSearchTerm = searchTerm.toLowerCase();
    return (
      (searchFilter === 'all' && (
        page.title.toLowerCase().includes(lowercaseSearchTerm) ||
        page.content.blocks.some(block => block.data.text && block.data.text.toLowerCase().includes(lowercaseSearchTerm)) ||
        page.tagNames?.some(tag => tag.toLowerCase().includes(lowercaseSearchTerm))
      )) ||
      (searchFilter === 'title' && page.title.toLowerCase().includes(lowercaseSearchTerm)) ||
      (searchFilter === 'content' && page.content.blocks.some(block => block.data.text && block.data.text.toLowerCase().includes(lowercaseSearchTerm))) ||
      (searchFilter === 'tags' && page.tagNames?.some(tag => tag.toLowerCase().includes(lowercaseSearchTerm)))
    );
  };

  const matchesTagFilter = (page, selectedTags) => {
    if (!selectedTags || selectedTags.length === 0) return true; // No tag filter applied
    return selectedTags.every(tag => page.tagNames?.includes(tag));
  };

  const sortPages = useCallback((pages, option) => {
    if (!Array.isArray(pages)) return []
    
    const folders = pages.filter(item => item.type === 'folder')
    const nonFolderPages = pages.filter(item => item.type !== 'folder')

    let sortedPages
    switch (option) {
      case 'a-z':
        sortedPages = nonFolderPages.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'z-a':
        sortedPages = nonFolderPages.sort((a, b) => b.title.localeCompare(a.title))
        break
      case 'oldest':
        sortedPages = nonFolderPages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        break
      case 'tag':
        sortedPages = nonFolderPages.sort((a, b) => {
          const aTag = a.tagNames && a.tagNames[0] ? a.tagNames[0] : ''
          const bTag = b.tagNames && b.tagNames[0] ? b.tagNames[0] : ''
          return aTag.localeCompare(bTag)
        })
        break
      case 'newest':
      default:
        sortedPages = nonFolderPages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }

    return [...sortedPages, ...folders]
  }, [])

  useEffect(() => {
    if (currentPage && currentPage.content) {
      setWordCount(calculateWordCount(currentPage.content));
    }
  }, [currentPage, calculateWordCount]);

  const handleCreateFolder = (folderName) => {
    createFolder(folderName)
    setIsFolderModalOpen(false)
  }

  const handleDeleteFolder = (folderId) => {
    if (window.confirm('Are you sure you want to delete this folder?')) {
      deleteFolder(folderId)
    }
  }

  const handleAddPageToFolder = (pageIds, folderId) => {
    pageIds.forEach(pageId => {
      addPageToFolder(pageId, folderId)
    })
    setIsAddToFolderModalOpen(false)
  }

  const handleRemovePageFromFolder = (pageId, folderId) => {
    removePageFromFolder(pageId, folderId)
  }

  useEffect(() => {
    const handleLinkClick = (event) => {
      if (event.target.tagName === 'A' && event.target.href) {
        event.preventDefault();
        window.electron.openExternal(event.target.href);
      }
    };

    document.addEventListener('click', handleLinkClick);

    return () => {
      document.removeEventListener('click', handleLinkClick);
    };
  }, []);

  useEffect(() => {
    const fetchAppVersion = async () => {
      try {
        const version = await window.electron.invoke('get-app-version');
        setAppVersion(version);
      } catch (error) {
        console.error('Error fetching app version:', error);
      }
    };

    fetchAppVersion();
  }, []);

  const truncateFolderName = (name) => {
    return name.length > 15 ? name.slice(0, 15) + '...' : name;
  };

  const handleRemoveTag = (tagName) => {
    if (currentPage) {
      removeTagFromPage(currentPage.id, tagName)
    }
  }

  // Tag filter handlers
  const handleTagToggle = (tag) => {
    setSelectedTagsFilter(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleClearAllTagsFilter = () => {
    setSelectedTagsFilter([])
  }

  // Search dropdown handlers
  const handleSelectPageFromSearch = (page) => {
    handlePageSelect(page)
    announce(`Navigated to page: ${page.title}`)
  }

  const handleSelectFolderFromSearch = (folder) => {
    // You could implement folder navigation here if needed
    console.log('Selected folder:', folder)
  }

  const handleSelectTagFromSearch = (tag) => {
    // Add tag to filter
    if (!selectedTagsFilter.includes(tag)) {
      setSelectedTagsFilter(prev => [...prev, tag])
    }
    announce(`Added tag filter: ${tag}`)
  }

  // Initialize keyboard navigation after all functions are defined
  useKeyboardNavigation({
    onNewPage: handleNewPage,
    onSavePage: () => savePage(currentPage?.content),
    onSearch: () => {
      const searchInput = document.querySelector('input[placeholder*="Search"]')
      if (searchInput) {
        searchInput.focus()
        announce('Search field focused')
      }
    },
    onToggleSidebar: () => {
      setSidebarOpen(!sidebarOpen)
      announce(sidebarOpen ? 'Sidebar collapsed' : 'Sidebar expanded')
    },
    onDeletePage: handleDeletePage,
    onDuplicatePage: handleDuplicatePage,
    currentPage,
    pages: (pages || []).filter(page => page.type !== 'folder'), // Use pages directly instead of filteredPages()
    onSelectPage: handlePageSelect
  })

  // Handle loading states - these returns must come AFTER all hooks
  if (!isClient) {
    return (
      <div className={`flex h-screen items-center justify-center ${getMainContainerClasses()}`}>
        <div>Loading...</div>
      </div>
    )
  }

  if (!currentPage) {
    return (
      <div className={`flex h-screen items-center justify-center ${getMainContainerClasses()}`}>
        <div>No page selected</div>
      </div>
    )
  }

  return (
    <div 
      className={getMainContainerClasses()}
      role="application"
      aria-label="Rich Text Note Editor"
    >
      {/* Sidebar */}
      <SidebarErrorBoundary>
        <nav 
          className={`${sidebarOpen ? 'w-64' : 'w-16'} flex flex-col transition-all duration-300 ease-in-out ${getSidebarClasses()} relative overflow-visible`}
          role="navigation"
          aria-label="Page navigation"
          aria-expanded={sidebarOpen}
        >
        <header className={`p-4 flex ${sidebarOpen ? 'justify-between' : 'justify-center'} items-center`}>
          {sidebarOpen && <h1 className="text-2xl font-bold">Pages</h1>}
          <div className="flex items-center space-x-2">
            {sidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFolderModalOpen(true)}
                className={getButtonHoverClasses()}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewPage}
              className={getButtonHoverClasses()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>
        {sidebarOpen && (
          <div className="px-4 mb-3 pt-1 space-y-3">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              filter={searchFilter}
              onFilterChange={setSearchFilter}
                              placeholder="Search everything"
              pages={(pages || []).filter(p => p.type !== 'folder')}
              folders={(pages || []).filter(p => p.type === 'folder')}
              tags={(tags || []).map(t => t.name)}
              onSelectPage={handleSelectPageFromSearch}
              onSelectFolder={handleSelectFolderFromSearch}
              onSelectTag={handleSelectTagFromSearch}
              showDropdown={true}
            />
            
            <TagsFilter
              tags={(tags || []).map(t => t.name)}
              selectedTags={selectedTagsFilter}
              onTagToggle={handleTagToggle}
              onClearAllTags={handleClearAllTagsFilter}
            />
          </div>
        )}
        <ScrollArea className="flex-grow">
          {sortPages(filteredPages(), sortOption).map(item => {
            if (item.type === 'folder') {
              return (
                <FolderItem
                  key={item.id}
                  folder={item}
                  onAddPage={() => {
                    setSelectedFolderId(item.id);
                    setIsAddToFolderModalOpen(true);
                  }}
                  onDeleteFolder={handleDeleteFolder}
                  onRenameFolder={renameFolder}
                  theme={theme}
                  pages={(pages || []).filter(page => page.folderId === item.id)}
                  onSelectPage={handlePageSelect}
                  currentPageId={currentPage?.id}
                  onRemovePageFromFolder={handleRemovePageFromFolder}
                  tags={tags}
                  tempUnlockedPages={tempUnlockedPages}
                  sidebarOpen={sidebarOpen}
                  onDelete={handleDeletePage}
                  onRename={handleRenamePage}
                  onToggleLock={handleToggleLock}
                  onDuplicate={handleDuplicatePage}
                  pagesCount={item.pages ? item.pages.length : 0}
                />
              );
            } else {
              return (
                <PageItem
                  key={item.id}
                  page={item}
                  isActive={currentPage?.id === item.id}
                  onSelect={handlePageSelect}
                  onRename={handleRenamePage}
                  onDelete={handleDeletePage}
                  onToggleLock={handleToggleLock}
                  onDuplicate={handleDuplicatePage}
                  sidebarOpen={sidebarOpen}
                  theme={theme}
                  tags={tags}
                  tempUnlockedPages={tempUnlockedPages}
                  isInsideFolder={false}
                />
              );
            }
          })}
        </ScrollArea>
        <div className={`mt-auto p-2 flex items-center justify-between border-t ${getBorderClasses()}`}>
          <Button
            variant="ghost"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="self-start"
            size="sm"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          {sidebarOpen && (
            <div className="flex items-center space-x-2">
              <span className={`text-xs ${getTextClasses()}`}>v{appVersion}</span>
              <SortDropdown onSort={setSortOption} theme={theme} activeSortOption={sortOption} sidebarOpen={sidebarOpen} />
            </div>
          )}
        </div>
      </nav>
      </SidebarErrorBoundary>

      {/* Main Content */}
      <main 
        className="flex-1 flex flex-col overflow-hidden"
        id="main-content"
        role="main"
        aria-label="Note editor"
      >
        {/* Header */}
        <div className={`flex flex-col p-4 border-b ${getHeaderClasses()}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <h1 
                className="text-2xl font-bold cursor-pointer" 
                onClick={() => handleRenamePage(currentPage)}
              >
                {currentPage?.title}
              </h1>
              {currentPage?.folderId && (
                <span className={`ml-2 px-1.5 py-0.5 text-xs font-medium rounded-md ${getFolderBadgeClasses()}`}>
                  <FolderIcon className="w-3 h-3 inline-block mr-1" />
                  {truncateFolderName((pages || []).find(item => item.id === currentPage.folderId)?.title || '')}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {/* <ModeDropdown onModeChange={handleModeChange} theme={theme} /> */}
              <ExportDropdown onExport={handleExport} />
              <button
                onClick={() => {
                  window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer');
                }}
                className={`p-2 rounded-md ${getButtonHoverClasses()}`}
                title="Report a bug or request a feature"
              >
                <Bug className="h-4 w-4" />
              </button>
              <button
                onClick={handleBellClick}
                disabled={!canCheckForUpdates}
                className={`p-2 rounded-md ${getButtonHoverClasses()} ${!canCheckForUpdates ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isCheckingForUpdates ? "Checking for updates..." : "Check for updates"}
              >
                <Bell className={`h-4 w-4 ${isCheckingForUpdates ? 'animate-pulse' : ''}`} />
              </button>
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-2">
            {currentPage.tagNames && currentPage.tagNames.map((tagName, index) => {
              const tag = (tags || []).find(t => t.name === tagName)
              if (!tag) return null
              return (
                <span
                  key={index}
                  className="flex items-center px-2 py-1 rounded text-xs text-gray-700"
                  style={{ backgroundColor: tag.color.background, border: `1px solid ${tag.color.border}` }}
                >
                  <span
                    className="cursor-pointer text-gray-700"
                    onClick={() => {
                      setTagToEdit(tag)
                      setIsTagModalOpen(true)
                    }}
                  >
                    {tag.name}
                  </span>
                  <button
                    className="ml-1 focus:outline-none"
                    onClick={() => handleRemoveTag(tag.name)}
                  >
                    <X className="h-3 w-3 text-gray-700" />
                  </button>
                </span>
              )
            })}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setTagToEdit(null)
                setIsTagModalOpen(true)
              }}
            >
              <Plus className={`h-4 w-4 ${getIconClasses()}`} />
            </Button>
          </div>
        </div>
        
        {/* Editor */}
        <div className={`flex-1 overflow-auto p-6 ${getMainContentClasses()}`}>
          {currentPage && (
            <EditorErrorBoundary>
              <DynamicEditor
                key={currentPage.id} // Add this line
                data={currentPage.content}
                onChange={handleEditorChange}
                holder="editorjs"
              />
            </EditorErrorBoundary>
          )}
        </div>

        {/* Footer */}
        <div className={`footer-fixed flex justify-between items-center p-3 text-sm ${getFooterClasses()}`}>
          {currentPage.createdAt && (
            <span>Created {format(new Date(currentPage.createdAt), 'MMM d, yyyy')}</span>
          )}
          <div className="flex items-center space-x-4">
            <span>{wordCount} words</span>
            <span>
              {saveStatus === 'saving' && <span className="text-yellow-500">Saving...</span>}
              {saveStatus === 'saved' && <span className="text-green-500">Saved</span>}
              {saveStatus === 'error' && <span className="text-red-500">Error saving</span>}
            </span>
          </div>
        </div>
      </main>

      <RenameModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onConfirm={confirmRename}
        title={newPageTitle}
        onTitleChange={setNewPageTitle}
      />

      <TagModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        onConfirm={(updatedTag) => {
          if (tagToEdit) {
            // Update existing tag
            updateTagInPages(tagToEdit.name, updatedTag)
          } else {
            // Add new tag
            addTagToPage(currentPage.id, updatedTag)
          }
          setIsTagModalOpen(false)
        }}
        onDelete={(tagName) => {
          deleteTagFromAllPages(tagName)
          setIsTagModalOpen(false)
        }}
        deleteTagFromAllPages={deleteTagFromAllPages}
        tag={tagToEdit}
        existingTags={tags}
      />

      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false)
          setPasswordError('')
          setPasswordInput('')
        }}
        onConfirm={handlePasswordConfirm}
        action={passwordAction}
        password={passwordInput}
        onPasswordChange={setPasswordInput}
        error={passwordError}
      />

      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onConfirm={handleCreateFolder}
        theme={theme}
      />

      <AddPageToFolderModal
        isOpen={isAddToFolderModalOpen}
        onClose={() => setIsAddToFolderModalOpen(false)}
        onConfirm={handleAddPageToFolder}
        pages={(pages || []).filter(page => page.type !== 'folder' && !page.folderId)}
        currentFolderId={selectedFolderId}
        theme={theme}
      />

      {(showUpdateNotification || error) && (
        <UpdateNotification
          onClose={() => {
            setShowUpdateNotification(false)
            if (error) dismissError()
          }}
          updateInfo={updateInfo}
          isChecking={isCheckingForUpdates}
          error={error}
          downloadProgress={downloadProgress}
          isDownloading={isDownloading}
          isInstalling={isInstalling}
          onDownload={downloadUpdate}
          onInstall={installUpdate}
          onRetry={checkForUpdates}
        />
      )}
    </div>
  )
}