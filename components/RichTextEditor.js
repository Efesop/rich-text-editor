'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, MoreVertical, Import, X, FolderPlus, Bell, Bug, Smartphone, Menu, Lock, LockKeyhole, Unlock, Timer, TimerOff, Keyboard, Sparkles, Share2, List, Users, Shield, Copy, Check } from 'lucide-react'
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
import VersionHistoryModal from './VersionHistoryModal'
import { MoveToFolderModal } from './MoveToFolderModal'
import { FolderIcon } from 'lucide-react'
import UpdateNotification from './UpdateNotification'
import MiniOutline from './MiniOutline'
import Tooltip from './Tooltip'
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
import AIPanel from './AIPanel'
import ShareModal from './ShareModal'
import LiveSessionModal from './LiveSessionModal'
// LiveSessionChip is defined inline above RichTextEditor
import LiveNotificationsPanel from './LiveNotificationsPanel'
import useLiveNotesStore from '../store/liveNotesStore'
import DecoyVaultSetupModal from './DecoyVaultSetupModal'
import { readDecoyPages } from '@/lib/storage'
import { decryptJsonWithPassphrase } from '@/utils/cryptoUtils'
import { usePageLinkInterceptor, PageLinkDropdown, PageLinkInlineTool } from './editor-tools/PageLink'

const DynamicEditor = dynamic(() => import('@/components/Editor'), { ssr: false })

const AVATAR_COLORS = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#0284c7', '#0ea5e9']
const ADJECTIVES = ['Red', 'Blue', 'Green', 'Gold', 'Silver', 'Purple', 'Amber', 'Coral']
const ANIMALS = ['Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Lynx', 'Deer', 'Crane']
function peerAlias (peerId) {
  const hash = peerId.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
  return ADJECTIVES[Math.abs(hash) % ADJECTIVES.length] + ' ' + ANIMALS[Math.abs(hash >> 4) % ANIMALS.length]
}

/** Persist a guest live page to localStorage (survives reload) */
function saveGuestPage (roomId, data) {
  try { localStorage.setItem('dash-live-page-' + roomId, JSON.stringify(data)) } catch { /* quota */ }
}
function loadGuestPages () {
  const pages = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('dash-live-page-')) {
        const data = JSON.parse(localStorage.getItem(key))
        if (data?.id) pages.push(data)
      }
    }
  } catch { /* ignore */ }
  return pages
}

