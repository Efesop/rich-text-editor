import { useEffect, useCallback, useRef } from 'react'

export function useKeyboardNavigation({
  onNewPage,
  onSavePage,
  onSearch,
  onToggleSidebar,
  onDeletePage,
  onDuplicatePage,
  onToggleFocusMode,
  onToggleQuickSwitcher,
  onLockApp,
  isLocked,
  isFocusMode,
  currentPage,
  pages,
  onSelectPage,
  onToggleShortcutsModal,
  onToggleAIPanel
}) {
  const currentPageIndexRef = useRef(0)

  // Update current page index when page changes
  useEffect(() => {
    if (currentPage && pages.length > 0) {
      const index = pages.findIndex(p => p.id === currentPage.id)
      if (index !== -1) {
        currentPageIndexRef.current = index
      }
    }
  }, [currentPage, pages])

  const handleKeyDown = useCallback((event) => {
    const { key, ctrlKey, metaKey, shiftKey, altKey } = event
    const isModifierPressed = ctrlKey || metaKey

    // When app is locked, only allow the lock shortcut (no-op since already locked)
    if (isLocked) return

    // Don't interfere when user is typing in inputs or editor
    const activeElement = document.activeElement
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true' ||
      activeElement.closest('.ce-block') ||
      activeElement.closest('[contenteditable="true"]')
    )

    // Escape exits focus mode regardless of where cursor is
    if (key === 'Escape' && isFocusMode) {
      event.preventDefault()
      onToggleFocusMode?.()
      return
    }

    // Global shortcuts that work even when typing
    if (isModifierPressed) {
      switch (key.toLowerCase()) {
        case 'n':
          event.preventDefault()
          onNewPage?.()
          break
        case 's':
          event.preventDefault()
          onSavePage?.()
          break
        case 'k':
          if (shiftKey) {
            event.preventDefault()
            onSearch?.()
          }
          break
        case 'b':
          if (shiftKey) {
            event.preventDefault()
            onToggleSidebar?.()
          }
          break
        case 'p':
          event.preventDefault()
          onToggleQuickSwitcher?.()
          break
        case 'f':
          if (shiftKey) {
            event.preventDefault()
            onToggleFocusMode?.()
          }
          break
        case 'l':
          if (shiftKey) {
            event.preventDefault()
            onLockApp?.()
          }
          break
        case 'd':
          if (shiftKey && currentPage) {
            event.preventDefault()
            onDuplicatePage?.(currentPage)
          }
          break
        case 'backspace':
          if (shiftKey && currentPage) {
            event.preventDefault()
            onDeletePage?.(currentPage)
          }
          break
        case 'a':
          if (shiftKey) {
            event.preventDefault()
            onToggleAIPanel?.()
          }
          break
      }
      return
    }

    // Navigation shortcuts (only when not typing)
    if (!isInputFocused) {
      switch (key) {
        case 'ArrowUp':
          if (altKey && pages.length > 0) {
            event.preventDefault()
            const prevIndex = Math.max(0, currentPageIndexRef.current - 1)
            const prevPage = pages[prevIndex]
            if (prevPage && prevPage.id !== currentPage?.id) {
              onSelectPage?.(prevPage)
            }
          }
          break
        case 'ArrowDown':
          if (altKey && pages.length > 0) {
            event.preventDefault()
            const nextIndex = Math.min(pages.length - 1, currentPageIndexRef.current + 1)
            const nextPage = pages[nextIndex]
            if (nextPage && nextPage.id !== currentPage?.id) {
              onSelectPage?.(nextPage)
            }
          }
          break
        case 'Home':
          if (altKey && pages.length > 0) {
            event.preventDefault()
            const firstPage = pages[0]
            if (firstPage && firstPage.id !== currentPage?.id) {
              onSelectPage?.(firstPage)
            }
          }
          break
        case 'End':
          if (altKey && pages.length > 0) {
            event.preventDefault()
            const lastPage = pages[pages.length - 1]
            if (lastPage && lastPage.id !== currentPage?.id) {
              onSelectPage?.(lastPage)
            }
          }
          break
        case 'Escape':
          if (activeElement && activeElement.blur) {
            activeElement.blur()
          }
          break
        case '/':
          event.preventDefault()
          onSearch?.()
          break
        case '?':
          event.preventDefault()
          onToggleShortcutsModal?.()
          break
      }
    }
  }, [
    onNewPage,
    onSavePage,
    onSearch,
    onToggleSidebar,
    onDeletePage,
    onDuplicatePage,
    onToggleFocusMode,
    onToggleQuickSwitcher,
    onLockApp,
    isLocked,
    isFocusMode,
    currentPage,
    pages,
    onSelectPage,
    onToggleShortcutsModal,
    onToggleAIPanel
  ])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return {
    shortcuts: {
      newPage: 'Ctrl+N',
      save: 'Ctrl+S',
      search: 'Ctrl+Shift+K or /',
      toggleSidebar: 'Ctrl+Shift+B',
      focusMode: 'Ctrl+Shift+F',
      lockApp: 'Ctrl+Shift+L',
      quickSwitcher: 'Ctrl+P',
      duplicate: 'Ctrl+Shift+D',
      delete: 'Ctrl+Shift+Backspace',
      navigateUp: 'Alt+↑',
      navigateDown: 'Alt+↓',
      firstPage: 'Alt+Home',
      lastPage: 'Alt+End',
      escape: 'Esc',
      shortcuts: '?',
      aiPanel: 'Ctrl+Shift+A'
    }
  }
}

