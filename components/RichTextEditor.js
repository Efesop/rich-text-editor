'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, MoreVertical, Import, X, FolderPlus, Bell, Bug, Smartphone, Menu, Lock, LockKeyhole, Unlock, Timer, TimerOff, Keyboard, Sparkles } from 'lucide-react'
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
import SearchTrigger from '@/components/SearchTrigger'
import SearchModal from '@/components/SearchModal'
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
import { DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortablePageItem from './SortablePageItem'
import SortableFolderItem from './SortableFolderItem'
import { getTagChipStyle } from '@/utils/colorUtils'
import { ConfirmModal } from './ConfirmModal'
import { shouldShowMobileInstall } from '@/utils/deviceUtils'
import { MobileHeaderMenu } from './MobileHeaderMenu'
import WhatsNewModal from './WhatsNewModal'
import QuickSwitcher from './QuickSwitcher'
import SelfDestructModal from './SelfDestructModal'
import SelfDestructBadge from './SelfDestructBadge'
import SelfDestructOverlay from './SelfDestructOverlay'
import EncryptionChoiceModal from './EncryptionChoiceModal'
import { deriveKeyFromPassphrase } from '@/utils/cryptoUtils'
import useAppLockStore from '../store/appLockStore'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import AppLockScreen from './AppLockScreen'
import AppLockSetupModal from './AppLockSetupModal'
import AppLockSettingsModal from './AppLockSettingsModal'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'
import FeaturesPanel from './FeaturesPanel'
import { usePageLinkInterceptor, PageLinkDropdown, PageLinkInlineTool } from './editor-tools/PageLink'

const DynamicEditor = dynamic(() => import('@/components/Editor'), { ssr: false })

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
    removeLockFromUnlockedPage,
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
    enterDuressHideMode,
    movePageToContainer,
    setSelfDestruct,
    cancelSelfDestruct,
    navigateToPage,
    selfDestructingPages,
    completeSelfDestruct,
    decryptAllAppLockPages,
    encryptAndClearAppLockPages,
    reEncryptAppLockPages,
    removeAppLockEncryption,
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
  const [isMacElectron, setIsMacElectron] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [pageToRename, setPageToRename] = useState(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [tagToEdit, setTagToEdit] = useState(null)
  const [searchFilter, setSearchFilter] = useState('all')
  const [selectedTagsFilter, setSelectedTagsFilter] = useState([])
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
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
    // Detect macOS Electron for frameless title bar
    if (typeof window !== 'undefined' && window.electronPlatform?.isMac && window.electron?.invoke) {
      setIsMacElectron(true)
    }
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

  // Focus Mode — hides sidebar, header, footer for distraction-free writing
  const [focusMode, setFocusMode] = useState(false)
  const [typewriterMode, setTypewriterMode] = useState(() => {
    try { return localStorage.getItem('dash-typewriter-mode') === 'true' } catch { return false }
  })
  const [paragraphDimming, setParagraphDimming] = useState(() => {
    try { return localStorage.getItem('dash-paragraph-dimming') === 'true' } catch { return false }
  })
  const focusSessionRef = useRef(null)
  const [focusSessionStats, setFocusSessionStats] = useState(null)
  const [focusPillVisible, setFocusPillVisible] = useState(true)
  const focusPillTimerRef = useRef(null)

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      if (!prev) {
        // Entering focus mode — record session start
        focusSessionRef.current = { startTime: Date.now(), startWordCount: wordCount }
      } else {
        // Exiting focus mode — calculate stats
        if (focusSessionRef.current) {
          const elapsed = Date.now() - focusSessionRef.current.startTime
          const wordsWritten = wordCount - focusSessionRef.current.startWordCount
          setFocusSessionStats({ elapsed, wordsWritten })
          focusSessionRef.current = null
          // Auto-dismiss after 4 seconds
          setTimeout(() => setFocusSessionStats(null), 4000)
        }
      }
      return !prev
    })
  }, [wordCount])

  const toggleTypewriterMode = useCallback(() => {
    setTypewriterMode(prev => {
      const next = !prev
      try { localStorage.setItem('dash-typewriter-mode', String(next)) } catch {}
      return next
    })
  }, [])

  const toggleParagraphDimming = useCallback(() => {
    setParagraphDimming(prev => {
      const next = !prev
      try { localStorage.setItem('dash-paragraph-dimming', String(next)) } catch {}
      return next
    })
  }, [])

  // Keyboard Shortcuts modal
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)

  // Features panel
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false)
  const [showFeaturesTooltip, setShowFeaturesTooltip] = useState(false)

  useEffect(() => {
    const key = 'dash-features-tooltip-seen'
    const checkTooltip = async () => {
      try {
        let seen = false
        if (typeof window !== 'undefined' && window.electron?.invoke) {
          const data = await window.electron.invoke('read-whats-new')
          seen = data?.featuresTooltipSeen === true
        } else {
          seen = localStorage.getItem(key) === 'true'
        }
        if (!seen) {
          setTimeout(() => setShowFeaturesTooltip(true), 2000)
        }
      } catch {}
    }
    checkTooltip()
  }, [])

  const dismissFeaturesTooltip = useCallback(async () => {
    setShowFeaturesTooltip(false)
    const key = 'dash-features-tooltip-seen'
    try {
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        const data = await window.electron.invoke('read-whats-new')
        await window.electron.invoke('save-whats-new', { ...data, featuresTooltipSeen: true })
      } else {
        localStorage.setItem(key, 'true')
      }
    } catch {}
  }, [])

  // Self-Destruct modal
  const [isSelfDestructModalOpen, setIsSelfDestructModalOpen] = useState(false)
  const [selfDestructPage, setSelfDestructPage] = useState(null)

  const handleSelfDestruct = useCallback((page) => {
    setSelfDestructPage(page)
    setIsSelfDestructModalOpen(true)
  }, [])

  const handleSelfDestructConfirm = useCallback((durationMs) => {
    if (selfDestructPage) {
      setSelfDestruct(selfDestructPage.id, durationMs)
    }
    setIsSelfDestructModalOpen(false)
    setSelfDestructPage(null)
  }, [selfDestructPage, setSelfDestruct])

  const handleCancelSelfDestruct = useCallback((page) => {
    cancelSelfDestruct(page.id)
  }, [cancelSelfDestruct])

  // Quick Switcher (Cmd+P)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  const toggleQuickSwitcher = useCallback(() => {
    setShowQuickSwitcher(prev => !prev)
  }, [])

  // App Lock
  const appLock = useAppLockStore()
  const [isAppLockSetupOpen, setIsAppLockSetupOpen] = useState(false)
  const [isAppLockSettingsOpen, setIsAppLockSettingsOpen] = useState(false)
  const [isEncryptionChoiceOpen, setIsEncryptionChoiceOpen] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [isLockDropdownOpen, setIsLockDropdownOpen] = useState(false)
  const lockDropdownRef = useRef(null)

  // Load app lock data on mount
  useEffect(() => {
    appLock.loadData()
    // Check biometric availability
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      window.electron.invoke('check-biometric-available').then(available => {
        setBiometricAvailable(available || false)
      }).catch(() => {})
    }
  }, [])

  // Close lock dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (lockDropdownRef.current && !lockDropdownRef.current.contains(e.target)) {
        setIsLockDropdownOpen(false)
      }
    }
    if (isLockDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isLockDropdownOpen])

  // Idle timer for auto-lock (encrypts before locking)
  const handleInstantLock = useCallback(async () => {
    if (appLock.isEnabled) {
      await encryptAndClearAppLockPages()
      appLock.lock()
    }
  }, [appLock.isEnabled, appLock.lock, encryptAndClearAppLockPages])

  useIdleTimer({
    timeoutMinutes: appLock.timeoutMinutes,
    isEnabled: appLock.isEnabled && !appLock.isLocked,
    onIdle: handleInstantLock
  })

  const handleAppLockUnlock = useCallback(async (password) => {
    const valid = appLock.unlock(password)
    if (!valid) return false

    // Derive encryption key
    let salt
    if (appLock.encryptionSalt) {
      salt = new Uint8Array(appLock.encryptionSalt)
    } else {
      // Migration: existing user with app lock but no encryption yet
      salt = crypto.getRandomValues(new Uint8Array(16))
      await appLock.setEncryptionSalt(Array.from(salt))
    }
    const key = await deriveKeyFromPassphrase(password, salt)
    appLock.setEncryptionKey(key, salt)

    // Decrypt all app-lock-encrypted pages
    await decryptAllAppLockPages(key, salt)

    // Store password in safeStorage if biometric is enabled
    if (appLock.biometricEnabled && window.electron?.invoke) {
      await window.electron.invoke('safe-storage-store', 'app-lock-password', password).catch(() => {})
    }

    return true
  }, [appLock, decryptAllAppLockPages])

  const handleBiometricUnlock = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      const success = await window.electron.invoke('prompt-touch-id')
      if (success) {
        // Retrieve password from safeStorage for encryption key derivation
        const password = await window.electron.invoke('safe-storage-retrieve', 'app-lock-password')
        if (password) {
          return handleAppLockUnlock(password)
        }
        // Touch ID succeeded but no stored password (e.g. upgraded from older version)
        // Return 'needs-password' so the lock screen can prompt for it
        return 'needs-password'
      }
    }
    return false
  }, [handleAppLockUnlock])

  const handleAppLockSetup = useCallback(async (password, timeout, biometric) => {
    // Generate encryption salt and derive key
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKeyFromPassphrase(password, salt)

    await appLock.enable(password, timeout, biometric, Array.from(salt))
    appLock.setEncryptionKey(key, salt)

    // Store password in safeStorage if biometric enabled
    if (biometric && window.electron?.invoke) {
      await window.electron.invoke('safe-storage-store', 'app-lock-password', password).catch(() => {})
    }
  }, [appLock])

  // Handle app lock password change — re-encrypt with new key
  const handleAppLockChangePassword = useCallback(async (currentPassword, newPassword) => {
    const success = await appLock.updatePassword(currentPassword, newPassword)
    if (!success) return false

    // Derive new encryption key
    const newSalt = crypto.getRandomValues(new Uint8Array(16))
    const newKey = await deriveKeyFromPassphrase(newPassword, newSalt)

    await appLock.setEncryptionSalt(Array.from(newSalt))
    appLock.setEncryptionKey(newKey, newSalt)
    await reEncryptAppLockPages(newKey, newSalt)

    // Update safeStorage if biometric enabled
    if (appLock.biometricEnabled && window.electron?.invoke) {
      await window.electron.invoke('safe-storage-store', 'app-lock-password', newPassword).catch(() => {})
    }

    return true
  }, [appLock, reEncryptAppLockPages])

  // Handle app lock disable — decrypt everything and save plaintext
  const handleAppLockDisable = useCallback(async () => {
    await removeAppLockEncryption()
    await appLock.disable()
  }, [appLock, removeAppLockEncryption])

  // Handle duress password unlock — triggers panic action
  const handleDuressUnlock = useCallback((password) => {
    if (!appLock.checkDuress(password)) return false

    // Hide mode only: clear UI but keep encrypted data safe on disk
    // Blocks ALL saves so disk data is never overwritten
    // Data recoverable by restarting app and entering real password
    enterDuressHideMode()
    appLock.clearEncryptionKey()

    // Unlock the screen silently — attacker sees empty app
    useAppLockStore.setState({ isLocked: false })

    return true
  }, [appLock, enterDuressHideMode])

  // Handle biometric toggle — need password for safeStorage
  const handleAppLockToggleBiometric = useCallback(async (enabled, password) => {
    await appLock.toggleBiometric(enabled)
    if (enabled && password && window.electron?.invoke) {
      await window.electron.invoke('safe-storage-store', 'app-lock-password', password).catch(() => {})
    } else if (!enabled && window.electron?.invoke) {
      await window.electron.invoke('safe-storage-delete', 'app-lock-password').catch(() => {})
    }
  }, [appLock])

  // Encrypt pages before window closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (appLock.isEnabled && !appLock.isLocked && appLock.getEncryptionKey()) {
        // Synchronous — best effort to trigger save
        encryptAndClearAppLockPages()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [appLock.isEnabled, appLock.isLocked, encryptAndClearAppLockPages])

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
        case 'bulletListItem':
        case 'numberedListItem':
        case 'checklistItem':
          text = block.data.text || ''
          break
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
    // If page is temp-unlocked, show confirm modal with Re-lock / Remove Lock options
    if (page.password && page.password.hash && tempUnlockedPages.has(page.id)) {
      setConfirmModal({
        isOpen: true,
        title: 'Page Lock',
        message: `"${page.title}" is currently unlocked. You can re-lock it or permanently remove the lock.`,
        onConfirm: () => removeLockFromUnlockedPage(page.id),
        onCancel: () => {
          setTempUnlockedPages(prev => {
            const next = new Set(prev)
            next.delete(page.id)
            return next
          })
        },
        variant: 'warning',
        confirmText: 'Remove Lock',
        cancelText: 'Re-lock',
        showCancel: true
      })
      return
    }

    if (page.password && page.password.hash) {
      setPasswordAction('unlock')
    } else {
      setPasswordAction('lock')
    }
    setPageToAccess(page)
    setIsPasswordModalOpen(true)
  }, [tempUnlockedPages, removeLockFromUnlockedPage, setTempUnlockedPages])

  const handleEncryptBadgeClick = useCallback((page) => {
    // If page already has a lock, use normal toggle (re-lock / remove lock)
    if (page.password && page.password.hash) {
      handleToggleLock(page)
      return
    }
    // If app lock is already enabled, go straight to page lock
    if (appLock.isEnabled) {
      handleToggleLock(page)
      return
    }
    // Show choice modal: individual page lock vs app lock
    setIsEncryptionChoiceOpen(true)
  }, [appLock.isEnabled, handleToggleLock])

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
      // Navigate to the unlocked page (bypasses lock check since tempUnlockedPages may not be flushed yet)
      if (pageToAccess && (actionType === 'open' || actionType === 'removeLock')) {
        navigateToPage(pageToAccess)
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
      setIsSearchModalOpen(true)
      announce('Search modal opened')
    },
    onToggleSidebar: () => {
      setSidebarOpen(!sidebarOpen)
      announce(sidebarOpen ? 'Sidebar collapsed' : 'Sidebar expanded')
    },
    onToggleFocusMode: () => {
      toggleFocusMode()
      announce(focusMode ? 'Focus mode off' : 'Focus mode on')
    },
    onToggleQuickSwitcher: () => {
      toggleQuickSwitcher()
      announce('Quick switcher toggled')
    },
    onLockApp: handleInstantLock,
    isLocked: appLock.isLocked,
    isFocusMode: focusMode,
    onDeletePage: handleDeletePage,
    onDuplicatePage: handleDuplicatePage,
    currentPage,
    pages: (Array.isArray(pages) ? pages : []).filter(page => page.type !== 'folder'), // Use pages directly instead of filteredPages()
    onSelectPage: handlePageSelect,
    onToggleShortcutsModal: () => setIsShortcutsModalOpen(true)
  })

  // Page link [[wiki links]] interceptor
  const handlePageLinkClick = useCallback((pageId) => {
    const allPages = (Array.isArray(pages) ? pages : []).filter(p => p.type !== 'folder')
    const targetPage = allPages.find(p => p.id === pageId)
    if (targetPage) {
      handlePageSelect(targetPage)
    }
  }, [pages, handlePageSelect])

  const pageLinkData = usePageLinkInterceptor({
    pages: (Array.isArray(pages) ? pages : []).filter(p => p.type !== 'folder'),
    onSelectPage: handlePageSelect,
    editorHolder: 'editorjs'
  })

  // Toolbar-initiated page link picker
  const [toolbarLinkState, setToolbarLinkState] = useState(null)
  useEffect(() => {
    const handler = (e) => {
      setToolbarLinkState({
        position: { top: e.detail.top, left: e.detail.left },
        range: e.detail.range,
        text: e.detail.text
      })
    }
    window.addEventListener('dash-page-link-toolbar', handler)
    return () => window.removeEventListener('dash-page-link-toolbar', handler)
  }, [])

  const handleToolbarPageLinkSelect = useCallback((page) => {
    if (toolbarLinkState?.range) {
      PageLinkInlineTool.insertLink(toolbarLinkState.range, page)
    }
    setToolbarLinkState(null)
  }, [toolbarLinkState])

  // Focus mode pill — show on mouse move, hide after 2s idle
  useEffect(() => {
    if (!focusMode) return
    setFocusPillVisible(true)

    const handleMouseMove = () => {
      setFocusPillVisible(true)
      clearTimeout(focusPillTimerRef.current)
      focusPillTimerRef.current = setTimeout(() => setFocusPillVisible(false), 2000)
    }

    // Start the initial hide timer
    focusPillTimerRef.current = setTimeout(() => setFocusPillVisible(false), 2000)

    document.addEventListener('mousemove', handleMouseMove)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(focusPillTimerRef.current)
    }
  }, [focusMode])

  // Typewriter scrolling — keep active block vertically centered in focus mode
  useEffect(() => {
    if (!focusMode || !typewriterMode) return

    const scrollCaretToCenter = () => {
      // Find the active block using the caret/selection position
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
      if (!element) return

      // Walk up to find the .ce-block ancestor
      const block = element.closest('.ce-block')
      if (!block) return

      // Find the scroll container (the overflow-auto div)
      const scrollContainer = block.closest('[class*="overflow-auto"]') || block.closest('.flex-1')
      if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight) return

      const blockRect = block.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()
      const blockCenter = blockRect.top + blockRect.height / 2
      const containerCenter = containerRect.top + containerRect.height / 2
      const offset = blockCenter - containerCenter

      if (Math.abs(offset) > 2) {
        scrollContainer.scrollTop += offset
      }
    }

    const scheduleScroll = () => {
      requestAnimationFrame(scrollCaretToCenter)
    }

    // Use selectionchange — fires whenever the caret moves (typing, clicking, arrow keys)
    document.addEventListener('selectionchange', scheduleScroll)

    // Initial center
    setTimeout(scrollCaretToCenter, 100)

    return () => {
      document.removeEventListener('selectionchange', scheduleScroll)
    }
  }, [focusMode, typewriterMode])

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
      className={`${getMainContainerClasses()} ${isMacElectron ? 'mac-electron' : ''}`}
      role="application"
      aria-label="Rich Text Note Editor"
    >
      {/* macOS Electron: draggable title bar region */}
      {isMacElectron && <div className="electron-drag-region" />}

      {/* Focus Mode: floating bottom bar with toggles + exit — hidden when idle */}
      {focusMode && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium transition-opacity duration-300 ${
            focusPillVisible ? 'opacity-80 hover:opacity-100' : 'opacity-0 pointer-events-none'
          } ${
            theme === 'fallout' ? 'text-green-500 bg-green-900/40 border border-green-500/30' :
            theme === 'dark' ? 'text-[#999] bg-[#1a1a1a] border border-[#3a3a3a]/50' :
            theme === 'darkblue' ? 'text-[#8b99b5] bg-[#141825] border border-[#1c2438]' :
            'text-neutral-500 bg-white border border-neutral-200 shadow-sm'
          }`}
          onMouseEnter={() => setFocusPillVisible(true)}
        >
          <button
            onClick={toggleTypewriterMode}
            className={`px-2 py-1 rounded-full transition-colors ${
              typewriterMode
                ? theme === 'fallout' ? 'bg-green-500/30 text-green-300' :
                  theme === 'dark' ? 'bg-[#3a3a3a] text-[#ddd]' :
                  theme === 'darkblue' ? 'bg-[#2a3550] text-[#c0ccdf]' :
                  'bg-neutral-200 text-neutral-800'
                : 'hover:opacity-80'
            }`}
            title="Typewriter scrolling"
          >
            Typewriter
          </button>
          <button
            onClick={toggleParagraphDimming}
            className={`px-2 py-1 rounded-full transition-colors ${
              paragraphDimming
                ? theme === 'fallout' ? 'bg-green-500/30 text-green-300' :
                  theme === 'dark' ? 'bg-[#3a3a3a] text-[#ddd]' :
                  theme === 'darkblue' ? 'bg-[#2a3550] text-[#c0ccdf]' :
                  'bg-neutral-200 text-neutral-800'
                : 'hover:opacity-80'
            }`}
            title="Dim unfocused paragraphs"
          >
            Dimming
          </button>
          <div className={`mx-1 w-px h-4 ${
            theme === 'fallout' ? 'bg-green-500/30' :
            theme === 'dark' ? 'bg-[#3a3a3a]' :
            theme === 'darkblue' ? 'bg-[#1c2438]' :
            'bg-neutral-200'
          }`} />
          <button
            onClick={toggleFocusMode}
            className="px-2 py-1 rounded-full hover:opacity-80 transition-colors"
            title="Click or press Esc to exit focus mode"
          >
            Esc to exit
          </button>
        </div>
      )}

      {/* Focus Session Stats toast */}
      {focusSessionStats && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-medium animate-fade-in ${
            theme === 'fallout' ? 'text-green-400 bg-green-900/60 border border-green-500/30' :
            theme === 'dark' ? 'text-[#ccc] bg-[#1a1a1a] border border-[#3a3a3a]/50' :
            theme === 'darkblue' ? 'text-[#c0ccdf] bg-[#141825] border border-[#1c2438]' :
            'text-neutral-700 bg-white border border-neutral-200 shadow-lg'
          }`}
        >
          {focusSessionStats.wordsWritten >= 0 ? '+' : ''}{focusSessionStats.wordsWritten} words in {Math.max(1, Math.round(focusSessionStats.elapsed / 60000))} min
        </div>
      )}

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
          className={`${getSidebarClasses()} ${focusMode
            ? 'w-0 overflow-hidden opacity-0 pointer-events-none absolute transition-all duration-300'
            : isSmallScreen
            ? `fixed z-50 inset-y-0 left-0 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200 w-3/4 max-w-xs safe-area-top safe-area-bottom`
            : `${sidebarOpen ? 'w-64' : 'w-16'} relative transition-all duration-300`
            } flex flex-col overflow-hidden`}
          role="navigation"
          aria-label="Page navigation"
          aria-expanded={sidebarOpen}
        >
          <header className={`px-3 ${isMacElectron ? 'pt-10' : 'pt-4'} pb-2 flex ${sidebarOpen ? 'justify-between' : 'justify-center'} items-center`}>
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
                <div ref={lockDropdownRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsLockDropdownOpen(!isLockDropdownOpen)}
                    className={`h-8 w-8 p-0 ${getButtonHoverClasses()}`}
                    title="App lock"
                  >
                    <Lock className="h-4 w-4" />
                  </Button>
                  {isLockDropdownOpen && lockDropdownRef.current && (() => {
                    const rect = lockDropdownRef.current.getBoundingClientRect()
                    return (
                    <div
                      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left }}
                      className={`
                      w-48 rounded-xl shadow-lg border z-50 py-1 overflow-hidden
                      ${theme === 'fallout'
                        ? 'bg-gray-900 border-green-500/40'
                        : theme === 'darkblue'
                          ? 'bg-[#141825] border-[#1c2438]'
                          : theme === 'dark'
                            ? 'bg-[#1a1a1a] border-[#3a3a3a]'
                            : 'bg-white border-gray-200'
                      }
                    `}>
                      <button
                        onClick={() => {
                          if (appLock.isEnabled) {
                            handleInstantLock()
                            setIsLockDropdownOpen(false)
                          }
                        }}
                        disabled={!appLock.isEnabled}
                        className={`
                          w-full flex items-center justify-between px-3 py-2 text-sm transition-colors
                          ${!appLock.isEnabled
                            ? theme === 'fallout'
                              ? 'text-green-700 cursor-not-allowed'
                              : theme === 'darkblue'
                                ? 'text-[#3d4a63] cursor-not-allowed'
                                : theme === 'dark'
                                  ? 'text-[#4a4a4a] cursor-not-allowed'
                                  : 'text-gray-300 cursor-not-allowed'
                            : theme === 'fallout'
                              ? 'text-green-400 hover:bg-green-500/20'
                              : theme === 'darkblue'
                                ? 'text-[#e0e6f0] hover:bg-[#1a2035]'
                                : theme === 'dark'
                                  ? 'text-[#ececec] hover:bg-[#2f2f2f]'
                                  : 'text-gray-700 hover:bg-gray-100'
                          }
                        `}
                      >
                        <span>Lock App Now</span>
                        <span className={`
                          text-xs
                          ${theme === 'fallout' ? 'text-green-600' : theme === 'darkblue' ? 'text-[#5d6b88]' : theme === 'dark' ? 'text-[#6b6b6b]' : 'text-gray-400'}
                        `}>
                          {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}⇧L
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setIsLockDropdownOpen(false)
                          if (appLock.isEnabled) {
                            setIsAppLockSettingsOpen(true)
                          } else {
                            setIsAppLockSetupOpen(true)
                          }
                        }}
                        className={`
                          w-full flex items-center px-3 py-2 text-sm transition-colors
                          ${theme === 'fallout'
                            ? 'text-green-400 hover:bg-green-500/20'
                            : theme === 'darkblue'
                              ? 'text-[#e0e6f0] hover:bg-[#1a2035]'
                              : theme === 'dark'
                                ? 'text-[#ececec] hover:bg-[#2f2f2f]'
                                : 'text-gray-700 hover:bg-gray-100'
                          }
                        `}
                      >
                        {appLock.isEnabled ? 'Lock App Settings' : 'Set Up App Lock'}
                      </button>
                    </div>
                    )
                  })()}
                </div>
              )}
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
            <div className="px-3 mb-2 pt-1">
              <SearchTrigger
                searchTerm={searchTerm}
                selectedTags={selectedTagsFilter}
                onClick={() => setIsSearchModalOpen(true)}
                onClear={() => {
                  setSearchTerm('')
                  setSelectedTagsFilter([])
                }}
                theme={theme}
                tagColorMap={(tags || []).reduce((acc, t) => { acc[t.name] = t.color; return acc }, {})}
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
                {(() => {
                  const sortedItems = sortPages(filteredPages(), sortOption)
                  // Build set of all page IDs owned by folders to prevent duplicates
                  const folderOwnedPageIds = new Set()
                  sortedItems.forEach(item => {
                    if (item.type === 'folder' && Array.isArray(item.pages)) {
                      item.pages.forEach(id => folderOwnedPageIds.add(id))
                    }
                  })
                  return sortedItems.map(item => {
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
                        onSelfDestruct={handleSelfDestruct}
                        onCancelSelfDestruct={handleCancelSelfDestruct}
                        selfDestructingPages={selfDestructingPages}
                        completeSelfDestruct={completeSelfDestruct}
                        pagesCount={folderPageIds.length}
                      />
                    )
                  }
                  if (!item.folderId && !folderOwnedPageIds.has(item.id)) {
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
                        onSelfDestruct={handleSelfDestruct}
                        onCancelSelfDestruct={handleCancelSelfDestruct}
                        sidebarOpen={sidebarOpen}
                        theme={theme}
                        tags={tags}
                        tempUnlockedPages={tempUnlockedPages}
                        isInsideFolder={false}
                        isSelfDestructing={selfDestructingPages.has(item.id)}
                        onSelfDestructComplete={completeSelfDestruct}
                      />
                    );
                  }
                  return null
                })})()}
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
        <div className={`flex flex-col px-6 ${isMacElectron ? 'pt-8 pb-3' : 'py-3'} ${theme === 'fallout' ? 'border-b border-green-600/20' : theme === 'dark' ? 'border-b border-[#2e2e2e]' : theme === 'darkblue' ? 'border-b border-[#1c2438]' : 'border-b border-neutral-100'} ${getHeaderClasses()} safe-area-top ${focusMode ? 'hidden' : ''}`}>
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
              {currentPage && (
                <div className="flex items-center ml-2 space-x-1 flex-shrink-0">
                  <button
                    onClick={() => handleEncryptBadgeClick(currentPage)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${getButtonHoverClasses()}`}
                    title={currentPage.password?.hash && !tempUnlockedPages.has(currentPage.id) ? 'Unlock page' : 'Lock page'}
                  >
                    {currentPage.password?.hash && !tempUnlockedPages.has(currentPage.id)
                      ? <LockKeyhole className="h-3.5 w-3.5 pointer-events-none" />
                      : <Unlock className="h-3.5 w-3.5 pointer-events-none" />
                    }
                  </button>
                  <button
                    onClick={() => {
                      if (currentPage.selfDestructAt) {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Remove Self-Destruct',
                          message: `Remove the self-destruct timer from "${currentPage.title}"? The page will no longer be automatically deleted.`,
                          onConfirm: () => cancelSelfDestruct(currentPage.id),
                          variant: 'danger',
                          confirmText: 'Remove Timer',
                          cancelText: 'Keep Timer',
                          showCancel: true
                        })
                      } else {
                        handleSelfDestruct(currentPage)
                      }
                    }}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${getButtonHoverClasses()}`}
                    title={currentPage.selfDestructAt ? 'Cancel self-destruct' : 'Self-destruct'}
                  >
                    {currentPage.selfDestructAt
                      ? <TimerOff className="h-3.5 w-3.5 pointer-events-none" />
                      : <Timer className="h-3.5 w-3.5 pointer-events-none" />
                    }
                  </button>
                </div>
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
                  <ExportDropdown onExport={handleExport} className={`cursor-pointer ${getButtonHoverClasses()}`} />
                  {shouldShowMobileInstall() && (
                    <button
                      onClick={() => setIsInstallModalOpen(true)}
                      className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                      title="Use on your phone"
                    >
                      <Smartphone className="h-4 w-4 pointer-events-none" />
                    </button>
                  )}
                  <button
                    onClick={handleImportBundleClick}
                    className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                    title={isImporting ? 'Importing…' : 'Import encrypted bundle'}
                    disabled={isImporting}
                  >
                    <Import className={`h-4 w-4 pointer-events-none ${isImporting ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer');
                    }}
                    className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                    title="Report a bug or request a feature"
                  >
                    <Bug className="h-4 w-4 pointer-events-none" />
                  </button>
                  <button
                    onClick={handleBellClick}
                    disabled={!canCheckForUpdates}
                    className={`relative p-2 rounded-lg cursor-pointer ${getIconClasses()} ${getButtonHoverClasses()} ${!canCheckForUpdates ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Check for updates"
                  >
                    <Bell className={`h-4 w-4 pointer-events-none ${isCheckingForUpdates ? 'animate-pulse' : ''}`} />
                    {updateInfo?.available && (
                      <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ${theme === 'dark' ? 'border border-[#0d0d0d]' : theme === 'darkblue' ? 'border border-[#0c1017]' : theme === 'fallout' ? 'border border-gray-900' : 'border border-white'} shadow-sm`}></span>
                    )}
                  </button>
                  <ThemeToggle className={`cursor-pointer ${getButtonHoverClasses()}`} />
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
                        color: getTagChipStyle(tag.color, theme).color
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
  <div className={`flex-1 overflow-auto p-6 ${getMainContentClasses()} ${focusMode ? 'focus-mode-scroll pt-16' : ''} ${currentPage && selfDestructingPages.has(currentPage.id) ? 'pointer-events-none' : ''}`}>
    <div className={`${focusMode ? 'max-w-2xl mx-auto w-full' : ''} ${focusMode && paragraphDimming ? 'paragraph-dimming' : ''} ${focusMode && typewriterMode ? 'pb-[50vh]' : ''}`}>
      {currentPage && (
        <EditorErrorBoundary>
          <DynamicEditor
            key={currentPage.id}
            data={currentPage.content}
            onChange={handleEditorChange}
            holder="editorjs"
            onPageLinkClick={handlePageLinkClick}
          />
        </EditorErrorBoundary>
      )}
    </div>
  </div>

  {/* Footer */}
  <div className={`footer-fixed flex justify-between items-center px-6 py-2 text-xs ${getFooterClasses()} safe-area-bottom ${focusMode ? 'hidden' : ''}`}>
    <div className="flex items-center space-x-3">
      {currentPage.createdAt && (
        <span>{format(new Date(currentPage.createdAt), 'MMM d, yyyy')}</span>
      )}
      <EncryptionStatusIndicator
        currentPage={currentPage}
        onEncryptPage={() => handleEncryptBadgeClick(currentPage)}
        appLockEnabled={appLock.isEnabled}
      />
    </div>
    <div className="flex items-center space-x-3">
      {currentPage.selfDestructAt && (
        <button
          onClick={() => {
            setConfirmModal({
              isOpen: true,
              title: 'Remove Self-Destruct',
              message: `Remove the self-destruct timer from "${currentPage.title}"? The page will no longer be automatically deleted.`,
              onConfirm: () => cancelSelfDestruct(currentPage.id),
              variant: 'danger',
              confirmText: 'Remove Timer',
              cancelText: 'Keep Timer',
              showCancel: true
            })
          }}
          className="cursor-pointer hover:opacity-80 transition-opacity flex items-center"
          title="Click to remove self-destruct timer"
        >
          <SelfDestructBadge selfDestructAt={currentPage.selfDestructAt} theme={theme} />
        </button>
      )}
      <span>{wordCount} words</span>
      <div className="relative">
        <button
          onClick={() => {
            setIsFeaturesOpen(true)
            if (showFeaturesTooltip) dismissFeaturesTooltip()
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
            theme === 'fallout' ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30' :
            theme === 'dark' ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2a2a2a]' :
            theme === 'darkblue' ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#1c2438]' :
            'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
          }`}
          title="Features"
        >
          <Sparkles size={12} className="pointer-events-none" />
        </button>
        {showFeaturesTooltip && (
          <div
            className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg animate-bounce-subtle ${
              theme === 'fallout' ? 'bg-green-500 text-gray-900' :
              theme === 'dark' ? 'bg-[#2f2f2f] text-[#e0e0e0] border border-[#3a3a3a]' :
              theme === 'darkblue' ? 'bg-[#1c2438] text-[#8b99b5] border border-[#2a3452]' :
              'bg-gray-800 text-white'
            }`}
            onClick={dismissFeaturesTooltip}
          >
            See what Dash can do
            <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${
              theme === 'fallout' ? 'border-t-green-500' :
              theme === 'dark' ? 'border-t-[#2f2f2f]' :
              theme === 'darkblue' ? 'border-t-[#1c2438]' :
              'border-t-gray-800'
            }`} />
          </div>
        )}
      </div>
      <button
        onClick={() => setIsShortcutsModalOpen(true)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
          theme === 'fallout' ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30' :
          theme === 'dark' ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2a2a2a]' :
          theme === 'darkblue' ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#1c2438]' :
          'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        title="Keyboard shortcuts (?)"
      >
        <Keyboard size={12} className="pointer-events-none" />
      </button>
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
        pages={pages}
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
        biometricAvailable={biometricAvailable}
        biometricEnabled={appLock.biometricEnabled}
        onBiometricUnlock={passwordAction !== 'lock' ? async () => {
          try {
            if (typeof window !== 'undefined' && window.electron?.invoke) {
              const success = await window.electron.invoke('prompt-touch-id')
              if (success && pageToAccess) {
                setTempUnlockedPages(prev => new Set(prev).add(pageToAccess.id))
                navigateToPage(pageToAccess)
                setIsPasswordModalOpen(false)
                setPasswordInput('')
                setPageToAccess(null)
              }
            }
          } catch {
            setPasswordError('Biometric authentication failed')
          }
        } : undefined}
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
        onCreateNewPage={async (folderId) => {
          const newPage = await handleNewPage()
          if (newPage && folderId) {
            addPageToFolder(newPage.id, folderId)
          }
        }}
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
        onCancel={confirmModal.onCancel}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        showCancel={confirmModal.showCancel}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        theme={theme}
      />

      <WhatsNewModal appVersion={appVersion} theme={theme} />

      <FeaturesPanel
        isOpen={isFeaturesOpen}
        onClose={() => setIsFeaturesOpen(false)}
        theme={theme}
      />

      <PageLinkDropdown
        isOpen={pageLinkData.isOpen}
        query={pageLinkData.query}
        position={pageLinkData.position}
        filteredPages={pageLinkData.filteredPages}
        selectedIndex={pageLinkData.selectedIndex}
        onSelect={pageLinkData.insertPageLink}
        theme={theme}
      />

      <PageLinkDropdown
        isOpen={!!toolbarLinkState}
        query=""
        position={toolbarLinkState?.position || { top: 0, left: 0 }}
        filteredPages={(Array.isArray(pages) ? pages : []).filter(p => p.type !== 'folder')}
        selectedIndex={0}
        onSelect={handleToolbarPageLinkSelect}
        onClose={() => setToolbarLinkState(null)}
        showSearch
        theme={theme}
      />

      <SelfDestructModal
        isOpen={isSelfDestructModalOpen}
        onClose={() => { setIsSelfDestructModalOpen(false); setSelfDestructPage(null) }}
        onConfirm={handleSelfDestructConfirm}
        pageTitle={selfDestructPage?.title || ''}
        theme={theme}
      />

      <QuickSwitcher
        isOpen={showQuickSwitcher}
        onClose={() => setShowQuickSwitcher(false)}
        pages={pages}
        onSelectPage={(page) => {
          handlePageSelect(page)
          setShowQuickSwitcher(false)
        }}
        theme={theme}
      />

      {appLock.isLocked && (
        <AppLockScreen
          onUnlock={handleAppLockUnlock}
          onBiometricUnlock={handleBiometricUnlock}
          biometricAvailable={biometricAvailable}
          biometricEnabled={appLock.biometricEnabled}
          onDuressUnlock={handleDuressUnlock}
          duressEnabled={appLock.duressEnabled}
          theme={theme}
        />
      )}

      <AppLockSetupModal
        isOpen={isAppLockSetupOpen}
        onClose={() => setIsAppLockSetupOpen(false)}
        onConfirm={handleAppLockSetup}
        biometricAvailable={biometricAvailable}
        onSetDuress={appLock.setDuress}
        theme={theme}
      />

      <AppLockSettingsModal
        isOpen={isAppLockSettingsOpen}
        onClose={() => setIsAppLockSettingsOpen(false)}
        currentTimeout={appLock.timeoutMinutes}
        biometricEnabled={appLock.biometricEnabled}
        biometricAvailable={biometricAvailable}
        onUpdateTimeout={appLock.updateTimeout}
        onChangePassword={handleAppLockChangePassword}
        onToggleBiometric={handleAppLockToggleBiometric}
        onDisable={handleAppLockDisable}
        duressEnabled={appLock.duressEnabled}
        duressAction={appLock.duressAction}
        onSetDuress={appLock.setDuress}
        onClearDuress={appLock.clearDuress}
        checkIsRealPassword={appLock.checkPassword}
        theme={theme}
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        selectedTags={selectedTagsFilter}
        onTagToggle={handleTagToggle}
        onClearAllTags={handleClearAllTagsFilter}
        allTags={(tags || []).map(t => t.name)}
        tagColorMap={(tags || []).reduce((acc, t) => { acc[t.name] = t.color; return acc }, {})}
        pages={(pages || []).filter(p => p.type !== 'folder')}
        folders={(pages || []).filter(p => p.type === 'folder')}
        onSelectPage={(page) => {
          handleSelectPageFromSearch(page)
          setIsSearchModalOpen(false)
        }}
        onSelectFolder={(folder) => {
          handleSelectFolderFromSearch(folder)
          setIsSearchModalOpen(false)
        }}
        theme={theme}
      />

      <EncryptionChoiceModal
        isOpen={isEncryptionChoiceOpen}
        onClose={() => setIsEncryptionChoiceOpen(false)}
        onLockPage={() => handleToggleLock(currentPage)}
        onSetupAppLock={() => setIsAppLockSetupOpen(true)}
      />

      {currentPage && selfDestructingPages.has(currentPage.id) && (
        <SelfDestructOverlay
          theme={theme}
          onComplete={() => {
            completeSelfDestruct(currentPage.id)
          }}
        />
      )}
    </div >
  )
}