function LiveSessionChip ({ participants, status, onEnd, theme, isHost, link, typingPeers, duration, startedAt, peerColors, remoteCursors: remoteCursorsProp }) {
  const stableStart = React.useMemo(() => startedAt || Date.now(), [startedAt])
  const [elapsed, setElapsed] = React.useState(Math.floor((Date.now() - stableStart) / 1000))
  const [linkCopied, setLinkCopied] = React.useState(false)
  const [showDropdown, setShowDropdown] = React.useState(false)
  const hoverTimerRef = React.useRef(null)
  const chipRef = React.useRef(null)

  React.useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - stableStart) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [stableStart])

  React.useEffect(() => {
    return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current) }
  }, [])

  const handleCopyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setShowDropdown(true), 150)
  }
  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setShowDropdown(false), 200)
  }

  const formatTime = (s) => {
    if (s < 0) s = 0
    if (s >= 3600) return `${Math.floor(s / 3600)}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }
  const remaining = duration ? Math.max(0, Math.floor(duration / 1000) - elapsed) : null
  const displayTime = remaining !== null ? remaining : elapsed
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'
  const isConnected = status === 'connected'
  const count = Math.max(participants || 1, 1)
  const avatars = peerColors && peerColors.length > 0
    ? peerColors.slice(0, 5)
    : Array.from({ length: Math.min(count, 5) }, (_, i) => AVATAR_COLORS[i % AVATAR_COLORS.length])
  const typingNames = typingPeers ? Object.values(typingPeers).map(p => p.alias).join(', ') : null

  // Build participant list for dropdown — use remoteCursors when available, fill from participants count
  const peerList = React.useMemo(() => {
    const list = [{ alias: 'You', color: avatars[0] || AVATAR_COLORS[0], isTyping: false }]
    const knownPeers = new Set()
    if (remoteCursorsProp) {
      Object.entries(remoteCursorsProp).forEach(([peerId, cursor]) => {
        knownPeers.add(peerId)
        list.push({ alias: cursor.alias || 'Peer', color: cursor.color, isTyping: typingPeers ? Object.values(typingPeers).some(t => t.alias === cursor.alias) : false })
      })
    }
    // Fill remaining participants who haven't sent cursor data yet
    for (let i = list.length; i < count; i++) {
      list.push({ alias: `Guest ${i}`, color: AVATAR_COLORS[i % AVATAR_COLORS.length], isTyping: false })
    }
    return list
  }, [remoteCursorsProp, typingPeers, avatars, count])

  const subtextCls = isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
  const textCls = isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'

  return (
    <div className="relative" ref={chipRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs cursor-default ${
      isFallout ? 'bg-green-500/10 border border-green-500/20'
        : isDarkBlue ? 'bg-blue-500/10 border border-blue-500/15'
        : isDark ? 'bg-blue-500/10 border border-blue-500/15'
        : 'bg-blue-50 border border-blue-100'
    }`}>
      {/* Live dot */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isConnected
          ? isFallout ? 'bg-green-400 animate-pulse' : 'bg-blue-500 animate-pulse'
          : 'bg-yellow-400 animate-pulse'
      }`} />

      {/* LIVE text */}
      <span className={`font-semibold flex-shrink-0 ${
        isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'
      }`}>
        LIVE
      </span>

      {/* Avatars */}
      <div className="flex items-center -space-x-1">
        {avatars.map((color, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: color, zIndex: avatars.length - i }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none">
              <circle cx="12" cy="8" r="4" />
              <path d="M20 21a8 8 0 1 0-16 0" />
            </svg>
          </div>
        ))}
      </div>

      {/* Timer */}
      <span className={`tabular-nums flex-shrink-0 ${
        isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-blue-300/50' : isDark ? 'text-blue-300/50' : 'text-blue-400/70'
      }`}>
        {formatTime(displayTime)}
      </span>

      {/* Typing indicator */}
      {typingNames && (
        <span className={`flex-shrink-0 italic ${
          isFallout ? 'text-green-500/60 font-mono' : isDarkBlue ? 'text-blue-300/40' : isDark ? 'text-blue-300/40' : 'text-blue-400/60'
        }`}>
          typing...
        </span>
      )}

      {/* E2E */}
      <div className={`flex items-center gap-0.5 flex-shrink-0 ${
        isFallout ? 'text-green-500/60' : isDarkBlue ? 'text-blue-400/50' : isDark ? 'text-blue-400/50' : 'text-blue-400/60'
      }`}>
        <Shield className="w-2.5 h-2.5" />
      </div>

      {/* Copy link button */}
      {link && (
        <button
          onClick={handleCopyLink}
          className={`p-0.5 rounded transition-colors flex-shrink-0 ${
            isFallout ? 'text-green-500/60 hover:text-green-400 hover:bg-green-500/20'
              : isDarkBlue ? 'text-blue-400/50 hover:text-blue-400 hover:bg-blue-500/10'
              : isDark ? 'text-blue-400/50 hover:text-blue-400 hover:bg-blue-500/10'
              : 'text-blue-400/60 hover:text-blue-600 hover:bg-blue-100'
          }`}
          title={linkCopied ? 'Copied!' : 'Copy session link'}
        >
          {linkCopied
            ? <Check className="w-3 h-3 pointer-events-none" />
            : <Copy className="w-3 h-3 pointer-events-none" />
          }
        </button>
      )}

      {/* End button */}
      <button
        onClick={onEnd}
        className={`ml-0.5 p-0.5 rounded transition-colors flex-shrink-0 ${
          isFallout ? 'text-green-600 hover:text-green-400 hover:bg-green-500/20'
            : isDarkBlue ? 'text-[#5d6b88] hover:text-red-400 hover:bg-red-500/10'
            : isDark ? 'text-[#555] hover:text-red-400 hover:bg-red-500/10'
            : 'text-gray-400 hover:text-red-500 hover:bg-red-100'
        }`}
        title="End session"
      >
        <X className="w-3 h-3 pointer-events-none" />
      </button>
    </div>

    {/* Hover dropdown */}
    {showDropdown && (
      <div
        className={`absolute top-full right-0 mt-1.5 w-56 rounded-xl shadow-xl border z-[9999] overflow-hidden ${
          isFallout ? 'bg-gray-900 border-green-500/30'
            : isDarkBlue ? 'bg-[#141825] border-[#1c2438]'
            : isDark ? 'bg-[#1a1a1a] border-[#3a3a3a]/50'
            : 'bg-white border-gray-200'
        }`}
        onMouseEnter={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current) }}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className={`px-3 py-2 border-b ${
          isFallout ? 'border-green-500/20' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-100'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${textCls}`}>
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </span>
            <div className="flex items-center gap-1">
              <Shield className={`w-3 h-3 ${subtextCls}`} />
              <span className={`text-[10px] ${subtextCls}`}>E2E Encrypted</span>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div className={`px-3 py-2 ${
          isFallout ? 'border-b border-green-500/20' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'
        }`}>
          <span className={`text-[10px] uppercase tracking-wider font-medium ${subtextCls}`}>
            Participants ({count})
          </span>
          <div className="mt-1.5 space-y-1">
            {peerList.map((peer, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: peer.color }} />
                <span className={`text-xs ${textCls}`}>{peer.alias}</span>
                {peer.isTyping && (
                  <span className={`text-[10px] italic ${subtextCls}`}>typing...</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Timer info */}
        <div className={`px-3 py-2 ${subtextCls}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px]">{remaining !== null ? 'Time remaining' : 'Elapsed'}</span>
            <span className={`text-xs tabular-nums font-medium ${textCls}`}>{formatTime(displayTime)}</span>
          </div>
          {isHost && (
            <span className="text-[10px] block mt-0.5">You are the host</span>
          )}
        </div>
      </div>
    )}
    </div>
  )
}

function RemoteCursorIndicator ({ blockIndex, color, alias }) {
  const [pos, setPos] = React.useState(null)

  React.useEffect(() => {
    const update = () => {
      const editor = document.getElementById('editorjs')
      if (!editor) { setPos(null); return }
      const blocks = editor.querySelectorAll('.ce-block')
      const block = blocks[blockIndex]
      if (!block) { setPos(null); return }
      const contentEl = block.querySelector('.ce-block__content') || block
      const editorRect = editor.getBoundingClientRect()
      const contentRect = contentEl.getBoundingClientRect()
      setPos({
        top: contentRect.top - editorRect.top,
        left: contentRect.left - editorRect.left,
        height: contentRect.height,
      })
    }
    update()
    // Re-calculate on resize
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [blockIndex])

  if (!pos) return null

  return (
    <div
      className="absolute pointer-events-none transition-all duration-300 ease-out"
      style={{ top: pos.top - 4, left: (pos.left || 0) - 3, height: pos.height + 8, zIndex: 5 }}
    >
      {/* Colored line */}
      <div
        className="w-[2px] rounded-full h-full"
        style={{ backgroundColor: color, opacity: 0.8 }}
      />
      {/* Label flag at top with alias */}
      <div
        className="absolute -top-5 -left-[1px] flex items-center gap-1 px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-md whitespace-nowrap"
        style={{ backgroundColor: color }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="white" stroke="none">
          <circle cx="12" cy="8" r="4" />
          <path d="M20 21a8 8 0 1 0-16 0" />
        </svg>
        {alias && <span className="text-[9px] text-white font-medium leading-none">{alias}</span>}
      </div>
    </div>
  )
}

function extractHeadings(blocks) {
  if (!blocks) return []
  return blocks
    .map((block, index) => {
      if (block.type === 'header') {
        return {
          blockIndex: index,
          text: (block.data.text || '').replace(/<[^>]*>/g, ''),
          level: block.data.level
        }
      }
      return null
    })
    .filter(Boolean)
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
    recoverFromDuressMode,
    movePageToContainer,
    setSelfDestruct,
    cancelSelfDestruct,
    navigateToPage,
    selfDestructingPages,
    completeSelfDestruct,
    editorReloadKey,
    setEditorReloadKey,
    decryptAllAppLockPages,
    encryptAndClearAppLockPages,
    reEncryptAppLockPages,
    removeAppLockEncryption,
    setPages,
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
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [versionHistoryPage, setVersionHistoryPage] = useState(null)
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
  const [outlineHeadings, setOutlineHeadings] = useState([])
  const [showMiniOutline, setShowMiniOutline] = useState(() => {
    try { return localStorage.getItem('dash-mini-outline') !== 'false' } catch { return true }
  })
  const editorScrollRef = useRef(null)
  const [pageToRename, setPageToRename] = useState(null)
  const [isNewPageRename, setIsNewPageRename] = useState(false)
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
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isLiveSessionModalOpen, setIsLiveSessionModalOpen] = useState(false)
  const [isDecoySetupOpen, setIsDecoySetupOpen] = useState(false)

  // Live session state
  const {
    activeSession,
    sessionStatus,
    participants,
    setActiveSession,
    setSessionStatus,
    setParticipants,
    clearSession,
    editRequests,
  } = useLiveNotesStore()
  const liveSessionRef = useRef(null)
  const liveGuestSyncedRef = useRef(false)
  const lastRemoteBlocksRef = useRef(null)
  const currentPageRef = useRef(currentPage)
  const [liveToast, setLiveToast] = useState(null)
  const [liveUpdateKey, setLiveUpdateKey] = useState(0)
  const prevParticipantsRef = useRef(0)
  const liveToastTimerRef = useRef(null)
  const [remoteCursors, setRemoteCursors] = useState({}) // { peerId: { blockIndex, color, alias } }
  const localPeerIdRef = useRef(crypto.randomUUID().slice(0, 8))
  const activeSessionRef = useRef(activeSession)
  activeSessionRef.current = activeSession
  const sessionExpiryRef = useRef(null)
  const sessionEndedByHostRef = useRef(false)
  const liveBlocksRef = useRef(null) // Synchronous blocks ref for block-update handlers (fix 4)
  const typingTimerRef = useRef(null) // Debounce typing indicator sends
  const [remoteTyping, setRemoteTyping] = useState({}) // { peerId: { alias, color, timeout } }
  const locallyModifiedBlocksRef = useRef(new Set()) // Track locally-edited block indices (fix 11)
  const rejoinTimeoutRef = useRef(null) // Timeout for rejoin sync check (fix 8)
  const [isLiveNotificationsOpen, setIsLiveNotificationsOpen] = useState(false)
  const [passwordPrompt, setPasswordPrompt] = useState(null) // { resolve, roomId } — shown when guest needs to enter password
  const passwordPromptRef = useRef(null)

  // Drag and drop state
  const [activeDragItem, setActiveDragItem] = useState(null)
  const [dropPosition, setDropPosition] = useState('above') // 'above' or 'below'
  const [dragTargetFolderId, setDragTargetFolderId] = useState(null) // folder being targeted during drag
  const folderHoverRef = useRef({ folderId: null, timer: null, ready: false })
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
    if (!draggedItem) return closestCorners(args)

    const activeContainer = draggedItem.folderId || 'root'

    const isInRect = (rect) => rect &&
      pointerCoordinates.x >= rect.left && pointerCoordinates.x <= rect.right &&
      pointerCoordinates.y >= rect.top && pointerCoordinates.y <= rect.bottom

    // Find closest droppable by Y-distance to center, also track above/below
    const findClosest = (filter) => {
      let closest = null, closestDist = Infinity, closestRect = null
      for (const container of droppableContainers) {
        if (container.id === active.id || container.disabled) continue
        if (!filter(container)) continue
        const rect = droppableRects.get(container.id)
        if (!rect) continue
        const dist = Math.abs(pointerCoordinates.y - (rect.top + rect.height / 2))
        if (dist < closestDist) { closestDist = dist; closest = container.id; closestRect = rect }
      }
      if (closest && closestRect) {
        const mid = closestRect.top + closestRect.height / 2
        setDropPosition(pointerCoordinates.y > mid ? 'below' : 'above')
      }
      return closest ? [{ id: closest }] : []
    }

    // Folders reorder with other root-level items
    if (draggedItem.type === 'folder') {
      return findClosest(c => {
        const item = (pages || []).find(p => p.id === c.id)
        return item && (item.type === 'folder' || !item.folderId)
      })
    }

    // Check if pointer is inside a DIFFERENT folder → drag into that folder (with delay)
    let hoveredFolder = null
    for (const container of droppableContainers) {
      if (container.id === activeContainer || container.disabled) continue
      const item = (pages || []).find(p => p.id === container.id)
      if (item?.type === 'folder') {
        if (isInRect(droppableRects.get(container.id))) {
          hoveredFolder = container.id
          break
        }
      }
    }

    // Manage folder hover delay — require 600ms hover before accepting as drop target
    if (hoveredFolder) {
      if (folderHoverRef.current.folderId !== hoveredFolder) {
        // Started hovering a new folder — begin timer
        if (folderHoverRef.current.timer) clearTimeout(folderHoverRef.current.timer)
        folderHoverRef.current = { folderId: hoveredFolder, ready: false, timer: null }
        folderHoverRef.current.timer = setTimeout(() => {
          folderHoverRef.current.ready = true
          setDragTargetFolderId(hoveredFolder)
        }, 600)
      }
      if (folderHoverRef.current.ready) {
        setDragTargetFolderId(hoveredFolder)
        // Folder is ready — target individual pages inside it for precise positioning
        const folderObj = (pages || []).find(p => p.id === hoveredFolder && p.type === 'folder')
        const folderPageIds = new Set(folderObj?.pages || [])
        if (folderPageIds.size > 0) {
          const result = findClosest(c => folderPageIds.has(c.id))
          if (result.length > 0) return result
        }
        // Empty folder or pages not rendered yet — target the folder itself
        return [{ id: hoveredFolder }]
      }
      // Not ready yet — fall through to normal closest-item logic
    } else {
      // Not hovering any folder — clear timer
      if (folderHoverRef.current.timer) clearTimeout(folderHoverRef.current.timer)
      folderHoverRef.current = { folderId: null, timer: null, ready: false }
      setDragTargetFolderId(null)
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

    // Page is at root → find closest root-level item
    return findClosest(c => {
      const item = (pages || []).find(p => p.id === c.id)
      return item && (item.type === 'folder' || !item.folderId)
    })
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
    setDragTargetFolderId(null)
    if (folderHoverRef.current.timer) clearTimeout(folderHoverRef.current.timer)
    folderHoverRef.current = { folderId: null, timer: null, ready: false }

    if (!over || active.id === over.id) return

    const activeItem = (pages || []).find(p => p.id === active.id)
    const overItem = (pages || []).find(p => p.id === over.id)
    if (!activeItem || !overItem) return

    // Folders can only reorder with other root items
    if (activeItem.type === 'folder') {
      reorderItems(active.id, over.id, dropPosition)
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
        movePageToContainer(active.id, activeContainer, 'root', null, dropPosition)
      } else if (activeContainer === 'root') {
        reorderItems(active.id, over.id, dropPosition)
      } else {
        reorderWithinFolder(activeContainer, active.id, over.id, dropPosition)
      }
    } else {
      // Cross-container move — pass nearItemId for positioning within target folder
      const nearId = overItem.type === 'folder' ? null : over.id
      movePageToContainer(active.id, activeContainer, overContainer, nearId, dropPosition)
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
      setOutlineHeadings(extractHeadings(currentPage.content.blocks))
    } else {
      setOutlineHeadings([])
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

  const toggleMiniOutline = useCallback(() => {
    setShowMiniOutline(prev => {
      const next = !prev
      try { localStorage.setItem('dash-mini-outline', String(next)) } catch {}
      return next
    })
  }, [])

  // Keyboard Shortcuts modal
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)

  // Features panel
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false)

  // AI panel
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false)
  const [aiContextText, setAiContextText] = useState(null)
  const [aiBlockIndex, setAiBlockIndex] = useState(null)
  const [aiBlockId, setAiBlockId] = useState(null)
  const [aiBlockIndices, setAiBlockIndices] = useState(null)
  const [aiReloadKey, setAiReloadKey] = useState(0)
  const [aiCanUndo, setAiCanUndo] = useState(false)
  const aiUndoSnapshotRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      const text = e.detail.selectedText
      setAiContextText(text || null) // empty string → null (full note context)
      setAiBlockIndex(e.detail.blockIndex ?? null)
      setAiBlockId(e.detail.blockId ?? null)
      setAiBlockIndices(e.detail.blockIndices ?? null)
      setIsAIPanelOpen(true)
    }
    window.addEventListener('dash-ai-inline', handler)
    return () => window.removeEventListener('dash-ai-inline', handler)
  }, [])

  // Reset AI state when switching pages
  useEffect(() => {
    setAiCanUndo(false)
    aiUndoSnapshotRef.current = null
    if (isAIPanelOpen) {
      setIsAIPanelOpen(false)
      setAiContextText(null)
      setAiBlockIndex(null)
      setAiBlockId(null)
      setAiBlockIndices(null)
    }
  }, [currentPage?.id])

  // Highlight selected blocks in editor while AI panel is open
  useEffect(() => {
    if (!isAIPanelOpen || !aiContextText) return
    const blocks = document.querySelectorAll('.ce-block')
    const indices = aiBlockIndices || (aiBlockIndex != null ? [aiBlockIndex] : [])
    indices.forEach(idx => {
      if (blocks[idx]) blocks[idx].classList.add('dash-ai-highlight')
    })
    return () => {
      document.querySelectorAll('.dash-ai-highlight').forEach(el => el.classList.remove('dash-ai-highlight'))
    }
  }, [isAIPanelOpen, aiContextText, aiBlockIndex, aiBlockIndices])

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

  // Deep link handler — dash:// protocol opens shared notes
  const pendingDeepLinkRef = useRef(null)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return

    const handler = async (hash) => {
      // If app is locked, buffer for after unlock
      if (useAppLockStore.getState().isLocked) {
        pendingDeepLinkRef.current = hash
        return
      }
      try {
        const { decryptSharePayload, bytesToBase64Url } = await import('@/utils/shareDecrypt')
        const RELAY = (process.env.NEXT_PUBLIC_RELAY_URL || 'https://dash-relay.efesop.deno.net').replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
        let json

        if (hash.startsWith('s:')) {
          const rest = hash.slice(2)
          const dotIdx = rest.indexOf('.')
          let id, pw
          if (dotIdx === -1) {
            id = rest
            pw = window.prompt('Enter the password for this shared note:')
            if (!pw) return
          } else {
            id = rest.slice(0, dotIdx)
            pw = decodeURIComponent(rest.slice(dotIdx + 1))
          }
          const res = await fetch(`${RELAY}/share/${id}`)
          if (!res.ok) throw new Error('Share not found or expired')
          const bytes = new Uint8Array(await res.arrayBuffer())
          json = await decryptSharePayload(pw.trim(), bytesToBase64Url(bytes))
        } else {
          const dotIdx = hash.indexOf('.')
          if (dotIdx === -1) {
            const pw = window.prompt('Enter the password for this shared note:')
            if (!pw) return
            json = await decryptSharePayload(pw.trim(), hash)
          } else {
            const pw = decodeURIComponent(hash.slice(0, dotIdx))
            json = await decryptSharePayload(pw, hash.slice(dotIdx + 1))
          }
        }

        const newPage = {
          id: crypto.randomUUID(),
          title: json.title || 'Imported Note',
          content: json.content,
          tags: [],
          tagNames: [],
          createdAt: new Date().toISOString(),
          password: null
        }

        importPages([newPage])
        setTimeout(() => navigateToPage(newPage), 100)
      } catch (err) {
        console.error('Deep link import failed:', err)
      }
    }

    window.electron.on('deep-link-share', handler)
    return () => window.electron.removeListener('deep-link-share', handler)
  }, [importPages, navigateToPage])

  // Handle deep link live session join (dashnotes://live#roomId.key)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return
    const handler = (hash) => {
      if (!hash) return
      const dotIdx = hash.indexOf('.')
      if (dotIdx === -1) return
      const roomId = hash.slice(0, dotIdx)
      const key = hash.slice(dotIdx + 1)
      if (!roomId || !key) return
      joinLiveSessionAsGuest(roomId, key)
    }
    window.electron.on('deep-link-live', handler)
    return () => window.electron.removeListener('deep-link-live', handler)
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
    if (window.__DASH_DEBUG) console.log('[applock] unlock attempt')
    const valid = appLock.unlock(password)
    if (!valid) {
      if (window.__DASH_DEBUG) console.log('[applock] wrong password')
      return false
    }

    // If recovering from duress hide mode, reload pages and tags from disk
    const wasInDuress = await recoverFromDuressMode()
    if (wasInDuress) {
      if (window.__DASH_DEBUG) console.log('[applock] recovered from duress, reloading tags')
      await useTagStore.getState().loadTags()
    }

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

    // Process any buffered deep link from while app was locked
    if (pendingDeepLinkRef.current) {
      const hash = pendingDeepLinkRef.current
      pendingDeepLinkRef.current = null
      setTimeout(async () => {
        try {
          const { decryptSharePayload, bytesToBase64Url } = await import('@/utils/shareDecrypt')
          const RELAY = (process.env.NEXT_PUBLIC_RELAY_URL || 'https://dash-relay.efesop.deno.net').replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
          let json

          if (hash.startsWith('s:')) {
            const rest = hash.slice(2)
            const dotIdx = rest.indexOf('.')
            let id, pw
            if (dotIdx === -1) {
              id = rest
              pw = window.prompt('Enter the password for this shared note:')
              if (!pw) return
            } else {
              id = rest.slice(0, dotIdx)
              pw = decodeURIComponent(rest.slice(dotIdx + 1))
            }
            const res = await fetch(`${RELAY}/share/${id}`)
            if (!res.ok) throw new Error('Share not found or expired')
            const bytes = new Uint8Array(await res.arrayBuffer())
            json = await decryptSharePayload(pw.trim(), bytesToBase64Url(bytes))
          } else {
            const dotIdx = hash.indexOf('.')
            if (dotIdx === -1) {
              const pw = window.prompt('Enter the password for this shared note:')
              if (!pw) return
              json = await decryptSharePayload(pw.trim(), hash)
            } else {
              const pw = decodeURIComponent(hash.slice(0, dotIdx))
              json = await decryptSharePayload(pw, hash.slice(dotIdx + 1))
            }
          }
          const newPage = {
            id: crypto.randomUUID(),
            title: json.title || 'Imported Note',
            content: json.content,
            tags: [],
            tagNames: [],
            createdAt: new Date().toISOString(),
            password: null
          }
          importPages([newPage])
          setTimeout(() => navigateToPage(newPage), 100)
        } catch (err) {
          console.error('Deep link import failed:', err)
        }
      }, 500)
    }

    return true
  }, [appLock, decryptAllAppLockPages, recoverFromDuressMode, importPages, navigateToPage])

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
  const handleDuressUnlock = useCallback(async (password) => {
    if (!appLock.checkDuress(password)) return false
    if (window.__DASH_DEBUG) console.log('[duress] duress password entered — hiding data')

    // Try to load decoy pages for plausible deniability
    let decoyPages = null
    try {
      const encrypted = await readDecoyPages()
      if (encrypted) {
        decoyPages = await decryptJsonWithPassphrase(encrypted, password)
        if (!Array.isArray(decoyPages)) decoyPages = null
      }
    } catch {
      // No decoy pages or decryption failed — will show empty app
      decoyPages = null
    }

    // Hide mode: clear UI but keep encrypted data safe on disk
    // Blocks ALL real saves so disk data is never overwritten
    enterDuressHideMode(decoyPages, password)
    appLock.clearEncryptionKey()

    // Clear tags from UI so attacker can't see tag names
    useTagStore.setState({ tags: [] })

    // Unlock the screen — attacker sees decoy notes (or empty app)
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

  // Keep currentPageRef in sync for live session callbacks
  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  // Show toast when participants join/leave during live session
  useEffect(() => {
    if (!activeSession) {
      prevParticipantsRef.current = 0
      return
    }
    const prev = prevParticipantsRef.current
    prevParticipantsRef.current = participants
    if (prev === 0) return // Initial count, skip

    if (participants > prev) {
      setLiveToast('Someone joined the session')
      if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
      liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 3000)
    } else if (participants < prev) {
      setLiveToast('Someone left the session')
      if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
      liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 3000)
    }
  }, [participants, activeSession])

  // Clean up toast timer on unmount
  useEffect(() => {
    return () => {
      if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
    }
  }, [])

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

  const lastLocalBlocksRef = useRef(null) // Track local blocks for delta diffing

  const handleEditorChange = useCallback(async (content) => {
    // Broadcast to live session peers
    // Skip if: not connected, guest hasn't synced yet, or content matches last remote update (echo prevention)
    const isOnSessionPage = activeSessionRef.current && currentPageRef.current?.id === activeSessionRef.current.pageId
    if (liveSessionRef.current?.isConnected() && liveGuestSyncedRef.current && isOnSessionPage) {
      const blocksJson = JSON.stringify(content.blocks)
      if (blocksJson !== lastRemoteBlocksRef.current) {
        const prevBlocks = lastLocalBlocksRef.current ? JSON.parse(lastLocalBlocksRef.current) : null

        if (!prevBlocks || prevBlocks.length !== content.blocks.length) {
          // Block count changed — send full sync
          if (window.__DASH_DEBUG) console.log('[live] full-sync (block count changed)')
          liveSessionRef.current.send({
            type: 'full-sync',
            title: currentPageRef.current?.title,
            blocks: content.blocks,
            duration: activeSessionRef.current?.duration || null,
            startedAt: activeSessionRef.current?.startedAt || null,
          })
          locallyModifiedBlocksRef.current.clear()
        } else {
          // Same count — send only changed blocks as deltas
          let deltasSent = 0
          for (let i = 0; i < content.blocks.length; i++) {
            if (JSON.stringify(content.blocks[i]) !== JSON.stringify(prevBlocks[i])) {
              liveSessionRef.current.send({
                type: 'block-update',
                index: i,
                block: content.blocks[i],
              })
              locallyModifiedBlocksRef.current.add(i) // Track for conflict detection (fix 11)
              deltasSent++
            }
          }
          if (window.__DASH_DEBUG && deltasSent) console.log('[live] sent', deltasSent, 'block-update(s)')
        }
        lastLocalBlocksRef.current = blocksJson
        liveBlocksRef.current = content.blocks // Keep sync ref up to date (fix 4)
      } else {
        if (window.__DASH_DEBUG) console.log('[live] skipped echo broadcast')
      }

      // Send typing indicator (fix 10)
      liveSessionRef.current.send({ type: 'typing', peerId: localPeerIdRef.current, isTyping: true })
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => {
        if (liveSessionRef.current?.isConnected()) {
          liveSessionRef.current.send({ type: 'typing', peerId: localPeerIdRef.current, isTyping: false })
        }
      }, 2000)
    }

    // Skip saving for guest virtual pages (they aren't real pages in storage)
    if (!currentPageRef.current?.id?.startsWith('live-')) {
      await savePage(content)
    }
    setWordCount(calculateWordCount(content))
    setOutlineHeadings(extractHeadings(content.blocks))
  }, [savePage])

  // AI panel insertion handler
  const handleAIInsertBlocks = useCallback(async (blocks, mode, selectionText, sourceBlockIndex, sourceBlockIndices, sourceBlockId) => {
    if (!currentPageRef.current) return
    const existingBlocks = currentPageRef.current.content?.blocks || []
    let newBlocks

    // If we have exact block indices (from multi-block selection), replace that range
    if (mode === 'replace' && Array.isArray(sourceBlockIndices) && sourceBlockIndices.length > 0) {
      const sorted = [...sourceBlockIndices].sort((a, b) => a - b)
      const startIdx = sorted[0]
      const endIdx = sorted[sorted.length - 1]
      if (startIdx >= 0 && endIdx < existingBlocks.length) {
        newBlocks = [
          ...existingBlocks.slice(0, startIdx),
          ...blocks,
          ...existingBlocks.slice(endIdx + 1)
        ]
      }
    }

    // If we have an exact block index (from single-block AI tune), resolve by block ID first
    if (!newBlocks && mode === 'replace' && sourceBlockIndex != null) {
      // Prefer blockId lookup (stable even if blocks shifted) over stale index
      let resolvedIndex = sourceBlockIndex
      if (sourceBlockId) {
        const idIdx = existingBlocks.findIndex(b => b.id === sourceBlockId)
        if (idIdx !== -1) resolvedIndex = idIdx
      }
      if (resolvedIndex >= 0 && resolvedIndex < existingBlocks.length) {
        newBlocks = [
          ...existingBlocks.slice(0, resolvedIndex),
          ...blocks,
          ...existingBlocks.slice(resolvedIndex + 1)
        ]
      }
    }

    if (!newBlocks && mode === 'replace' && selectionText) {
      // Selection-level replace: find blocks whose text appears in the selection
      const selectionClean = selectionText.replace(/\s+/g, ' ').trim()

      // Extract plain text from any block type
      const extractBlockText = (b) => {
        // Table: extract from content 2D array
        if (b.type === 'table' && Array.isArray(b.data?.content)) {
          return b.data.content.map(row =>
            Array.isArray(row) ? row.map(cell => (cell || '').replace(/<[^>]*>/g, '').trim()).join(' ') : ''
          ).join(' ')
        }
        // List items
        if (Array.isArray(b.data?.items)) {
          return b.data.items.map(item => {
            const t = typeof item === 'string' ? item : (item.text || item.content || '')
            return t.replace(/<[^>]*>/g, '').trim()
          }).join(' ')
        }
        const raw = b.data?.text || b.data?.code || b.data?.caption || ''
        return raw.replace(/<[^>]*>/g, '').trim()
      }

      // Score each block by whether its text content appears in the selection
      let startIdx = -1
      let endIdx = -1
      for (let i = 0; i < existingBlocks.length; i++) {
        const b = existingBlocks[i]
        const blockText = extractBlockText(b).replace(/\s+/g, ' ').trim()
        if (!blockText || blockText.length < 2) continue

        // Check if block text is a substring of the selection (or vice versa for short blocks)
        const inSelection = selectionClean.includes(blockText) || blockText.includes(selectionClean.slice(0, 60))
        if (inSelection) {
          if (startIdx === -1) startIdx = i
          endIdx = i
        } else if (startIdx !== -1) {
          // Stop once we've left the matching range
          break
        }
      }

      if (startIdx !== -1 && endIdx !== -1) {
        newBlocks = [
          ...existingBlocks.slice(0, startIdx),
          ...blocks,
          ...existingBlocks.slice(endIdx + 1)
        ]
      } else {
        // Fallback: append below instead of silently replacing the whole note
        newBlocks = [...existingBlocks, ...blocks]
      }
    } else if (!newBlocks && mode === 'replace') {
      newBlocks = blocks
    }

    if (!newBlocks) {
      newBlocks = [...existingBlocks, ...blocks]
    }

    // Snapshot current content for undo
    aiUndoSnapshotRef.current = JSON.parse(JSON.stringify(currentPageRef.current.content || {}))

    const newContent = { ...(currentPageRef.current.content || {}), blocks: newBlocks, time: Date.now() }
    await handleEditorChange(newContent)
    // Force-sync React state so the editor remount gets fresh data
    // (savePage only updates refs, not React state, to avoid MutationObserver loops during normal edits)
    setCurrentPage({ ...currentPageRef.current, content: newContent })
    setAiReloadKey(k => k + 1)
    setAiCanUndo(true)
  }, [handleEditorChange, setCurrentPage])

  const handleAIUndo = useCallback(async () => {
    if (!aiUndoSnapshotRef.current || !currentPageRef.current) return
    const restoredContent = aiUndoSnapshotRef.current
    aiUndoSnapshotRef.current = null
    await handleEditorChange(restoredContent)
    setCurrentPage({ ...currentPageRef.current, content: restoredContent })
    setAiReloadKey(k => k + 1)
    setAiCanUndo(false)
  }, [handleEditorChange, setCurrentPage])

  const handleAISaveAsNote = useCallback(async (markdownText) => {
    if (!markdownText) return
    const { parseMarkdownToBlocks } = await import('./Editor')
    const { sanitizeEditorContent } = await import('@/utils/securityUtils')
    const rawBlocks = parseMarkdownToBlocks(markdownText)
    const sanitized = sanitizeEditorContent({ blocks: rawBlocks })
    const blocks = sanitized?.blocks || []
    if (blocks.length > 0) {
      const newPage = await handleNewPage()
      if (newPage) {
        const content = { time: Date.now(), blocks, version: '2.30.6' }
        await handleEditorChange(content)
        setCurrentPage({ ...currentPageRef.current, content })
        setAiReloadKey(k => k + 1)
      }
    }
  }, [handleNewPage, handleEditorChange, setCurrentPage])

  // ── Live Session Handlers ─────────────────────────────────────
  const handleStartLiveSession = useCallback(async ({ roomId, keyStr, link, duration, sessionPassword }) => {
    if (!currentPage) return
    // Destroy any existing session before starting a new one
    if (liveSessionRef.current) {
      liveSessionRef.current.destroy()
      liveSessionRef.current = null
    }
    const docId = crypto.randomUUID()

    // Hash the session password if provided (for comparison without storing plaintext)
    let passwordHash = null
    if (sessionPassword) {
      const encoder = new TextEncoder()
      const data = encoder.encode(sessionPassword)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      passwordHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
    }

    const { createLiveSession } = await import('@/lib/liveSession')

    const session = createLiveSession({
      roomId,
      keyStr,
      isHost: true,
      onMessage: (msg) => {
        const page = currentPageRef.current
        if (window.__DASH_DEBUG) console.log('[live:host] received msg:', msg.type, 'page:', page?.id, 'hasContent:', !!page?.content, 'blocksCount:', page?.content?.blocks?.length)
        if (msg.type === 'request-sync' && page?.content) {
          if (passwordHash) {
            if (window.__DASH_DEBUG) console.log('[live:host] password protected — sending auth-challenge')
            session.send({ type: 'auth-challenge', peerId: msg.peerId })
          } else {
            if (window.__DASH_DEBUG) console.log('[live:host] sending full-sync:', page.content.blocks.length, 'blocks, title:', page.title)
            session.send({
              type: 'full-sync',
              title: page.title,
              blocks: page.content.blocks,
              duration: activeSessionRef.current?.duration || null,
              startedAt: activeSessionRef.current?.startedAt || null,
            })
          }
        }
        // Guest responded to auth challenge
        if (msg.type === 'auth-response' && msg.passwordHash) {
          const accepted = msg.passwordHash === passwordHash
          if (window.__DASH_DEBUG) console.log('[live:host] auth-response from', msg.peerId, 'accepted:', accepted)
          session.send({ type: 'auth-result', accepted, peerId: msg.peerId })
          if (accepted && page?.content) {
            if (window.__DASH_DEBUG) console.log('[live:host] auth accepted — sending full-sync:', page.content.blocks.length, 'blocks')
            session.send({
              type: 'full-sync',
              title: page.title,
              blocks: page.content.blocks,
              duration: activeSessionRef.current?.duration || null,
              startedAt: activeSessionRef.current?.startedAt || null,
            })
          }
        }
        // Handle incoming edits from guest
        if (msg.type === 'full-sync' && msg.blocks && page) {
          if (window.__DASH_DEBUG) console.log('[live] host received', msg.blocks.length, 'blocks from guest')
          liveBlocksRef.current = msg.blocks
          lastRemoteBlocksRef.current = JSON.stringify(msg.blocks)
          lastLocalBlocksRef.current = lastRemoteBlocksRef.current
          locallyModifiedBlocksRef.current.clear()
          navigateToPage({
            ...page,
            content: { time: Date.now(), blocks: msg.blocks },
          })
          setLiveUpdateKey(k => k + 1)
          setRemoteCursors({}) // Clear cursors — indices may have shifted (fix 5)
        }
        // Handle block-level delta updates
        if (msg.type === 'block-update' && typeof msg.index === 'number' && msg.block) {
          // Conflict detection (fix 11)
          if (locallyModifiedBlocksRef.current.has(msg.index)) {
            locallyModifiedBlocksRef.current.delete(msg.index)
            if (window.__DASH_DEBUG) console.log('[live] conflict at index', msg.index, '— keeping local version')
            setLiveToast('Conflict detected — your version was kept')
            if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
            liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 3000)
            return
          }
          const blocks = liveBlocksRef.current ? [...liveBlocksRef.current] : (page?.content?.blocks ? [...page.content.blocks] : null)
          if (blocks && msg.index < blocks.length) {
            blocks[msg.index] = msg.block
            if (window.__DASH_DEBUG) console.log('[live] host received block-update at index', msg.index)
            liveBlocksRef.current = blocks
            lastRemoteBlocksRef.current = JSON.stringify(blocks)
            lastLocalBlocksRef.current = lastRemoteBlocksRef.current
            navigateToPage({
              ...page,
              content: { time: Date.now(), blocks },
            })
            setLiveUpdateKey(k => k + 1)
          }
        }
        // Handle remote cursor position (fix 9: with alias)
        if (msg.type === 'cursor' && typeof msg.blockIndex === 'number' && msg.peerId) {
          const colorIdx = Math.abs(msg.peerId.charCodeAt(0)) % AVATAR_COLORS.length
          setRemoteCursors(prev => ({ ...prev, [msg.peerId]: { blockIndex: msg.blockIndex, color: AVATAR_COLORS[colorIdx], alias: peerAlias(msg.peerId) } }))
        }
        // Handle typing indicators (fix 10)
        if (msg.type === 'typing' && msg.peerId) {
          const colorIdx = Math.abs(msg.peerId.charCodeAt(0)) % AVATAR_COLORS.length
          setRemoteTyping(prev => {
            const updated = { ...prev }
            if (msg.isTyping) {
              if (updated[msg.peerId]?.timeout) clearTimeout(updated[msg.peerId].timeout)
              const timeout = setTimeout(() => {
                setRemoteTyping(p => { const u = { ...p }; delete u[msg.peerId]; return u })
              }, 3000)
              updated[msg.peerId] = { alias: peerAlias(msg.peerId), color: AVATAR_COLORS[colorIdx], timeout }
            } else {
              if (updated[msg.peerId]?.timeout) clearTimeout(updated[msg.peerId].timeout)
              delete updated[msg.peerId]
            }
            return updated
          })
        }
      },
      onParticipantsChange: (count) => {
        setParticipants(count)
        if (count <= 1) { setRemoteCursors({}); setRemoteTyping({}) }
      },
      onStatusChange: (status) => {
        setSessionStatus(status)
        if (status === 'disconnected' || status === 'connecting') { setRemoteCursors({}); setRemoteTyping({}) }
      },
    })

    liveSessionRef.current = session
    liveGuestSyncedRef.current = true // Host is always synced
    lastLocalBlocksRef.current = currentPage.content ? JSON.stringify(currentPage.content.blocks) : null
    liveBlocksRef.current = currentPage.content?.blocks || []
    locallyModifiedBlocksRef.current.clear()
    setActiveSession({ roomId, keyStr, docId, pageId: currentPage.id, isHost: true, link, duration: duration || null, startedAt: Date.now(), passwordHash })

    // Auto-expiry timer — host only
    if (sessionExpiryRef.current) clearTimeout(sessionExpiryRef.current)
    if (duration) {
      sessionExpiryRef.current = setTimeout(async () => {
        // Inline end logic to avoid circular dep with handleEndLiveSession
        if (liveSessionRef.current) {
          try { await liveSessionRef.current.send({ type: 'session-end' }) } catch { /* ignore */ }
          liveSessionRef.current.destroy()
          liveSessionRef.current = null
        }
        liveGuestSyncedRef.current = false
        lastRemoteBlocksRef.current = null
        lastLocalBlocksRef.current = null
        liveBlocksRef.current = null
        locallyModifiedBlocksRef.current.clear()
        setRemoteCursors({})
        setRemoteTyping({})
        clearSession()
        setLiveToast({ message: 'Live session expired', duration: 4000 })
      }, duration)
    }
  }, [currentPage, setActiveSession, setParticipants, setSessionStatus, clearSession])

  const handleEndLiveSession = useCallback(async () => {
    if (sessionExpiryRef.current) { clearTimeout(sessionExpiryRef.current); sessionExpiryRef.current = null }
    if (liveSessionRef.current) {
      // Notify peers before closing (fix 2) — must await since send() encrypts async
      try { await liveSessionRef.current.send({ type: 'session-end' }) } catch { /* ignore */ }
      liveSessionRef.current.destroy()
      liveSessionRef.current = null
    }
    liveGuestSyncedRef.current = false
    lastRemoteBlocksRef.current = null
    lastLocalBlocksRef.current = null
    liveBlocksRef.current = null
    locallyModifiedBlocksRef.current.clear()
    setRemoteCursors({})
    setRemoteTyping({})
    clearSession()
  }, [clearSession])

  // Send cursor position to remote peer during live sessions
  useEffect(() => {
    if (!activeSession) return
    let lastSentIndex = -1
    const handleSelection = () => {
      if (!liveSessionRef.current?.isConnected()) return
      if (currentPageRef.current?.id !== activeSession.pageId) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const node = sel.anchorNode
      if (!node) return
      // Walk up to find the .ce-block ancestor
      let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
      while (el && !el.classList?.contains('ce-block')) {
        el = el.parentElement
      }
      if (!el) return
      // Find block index
      const blocks = el.parentElement?.querySelectorAll('.ce-block')
      if (!blocks) return
      const blockIndex = Array.from(blocks).indexOf(el)
      if (blockIndex === -1 || blockIndex === lastSentIndex) return
      lastSentIndex = blockIndex
      liveSessionRef.current.send({ type: 'cursor', blockIndex, peerId: localPeerIdRef.current })
    }
    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [activeSession])

  // Clean up session on unmount or page change
  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.destroy()
        liveSessionRef.current = null
      }
    }
  }, [])

  // Join a live session as guest (used by both /live page redirect and deep links)
  const joinLiveSessionAsGuest = useCallback(async (roomId, key) => {
    try {
      // Destroy any existing session before joining a new one
      if (liveSessionRef.current) {
        liveSessionRef.current.destroy()
        liveSessionRef.current = null
      }
      const guestPageId = 'live-' + roomId
      // Check if we already have this page (rejoining) — preserve existing content
      let existingPage = null
      try {
        const stored = localStorage.getItem('dash-live-page-' + roomId)
        if (stored) {
          const data = JSON.parse(stored)
          if (data.content?.blocks?.length > 0) {
            existingPage = { id: guestPageId, title: data.title || 'Live Session', content: data.content, tags: [], lastEdited: Date.now() }
          }
        }
      } catch { /* ignore */ }
      const guestPage = existingPage || {
        id: guestPageId,
        title: 'Live Session',
        content: { blocks: [] },
        tags: [],
        lastEdited: Date.now(),
      }
      navigateToPage(guestPage)
      // Add guest page to pages array so it appears in the sidebar
      setPages(prev => {
        if (prev.some(p => p.id === guestPageId)) return prev
        return [guestPage, ...prev]
      })
      // Persist to localStorage so it survives reload (fix 1) — clear sessionEnded flag on rejoin
      saveGuestPage(roomId, { ...guestPage, roomId, keyStr: key, sessionEnded: false })
      sessionEndedByHostRef.current = false
      liveBlocksRef.current = []
      locallyModifiedBlocksRef.current.clear()

      const { createLiveSession } = await import('@/lib/liveSession')
      const session = createLiveSession({
        roomId,
        keyStr: key,
        isHost: false,
        onMessage: (msg) => {
          if (window.__DASH_DEBUG) console.log('[live:guest] received msg:', msg.type)
          // Host ended the session gracefully (fix 2+3)
          if (msg.type === 'session-end') {
            sessionEndedByHostRef.current = true
            if (liveSessionRef.current) {
              liveSessionRef.current.destroy()
              liveSessionRef.current = null
            }
            liveGuestSyncedRef.current = false
            lastRemoteBlocksRef.current = null
            lastLocalBlocksRef.current = null
            liveBlocksRef.current = null
            setRemoteCursors({})
            setRemoteTyping({})
            clearSession()

            // Convert live page to a normal editable page the guest owns
            // Must always convert — live- pages are filtered from storage saves
            const newId = crypto.randomUUID()
            setPages(prev => {
              const livePage = prev.find(p => p.id === guestPageId)
              if (!livePage) return prev
              const adoptedPage = { ...livePage, id: newId, tags: [], lastEdited: Date.now() }
              return [adoptedPage, ...prev.filter(p => p.id !== guestPageId)]
            })
            // If guest is currently viewing the live page, navigate to the converted one
            if (currentPageRef.current?.id === guestPageId) {
              const livePage = currentPageRef.current
              navigateToPage({ ...livePage, id: newId, tags: [], lastEdited: Date.now() })
            }
            // Clean up localStorage live page entry
            try { localStorage.removeItem('dash-live-page-' + roomId) } catch { /* ignore */ }

            setLiveToast('Session ended — this page is now yours to edit')
            if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
            liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 5000)
            return
          }
          // Password-protected session — host asks guest to authenticate (fix 6)
          if (msg.type === 'auth-challenge') {
            setPasswordPrompt({
              resolve: async (password) => {
                if (!password) {
                  // User cancelled — destroy session
                  if (liveSessionRef.current) { liveSessionRef.current.destroy(); liveSessionRef.current = null }
                  clearSession()
                  setPages(prev => prev.filter(p => p.id !== guestPageId))
                  navigateToPage(null)
                  return
                }
                const encoder = new TextEncoder()
                const data = encoder.encode(password)
                const hashBuffer = await crypto.subtle.digest('SHA-256', data)
                const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
                if (liveSessionRef.current) {
                  liveSessionRef.current.send({ type: 'auth-response', passwordHash: hash, peerId: localPeerIdRef.current })
                }
              },
            })
            return
          }
          if (msg.type === 'auth-result') {
            if (!msg.accepted) {
              setPasswordPrompt(prev => {
                if (!prev) return null
                const attempts = (prev.attempts || 0) + 1
                if (attempts >= 3) {
                  // Max attempts reached — destroy session
                  setLiveToast('Too many incorrect attempts — access denied.')
                  if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
                  liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 5000)
                  if (liveSessionRef.current) { liveSessionRef.current.destroy(); liveSessionRef.current = null }
                  clearSession()
                  setPages(pp => pp.filter(p => p.id !== guestPageId))
                  navigateToPage(null)
                  return null
                }
                return { ...prev, attempts, error: `Incorrect password (${3 - attempts} ${3 - attempts === 1 ? 'try' : 'tries'} remaining)` }
              })
              return
            }
            // Accepted — dismiss prompt, full-sync will follow
            setPasswordPrompt(null)
            return
          }
          if (msg.type === 'full-sync' && msg.blocks) {
            if (window.__DASH_DEBUG) console.log('[live] guest received', msg.blocks.length, 'blocks from host')
            liveGuestSyncedRef.current = true
            lastRemoteBlocksRef.current = JSON.stringify(msg.blocks)
            lastLocalBlocksRef.current = lastRemoteBlocksRef.current
            liveBlocksRef.current = msg.blocks
            locallyModifiedBlocksRef.current.clear() // full-sync resets conflict tracking
            const current = currentPageRef.current || guestPage
            const title = msg.title || current.title
            const updatedPage = {
              ...current,
              id: guestPageId,
              title,
              content: { time: Date.now(), blocks: msg.blocks },
            }
            navigateToPage(updatedPage)
            setPages(prev => prev.map(p => p.id === guestPageId ? { ...p, title, content: { time: Date.now(), blocks: msg.blocks }, lastEdited: Date.now() } : p))
            setLiveUpdateKey(k => k + 1)
            setRemoteCursors({}) // Clear cursors — indices may have shifted (fix 5)
            // Clear rejoin timeout — sync arrived
            if (rejoinTimeoutRef.current) { clearTimeout(rejoinTimeoutRef.current); rejoinTimeoutRef.current = null }
            // Sync timing info from host so guest timer counts down too (fix 7)
            if (msg.duration !== undefined || msg.startedAt !== undefined) {
              const cs = activeSessionRef.current
              if (cs) {
                setActiveSession({ ...cs, duration: msg.duration || cs.duration || null, startedAt: msg.startedAt || cs.startedAt })
              }
            }
            // Persist updated content (fix 1)
            saveGuestPage(roomId, { ...updatedPage, roomId, keyStr: key })
          }
          // Handle block-level delta updates
          if (msg.type === 'block-update' && typeof msg.index === 'number' && msg.block) {
            // Conflict detection (fix 11)
            if (locallyModifiedBlocksRef.current.has(msg.index)) {
              locallyModifiedBlocksRef.current.delete(msg.index)
              if (window.__DASH_DEBUG) console.log('[live] conflict at index', msg.index, '— keeping local version')
              setLiveToast('Conflict detected — your version was kept')
              if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
              liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 3000)
              return
            }
            const blocks = liveBlocksRef.current ? [...liveBlocksRef.current] : null
            if (blocks && msg.index < blocks.length) {
              blocks[msg.index] = msg.block
              if (window.__DASH_DEBUG) console.log('[live] guest received block-update at index', msg.index)
              liveBlocksRef.current = blocks
              lastRemoteBlocksRef.current = JSON.stringify(blocks)
              lastLocalBlocksRef.current = lastRemoteBlocksRef.current
              const current = currentPageRef.current || guestPage
              const updatedContent = { time: Date.now(), blocks }
              navigateToPage({
                ...current,
                id: guestPageId,
                content: updatedContent,
              })
              setPages(prev => prev.map(p => p.id === guestPageId ? { ...p, content: updatedContent, lastEdited: Date.now() } : p))
              setLiveUpdateKey(k => k + 1)
              // Persist updated content (fix 1)
              saveGuestPage(roomId, { ...current, id: guestPageId, content: { time: Date.now(), blocks }, roomId, keyStr: key })
            }
          }
          // Handle remote cursor position (fix 9: with alias)
          if (msg.type === 'cursor' && typeof msg.blockIndex === 'number' && msg.peerId) {
            const colorIdx = Math.abs(msg.peerId.charCodeAt(0)) % AVATAR_COLORS.length
            setRemoteCursors(prev => ({ ...prev, [msg.peerId]: { blockIndex: msg.blockIndex, color: AVATAR_COLORS[colorIdx], alias: peerAlias(msg.peerId) } }))
          }
          // Handle typing indicators (fix 10)
          if (msg.type === 'typing' && msg.peerId) {
            const colorIdx = Math.abs(msg.peerId.charCodeAt(0)) % AVATAR_COLORS.length
            setRemoteTyping(prev => {
              const updated = { ...prev }
              if (msg.isTyping) {
                if (updated[msg.peerId]?.timeout) clearTimeout(updated[msg.peerId].timeout)
                const timeout = setTimeout(() => {
                  setRemoteTyping(p => { const u = { ...p }; delete u[msg.peerId]; return u })
                }, 3000)
                updated[msg.peerId] = { alias: peerAlias(msg.peerId), color: AVATAR_COLORS[colorIdx], timeout }
              } else {
                if (updated[msg.peerId]?.timeout) clearTimeout(updated[msg.peerId].timeout)
                delete updated[msg.peerId]
              }
              return updated
            })
          }
        },
        onParticipantsChange: (count) => {
          setParticipants(count)
          if (count <= 1) { setRemoteCursors({}); setRemoteTyping({}) }
        },
        onStatusChange: (status) => {
          setSessionStatus(status)
          if (status === 'disconnected' || status === 'connecting') {
            setRemoteCursors({})
            setRemoteTyping({})
          }
          // Show disconnect toast for unexpected disconnects (fix 3)
          if (status === 'disconnected' && !sessionEndedByHostRef.current && liveGuestSyncedRef.current) {
            setLiveToast('Connection lost. Your copy is now read-only.')
            if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
            liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 5000)
          }
        },
      })
      liveSessionRef.current = session
      setActiveSession({ roomId, keyStr: key, pageId: guestPageId, isHost: false, startedAt: Date.now() })
    } catch (e) {
      console.error('Failed to join live session:', e)
    }
  }, [setActiveSession, setParticipants, setSessionStatus, navigateToPage, setPages])

  // Check for live session join link (from /live page redirect)
  useEffect(() => {
    const joinData = sessionStorage.getItem('dash-live-join')
    if (!joinData) return
    sessionStorage.removeItem('dash-live-join')

    try {
      const { roomId, key } = JSON.parse(joinData)
      if (!roomId || !key) return
      joinLiveSessionAsGuest(roomId, key)
    } catch (e) {
      console.error('Failed to parse live session join data:', e)
    }
  }, [joinLiveSessionAsGuest])

  // Load persisted guest pages from localStorage on startup (fix 1)
  useEffect(() => {
    const stored = loadGuestPages()
    if (stored.length > 0) {
      setPages(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        const toAdd = stored.filter(p => !existingIds.has(p.id))
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev
      })
    }
  }, [setPages])

  // Clean up rejoin timeout on unmount
  useEffect(() => {
    return () => {
      if (rejoinTimeoutRef.current) clearTimeout(rejoinTimeoutRef.current)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (sessionExpiryRef.current) clearTimeout(sessionExpiryRef.current)
    }
  }, [])

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
        case 'encrypted-share': {
          if (window.__editorFlush) await window.__editorFlush()
          setIsShareModalOpen(true)
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
    setIsNewPageRename(false)
    setIsRenameModalOpen(true)
  }, [])

  const handleNewPageWithRename = useCallback(async () => {
    const newPage = await handleNewPage()
    if (newPage) {
      setPageToRename(newPage)
      setNewPageTitle('')
      setIsNewPageRename(true)
      setIsRenameModalOpen(true)
    }
    return newPage
  }, [handleNewPage])

  const confirmRename = useCallback(async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
      await renamePage(pageToRename, newPageTitle.slice(0, 50))
    }
    setIsRenameModalOpen(false)
    setPageToRename(null)
    setNewPageTitle('')
    setIsNewPageRename(false)
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
      // No need to navigate — unlockPage() already calls _setCurrentPage() with the decrypted page.
      // Calling navigateToPage(pageToAccess) here would overwrite it with the stale encrypted object.
      setIsPasswordModalOpen(false)
      setPasswordInput('')
      setPageToAccess(null)
    }
  }

  const handleDeletePage = useCallback((page) => {
    // Live guest pages: remove from state + localStorage directly, no confirmation needed
    if (page.id?.startsWith('live-')) {
      const roomId = page.id.replace('live-', '')
      try { localStorage.removeItem('dash-live-page-' + roomId) } catch { /* ignore */ }
      setPages(prev => prev.filter(p => p.id !== page.id))
      if (currentPage?.id === page.id) {
        const remaining = pages.filter(p => p.id !== page.id && p.type !== 'folder')
        if (remaining.length > 0) setCurrentPage(remaining[0])
      }
      return
    }
    setConfirmModal({
      isOpen: true,
      title: 'Delete Page',
      message: `Are you sure you want to delete "${page.title}"? This action cannot be undone.`,
      onConfirm: () => deletePage(page),
      variant: 'danger',
      confirmText: 'Delete',
      showCancel: true
    })
  }, [deletePage, currentPage, pages, setPages, setCurrentPage])

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

  const handleCreateFolder = (folderName, emoji) => {
    createFolder(folderName, emoji)
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

  const handleVersionHistory = (page) => {
    setVersionHistoryPage(page)
    setIsVersionHistoryOpen(true)
  }

  const handleRestoreVersion = async (blocks) => {
    if (!versionHistoryPage) return
    // Build the restored page with content already set (avoids race with savePage)
    const restoredPage = {
      id: crypto.randomUUID(),
      title: `${versionHistoryPage.title || 'Untitled'} (restored)`,
      content: { time: Date.now(), blocks, version: '2.30.6' },
      tags: [],
      tagNames: [],
      createdAt: new Date().toISOString(),
      password: null
    }
    // Insert into pages via importPages (handles storage + state atomically)
    await importPages([restoredPage])
    navigateToPage(restoredPage)
    setEditorReloadKey(k => k + 1)
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
    onNewPage: handleNewPageWithRename,
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
    onToggleShortcutsModal: () => setIsShortcutsModalOpen(true),
    onToggleAIPanel: () => {
      setAiContextText(null)
      setIsAIPanelOpen(prev => !prev)
    }
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

  // Compute avatar colors for live session sidebar dots — based on participants count + known cursor colors
  const liveAllAvatarColors = (() => {
    if (!activeSession) return []
    const localColor = AVATAR_COLORS[Math.abs(localPeerIdRef.current.charCodeAt(0)) % AVATAR_COLORS.length]
    const cursorColors = Object.values(remoteCursors).map(c => c.color)
    // Use participants count to ensure we show the right number of dots even before cursors are sent
    const totalParticipants = Math.max(participants, 1 + cursorColors.length)
    const colors = [localColor, ...cursorColors]
    // Fill remaining slots with sequential AVATAR_COLORS
    for (let i = colors.length; i < totalParticipants; i++) {
      colors.push(AVATAR_COLORS[i % AVATAR_COLORS.length])
    }
    return colors
  })()

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
          style={{ animation: 'dash-focus-enter 300ms ease-out' }}
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

      {/* Live session toast */}
      {liveToast && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium shadow-2xl ${
            theme === 'fallout' ? 'text-green-400 bg-green-900/90 border border-green-500/40' :
            theme === 'dark' ? 'text-white bg-[#2a2a2a] border border-[#4a4a4a]/60' :
            theme === 'darkblue' ? 'text-white bg-[#1c2438] border border-[#2a3555]' :
            'text-gray-800 bg-gray-900 text-white border border-gray-700'
          }`}
          style={{ animation: 'dash-modal-in 200ms ease-out' }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          {liveToast}
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
            : sidebarOpen
              ? 'w-64 relative transition-all duration-300'
              : 'w-16 relative transition-all duration-200'
            } flex flex-col overflow-hidden`}
          role="navigation"
          aria-label="Page navigation"
          aria-expanded={sidebarOpen}
        >
          <header className={`${sidebarOpen ? 'px-3' : 'px-1'} ${isMacElectron ? 'pt-10' : 'pt-4'} pb-2 flex ${sidebarOpen ? 'justify-between' : 'flex-col items-center gap-1'} items-center`}>
            {sidebarOpen ? (
              <div className="flex items-center space-x-2">
                <img src="./icons/dash-logo.png" alt="Dash" className="h-7 w-7 rounded-md" />
                <span className={`text-base font-semibold ${theme === 'fallout' ? 'text-green-400' : theme === 'dark' ? 'text-[#ececec]' : theme === 'darkblue' ? 'text-[#e0e6f0]' : 'text-neutral-900'}`}>Dash</span>
              </div>
            ) : (
              <img src="./icons/dash-logo.png" alt="Dash" className="h-6 w-6 rounded-md" />
            )}
            <div className="flex items-center space-x-1">
              {sidebarOpen && (
                <div ref={lockDropdownRef} className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsLockDropdownOpen(!isLockDropdownOpen)}
                    className={`h-8 w-8 p-0 ${getButtonHoverClasses()}`}
                    title="App lock"
                  >
                    <Lock className="h-4 w-4" />
                  </Button>
                  {appLock.isEnabled && (
                    <span className={`absolute top-1 right-0.5 flex items-center justify-center h-2.5 w-2.5 rounded-full pointer-events-none z-[1] ${
                      theme === 'fallout' ? 'bg-green-500' : 'bg-blue-500'
                    }`}>
                      <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    </span>
                  )}
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
                onClick={handleNewPageWithRename}
                className={`${sidebarOpen ? 'h-8 w-8' : 'h-6 w-6'} p-0 ${getButtonHoverClasses()}`}
                title="New page"
              >
                <Plus className={sidebarOpen ? 'h-5 w-5' : 'h-4 w-4'} />
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
                        dropPosition={dropPosition}
                        dragTargetFolderId={dragTargetFolderId}
                        isDraggingFolder={activeDragItem?.type === 'folder'}
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
                        onVersionHistory={handleVersionHistory}
                        onMoveToFolder={handleMoveToFolder}
                        onSelfDestruct={handleSelfDestruct}
                        onCancelSelfDestruct={handleCancelSelfDestruct}
                        selfDestructingPages={selfDestructingPages}
                        completeSelfDestruct={completeSelfDestruct}
                        pagesCount={folderPageIds.length}
                        liveSessionPageId={activeSession?.pageId}
                        liveAvatarColors={liveAllAvatarColors}
                      />
                    )
                  }
                  if (!item.folderId && !folderOwnedPageIds.has(item.id)) {
                    return (
                      <SortablePageItem
                        key={item.id}
                        id={item.id}
                        disabled={!isDndEnabled}
                        dropPosition={dropPosition}
                        page={item}
                        isActive={currentPage?.id === item.id}
                        onSelect={handlePageSelect}
                        onRename={handleRenamePage}
                        onDelete={handleDeletePage}
                        onToggleLock={handleToggleLock}
                        onDuplicate={handleDuplicatePage}
                        onVersionHistory={handleVersionHistory}
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
                        isLiveSession={activeSession?.pageId === item.id}
                        liveAvatarColors={activeSession?.pageId === item.id || item.id?.startsWith('live-') ? liveAllAvatarColors : []}
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
          <div className={`mt-auto ${sidebarOpen ? 'px-3' : 'px-1'} py-2 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'} ${theme === 'fallout' ? 'border-t border-green-600/20' : theme === 'dark' ? 'border-t border-[#2e2e2e]' : theme === 'darkblue' ? 'border-t border-[#1c2438]' : 'border-t border-neutral-100'}`}>
            <Button
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`self-start ${sidebarOpen ? 'h-7 w-7' : 'h-6 w-6'} p-0 ${getButtonHoverClasses()}`}
              size="sm"
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-3.5 w-3.5" />}
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
              <Tooltip text="Rename page">
              <h1
                className={`text-lg font-semibold cursor-pointer truncate py-1 px-1.5 -my-1 rounded-lg transition-colors ${theme === 'fallout' ? 'text-green-400 hover:bg-gray-800/50' : theme === 'dark' ? 'text-[#ececec] hover:bg-[#2f2f2f]/50' : theme === 'darkblue' ? 'text-[#e0e6f0] hover:bg-[#232b42]/50' : 'text-neutral-900 hover:bg-neutral-100'}`}
                onClick={() => handleRenamePage(currentPage)}
              >
                {currentPage?.title}
              </h1>
              </Tooltip>
              {(() => {
                const folder = currentPage?.folderId
                  ? (pages || []).find(item => item.id === currentPage.folderId && item.type === 'folder')
                  : (pages || []).find(item => item.type === 'folder' && Array.isArray(item.pages) && item.pages.includes(currentPage?.id))
                return folder ? (
                  <span className={`ml-2 px-1.5 py-0.5 text-xs font-medium rounded-md flex-shrink-0 ${getFolderBadgeClasses()}`}>
                    {folder.emoji ? (
                      <span className="inline-block mr-1 text-xs">{folder.emoji}</span>
                    ) : (
                      <FolderIcon className="w-3 h-3 inline-block mr-1" />
                    )}
                    {truncateFolderName(folder.title || '')}
                  </span>
                ) : null
              })()}
              {currentPage && !currentPage.id?.startsWith('live-') && (
                <div className="flex items-center ml-2 space-x-1 flex-shrink-0">
                  <Tooltip text={currentPage.password?.hash && !tempUnlockedPages.has(currentPage.id) ? 'Unlock page' : 'Lock page'}>
                  <button
                    onClick={() => handleEncryptBadgeClick(currentPage)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${getButtonHoverClasses()}`}
                  >
                    {currentPage.password?.hash && !tempUnlockedPages.has(currentPage.id)
                      ? <LockKeyhole className="h-3.5 w-3.5 pointer-events-none" />
                      : <Unlock className="h-3.5 w-3.5 pointer-events-none" />
                    }
                  </button>
                  </Tooltip>
                  <Tooltip text={currentPage.selfDestructAt ? 'Cancel self-destruct' : 'Self-destruct'}>
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
                  >
                    {currentPage.selfDestructAt
                      ? <TimerOff className="h-3.5 w-3.5 pointer-events-none" />
                      : <Timer className="h-3.5 w-3.5 pointer-events-none" />
                    }
                  </button>
                  </Tooltip>
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
                  {activeSession && currentPage?.id === activeSession.pageId ? (
                    <LiveSessionChip
                      participants={participants}
                      status={sessionStatus}
                      onEnd={handleEndLiveSession}
                      theme={theme}
                      isHost={activeSession.isHost}
                      link={activeSession?.link}
                      typingPeers={remoteTyping}
                      duration={activeSession?.duration}
                      startedAt={activeSession?.startedAt}
                      peerColors={liveAllAvatarColors}
                      remoteCursors={remoteCursors}
                    />
                  ) : null}
                  {!currentPage.id?.startsWith('live-') && (
                    <>
                    <Tooltip text="Share encrypted note">
                    <button
                      onClick={async () => { if (window.__editorFlush) await window.__editorFlush(); setIsShareModalOpen(true) }}
                      className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                    >
                      <Share2 className="h-4 w-4 pointer-events-none" />
                    </button>
                    </Tooltip>
                    {shouldShowMobileInstall() && (
                      <Tooltip text="Use on your phone">
                      <button
                        onClick={() => setIsInstallModalOpen(true)}
                        className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                      >
                        <Smartphone className="h-4 w-4 pointer-events-none" />
                      </button>
                      </Tooltip>
                    )}
                    <Tooltip text={isImporting ? 'Importing…' : 'Import encrypted bundle'}>
                    <button
                      onClick={handleImportBundleClick}
                      className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                      disabled={isImporting}
                    >
                      <Import className={`h-4 w-4 pointer-events-none ${isImporting ? 'animate-pulse' : ''}`} />
                    </button>
                    </Tooltip>
                    </>
                  )}
                  <Tooltip text="Report a bug">
                  <button
                    onClick={() => {
                      window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer');
                    }}
                    className={`p-2 rounded-lg cursor-pointer ${getButtonHoverClasses()}`}
                  >
                    <Bug className="h-4 w-4 pointer-events-none" />
                  </button>
                  </Tooltip>
                  <Tooltip text={editRequests.length > 0 ? `${editRequests.length} edit request${editRequests.length > 1 ? 's' : ''}` : 'Check for updates'}>
                  <button
                    onClick={editRequests.length > 0 ? () => setIsLiveNotificationsOpen(!isLiveNotificationsOpen) : handleBellClick}
                    disabled={editRequests.length === 0 && !canCheckForUpdates}
                    className={`relative p-2 rounded-lg cursor-pointer ${getIconClasses()} ${getButtonHoverClasses()} ${editRequests.length === 0 && !canCheckForUpdates ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Bell className={`h-4 w-4 pointer-events-none ${isCheckingForUpdates ? 'animate-pulse' : ''}`} />
                    {(updateInfo?.available || editRequests.length > 0) && (
                      <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${editRequests.length > 0 ? 'bg-blue-500' : 'bg-red-500'} ${theme === 'dark' ? 'border border-[#0d0d0d]' : theme === 'darkblue' ? 'border border-[#0c1017]' : theme === 'fallout' ? 'border border-gray-900' : 'border border-white'} shadow-sm`}></span>
                    )}
                  </button>
                  </Tooltip>
                  <ThemeToggle className={`cursor-pointer ${getButtonHoverClasses()}`} />
                </>
              )}
            </div>
        </div>
        {currentPage.tagNames && currentPage.tagNames.length > 0 && !currentPage.id?.startsWith('live-') && (
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
        {(!currentPage.tagNames || currentPage.tagNames.length === 0) && !currentPage.id?.startsWith('live-') && (
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

        {/* Live Session Bar */}
        {/* Editor */ }
  <div className="flex-1 relative overflow-hidden">
  <div ref={editorScrollRef} className={`h-full overflow-auto p-6 ${getMainContentClasses()} ${focusMode ? 'focus-mode-scroll pt-16' : ''} ${currentPage && selfDestructingPages.has(currentPage.id) ? 'pointer-events-none' : ''}`}>
    <div className={`${focusMode ? 'max-w-2xl mx-auto w-full' : ''} ${focusMode && paragraphDimming ? 'paragraph-dimming' : ''} ${focusMode && typewriterMode ? 'pb-[50vh]' : ''}`}>
      {currentPage && (
        <div className="relative">
          {/* Read-only banner for guest live pages when session is not active */}
          {currentPage.id?.startsWith('live-') && !activeSession && (() => {
            const roomId = currentPage.id.replace('live-', '')
            let storedData = null
            try { const raw = localStorage.getItem('dash-live-page-' + roomId); if (raw) storedData = JSON.parse(raw) } catch { /* ignore */ }
            const isEnded = sessionEndedByHostRef.current || storedData?.sessionEnded

            const bannerCls = theme === 'fallout' ? 'bg-green-500/10 border border-green-500/20 text-green-400 font-mono'
              : theme === 'darkblue' ? 'bg-blue-500/5 border border-blue-500/10 text-[#8b99b5]'
              : theme === 'dark' ? 'bg-blue-500/5 border border-blue-500/10 text-[#8e8e8e]'
              : 'bg-blue-50 border border-blue-100 text-gray-500'
            const btnCls = theme === 'fallout' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : theme === 'darkblue' ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
              : theme === 'dark' ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
              : 'bg-blue-100 text-blue-600 hover:bg-blue-200'

            return (
              <div className={`flex items-center gap-2 px-4 py-2.5 mb-3 rounded-xl text-sm ${bannerCls}`}>
                <Shield className="w-4 h-4 flex-shrink-0 pointer-events-none" />
                <span className="flex-1">
                  {isEnded
                    ? 'Session ended — this is your copy now'
                    : 'Shared page from a live session'
                  }
                </span>
                {isEnded ? (
                  <button
                    onClick={() => {
                      // Convert to a normal page
                      const newId = crypto.randomUUID()
                      const adoptedPage = { ...currentPage, id: newId, tags: [], lastEdited: Date.now() }
                      setPages(prev => [adoptedPage, ...prev.filter(p => p.id !== currentPage.id)])
                      navigateToPage(adoptedPage)
                      try { localStorage.removeItem('dash-live-page-' + roomId) } catch { /* ignore */ }
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${btnCls}`}
                  >
                    Keep as My Page
                  </button>
                ) : storedData?.roomId && storedData?.keyStr && (
                  <button
                    onClick={() => {
                      joinLiveSessionAsGuest(storedData.roomId, storedData.keyStr)
                      if (rejoinTimeoutRef.current) clearTimeout(rejoinTimeoutRef.current)
                      rejoinTimeoutRef.current = setTimeout(() => {
                        if (!liveGuestSyncedRef.current) {
                          setLiveToast('Session no longer available — the host may have ended it')
                          if (liveToastTimerRef.current) clearTimeout(liveToastTimerRef.current)
                          liveToastTimerRef.current = setTimeout(() => setLiveToast(null), 4000)
                          handleEndLiveSession()
                          // Mark as ended so next render shows the right banner
                          sessionEndedByHostRef.current = true
                          try {
                            const stored = localStorage.getItem('dash-live-page-' + roomId)
                            if (stored) {
                              const data = JSON.parse(stored)
                              data.sessionEnded = true
                              localStorage.setItem('dash-live-page-' + roomId, JSON.stringify(data))
                            }
                          } catch { /* ignore */ }
                        }
                      }, 5000)
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${btnCls}`}
                  >
                    Rejoin
                  </button>
                )}
              </div>
            )
          })()}
          <EditorErrorBoundary>
            <DynamicEditor
              key={currentPage.id + '-' + editorReloadKey + '-' + aiReloadKey}
              data={currentPage.content}
              onChange={handleEditorChange}
              holder="editorjs"
              onPageLinkClick={handlePageLinkClick}
              liveUpdateKey={activeSession ? liveUpdateKey : undefined}
              readOnly={undefined}
            />
          </EditorErrorBoundary>
          {/* Remote cursor indicators — inside scroll container so they scroll with content */}
          {activeSession && currentPage?.id === activeSession.pageId && Object.entries(remoteCursors).map(([peerId, cursor]) => (
            <RemoteCursorIndicator key={peerId} blockIndex={cursor.blockIndex} color={cursor.color} alias={cursor.alias} />
          ))}
        </div>
      )}
    </div>
  </div>
  {currentPage && (
    <MiniOutline
      headings={outlineHeadings}
      isVisible={showMiniOutline && !focusMode && outlineHeadings.length > 0}
      theme={theme}
      scrollContainerRef={editorScrollRef}
    />
  )}
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
        <Tooltip text="Remove self-destruct timer">
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
        >
          <SelfDestructBadge selfDestructAt={currentPage.selfDestructAt} theme={theme} />
        </button>
        </Tooltip>
      )}
      <span
        onClick={() => { if (!currentPage?.id?.startsWith('live-') && !activeSession) setIsLiveSessionModalOpen(true) }}
        className={!currentPage?.id?.startsWith('live-') && !activeSession ? 'cursor-pointer' : ''}
      >{wordCount} words</span>
      <Tooltip text={showMiniOutline ? 'Hide contents' : 'Table of contents'}>
      <button
        onClick={toggleMiniOutline}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
          theme === 'fallout' ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30' :
          theme === 'dark' ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2a2a2a]' :
          theme === 'darkblue' ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#1c2438]' :
          'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        <List size={12} className="pointer-events-none" />
      </button>
      </Tooltip>
      <Tooltip text="Local AI">
      <button
        onClick={() => { setAiContextText(null); setIsAIPanelOpen(true) }}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
          theme === 'fallout' ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30' :
          theme === 'dark' ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2a2a2a]' :
          theme === 'darkblue' ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#1c2438]' :
          'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" className="pointer-events-none"><defs><filter id="fo-bl"><feGaussianBlur stdDeviation="2.5"/></filter></defs><clipPath id="fo-cp"><circle cx="12" cy="12" r="10"/></clipPath><g clipPath="url(#fo-cp)" filter="url(#fo-bl)"><circle cx="9" cy="9" r="8" fill="rgba(70,120,255,0.9)"/><circle cx="16" cy="10" r="7" fill="rgba(140,80,250,0.8)"/><circle cx="12" cy="16" r="6" fill="rgba(230,90,180,0.7)"/><circle cx="7" cy="14" r="6" fill="rgba(40,180,255,0.65)"/></g><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"/></svg>
      </button>
      </Tooltip>
      <div className="relative">
        <Tooltip text="Features">
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
        >
          <Sparkles size={12} className="pointer-events-none" />
        </button>
        </Tooltip>
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
      <Tooltip text="Keyboard shortcuts">
      <button
        onClick={() => setIsShortcutsModalOpen(true)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
          theme === 'fallout' ? 'text-green-600 hover:text-green-400 hover:bg-green-900/30' :
          theme === 'dark' ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2a2a2a]' :
          theme === 'darkblue' ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#1c2438]' :
          'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        <Keyboard size={12} className="pointer-events-none" />
      </button>
      </Tooltip>
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
        onClose={() => { setIsRenameModalOpen(false); setIsNewPageRename(false) }}
        onConfirm={confirmRename}
        title={newPageTitle}
        onTitleChange={setNewPageTitle}
        isNew={isNewPageRename}
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
        action={pageToAccess?.password?.hash ? (passwordAction === 'lock' ? 'access' : passwordAction) : passwordAction}
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

      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => {
          setIsVersionHistoryOpen(false)
          setVersionHistoryPage(null)
        }}
        page={versionHistoryPage}
        onRestore={handleRestoreVersion}
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

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        noteContent={currentPage?.content}
        noteTitle={currentPage?.title}
        theme={theme}
      />

      <LiveSessionModal
        isOpen={isLiveSessionModalOpen}
        onClose={() => setIsLiveSessionModalOpen(false)}
        onStartSession={handleStartLiveSession}
        theme={theme}
        participants={participants}
      />

      {/* Guest password prompt for password-protected sessions (fix 6) */}
      {passwordPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { passwordPrompt.resolve(null); setPasswordPrompt(null) } }}
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { passwordPrompt.resolve(null); setPasswordPrompt(null) }} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />
          <div
            style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
            className={`
              relative w-full max-w-sm rounded-2xl overflow-hidden
              ${theme === 'fallout'
                ? 'bg-gray-900 border-2 border-green-500/60'
                : theme === 'darkblue'
                  ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
                  : theme === 'dark'
                    ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
                    : 'bg-white border border-gray-200 shadow-2xl'
              }
            `}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${
                  theme === 'fallout' ? 'bg-green-500/20 text-green-400'
                    : theme === 'darkblue' ? 'bg-blue-500/20 text-blue-400'
                    : theme === 'dark' ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div>
                  <h3 className={`text-base font-semibold ${
                    theme === 'fallout' ? 'text-green-400 font-mono' : theme === 'darkblue' ? 'text-[#e0e6f0]' : theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>Password Required</h3>
                  <p className={`text-xs ${
                    theme === 'fallout' ? 'text-green-600 font-mono' : theme === 'darkblue' ? 'text-[#5d6b88]' : theme === 'dark' ? 'text-[#6b6b6b]' : 'text-gray-500'
                  }`}>This session is password-protected</p>
                </div>
              </div>
              {passwordPrompt.error && (
                <p className={`text-xs mb-3 ${
                  theme === 'fallout' ? 'text-red-400 font-mono' : 'text-red-500'
                }`}>{passwordPrompt.error}</p>
              )}
              <form onSubmit={(e) => {
                e.preventDefault()
                const pw = passwordPromptRef.current?.value || ''
                if (pw) {
                  passwordPrompt.resolve(pw)
                  if (passwordPromptRef.current) passwordPromptRef.current.value = ''
                }
              }}>
                <input
                  ref={passwordPromptRef}
                  type="password"
                  autoFocus
                  placeholder="Enter session password"
                  className={`
                    w-full px-3 py-2.5 rounded-lg text-sm mb-3 outline-none
                    ${theme === 'fallout'
                      ? 'bg-gray-800 border border-green-500/30 text-green-400 placeholder-green-700 font-mono focus:border-green-500/60'
                      : theme === 'darkblue'
                        ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#3d4f6f] focus:border-[#2a3555]'
                        : theme === 'dark'
                          ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] placeholder-[#555] focus:border-[#555]'
                          : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-gray-300'
                    }
                  `}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { passwordPrompt.resolve(null); setPasswordPrompt(null) }}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      theme === 'fallout'
                        ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
                        : theme === 'darkblue'
                          ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
                          : theme === 'dark'
                            ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      theme === 'fallout'
                        ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono'
                        : theme === 'darkblue' || theme === 'dark'
                          ? 'bg-blue-500 text-white hover:bg-blue-400'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <LiveNotificationsPanel
        isOpen={isLiveNotificationsOpen}
        onClose={() => setIsLiveNotificationsOpen(false)}
        theme={theme}
        onApproveRequest={(req) => {
          // Approve → start a new live session for the requested doc
          setIsLiveNotificationsOpen(false)
          if (req.pageId) {
            const page = pages.find(p => p.id === req.pageId)
            if (page) {
              setCurrentPage(page)
              setTimeout(() => setIsLiveSessionModalOpen(true), 100)
            }
          }
        }}
      />

      <DecoyVaultSetupModal
        isOpen={isDecoySetupOpen}
        onClose={() => setIsDecoySetupOpen(false)}
        theme={theme}
      />

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

      <AIPanel
        isOpen={isAIPanelOpen}
        onClose={() => { setIsAIPanelOpen(false); setAiContextText(null); setAiBlockIndex(null); setAiBlockId(null); setAiBlockIndices(null) }}
        theme={theme}
        currentPage={currentPage}
        contextText={aiContextText}
        blockIndex={aiBlockIndex}
        blockId={aiBlockId}
        blockIndices={aiBlockIndices}
        onInsertBlocks={handleAIInsertBlocks}
        canUndo={aiCanUndo}
        onUndo={handleAIUndo}
        onSaveAsNote={handleAISaveAsNote}
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
        onManageDecoy={() => setIsDecoySetupOpen(true)}
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