// Custom hook for focus management in modals
export function useFocusTrap(isOpen, containerRef) {
  const firstFocusableRef = useRef(null)
  const lastFocusableRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    const firstFocusable = focusableElements[0]
    const lastFocusable = focusableElements[focusableElements.length - 1]

    firstFocusableRef.current = firstFocusable
    lastFocusableRef.current = lastFocusable

    // Focus the first element when modal opens
    if (firstFocusable) {
      firstFocusable.focus()
    }

    const handleTab = (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift+Tab - going backwards
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable?.focus()
        }
      } else {
        // Tab - going forwards
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleTab)
    
    return () => {
      container.removeEventListener('keydown', handleTab)
    }
  }, [isOpen, containerRef])

  return { firstFocusableRef, lastFocusableRef }
}

// Hook for managing screen reader announcements
export function useScreenReader() {
  const announcementRef = useRef(null)

  const announce = useCallback((message, priority = 'polite') => {
    if (!announcementRef.current) {
      // Create announcement element if it doesn't exist
      const element = document.createElement('div')
      element.setAttribute('aria-live', priority)
      element.setAttribute('aria-atomic', 'true')
      element.className = 'sr-only'
      element.style.position = 'absolute'
      element.style.left = '-10000px'
      element.style.width = '1px'
      element.style.height = '1px'
      element.style.overflow = 'hidden'
      document.body.appendChild(element)
      announcementRef.current = element
    }

    // Clear previous message and set new one
    announcementRef.current.textContent = ''
    setTimeout(() => {
      if (announcementRef.current) {
        announcementRef.current.textContent = message
      }
    }, 100)
  }, [])

  useEffect(() => {
    return () => {
      if (announcementRef.current) {
        document.body.removeChild(announcementRef.current)
      }
    }
  }, [])

  return announce
}

// Hook for skip navigation links
export function useSkipNavigation() {
  useEffect(() => {
    // Add skip navigation link if it doesn't exist
    let skipLink = document.getElementById('skip-to-main')
    
    if (!skipLink) {
      skipLink = document.createElement('a')
      skipLink.id = 'skip-to-main'
      skipLink.href = '#main-content'
      skipLink.textContent = 'Skip to main content'
      skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded'
      
      // Insert at the beginning of body
      document.body.insertBefore(skipLink, document.body.firstChild)
    }

    return () => {
      const existingSkipLink = document.getElementById('skip-to-main')
      if (existingSkipLink) {
        document.body.removeChild(existingSkipLink)
      }
    }
  }, [])
} 