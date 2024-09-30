'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, FolderPlus } from 'lucide-react'
import { useTheme } from 'next-themes'
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
import { X } from 'lucide-react'

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
    renameFolder
  } = usePagesManager()

  const { theme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [pageToRename, setPageToRename] = useState(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [tagToEdit, setTagToEdit] = useState(null)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [searchFilter, setSearchFilter] = useState('all')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordAction, setPasswordAction] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [sortOption, setSortOption] = useState('newest')

  const [isClient, setIsClient] = useState(false)
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [isAddToFolderModalOpen, setIsAddToFolderModalOpen] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

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
    setNewPageTitle(page.title.slice(0, 15))
    setIsRenameModalOpen(true)
  }, [])

  const confirmRename = useCallback(async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
      await renamePage(pageToRename, newPageTitle.slice(0, 15))
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
    return pages.filter(page => {
      if (page.type === 'folder') {
        return page.title.toLowerCase().includes(searchTerm.toLowerCase())
      }
      if (searchTerm === '') return true;
      
      const lowercaseSearchTerm = searchTerm.toLowerCase();
      
      switch (searchFilter) {
        case 'all':
          return page.title.toLowerCase().includes(lowercaseSearchTerm) ||
                 JSON.stringify(page.content).toLowerCase().includes(lowercaseSearchTerm) ||
                 (page.tagNames && page.tagNames.some(tag => tag.toLowerCase().includes(lowercaseSearchTerm)));
        case 'title':
          return page.title.toLowerCase().includes(lowercaseSearchTerm);
        case 'content':
          return JSON.stringify(page.content).toLowerCase().includes(lowercaseSearchTerm);
        case 'tags':
          return page.tagNames && page.tagNames.some(tag => tag.toLowerCase().includes(lowercaseSearchTerm));
        default:
          return true;
      }
    });
  }, [pages, searchTerm, searchFilter]);

  const sortPages = useCallback((pages, option) => {
    switch (option) {
      case 'a-z':
        return [...pages].sort((a, b) => a.title.localeCompare(b.title))
      case 'z-a':
        return [...pages].sort((a, b) => b.title.localeCompare(a.title))
      case 'oldest':
        return [...pages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      case 'tag':
        return [...pages].sort((a, b) => {
          const aTag = a.tagNames && a.tagNames[0] ? a.tagNames[0] : ''
          const bTag = b.tagNames && b.tagNames[0] ? b.tagNames[0] : ''
          return aTag.localeCompare(bTag)
        })
      case 'newest':
      default:
        return [...pages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }
  }, [])

  // Use useMemo to sort the pages based on the current sortOption
  const sortedPages = useMemo(() => {
    return sortPages(filteredPages(), sortOption)
  }, [filteredPages, sortOption, sortPages])

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

  const handleAddPageToFolder = (pageId, folderId) => {
    addPageToFolder(pageId, folderId)
    setIsAddToFolderModalOpen(false)
  }

  const handleRemovePageFromFolder = (pageId, folderId) => {
    removePageFromFolder(pageId, folderId)
  }

  if (!isClient) {
    return null // or a loading indicator
  }

  // Add this check
  if (!currentPage) {
    return <div>No page selected</div> // or some other appropriate UI
  }

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'dark bg-gray-900 text-white' : 'bg-white text-black'}`}>
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} flex flex-col transition-all duration-300 ease-in-out ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'} relative overflow-visible`}>
        <div className={`p-4 flex ${sidebarOpen ? 'justify-between' : 'justify-center'} items-center`}>
          {sidebarOpen && <h1 className="text-2xl font-bold">Pages</h1>}
          <div className="flex items-center space-x-2">
            {sidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFolderModalOpen(true)}
                className={`hover:bg-gray-200 hover:text-primary-foreground ${
                  theme === 'dark' ? 'hover:bg-gray-700 hover:text-white' : 'hover:bg-gray-200 hover:text-primary-foreground'
                }`}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewPage}
              className={`hover:bg-gray-200 hover:text-primary-foreground ${
                theme === 'dark' ? 'hover:bg-gray-700 hover:text-white' : 'hover:bg-gray-200 hover:text-primary-foreground'
              }`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {sidebarOpen && (
          <div className="px-4 mb-3 pt-1">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              filter={searchFilter}
              onFilterChange={setSearchFilter}
              placeholder={searchPlaceholders[searchFilter]}
              theme={theme}
            />
          </div>
        )}
        <ScrollArea className="flex-grow">
          {sortPages(filteredPages(), sortOption).map(item => {
            if (item.type === 'folder') {
              const folderPagesCount = pages.filter(page => page.folderId === item.id).length;
              return (
                <FolderItem
                  key={item.id}
                  folder={item}
                  onAddPage={() => {
                    setSelectedFolderId(item.id)
                    setIsAddToFolderModalOpen(true)
                  }}
                  onDeleteFolder={handleDeleteFolder}
                  onRenameFolder={renameFolder}
                  theme={theme}
                  pages={pages}
                  onSelectPage={handlePageSelect}
                  currentPageId={currentPage?.id}
                  onRemovePageFromFolder={handleRemovePageFromFolder}
                  tags={tags}
                  tempUnlockedPages={tempUnlockedPages}
                  sidebarOpen={sidebarOpen}
                  onDelete={handleDeletePage}
                  onRename={handleRenamePage}
                  onToggleLock={handleToggleLock}
                  pagesCount={folderPagesCount}
                />
              )
            }
            // Only render pages that are not in a folder
            if (!item.folderId) {
              return (
                <PageItem
                  key={item.id}
                  page={item}
                  isActive={currentPage?.id === item.id}
                  onSelect={handlePageSelect}
                  onRename={handleRenamePage}
                  onDelete={handleDeletePage}
                  onToggleLock={handleToggleLock}
                  sidebarOpen={sidebarOpen}
                  theme={theme}
                  tags={tags}
                  tempUnlockedPages={tempUnlockedPages}
                  isInsideFolder={false}  // Add this line
                />
              )
            }
            return null
          })}
        </ScrollArea>
        <div className={`mt-90 p-2 flex items-center justify-between border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`}>
          <Button
            variant="ghost"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="self-start"
            size="sm"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          {sidebarOpen && (
            <div className="pr-3">
              <SortDropdown onSort={setSortOption} theme={theme} activeSortOption={sortOption} sidebarOpen={sidebarOpen} />
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex flex-col p-4 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <h1 
                className="text-2xl font-bold cursor-pointer" 
                onClick={() => handleRenamePage(currentPage)}
              >
                {currentPage?.title}
              </h1>
              {currentPage?.folderId && (
                <span className={`ml-2 px-1.5 py-0.5 text-xs font-medium rounded-md ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-gray-300 border border-gray-600' 
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}>
                  <FolderIcon className="w-3 h-3 inline-block mr-1" />
                  {pages.find(item => item.id === currentPage.folderId)?.title}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <ExportDropdown onExport={handleExport} />
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-2">
            {currentPage.tagNames && currentPage.tagNames.map((tagName, index) => {
              const tag = tags.find(t => t.name === tagName)
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
              <Plus className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} />
            </Button>
          </div>
        </div>
        
        {/* Editor */}
        <div className={`flex-1 overflow-auto p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
          {currentPage && (
            <DynamicEditor
              key={currentPage.id} // Add this line
              data={currentPage.content}
              onChange={handleEditorChange}
              holder="editorjs"
            />
          )}
        </div>

        {/* Footer */}
        <div className={`footer-fixed flex justify-between items-center p-3 text-sm ${theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600'}`}>
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
      </div>

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
        pages={pages.filter(page => page.type !== 'folder' && !page.folderId)}
        currentFolderId={selectedFolderId}
        theme={theme}
      />
    </div>
  )
}