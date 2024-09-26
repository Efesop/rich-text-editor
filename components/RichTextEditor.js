'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText, Trash2, Search, MoreVertical, Download, X, ChevronDown, Lock } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
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
import NestedList from '@editorjs/nested-list'
import { format } from 'date-fns'
import PasswordModal from '@/components/PasswordModal'
import { usePagesManager } from '@/hooks/usePagesManager'
import ThemeToggle from '@/components/ThemeToggle'
import SearchInput from '@/components/SearchInput'
import PageItem from '@/components/PageItem'

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
    removeTagFromPage,
    deleteTagFromAllPages,
    tags
  } = usePagesManager()

  const { theme } = useTheme()
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [pageToRename, setPageToRename] = useState(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [tagToEdit, setTagToEdit] = useState(null)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const { addTag, removeTag, deleteTag } = useTagStore()
  const [searchFilter, setSearchFilter] = useState('all')
  const [passwordInput, setPasswordInput] = useState('')
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [passwordAction, setPasswordAction] = useState('')
  const [pageToAccess, setPageToAccess] = useState(null)
  const [unlockedPages, setUnlockedPages] = useState(new Set())
  const [passwordError, setPasswordError] = useState('')

  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const handleEditorChange = useCallback(async (content) => {
    await savePage(content)
    setWordCount(calculateWordCount(content))
  }, [savePage])

  const handlePageSelect = (page) => {
    if (currentPage && currentPage.password && unlockedPages.has(currentPage.id)) {
      // Relock the current page if it was temporarily unlocked
      setUnlockedPages(prev => {
        const newSet = new Set(prev)
        newSet.delete(currentPage.id)
        return newSet
      })
    }

    if (page.password && !unlockedPages.has(page.id)) {
      setPasswordAction('access')
      setPageToAccess(page)
      setIsPasswordModalOpen(true)
    } else {
      setCurrentPage(page)
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
    setNewPageTitle(page.title)
    setIsRenameModalOpen(true)
  }, [])

  const confirmRename = useCallback(async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
      await renamePage(pageToRename, newPageTitle)
    }
    setIsRenameModalOpen(false)
    setPageToRename(null)
    setNewPageTitle('')
  }, [pageToRename, newPageTitle, renamePage])

  const handleAddTag = useCallback((tag) => {
    addTagToPage(currentPage.id, tag)
  }, [currentPage, addTagToPage])

  const handleRemoveTag = useCallback((tagName) => {
    removeTagFromPage(currentPage.id, tagName)
  }, [currentPage, removeTagFromPage])

  const handleDeleteTag = useCallback((tagName) => {
    deleteTagFromAllPages(tagName)
  }, [deleteTagFromAllPages])

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
        const unlockSuccess = await unlockPage(pageToAccess, password)
        if (unlockSuccess) {
          setUnlockedPages(prev => new Set(prev).add(pageToAccess.id))
          setCurrentPage(pageToAccess)
          setIsPasswordModalOpen(false)
          setPasswordInput('')
        } else {
          setPasswordError('Incorrect password. Please try again.')
        }
        break
      case 'removeLock':
        const removeLockSuccess = await unlockPage(pageToAccess, password)
        if (removeLockSuccess) {
          const updatedPage = { ...pageToAccess, password: null }
          setPages(prevPages => prevPages.map(p => p.id === updatedPage.id ? updatedPage : p))
          setCurrentPage(updatedPage)
          setUnlockedPages(prev => {
            const newSet = new Set(prev)
            newSet.delete(updatedPage.id)
            return newSet
          })
          setIsPasswordModalOpen(false)
          setPasswordInput('')
        } else {
          setPasswordError('Incorrect password. Unable to remove lock.')
        }
        break
    }
    if (passwordError) {
      setPageToAccess(null)
    }
  }

  const handleDeletePage = useCallback((page) => {
    if (window.confirm(`Are you sure you want to delete "${page.title}"?`)) {
      deletePage(page)
    }
  }, [deletePage])

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
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} flex flex-col border-r transition-all duration-300 ease-in-out ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-100 border-gray-200'}`}>
        <div className="flex items-center justify-between p-4">
          <Button variant="ghost" onClick={handleNewPage}>
            <Plus className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">New Page</span>}
          </Button>
        </div>
        {sidebarOpen && (
          <div className="px-4 mb-2">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              filter={searchFilter}
              onFilterChange={setSearchFilter}
              placeholder={searchPlaceholders[searchFilter]}
            />
          </div>
        )}
        <ScrollArea className="flex-1">
          {pages.map(page => (
            <PageItem
              key={page.id}
              page={page}
              isActive={currentPage.id === page.id}
              onSelect={handlePageSelect}
              onRename={handleRenamePage}
              onDelete={handleDeletePage}
              onToggleLock={handleToggleLock}
              sidebarOpen={sidebarOpen}
              theme={theme}
              tags={tags}
            />
          ))}
        </ScrollArea>
        <Button
          variant="ghost"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex flex-col p-4 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <h1 
              className="text-2xl font-bold cursor-pointer" 
              onClick={() => handleRenamePage(currentPage)}
            >
              {currentPage?.title}
            </h1>
            <div className="flex items-center space-x-2">
              <ExportDropdown onExport={handleExport} />
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center space-x-2">
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
              data={currentPage.content}
              onChange={handleEditorChange}
              holder="editorjs"
            />
          )}
        </div>

        {/* Footer */}
        <div className={`footer-fixed flex justify-between items-center p-3 text-sm ${theme === 'dark' ? 'bg-gray-800 border-t border-gray-700 text-gray-300' : 'bg-white border-t border-gray-200 text-gray-600'}`}>
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
        onConfirm={(tag) => {
          addTagToPage(currentPage.id, tag)
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
    </div>
  )
}