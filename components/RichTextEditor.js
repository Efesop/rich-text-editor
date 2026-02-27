'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, MoreVertical, Import, X, FolderPlus, Bell, Bug, Smartphone, Menu } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { PassphraseModal } from '@/components/PassphraseModal'
import { useTheme } from 'next-themes'
import { getThemeClasses } from '@/utils/themeUtils'
//import { Sun, Moon } from 'lucide-react'
import { RenameModal } from '@/components/RenameModal'
import ExportDropdown from '@/components/ExportDropdown'
import { InstallOnMobileModal } from '@/components/InstallOnMobileModal'
import { MobileInstallGuide } from '@/components/MobileInstallGuide'
// import { UpdateDebugger } from '@/components/UpdateDebugger' // Hidden for production
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
import SortDropdown from '@/components/SortDropdown'
import { FolderModal } from '@/components/FolderModal'
import { AddPageToFolderModal } from './AddPageToFolderModal'
import { MoveToFolderModal } from './MoveToFolderModal'
import { FolderIcon } from 'lucide-react'
import UpdateNotification from './UpdateNotification'
import EncryptionStatusIndicator from './EncryptionStatusIndicator'
import { useUpdateManager } from '@/hooks/useUpdateManager'
import { EditorErrorBoundary, SidebarErrorBoundary } from './ErrorBoundary'
import { useKeyboardNavigation, useScreenReader, useSkipNavigation } from '@/hooks/useKeyboardNavigation'
import TagsFilter from './TagsFilter'
import { DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortablePageItem from './SortablePageItem'
import SortableFolderItem from './SortableFolderItem'
import { getTagChipStyle } from '@/utils/colorUtils'
import { ConfirmModal } from './ConfirmModal'
import { shouldShowMobileInstall } from '@/utils/deviceUtils'
import { MobileHeaderMenu } from './MobileHeaderMenu'

const DynamicEditor = dynamic(() => import('@/components/Editor'), { ssr: false })

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
    importPages,
    movePageToFolder,
    reorderItems,
    reorderWithinFolder,
    persistPages,
    movePageToContainer,
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
  const announce = useScreenReader()
  useSkipNavigation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isSmallScreen, setIsSmallScreen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [isAddToFolderModalOpen, setIsAddToFolderModalOpen] = useState(false)
  const [isMoveToFolderModalOpen, setIsMoveToFolderModalOpen] = useState(false)
  const [pageToMoveToFolder, setPageToMoveToFolder] = useState(null)
  const [passwordAction, setPasswordAction] = useState('lock')
  const [passwordError, setPasswordError] = useState('')
  // Rate limiting for password attempts — persisted to localStorage
  const MAX_PASSWORD_ATTEMPTS = 5
  const LOCKOUT_DURATIONS = [30000, 60000, 120000, 300000] // Exponential backoff: 30s, 60s, 2m, 5m
  const passwordAttemptsRef = useRef(() => {
    try {
      const stored = localStorage.getItem('dash-password-lockouts')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })
  // Initialize ref value from the lazy initializer
  if (typeof passwordAttemptsRef.current === 'function') {
    passwordAttemptsRef.current = passwordAttemptsRef.current()
  }
  const [isClient, setIsClient] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [pageToRename, setPageToRename] = useState(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [tagToEdit, setTagToEdit] = useState(null)
  const [searchFilter, setSearchFilter] = useState('all')
  const [selectedTagsFilter, setSelectedTagsFilter] = useState([])
  const [passwordInput, setPasswordInput] = useState('')
  const [sortOption, setSortOption] = useState('custom')
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [appVersion, setAppVersion] = useState('')
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState(null) // Error message for import failures
  const fileInputRef = useRef(null)
  const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024 // 50MB limit
  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    variant: 'danger',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    showCancel: true
  })
  const [isPassphraseOpen, setIsPassphraseOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'export' | 'import'

  // Drag and drop state
  const [activeDragItem, setActiveDragItem] = useState(null)
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )
  const isDndEnabled = sortOption === 'custom' && !searchTerm && selectedTagsFilter.length === 0

  // Custom collision detection using raw pointer coordinates for reliable folder boundary detection
  const customCollisionDetection = useCallback((args) => {
    const { active, droppableRects, droppableContainers, pointerCoordinates } = args
    if (!pointerCoordinates) return closestCorners(args)

    const draggedItem = (pages || []).find(p => p.id === active.id)
    if (!draggedItem || draggedItem.type === 'folder') return closestCorners(args)

    const activeContainer = draggedItem.folderId || 'root'

    const isInRect = (rect) => rect &&
      pointerCoordinates.x >= rect.left && pointerCoordinates.x <= rect.right &&
      pointerCoordinates.y >= rect.top && pointerCoordinates.y <= rect.bottom

    // Find closest droppable by Y-distance to center
    const findClosest = (filter) => {
      let closest = null, closestDist = Infinity
      for (const container of droppableContainers) {
        if (container.id === active.id || container.disabled) continue
        if (!filter(container)) continue
        const rect = droppableRects.get(container.id)
        if (!rect) continue
        const dist = Math.abs(pointerCoordinates.y - (rect.top + rect.height / 2))
        if (dist < closestDist) { closestDist = dist; closest = container.id }
      }
      return closest ? [{ id: closest }] : []
    }

    // Check if pointer is inside a DIFFERENT folder → drag into that folder
    for (const container of droppableContainers) {
      if (container.id === activeContainer || container.disabled) continue
      const item = (pages || []).find(p => p.id === container.id)
      if (item?.type === 'folder') {
        if (isInRect(droppableRects.get(container.id))) return [{ id: container.id }]
      }
    }

    if (activeContainer !== 'root') {
      // Page is inside a folder — check if pointer is still within the folder's bounds
      const folderRect = droppableRects.get(activeContainer)

      if (isInRect(folderRect)) {
        // Pointer inside folder → target same-folder pages only (for reorder)
        const folderObj = (pages || []).find(p => p.id === activeContainer && p.type === 'folder')
        const folderPageIds = new Set(folderObj?.pages || [])
        return findClosest(c => folderPageIds.has(c.id))
      } else {
        // Pointer outside folder → target root-level items, or folder itself as "move to root" signal
        const result = findClosest(c => {
          if (c.id === activeContainer) return false
          const item = (pages || []).find(p => p.id === c.id)
          return item && (item.type === 'folder' || !item.folderId)
        })
        if (result.length > 0) return result
        // No root items exist — return the folder itself (handleDragEnd treats this as "move to root")
        return [{ id: activeContainer }]
      }
    }

    // Page is at root → use closestCorners normally
    return closestCorners(args)
  }, [pages])

  const handleDragStart = useCallback((event) => {
    const item = (pages || []).find(p => p.id === event.active.id)
    setActiveDragItem(item || null)
  }, [pages])

  // onDragOver: no-op — cross-container moves handled in onDragEnd to avoid bounce
  const handleDragOver = useCallback(() => {}, [])

  // onDragEnd: handles both same-container reorder and cross-container moves
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveDragItem(null)

    if (!over || active.id === over.id) return

    const activeItem = (pages || []).find(p => p.id === active.id)
    const overItem = (pages || []).find(p => p.id === over.id)
    if (!activeItem || !overItem) return

    // Folders can only reorder with other root items
    if (activeItem.type === 'folder') {
      reorderItems(active.id, over.id)
      return
    }

    const activeContainer = activeItem.folderId || 'root'
    let overContainer
    if (overItem.type === 'folder') {
      overContainer = overItem.id
    } else {
      overContainer = overItem.folderId || 'root'
    }

    if (activeContainer === overContainer) {
      // Same container
      if (overItem.type === 'folder' && activeItem.folderId === overItem.id) {
        // Page dropped on its own folder (pointer was outside folder) → move to root
        movePageToContainer(active.id, activeContainer, 'root', null)
      } else if (activeContainer === 'root') {
        reorderItems(active.id, over.id)
      } else {
        reorderWithinFolder(activeContainer, active.id, over.id)
      }
    } else {
      // Cross-container move
      movePageToContainer(active.id, activeContainer, overContainer, overContainer === 'root' ? over.id : null)
    }
  }, [pages, reorderItems, reorderWithinFolder, movePageToContainer])

  // Centralized theme classes - reduces code duplication
  const themeClasses = getThemeClasses(theme)

  // Convenience accessors for backwards compatibility
  const getMainContainerClasses = () => themeClasses.mainContainer
  const getSidebarClasses = () => themeClasses.sidebar
  const getButtonHoverClasses = () => themeClasses.buttonHover
  const getHeaderClasses = () => themeClasses.header
  const getMainContentClasses = () => themeClasses.mainContent
  const getFooterClasses = () => themeClasses.footer

  const getTextClasses = () => themeClasses.text
  const getIconClasses = () => themeClasses.icon
  const getFolderBadgeClasses = () => themeClasses.folderBadge

  // Essential useEffects
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Responsive: detect small screens and default to collapsed sidebar
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null
    const apply = () => {
      const small = mq ? mq.matches : false
      setIsSmallScreen(small)
      if (small) setSidebarOpen(false)
    }
    apply()
    mq && mq.addEventListener('change', apply)
    return () => { mq && mq.removeEventListener('change', apply) }
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
        case 'dashpack': {
          setPendingAction('export')
          setIsPassphraseOpen(true)
          break
        }
        default:
          console.error('Unsupported export type:', exportType)
      }
    } catch (error) {
      console.error('Error exporting content:', error)
    }
  }, [isClient, currentPage])

  const handleExportBundle = useCallback(async () => {
    try {
      setPendingAction('export')
      setIsPassphraseOpen(true)
    } catch (err) {
      console.error('Failed exporting bundle', err)
    }
  }, [pages, tags])

  const handleImportBundleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportBundle = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Clear any previous errors
    setImportError(null)

    // Validate file size
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setImportError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 50MB.`)
      setConfirmModal({
        isOpen: true,
        title: 'Import Failed',
        message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 50MB.`,
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        variant: 'warning',
        confirmText: 'OK',
        showCancel: false
      })
      e.target.value = ''
      return
    }

    try {
      setPendingAction({ type: 'import', file })
      setIsPassphraseOpen(true)
    } catch (err) {
      console.error('Failed importing bundle', err)
    } finally {
      e.target.value = ''
    }
  }, [])

  const handlePassphraseConfirm = useCallback(async (passphrase) => {
    setIsPassphraseOpen(false)
    setImportError(null)

    try {
      if (pendingAction === 'export') {
        const { exportEncryptedBundle } = await import('@/utils/exportUtils')
        // Export ALL items including folders to preserve folder structure
        const allItems = pages || []
        await exportEncryptedBundle(allItems, tags, passphrase)
        return
      }
      if (pendingAction && pendingAction.type === 'import') {
        const file = pendingAction.file
        setIsImporting(true)
        const { importEncryptedBundle } = await import('@/utils/exportUtils')
        const { pages: importedItems, tags: importedTags } = await importEncryptedBundle(file, passphrase)
        // Use importPages to properly merge, update refs, and save to storage
        // This handles both pages AND folders since they're stored together
        await importPages(importedItems)
        // Tags: union by name
        const existing = new Set((tags || []).map(t => t.name))
        importedTags?.forEach(t => { if (!existing.has(t.name)) useTagStore.getState().addTag(t) })

        // Show success message
        setConfirmModal({
          isOpen: true,
          title: 'Import Successful',
          message: `Successfully imported ${importedItems?.length || 0} items and ${importedTags?.length || 0} tags.`,
          onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
          variant: 'info',
          confirmText: 'Done',
          showCancel: false
        })
      }
    } catch (err) {
      console.error('Bundle action failed', err)

      // Show user-friendly error message
      const errorMessage = err.name === 'DecryptionError'
        ? err.message
        : 'Failed to process the file. Please ensure it is a valid encrypted bundle.'

      setImportError(errorMessage)
      setConfirmModal({
        isOpen: true,
        title: 'Import Failed',
        message: errorMessage,
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        variant: 'danger',
        confirmText: 'OK',
        showCancel: false
      })
    } finally {
      setIsImporting(false)
      setPendingAction(null)
    }
  }, [pendingAction, pages, tags, importPages])

  const handleRenamePage = useCallback((page) => {
    setPageToRename(page)
    setNewPageTitle(page.title.slice(0, 50))
    setIsRenameModalOpen(true)
  }, [])

  const confirmRename = useCallback(async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
      await renamePage(pageToRename, newPageTitle.slice(0, 50))
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

  const persistLockouts = () => {
    try {
      localStorage.setItem('dash-password-lockouts', JSON.stringify(passwordAttemptsRef.current))
    } catch { /* ignore storage errors */ }
  }

  const trackFailedAttempt = (pageId, fallbackError) => {
    if (!pageId) {
      setPasswordError(fallbackError)
      return
    }
    const attempts = passwordAttemptsRef.current[pageId] || { count: 0, lockedUntil: 0, lockoutCount: 0 }
    attempts.count += 1
    const remainingAttempts = MAX_PASSWORD_ATTEMPTS - attempts.count

    if (attempts.count >= MAX_PASSWORD_ATTEMPTS) {
      const durationIndex = Math.min(attempts.lockoutCount || 0, LOCKOUT_DURATIONS.length - 1)
      const duration = LOCKOUT_DURATIONS[durationIndex]
      attempts.lockedUntil = Date.now() + duration
      attempts.count = 0
      attempts.lockoutCount = (attempts.lockoutCount || 0) + 1
      const seconds = Math.ceil(duration / 1000)
      setPasswordError(`Too many failed attempts. Please wait ${seconds} seconds before trying again.`)
    } else {
      setPasswordError(`Incorrect password. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`)
    }
    passwordAttemptsRef.current[pageId] = attempts
    persistLockouts()
  }

  const handlePasswordConfirm = async (actionType, password) => {
    setPasswordError('')

    // Rate limiting check for unlock/remove actions
    if (actionType === 'open' || actionType === 'removeLock') {
      const pageId = pageToAccess?.id
      if (pageId) {
        const attempts = passwordAttemptsRef.current[pageId] || { count: 0, lockedUntil: 0 }

        // Check if currently locked out
        if (attempts.lockedUntil > Date.now()) {
          const remainingSeconds = Math.ceil((attempts.lockedUntil - Date.now()) / 1000)
          setPasswordError(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`)
          return
        }
      }
    }

    let success = false
    switch (actionType) {
      case 'lock': {
        success = await lockPage(pageToAccess, password)
        if (!success) setPasswordError('Failed to lock the page. Please try again.')
        break
      }
      case 'open': {
        success = await unlockPage(pageToAccess, password, true)
        if (!success) {
          trackFailedAttempt(pageToAccess?.id, 'Incorrect password. Please try again.')
        }
        break
      }
      case 'removeLock': {
        success = await unlockPage(pageToAccess, password, false)
        if (!success) {
          trackFailedAttempt(pageToAccess?.id, 'Incorrect password. Unable to remove lock.')
        }
        break
      }
    }

    if (success) {
      // Clear attempts on successful unlock
      if (pageToAccess?.id) {
        delete passwordAttemptsRef.current[pageToAccess.id]
      }
      setIsPasswordModalOpen(false)
      setPasswordInput('')
      setPageToAccess(null)
    }
  }

  const handleDeletePage = useCallback((page) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Page',
      message: `Are you sure you want to delete "${page.title}"? This action cannot be undone.`,
      onConfirm: () => deletePage(page),
      variant: 'danger',
      confirmText: 'Delete',
      showCancel: true
    })
  }, [deletePage])

  const filteredPages = useCallback(() => {
    return pages.filter(page => {
      if (page.type === 'folder') {
        return page.title.toLowerCase().includes(searchTerm.toLowerCase())
      }

      // Apply tag filter first
      if (selectedTagsFilter.length > 0) {
        const pageHasSelectedTag = selectedTagsFilter.some(selectedTag =>
          page.tagNames && page.tagNames.includes(selectedTag)
        )
        if (!pageHasSelectedTag) return false
      }

      // Apply search filter
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
  }, [pages, searchTerm, searchFilter, selectedTagsFilter]);

  const sortPages = useCallback((pages, option) => {
    const list = Array.isArray(pages) ? pages : []
    const folders = list.filter(item => item.type === 'folder')
    const nonFolderPages = list.filter(item => item.type !== 'folder')

    let sortedPages
    switch (option) {
      case 'custom':
        return list
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

  // DnD helpers (must be after filteredPages/sortPages definitions)
  const getRootItemIds = useCallback(() => {
    return sortPages(filteredPages(), sortOption)
      .filter(item => item.type === 'folder' || !item.folderId)
      .map(item => item.id)
  }, [filteredPages, sortPages, sortOption])

  const getFolderPageIds = useCallback((folderId) => {
    const folder = (pages || []).find(p => p.id === folderId && p.type === 'folder')
    if (!folder || !Array.isArray(folder.pages)) return []
    const existingIds = new Set((pages || []).map(p => p.id))
    return folder.pages.filter(id => existingIds.has(id))
  }, [pages])

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
    setConfirmModal({
      isOpen: true,
      title: 'Delete Folder',
      message: 'Are you sure you want to delete this folder? Pages inside will be moved out of the folder.',
      onConfirm: () => deleteFolder(folderId),
      variant: 'danger',
      confirmText: 'Delete',
      showCancel: true
    })
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

  const handleMoveToFolder = (page) => {
    setPageToMoveToFolder(page)
    setIsMoveToFolderModalOpen(true)
  }

  const handleMoveToFolderConfirm = (targetFolderId) => {
    if (!pageToMoveToFolder) return
    movePageToFolder(pageToMoveToFolder.id, targetFolderId)
    setIsMoveToFolderModalOpen(false)
    setPageToMoveToFolder(null)
  }

  useEffect(() => {
    const handleLinkClick = (event) => {
      const link = event.target?.closest && event.target.closest('a')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href) return
      // Ignore programmatic clicks or downloads (used by export)
      if (!event.isTrusted || link.hasAttribute('download')) return
      try {
        const url = new URL(href, window.location.href)
        const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
        if (isHttp && window.electron?.openExternal) {
          event.preventDefault()
          window.electron.openExternal(url.toString())
        }
      } catch (_) {
        // ignore invalid URLs
      }
    }

    document.addEventListener('click', handleLinkClick)
    return () => document.removeEventListener('click', handleLinkClick)
  }, [])

  useEffect(() => {
    const fetchAppVersion = async () => {
      try {
        if (!window.electron?.invoke) return
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
    pages: (Array.isArray(pages) ? pages : []).filter(page => page.type !== 'folder'), // Use pages directly instead of filteredPages()
    onSelectPage: handlePageSelect
  })

  // Force override Editor.js styles for fallout theme
  useEffect(() => {
    if (theme === 'fallout') {
      // Remove any existing override styles
      const existingOverride = document.getElementById('fallout-editor-override')
      if (existingOverride) {
        existingOverride.remove()
      }

      // Create and inject override styles
      const style = document.createElement('style')
      style.id = 'fallout-editor-override'
      style.innerHTML = `
        /* ULTIMATE fallout theme overrides - injected after Editor.js loads */
        .fallout .codex-editor .ce-block:hover .ce-block__content,
        .fallout .codex-editor .ce-block--selected .ce-block__content,
        .fallout .codex-editor .ce-block:focus .ce-block__content {
          background: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
          border: none !important;
          outline: none !important;
        }
        
        .fallout .codex-editor .ce-block:hover::before,
        .fallout .codex-editor .ce-block:hover::after,
        .fallout .codex-editor .ce-block::before,
        .fallout .codex-editor .ce-block::after,
        .fallout .codex-editor .ce-block--selected::before,
        .fallout .codex-editor .ce-block--selected::after {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          content: none !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* Clean Editor.js dropdown menus */
        .fallout .ce-popover,
        .fallout .ce-popover.ce-popover--opened,
        .fallout .ce-conversion-toolbar {
          background: #111111 !important;
          border: 1px solid #16a34a !important;
          color: #16a34a !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
        }
        
        .fallout .ce-popover__item,
        .fallout .ce-conversion-tool {
          background: transparent !important;
          color: #16a34a !important;
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
          padding: 10px 16px !important;
          margin: 0 !important;
        }
        
        .fallout .ce-popover__item:hover,
        .fallout .ce-conversion-tool:hover {
          background: #1a2e1a !important;
          color: #16a34a !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* Force remove ALL borders from dropdown items */
        .fallout .fixed.w-48.rounded-md.shadow-lg button,
        .fallout [role="menuitem"] {
          border: none !important;
          border-top: none !important;
          border-bottom: none !important;
          border-left: none !important;
          border-right: none !important;
          box-shadow: none !important;
          outline: none !important;
          background: transparent !important;
        }
        
        .fallout .ring-1,
        .fallout .ring-black,
        .fallout .ring-opacity-5 {
          box-shadow: none !important;
          border: none !important;
        }
      `
      document.head.appendChild(style)
    } else {
      // Remove fallout overrides when not in fallout theme
      const existingOverride = document.getElementById('fallout-editor-override')
      if (existingOverride) {
        existingOverride.remove()
      }
    }
  }, [theme])

  // Handle loading states - these returns must come AFTER all hooks
  if (!isClient) {
    return (
      <div className={`flex h-screen items-center justify-center ${getMainContainerClasses()}`}>
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div
      className={getMainContainerClasses()}
      role="application"
      aria-label="Rich Text Note Editor"
    >
      {/* Mobile overlay */}
      {isSmallScreen && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden safe-area-top"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <SidebarErrorBoundary>
        <nav
          className={`${getSidebarClasses()} ${isSmallScreen
            ? `fixed z-50 inset-y-0 left-0 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200 w-3/4 max-w-xs safe-area-top safe-area-bottom`
            : `${sidebarOpen ? 'w-64' : 'w-16'} relative transition-all duration-300`
            } flex flex-col overflow-visible`}
          role="navigation"
          aria-label="Page navigation"
          aria-expanded={sidebarOpen}
        >
          <header className={`px-3 pt-4 pb-2 flex ${sidebarOpen ? 'justify-between' : 'justify-center'} items-center`}>
            {sidebarOpen ? (
              <div className="flex items-center space-x-2">
                <img src="./icons/dash-logo.png" alt="Dash" className="h-7 w-7 rounded-md" />
                <span className={`text-base font-semibold ${theme === 'fallout' ? 'text-green-400' : theme === 'dark' ? 'text-[#ececec]' : theme === 'darkblue' ? 'text-[#e0e6f0]' : 'text-neutral-900'}`}>Dash</span>
              </div>
            ) : (
              <img src="./icons/dash-logo.png" alt="Dash" className="h-7 w-7 rounded-md" />
            )}
            <div className="flex items-center space-x-1">
              {sidebarOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFolderModalOpen(true)}
                  className={`h-8 w-8 p-0 ${getButtonHoverClasses()}`}
                  title="New folder"
                >
                  <FolderPlus className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewPage}
                className={`h-8 w-8 p-0 ${getButtonHoverClasses()}`}
                title="New page"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </header>
          {sidebarOpen && (
            <div className="px-3 mb-2 pt-1 space-y-2">
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
          <ScrollArea className="flex-grow px-1">
            <DndContext
              sensors={dndSensors}
              collisionDetection={customCollisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={getRootItemIds()}
                strategy={verticalListSortingStrategy}
                disabled={!isDndEnabled}
              >
                {sortPages(filteredPages(), sortOption).map(item => {
                  if (item.type === 'folder') {
                    const folderPageIds = getFolderPageIds(item.id)
                    return (
                      <SortableFolderItem
                        key={item.id}
                        id={item.id}
                        disabled={!isDndEnabled}
                        isDndEnabled={isDndEnabled}
                        folderPageIds={folderPageIds}
                        folder={item}
                        onAddPage={() => {
                          setSelectedFolderId(item.id);
                          setIsAddToFolderModalOpen(true);
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
                        onDuplicate={handleDuplicatePage}
                        onMoveToFolder={handleMoveToFolder}
                        pagesCount={folderPageIds.length}
                      />
                    )
                  }
                  if (!item.folderId) {
                    return (
                      <SortablePageItem
                        key={item.id}
                        id={item.id}
                        disabled={!isDndEnabled}
                        page={item}
                        isActive={currentPage?.id === item.id}
                        onSelect={handlePageSelect}
                        onRename={handleRenamePage}
                        onDelete={handleDeletePage}
                        onToggleLock={handleToggleLock}
                        onDuplicate={handleDuplicatePage}
                        onMoveToFolder={handleMoveToFolder}
                        sidebarOpen={sidebarOpen}
                        theme={theme}
                        tags={tags}
                        tempUnlockedPages={tempUnlockedPages}
                        isInsideFolder={false}
                      />
                    );
                  }
                  return null
                })}
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeDragItem ? (
                  <div className="opacity-80 shadow-lg rounded-lg pointer-events-none">
                    <div className={`px-3 py-2 text-sm rounded-lg ${
                      theme === 'fallout'
                        ? 'bg-gray-800 text-green-400 border border-green-600/40'
                        : theme === 'dark'
                          ? 'bg-[#2f2f2f] text-[#ececec] border border-[#3a3a3a]'
                          : theme === 'darkblue'
                            ? 'bg-[#1a2035] text-[#e0e6f0] border border-[#1c2438]'
                            : 'bg-white text-neutral-900 border border-neutral-200 shadow-md'
                    }`}>
                      {activeDragItem.type === 'folder' && <FolderIcon className="w-4 h-4 inline mr-2 opacity-60" />}
                      {activeDragItem.title || 'Untitled'}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </ScrollArea>
          <div className={`mt-auto px-3 py-2 flex items-center justify-between ${theme === 'fallout' ? 'border-t border-green-600/20' : theme === 'dark' ? 'border-t border-[#2e2e2e]' : theme === 'darkblue' ? 'border-t border-[#1c2438]' : 'border-t border-neutral-100'}`}>
            <Button
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`self-start h-7 w-7 p-0 ${getButtonHoverClasses()}`}
              size="sm"
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            {sidebarOpen && (
              <div className="flex items-center space-x-2">
                {appVersion && <span className={`text-xs ${getTextClasses()}`}>v{appVersion}</span>}
                <SortDropdown onSort={setSortOption} theme={theme} activeSortOption={sortOption} sidebarOpen={sidebarOpen} />
              </div>
            )}
          </div>
        </nav>
      </SidebarErrorBoundary>

      {/* Main Content */}
      <main
        className="flex-1 flex flex-col overflow-hidden md:ml-0"
        id="main-content"
        role="main"
        aria-label="Note editor"
      >
        {!currentPage ? (
          <div className={`flex-1 flex items-center justify-center ${getMainContentClasses()}`}>
            <div className={`text-center ${theme === 'fallout' ? 'text-green-600' : theme === 'darkblue' ? 'text-[#445068]' : theme === 'dark' ? 'text-[#6b6b6b]' : 'text-neutral-400'}`}>
              <p className="text-lg">No page selected</p>
              <p className="text-sm mt-1">Select a page from the sidebar or create a new one</p>
            </div>
          </div>
        ) : (
        <>
        {/* Header */}
        <div className={`flex flex-col px-6 py-3 ${theme === 'fallout' ? 'border-b border-green-600/20' : theme === 'dark' ? 'border-b border-[#2e2e2e]' : theme === 'darkblue' ? 'border-b border-[#1c2438]' : 'border-b border-neutral-100'} ${getHeaderClasses()} safe-area-top`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0">
              {isSmallScreen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                  className="mr-2 h-8 w-8 p-0"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <h1
                className={`text-lg font-semibold cursor-pointer truncate ${theme === 'fallout' ? 'text-green-400' : theme === 'dark' ? 'text-[#ececec]' : theme === 'darkblue' ? 'text-[#e0e6f0]' : 'text-neutral-900'}`}
                onClick={() => handleRenamePage(currentPage)}
              >
                {currentPage?.title}
              </h1>
              {currentPage?.folderId && (
                <span className={`ml-2 px-1.5 py-0.5 text-xs font-medium rounded-md flex-shrink-0 ${getFolderBadgeClasses()}`}>
                  <FolderIcon className="w-3 h-3 inline-block mr-1" />
                  {truncateFolderName((pages || []).find(item => item.id === currentPage.folderId)?.title || '')}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {isSmallScreen ? (
                <MobileHeaderMenu
                  onExport={handleExport}
                  onImportBundle={handleImportBundleClick}
                  onPhoneSetup={() => setIsInstallModalOpen(true)}
                  isImporting={isImporting}
                />
              ) : (
                <>
                  <ExportDropdown onExport={handleExport} />
                  {shouldShowMobileInstall() && (
                    <button
                      onClick={() => setIsInstallModalOpen(true)}
                      className={`p-2 rounded-lg ${getButtonHoverClasses()}`}
                      title="Use on your phone"
                    >
                      <Smartphone className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={handleImportBundleClick}
                    className={`p-2 rounded-lg ${getButtonHoverClasses()}`}
                    title={isImporting ? 'Importing…' : 'Import encrypted bundle'}
                    disabled={isImporting}
                  >
                    <Import className={`h-4 w-4 ${isImporting ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer');
                    }}
                    className={`p-2 rounded-lg ${getButtonHoverClasses()}`}
                    title="Report a bug or request a feature"
                  >
                    <Bug className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleBellClick}
                    disabled={!canCheckForUpdates}
                    className={`relative p-2 rounded-lg ${getButtonHoverClasses()} ${!canCheckForUpdates ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Check for updates"
                  >
                    <Bell className={`h-4 w-4 ${isCheckingForUpdates ? 'animate-pulse' : ''}`} />
                    {updateInfo?.available && (
                      <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ${theme === 'dark' ? 'border border-[#0d0d0d]' : theme === 'darkblue' ? 'border border-[#0c1017]' : theme === 'fallout' ? 'border border-gray-900' : 'border border-white'} shadow-sm`}></span>
                    )}
                  </button>
                  <ThemeToggle />
                </>
              )}
            </div>
        </div>
        {currentPage.tagNames && currentPage.tagNames.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 mt-2">
            {currentPage.tagNames.map((tagName, index) => {
              const tag = (tags || []).find(t => t.name === tagName)
              if (!tag) return null
              return (
                <span
                  key={index}
                  className="inline-flex items-center rounded-md font-medium border px-2 py-0.5 text-xs"
                  style={getTagChipStyle(tag.color, theme)}
                >
                  <span
                    className="cursor-pointer"
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
                    <X
                      className="h-3 w-3 transition-opacity hover:opacity-75"
                      style={{
                        color: theme === 'dark' || theme === 'darkblue'
                          ? getTagChipStyle(tag.color, theme).color
                          : theme === 'light'
                            ? '#6b7280'
                            : getTagChipStyle(tag.color, theme).color
                      }}
                    />
                  </button>
                </span>
              )
            })}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => {
                setTagToEdit(null)
                setIsTagModalOpen(true)
              }}
            >
              <Plus className={`h-3.5 w-3.5 ${getIconClasses()}`} />
            </Button>
          </div>
        )}
        {(!currentPage.tagNames || currentPage.tagNames.length === 0) && (
          <div className="flex items-center mt-2">
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-2 text-xs ${theme === 'fallout' ? 'text-green-600 hover:text-green-400' : theme === 'dark' ? 'text-[#6b6b6b] hover:text-[#c0c0c0]' : theme === 'darkblue' ? 'text-[#5d6b88] hover:text-[#8b99b5]' : 'text-neutral-400 hover:text-neutral-600'}`}
              onClick={() => {
                setTagToEdit(null)
                setIsTagModalOpen(true)
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add tag
            </Button>
          </div>
        )}
    </div>

        {/* Editor */ }
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
  <div className={`footer-fixed flex justify-between items-center px-6 py-2 text-xs ${getFooterClasses()} safe-area-bottom`}>
    <div className="flex items-center space-x-3">
      {currentPage.createdAt && (
        <span>{format(new Date(currentPage.createdAt), 'MMM d, yyyy')}</span>
      )}
      <EncryptionStatusIndicator />
    </div>
    <div className="flex items-center space-x-3">
      <span>{wordCount} words</span>
      <span aria-live="polite" aria-atomic="true">
        {saveStatus === 'saving' && <span className={theme === 'fallout' ? 'text-yellow-400' : 'text-yellow-500'}>Saving...</span>}
        {saveStatus === 'saved' && <span className={theme === 'fallout' ? 'text-green-400' : theme === 'dark' ? 'text-[#6b6b6b]' : theme === 'darkblue' ? 'text-[#445068]' : 'text-neutral-400'}>Saved</span>}
        {saveStatus === 'error' && <span className="text-red-500">Error saving</span>}
      </span>
    </div>
  </div>
        </>
        )}
      </main >

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

      <MoveToFolderModal
        isOpen={isMoveToFolderModalOpen}
        onClose={() => {
          setIsMoveToFolderModalOpen(false)
          setPageToMoveToFolder(null)
        }}
        onConfirm={handleMoveToFolderConfirm}
        folders={(pages || []).filter(item => item.type === 'folder')}
        currentFolderId={pageToMoveToFolder?.folderId || null}
        theme={theme}
      />

  {
    (showUpdateNotification || error) && (
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
    )
  }

      <input
        ref={fileInputRef}
        type="file"
        accept=".dashpack,application/json,application/octet-stream,*/*"
        onChange={handleImportBundle}
        className="hidden"
      />

      <InstallOnMobileModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        pwaUrl="https://efesop.github.io/rich-text-editor/"
      />

      <MobileInstallGuide />

  {/* <UpdateDebugger
        isOpen={isUpdateDebuggerOpen}
        onClose={() => setIsUpdateDebuggerOpen(false)}
      /> */}

      <PassphraseModal
        isOpen={isPassphraseOpen}
        onClose={() => setIsPassphraseOpen(false)}
        onConfirm={handlePassphraseConfirm}
        title={pendingAction === 'export' ? 'Set a passphrase (store safely)' : 'Enter passphrase'}
        confirmLabel={pendingAction === 'export' ? 'Encrypt & Export' : 'Decrypt & Import'}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        showCancel={confirmModal.showCancel}
      />
    </div >
  )
}