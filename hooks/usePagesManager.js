import { useState, useEffect, useCallback, useRef } from 'react'
import { hashPassword, verifyPassword } from '@/utils/passwordUtils'
import { sanitizeEditorContent, validatePageStructure } from '@/utils/securityUtils'
import { deriveKeyFromPassphrase, encryptJsonWithKey, decryptJsonWithKey } from '@/utils/cryptoUtils'
import useTagStore from '../store/tagStore'
import { readPages, savePages as savePagesToFallback, saveDecoyPages } from '@/lib/storage'
import { encryptJsonWithPassphrase } from '@/utils/cryptoUtils'

// Debug logger: enable in browser console with window.__DASH_DEBUG = true
const dbg = (category, ...args) => {
  if (typeof window !== 'undefined' && window.__DASH_DEBUG) {
    console.log(`[${category}]`, ...args)
  }
}

export function usePagesManager() {
  const [pages, setPages] = useState([])
  const [currentPage, _setCurrentPage] = useState(null)
  const { tags, addTag, removeTag, updateTag } = useTagStore()
  const [saveStatus, setSaveStatus] = useState('saved')
  const [editorReloadKey, setEditorReloadKey] = useState(0)
  const [tempUnlockedPages, setTempUnlockedPages] = useState(new Set())
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [pageToAccess, setPageToAccess] = useState(null)

  // Refs to prevent race conditions and stale closures
  const pagesRef = useRef([])
  const currentPageRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const isInitializedRef = useRef(false)

  // Race condition protection: save queue and version tracking
  const saveInProgressRef = useRef(false)
  const pendingSaveRef = useRef(null)
  const saveVersionRef = useRef(0)

  // Encryption: cache derived keys for temp-unlocked pages (avoids slow PBKDF2 on every save)
  const encryptionKeysRef = useRef(new Map()) // pageId -> { key: CryptoKey, salt: Uint8Array }
  const tempUnlockedPagesRef = useRef(new Set())

  // App lock encryption: cached key for bulk encrypt/decrypt
  const appLockKeyRef = useRef(null) // { key: CryptoKey, salt: Uint8Array }

  // Duress hide mode: blocks ALL saves to prevent overwriting encrypted data on disk
  const savesBlockedRef = useRef(false)
  // Decoy vault mode: when true, saves go to decoy storage instead of real storage
  const isDuressModeRef = useRef(false)
  const duressKeyRef = useRef(null) // passphrase string for re-encrypting decoy saves

  // Update refs when state changes
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    tempUnlockedPagesRef.current = tempUnlockedPages
  }, [tempUnlockedPages])

  // Encrypt temp-unlocked pages before writing to storage
  const preparePagesForStorage = async (pages) => {
    const result = []
    for (const page of pages) {
      // If page is locked and temp-unlocked, encrypt content before saving
      if (page.password?.hash && tempUnlockedPagesRef.current.has(page.id)) {
        const keyData = encryptionKeysRef.current.get(page.id)
        if (keyData && page.content) {
          try {
            const encryptedContent = await encryptJsonWithKey(page.content, keyData.key, keyData.salt)
            result.push({ ...page, content: null, encryptedContent })
          } catch (error) {
            console.error('Failed to encrypt page for storage:', error)
            result.push(page) // Fallback: save as-is rather than lose data
          }
        } else {
          result.push(page)
        }
      } else {
        result.push(page)
      }
    }

    // App lock encryption: encrypt all non-individually-locked pages
    const appLockKey = appLockKeyRef.current
    if (appLockKey) {
      const encrypted = []
      for (const page of result) {
        // Skip folders, individually locked pages, and already app-lock-encrypted pages
        if (page.type === 'folder' || page.password?.hash || page.appLockEncrypted) {
          encrypted.push(page)
        } else if (page.content) {
          try {
            const encryptedContent = await encryptJsonWithKey(page.content, appLockKey.key, appLockKey.salt)
            encrypted.push({ ...page, content: null, encryptedContent, appLockEncrypted: true })
          } catch (error) {
            console.error('Failed to app-lock encrypt page:', page.id, error)
            encrypted.push(page) // Fallback: save plaintext
          }
        } else {
          encrypted.push(page)
        }
      }
      return encrypted
    }

    return result
  }

  // Execute the actual save operation with race condition protection
  const executeSave = useCallback(async (pagesToSave, version) => {
    // In decoy mode: save to decoy storage, encrypted with duress password
    if (isDuressModeRef.current && duressKeyRef.current) {
      dbg('save', 'decoy mode — saving to decoy storage')
      try {
        const encrypted = await encryptJsonWithPassphrase(pagesToSave, duressKeyRef.current)
        await saveDecoyPages(encrypted)
        if (version === saveVersionRef.current) {
          setPages(pagesRef.current)
          setSaveStatus('saved')
        }
      } catch (err) {
        dbg('save', 'decoy save error', err.message)
      }
      return
    }
    if (savesBlockedRef.current) {
      dbg('save', 'BLOCKED by duress mode, skipping disk write')
      return
    }
    try {
      // Encrypt temp-unlocked pages before writing to disk
      const pagesForStorage = await preparePagesForStorage(pagesToSave)

      if (typeof window !== 'undefined' && window.electron?.invoke) {
        await window.electron.invoke('save-pages', pagesForStorage)
      } else {
        await savePagesToFallback(pagesForStorage)
      }
      // Only mark as saved if this is still the latest version
      if (version === saveVersionRef.current) {
        dbg('save', 'disk write complete v' + version)
        // Sync React state after disk write — single batched re-render.
        // We defer this from savePage to avoid re-render during editing
        // which triggers EditorJS MutationObserver feedback loops.
        setPages(pagesRef.current)
        setSaveStatus('saved')
      }
    } catch (error) {
      console.error('Error saving pages:', error)
      dbg('save', 'ERROR v' + version, error.message)
      if (version === saveVersionRef.current) {
        setSaveStatus('error')
      }
      throw error
    }
  }, [])

  // Process the save queue - ensures saves happen sequentially
  const processSaveQueue = useCallback(async () => {
    if (saveInProgressRef.current) return
    if (!pendingSaveRef.current) return

    saveInProgressRef.current = true
    const { pages: pagesToSave, version } = pendingSaveRef.current
    pendingSaveRef.current = null

    try {
      await executeSave(pagesToSave, version)
    } catch (error) {
      // Retry once on failure with latest data
      try {
        await executeSave(pagesRef.current, saveVersionRef.current)
      } catch (retryError) {
        console.error('Save retry failed:', retryError)
      }
    } finally {
      saveInProgressRef.current = false
      // Process any pending saves that queued while we were saving
      if (pendingSaveRef.current) {
        processSaveQueue()
      }
    }
  }, [executeSave])

  // Debounced save function to prevent excessive saves
  // Note: updatedPages param kept for API compatibility but we always use pagesRef.current
  const savePagesToStorage = useCallback(async (_updatedPages) => {
    // Clear any pending debounce timer
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      dbg('save', 'debounce reset')
    }

    // Increment version to track save ordering
    saveVersionRef.current += 1
    const currentVersion = saveVersionRef.current

    dbg('save', 'queued v' + currentVersion)

    // Debounce: wait before actually saving to batch rapid updates
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving')
      dbg('save', 'debounce fired v' + currentVersion)
      // Always save the latest pages data, not stale closure data
      const pagesToSave = pagesRef.current

      // Queue the save with version tracking
      pendingSaveRef.current = { pages: pagesToSave, version: currentVersion }
      processSaveQueue()
    }, 150)
  }, [processSaveQueue])

  const fetchPages = useCallback(async () => {
    try {
      const data = await readPages()
      const validPages = Array.isArray(data) ? data : []
      dbg('pages', 'fetched', validPages.length, 'pages', validPages.filter(p => p.type === 'folder').length, 'folders')

      setPages(validPages)
      pagesRef.current = validPages

      if (validPages.length > 0 && !currentPageRef.current) {
        const firstPage = validPages[0]
        dbg('pages', 'selecting first page:', firstPage.title || firstPage.id)
        setCurrentPage(firstPage)
      } else if (validPages.length === 0) {
        dbg('pages', 'no pages found, creating initial page')
        const newPage = await createNewPage()
        setCurrentPage(newPage)
      }

      isInitializedRef.current = true
    } catch (error) {
      console.error('Error fetching pages:', error)
      dbg('pages', 'ERROR fetching:', error.message)
      const newPage = await createNewPage()
      setCurrentPage(newPage)
      isInitializedRef.current = true
    }
  }, [])

  const createNewPage = useCallback(async () => {
    dbg('pages', 'creating new page')
    const newPage = {
      id: crypto.randomUUID(), // More unique IDs
      title: 'New Page',
      content: {
        time: Date.now(),
        blocks: [],
        version: '2.30.6'
      },
      tags: [],
      tagNames: [],
      createdAt: new Date().toISOString(),
      password: null
    }

    const updatedPages = [newPage, ...pagesRef.current]
    setPages(updatedPages)
    pagesRef.current = updatedPages
    await savePagesToStorage(updatedPages)

    return newPage
  }, [savePagesToStorage])

  const handleNewPage = useCallback(async () => {
    const newPage = await createNewPage()
    setCurrentPage(newPage)
    return newPage
  }, [createNewPage])

  const lastSavedContentRef = useRef(null)

  const savePage = useCallback(async (pageContent) => {
    const currentPageData = currentPageRef.current
    if (!currentPageData || !pageContent) return
    // Block saves for pages that are self-destructing
    if (selfDestructingPagesRef.current.has(currentPageData.id)) return

    // Skip save if content hasn't structurally changed
    const contentStr = JSON.stringify(pageContent.blocks)
    if (contentStr === lastSavedContentRef.current) {
      dbg('save', 'skipped — content unchanged')
      return
    }
    lastSavedContentRef.current = contentStr

    try {
      // Sanitize the content before saving
      const sanitizedContent = sanitizeEditorContent(pageContent)

      const updatedPage = {
        ...currentPageData,
        content: sanitizedContent
      }

      // Validate the complete page structure
      const validation = validatePageStructure(updatedPage)
      if (!validation.isValid) {
        console.error('Page validation failed:', validation.errors)
        throw new Error('Invalid page data structure')
      }

      // Update pagesRef and queue disk save. We intentionally do NOT call
      // setPages or _setCurrentPage here — those cause React re-renders which
      // trigger EditorJS's MutationObserver, firing onChange again.
      // Instead, pagesRef is the source of truth during edits.
      // lockPage/unlockPage read from pagesRef for latest content.
      const currentPages = pagesRef.current
      if (!currentPages.find(p => p.id === validation.sanitized.id)) return

      const newPages = currentPages.map(p =>
        p.id === validation.sanitized.id ? validation.sanitized : p
      )
      pagesRef.current = newPages
      currentPageRef.current = validation.sanitized
      savePagesToStorage(newPages)
    } catch (error) {
      console.error('Error saving page:', error)
      // Show user-friendly error message
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('saved'), 3000)
    }
  }, [savePagesToStorage])

  const deletePage = useCallback(async (pageToDelete) => {
    dbg('pages', 'deleting:', pageToDelete.title || pageToDelete.id, pageToDelete.type === 'folder' ? '(folder)' : '')
    setPages(prevPages => {
      let updatedPages = prevPages.filter(p => p.id !== pageToDelete.id)

      // Handle folder cleanup
      if (pageToDelete.folderId) {
        updatedPages = updatedPages.map(item => {
          if (item.id === pageToDelete.folderId && item.type === 'folder') {
            return {
              ...item,
              pages: (Array.isArray(item.pages) ? item.pages : []).filter(pageId => pageId !== pageToDelete.id)
            }
          }
          return item
        })
      }

      // Ensure we always have at least one page
      if (updatedPages.filter(p => p.type !== 'folder').length === 0) {
        const defaultPage = {
          id: crypto.randomUUID(),
          title: 'New Page',
          content: { time: Date.now(), blocks: [], version: '2.30.6' },
          tags: [],
          tagNames: [],
          createdAt: new Date().toISOString(),
          password: null
        }
        updatedPages.push(defaultPage)
      }

      pagesRef.current = updatedPages
      savePagesToStorage(updatedPages)
      return updatedPages
    })

    // Handle current page cleanup
    if (currentPageRef.current?.id === pageToDelete.id) {
      const remainingPages = (Array.isArray(pagesRef.current) ? pagesRef.current : []).filter(p => p.type !== 'folder')
      setCurrentPage(remainingPages[0] || null)
    }
  }, [savePagesToStorage])

  const renamePage = useCallback(async (pageToRename, newTitle) => {
    if (!pageToRename || !newTitle || newTitle === pageToRename.title) return

    const trimmedTitle = newTitle.slice(0, 50) // Reasonable title length limit
    const updatedPage = { ...pageToRename, title: trimmedTitle }

    setPages(prevPages => {
      const newPages = prevPages.map(p =>
        p.id === pageToRename.id ? updatedPage : p
      )
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current?.id === pageToRename.id) {
      _setCurrentPage(updatedPage)
    }
  }, [savePagesToStorage])

  const lockPage = useCallback(async (page, password) => {
    if (!page || !password) return false
    dbg('encrypt', 'locking page:', page.title || page.id)

    try {
      const hashedPassword = await hashPassword(password)

      // Derive encryption key and cache it for auto-save re-encryption
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const key = await deriveKeyFromPassphrase(password, salt)
      encryptionKeysRef.current.set(page.id, { key, salt })

      // Keep plaintext in memory, mark as temp-unlocked so user can keep editing
      // The save pipeline will encrypt before writing to disk
      // Use pagesRef to get latest content (savePage updates ref before React state)
      const latestPage = pagesRef.current.find(p => p.id === page.id) || page
      const updatedPage = { ...latestPage, password: { hash: hashedPassword } }
      setTempUnlockedPages(prev => new Set(prev).add(page.id))

      setPages(prevPages => {
        const newPages = prevPages.map(p =>
          p.id === updatedPage.id ? updatedPage : p
        )
        pagesRef.current = newPages
        savePagesToStorage(newPages)
        return newPages
      })

      if (currentPageRef.current?.id === page.id) {
        _setCurrentPage(updatedPage)
      }

      return true
    } catch (error) {
      console.error('Error locking page:', error)
      return false
    }
  }, [savePagesToStorage])

  const unlockPage = useCallback(async (page, password, temporary = false) => {
    if (!page?.password?.hash || !password) return false
    dbg('encrypt', 'unlocking page:', page.title || page.id, temporary ? '(temp)' : '(permanent)')

    try {
      const isPasswordCorrect = await verifyPassword(password, page.password.hash)
      if (!isPasswordCorrect) {
        dbg('encrypt', 'wrong password for:', page.title || page.id)
        return false
      }

      // Decrypt content if encrypted, or use plaintext for legacy pages
      let decryptedContent
      if (page.encryptedContent) {
        const salt = new Uint8Array(page.encryptedContent.salt)
        const key = await deriveKeyFromPassphrase(password, salt)
        decryptedContent = await decryptJsonWithKey(page.encryptedContent, key)
        // Cache key for auto-save re-encryption
        encryptionKeysRef.current.set(page.id, { key, salt })
      } else {
        // Legacy page: content is plaintext, generate key for future encryption
        decryptedContent = page.content
        const salt = crypto.getRandomValues(new Uint8Array(16))
        const key = await deriveKeyFromPassphrase(password, salt)
        encryptionKeysRef.current.set(page.id, { key, salt })
      }

      if (temporary) {
        // Temp unlock: update in-memory state with decrypted content, don't save to storage
        setTempUnlockedPages(prev => new Set(prev).add(page.id))
        const updatedPage = { ...page, content: decryptedContent }
        setPages(prevPages => {
          const newPages = prevPages.map(p =>
            p.id === updatedPage.id ? updatedPage : p
          )
          pagesRef.current = newPages
          // Don't call savePagesToStorage — content is decrypted in memory only
          return newPages
        })
        _setCurrentPage(updatedPage)
      } else {
        // Permanent unlock: remove encryption, save plaintext to storage
        const updatedPage = { ...page, content: decryptedContent }
        delete updatedPage.password
        delete updatedPage.encryptedContent
        encryptionKeysRef.current.delete(page.id)

        setTempUnlockedPages(prev => {
          const next = new Set(prev)
          next.delete(page.id)
          return next
        })

        setPages(prevPages => {
          const newPages = prevPages.map(p =>
            p.id === updatedPage.id ? updatedPage : p
          )
          pagesRef.current = newPages
          savePagesToStorage(newPages)
          return newPages
        })
        _setCurrentPage(updatedPage)
      }

      return true
    } catch (error) {
      console.error('Error unlocking page:', error)
      return false
    }
  }, [savePagesToStorage])

  const removeLockFromUnlockedPage = useCallback((pageId) => {
    if (!pageId || !tempUnlockedPagesRef.current.has(pageId)) return false

    // Page is already decrypted in memory — just strip password fields and save
    setTempUnlockedPages(prev => {
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })

    encryptionKeysRef.current.delete(pageId)

    setPages(prevPages => {
      const newPages = prevPages.map(p => {
        if (p.id === pageId) {
          const updated = { ...p }
          delete updated.password
          delete updated.encryptedContent
          return updated
        }
        return p
      })
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    // Update currentPage if it's the same page
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => {
        const updated = { ...prev }
        delete updated.password
        delete updated.encryptedContent
        return updated
      })
    }

    return true
  }, [savePagesToStorage])

  const addTagToPage = useCallback(async (pageId, tag) => {
    if (!pageId || !tag?.name) return

    const trimmedTag = { ...tag, name: tag.name.slice(0, 15) }
    addTag(trimmedTag)

    setPages(prevPages => {
      const newPages = prevPages.map(page => {
        if (page.id === pageId) {
          const currentTagNames = page.tagNames || []
          if (!currentTagNames.includes(trimmedTag.name)) {
            return {
              ...page,
              tagNames: [...currentTagNames, trimmedTag.name]
            }
          }
        }
        return page
      })

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prevPage => {
        const currentTagNames = prevPage.tagNames || []
        if (!currentTagNames.includes(trimmedTag.name)) {
          return {
            ...prevPage,
            tagNames: [...currentTagNames, trimmedTag.name]
          }
        }
        return prevPage
      })
    }
  }, [addTag, savePagesToStorage])

  const removeTagFromPage = useCallback(async (pageId, tagName) => {
    if (!pageId || !tagName) return

    setPages(prevPages => {
      const newPages = prevPages.map(page => {
        if (page.id === pageId) {
          return {
            ...page,
            tagNames: (page.tagNames || []).filter(t => t !== tagName)
          }
        }
        return page
      })

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: (prevPage.tagNames || []).filter(t => t !== tagName)
      }))
    }
  }, [savePagesToStorage])

  const deleteTagFromAllPages = useCallback(async (tagName) => {
    if (!tagName) return

    setPages(prevPages => {
      const newPages = prevPages.map(page => ({
        ...page,
        tagNames: (page.tagNames || []).filter(t => t !== tagName)
      }))

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current) {
      _setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: (prevPage.tagNames || []).filter(t => t !== tagName)
      }))
    }

    removeTag(tagName)
  }, [removeTag, savePagesToStorage])

  const setCurrentPage = useCallback((page) => {
    if (!page) return
    dbg('nav', 'setCurrentPage:', page.title || page.id, page.password ? '(locked)' : '')
    lastSavedContentRef.current = null // Reset dedup on page switch

    // Note: We no longer clear temp unlocks on page switch.
    // Temp unlocks persist for the session, cleared only on:
    // 1. Page refresh/close (natural state reset)
    // 2. Explicitly re-locking a page via lockPage()

    if (page.password && !tempUnlockedPages.has(page.id)) {
      dbg('nav', 'page is locked, showing password modal')
      setPageToAccess(page)
      setIsPasswordModalOpen(true)
    } else {
      // Use pagesRef for latest content (savePage updates ref before React state)
      const latest = pagesRef.current.find(p => p.id === page.id) || page
      _setCurrentPage(latest)
    }
  }, [tempUnlockedPages])

  // Direct page navigation that bypasses lock checks.
  // Use after successful unlock (password or biometric) when the page
  // is already verified/decrypted but tempUnlockedPages may not be flushed yet.
  const navigateToPage = useCallback((page) => {
    if (page) _setCurrentPage(page)
  }, [])

  const updateTagInPages = useCallback(async (oldName, updatedTag) => {
    if (!oldName || !updatedTag?.name) return

    setPages(prevPages => {
      const newPages = prevPages.map(page => ({
        ...page,
        tagNames: (page.tagNames || []).map(tagName =>
          tagName === oldName ? updatedTag.name : tagName
        )
      }))

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current) {
      _setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: (prevPage.tagNames || []).map(tagName =>
          tagName === oldName ? updatedTag.name : tagName
        )
      }))
    }

    updateTag(oldName, updatedTag)
  }, [updateTag, savePagesToStorage])

  // Folder management functions
  const createFolder = useCallback(async (folderName) => {
    if (!folderName) return

    const newFolder = {
      id: crypto.randomUUID(),
      title: folderName.slice(0, 30),
      type: 'folder',
      pages: [],
      createdAt: new Date().toISOString()
    }

    setPages(prevPages => {
      const newPages = [newFolder, ...prevPages]
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })
  }, [savePagesToStorage])

  const deleteFolder = useCallback(async (folderId) => {
    if (!folderId) return

    // Check if currentPage is in this folder before deleting
    const currentPageInFolder = currentPageRef.current?.folderId === folderId

    setPages(prevPages => {
      const folderToDelete = prevPages.find(item => item.id === folderId && item.type === 'folder')

      if (folderToDelete) {
        // Move pages out of folder before deleting
        const folderPages = Array.isArray(folderToDelete.pages) ? folderToDelete.pages : []
        const updatedPages = prevPages.map(item => {
          if (folderPages.includes(item.id)) {
            const { folderId: _, ...pageWithoutFolder } = item
            return pageWithoutFolder
          }
          return item
        }).filter(item => item.id !== folderId)

        pagesRef.current = updatedPages
        savePagesToStorage(updatedPages)
        return updatedPages
      }

      return prevPages
    })

    // Update currentPage if it was in the deleted folder
    if (currentPageInFolder) {
      _setCurrentPage(prev => {
        const { folderId: _, ...pageWithoutFolder } = prev
        return pageWithoutFolder
      })
    }
  }, [savePagesToStorage])

  const addPageToFolder = useCallback(async (pageId, folderId) => {
    if (!pageId || !folderId) return

    setPages(prevPages => {
      const newPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          const existing = Array.isArray(item.pages) ? item.pages : []
          const updatedPages = [...new Set([...existing, pageId])]
          return { ...item, pages: updatedPages }
        }
        if (item.id === pageId && item.type !== 'folder') {
          return { ...item, folderId }
        }
        return item
      })

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    // Update currentPage if it's the one being added to folder
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => ({ ...prev, folderId }))
    }
  }, [savePagesToStorage])

  const movePageToFolder = useCallback(async (pageId, targetFolderId) => {
    if (!pageId || !targetFolderId) return

    setPages(prevPages => {
      const page = prevPages.find(p => p.id === pageId)
      if (!page) return prevPages

      const oldFolderId = page.folderId

      const newPages = prevPages.map(item => {
        // Remove page from old folder's pages array
        if (oldFolderId && item.id === oldFolderId && item.type === 'folder') {
          const currentPages = Array.isArray(item.pages) ? item.pages : []
          return { ...item, pages: currentPages.filter(id => id !== pageId) }
        }
        // Add page to new folder's pages array
        if (item.id === targetFolderId && item.type === 'folder') {
          const existing = Array.isArray(item.pages) ? item.pages : []
          return { ...item, pages: [...new Set([...existing, pageId])] }
        }
        // Update the page's folderId
        if (item.id === pageId && item.type !== 'folder') {
          return { ...item, folderId: targetFolderId }
        }
        return item
      })

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    // Update currentPage if it's the one being moved
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => ({ ...prev, folderId: targetFolderId }))
    }
  }, [savePagesToStorage])

  const removePageFromFolder = useCallback(async (pageId, folderId) => {
    if (!pageId || !folderId) return

    setPages(prevPages => {
      const newPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          const currentPages = Array.isArray(item.pages) ? item.pages : []
          return { ...item, pages: currentPages.filter(id => id !== pageId) }
        }
        if (item.id === pageId) {
          const { folderId: _, ...pageWithoutFolder } = item
          return pageWithoutFolder
        }
        return item
      })

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    // Update currentPage if it's the one being removed from folder
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => {
        const { folderId: _, ...pageWithoutFolder } = prev
        return pageWithoutFolder
      })
    }
  }, [savePagesToStorage])

  const renameFolder = useCallback(async (folderId, newName) => {
    if (!folderId || !newName) return

    setPages(prevPages => {
      const newPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          return { ...item, title: newName.slice(0, 30) }
        }
        return item
      })

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })
  }, [savePagesToStorage])

  const handleDuplicatePage = useCallback(async (page) => {
    if (!page) return

    const newPage = {
      ...page,
      id: crypto.randomUUID(),
      title: `${page.title} (Copy)`,
      createdAt: new Date().toISOString(),
    }

    setPages(prevPages => {
      let newPages = [...prevPages]
      const pageIndex = newPages.findIndex(p => p.id === page.id)

      if (pageIndex !== -1) {
        newPages.splice(pageIndex + 1, 0, newPage)
      } else {
        newPages.unshift(newPage)
      }

      // Handle folder membership
      if (page.folderId) {
        const folderIndex = newPages.findIndex(item =>
          item.id === page.folderId && item.type === 'folder'
        )
        if (folderIndex !== -1) {
          newPages[folderIndex] = {
            ...newPages[folderIndex],
            pages: [...newPages[folderIndex].pages, newPage.id]
          }
        }
        newPage.folderId = page.folderId
      }

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    setCurrentPage(newPage)
  }, [savePagesToStorage, setCurrentPage])

  const reorderItems = useCallback((activeId, overId) => {
    setPages(prevPages => {
      const newPages = [...prevPages]
      const oldIndex = newPages.findIndex(p => p.id === activeId)
      const newIndex = newPages.findIndex(p => p.id === overId)
      if (oldIndex === -1 || newIndex === -1) return prevPages
      const [moved] = newPages.splice(oldIndex, 1)
      newPages.splice(newIndex, 0, moved)
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })
  }, [savePagesToStorage])

  const reorderWithinFolder = useCallback((folderId, activeId, overId) => {
    setPages(prevPages => {
      const newPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          const folderPages = Array.isArray(item.pages) ? [...item.pages] : []
          const oldIdx = folderPages.indexOf(activeId)
          const newIdx = folderPages.indexOf(overId)
          if (oldIdx !== -1 && newIdx !== -1) {
            const [moved] = folderPages.splice(oldIdx, 1)
            folderPages.splice(newIdx, 0, moved)
            return { ...item, pages: folderPages }
          }
        }
        return item
      })
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })
  }, [savePagesToStorage])

  const persistPages = useCallback(() => {
    savePagesToStorage(pagesRef.current)
  }, [savePagesToStorage])

  const wipeAllPages = useCallback(() => {
    setPages([])
    pagesRef.current = []
    _setCurrentPage(null)
    // Wipe must save immediately, bypassing debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = null
    saveVersionRef.current += 1
    executeSave([], saveVersionRef.current)
  }, [executeSave])

  // Duress hide mode: clear UI state but preserve encrypted data on disk
  // CRITICAL: blocks ALL future saves so disk data is never overwritten
  // If decoyPages provided, shows them instead of empty app (plausible deniability)
  const enterDuressHideMode = useCallback((decoyPages = null, duressPassword = null) => {
    dbg('duress', 'ENTERING duress hide mode — blocking real saves')
    // Block all real saves FIRST, before anything else
    savesBlockedRef.current = true
    // Cancel any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    pendingSaveRef.current = null
    // Clear encryption keys so nothing can re-encrypt real data
    appLockKeyRef.current = null
    encryptionKeysRef.current.clear()

    if (decoyPages && decoyPages.length > 0 && duressPassword) {
      // Decoy vault mode: show fake notes, allow edits to decoy storage
      dbg('duress', 'loading', decoyPages.length, 'decoy pages')
      isDuressModeRef.current = true
      duressKeyRef.current = duressPassword
      setPages(decoyPages)
      pagesRef.current = decoyPages
      if (decoyPages.length > 0) {
        _setCurrentPage(decoyPages[0])
      }
    } else {
      // Classic hide mode: empty app
      setPages([])
      pagesRef.current = []
      _setCurrentPage(null)
    }
  }, [])

  // Recover from duress hide mode: unblock saves and reload pages from disk
  // Only reloads if duress mode is active (savesBlockedRef), otherwise no-op
  const recoverFromDuressMode = useCallback(async () => {
    if (!savesBlockedRef.current && !isDuressModeRef.current) return false
    dbg('duress', 'RECOVERING from duress — unblocking saves, reloading from disk')
    savesBlockedRef.current = false
    isDuressModeRef.current = false
    duressKeyRef.current = null
    const data = await readPages()
    const validPages = Array.isArray(data) ? data : []
    dbg('duress', 'recovered', validPages.length, 'pages from disk')
    setPages(validPages)
    pagesRef.current = validPages
    return true
  }, [])

  // Move a page between containers (folder↔root, folder↔folder)
  const movePageToContainer = useCallback((pageId, fromContainer, toContainer, nearItemId) => {
    setPages(prevPages => {
      let newPages = [...prevPages]

      // Remove from old folder's pages array
      if (fromContainer !== 'root') {
        newPages = newPages.map(item => {
          if (item.id === fromContainer && item.type === 'folder') {
            return { ...item, pages: (Array.isArray(item.pages) ? item.pages : []).filter(id => id !== pageId) }
          }
          return item
        })
      }

      // Add to new folder's pages array
      if (toContainer !== 'root') {
        newPages = newPages.map(item => {
          if (item.id === toContainer && item.type === 'folder') {
            const fp = (Array.isArray(item.pages) ? item.pages : []).filter(id => id !== pageId)
            return { ...item, pages: [...fp, pageId] }
          }
          return item
        })
      }

      // Update the page's folderId
      newPages = newPages.map(item => {
        if (item.id === pageId) {
          if (toContainer === 'root') {
            const { folderId: _, ...rest } = item
            return rest
          }
          return { ...item, folderId: toContainer }
        }
        return item
      })

      // Position near the target item in flat array (for root placement)
      if (toContainer === 'root' && nearItemId) {
        const pageIdx = newPages.findIndex(p => p.id === pageId)
        const nearIdx = newPages.findIndex(p => p.id === nearItemId)
        if (pageIdx !== -1 && nearIdx !== -1) {
          const [moved] = newPages.splice(pageIdx, 1)
          newPages.splice(nearIdx, 0, moved)
        }
      }

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })
  }, [savePagesToStorage])

  // Import pages from an encrypted bundle (merges with existing)
  const importPages = useCallback(async (importedItems) => {
    if (!Array.isArray(importedItems) || importedItems.length === 0) return

    // Sanitize imported items before merging
    const sanitizedItems = importedItems.map(item => {
      if (item.type === 'folder' || !item.content?.blocks) return item
      return { ...item, content: sanitizeEditorContent(item.content) }
    })

    setPages(prevPages => {
      // Merge: imported items overwrite existing items with same ID
      const map = new Map(prevPages.map(item => [item.id, item]))
      sanitizedItems.forEach(item => {
        map.set(item.id, item)
      })
      const newPages = Array.from(map.values())

      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    // Update currentPage if it was overwritten by import
    if (currentPageRef.current) {
      const importedCurrent = sanitizedItems.find(item => item.id === currentPageRef.current.id)
      if (importedCurrent) {
        _setCurrentPage(importedCurrent)
      }
    }
  }, [savePagesToStorage])

  // Self-destruct: set a timer on a page
  const setSelfDestruct = useCallback((pageId, durationMs) => {
    if (!pageId || !durationMs) return
    const selfDestructAt = Date.now() + durationMs

    setPages(prevPages => {
      const newPages = prevPages.map(p =>
        p.id === pageId ? { ...p, selfDestructAt } : p
      )
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => ({ ...prev, selfDestructAt }))
    }
  }, [savePagesToStorage])

  // Self-destruct: cancel timer
  const cancelSelfDestruct = useCallback((pageId) => {
    if (!pageId) return

    setPages(prevPages => {
      const newPages = prevPages.map(p => {
        if (p.id === pageId) {
          const { selfDestructAt: _, ...rest } = p
          return rest
        }
        return p
      })
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => {
        const { selfDestructAt: _, ...rest } = prev
        return rest
      })
    }
  }, [savePagesToStorage])

  // App lock encryption: decrypt all app-lock-encrypted pages after unlock
  const decryptAllAppLockPages = useCallback(async (key, salt) => {
    appLockKeyRef.current = { key, salt }
    const currentPages = pagesRef.current
    const hasAppLockPages = currentPages.some(p => p.appLockEncrypted && p.encryptedContent)
    dbg('applock', 'decrypting all pages, encrypted count:', currentPages.filter(p => p.appLockEncrypted).length)
    if (!hasAppLockPages) {
      dbg('applock', 'no encrypted pages to decrypt')
      return
    }

    const decrypted = []
    for (const page of currentPages) {
      if (page.appLockEncrypted && page.encryptedContent) {
        try {
          const content = await decryptJsonWithKey(page.encryptedContent, key)
          const { appLockEncrypted: _, encryptedContent: __, ...rest } = page
          decrypted.push({ ...rest, content })
        } catch (err) {
          console.error('Failed to decrypt app-lock page:', page.id, err)
          decrypted.push(page) // Keep encrypted on failure
        }
      } else {
        decrypted.push(page)
      }
    }
    dbg('applock', 'decrypted', decrypted.filter(p => p.content).length, 'pages successfully')
    setPages(decrypted)
    pagesRef.current = decrypted
    // Update currentPage with decrypted content and bump editorReloadKey
    // to force editor remount (same page ID won't remount via key alone)
    if (currentPageRef.current) {
      const updated = decrypted.find(p => p.id === currentPageRef.current.id)
      if (updated) {
        _setCurrentPage(updated)
        setEditorReloadKey(k => k + 1)
      }
    } else if (decrypted.length > 0) {
      const firstPage = decrypted.find(p => p.type !== 'folder') || decrypted[0]
      dbg('applock', 'selecting first page after recovery:', firstPage.title || firstPage.id)
      _setCurrentPage(firstPage)
    }
  }, [])

  // App lock encryption: encrypt all pages and clear plaintext from memory
  const encryptAndClearAppLockPages = useCallback(async () => {
    const appLockKey = appLockKeyRef.current
    if (!appLockKey) return
    dbg('applock', 'encrypting all pages for lock')

    // Flush: cancel any pending debounce and save immediately
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    // Wait for any in-progress save to finish before we save
    while (saveInProgressRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    saveVersionRef.current += 1
    await executeSave(pagesRef.current, saveVersionRef.current)

    // Clear plaintext from in-memory state
    const encrypted = []
    for (const page of pagesRef.current) {
      if (page.type === 'folder' || page.password?.hash || page.appLockEncrypted) {
        encrypted.push(page)
      } else if (page.content) {
        try {
          const encryptedContent = await encryptJsonWithKey(page.content, appLockKey.key, appLockKey.salt)
          encrypted.push({ ...page, content: null, encryptedContent, appLockEncrypted: true })
        } catch (err) {
          console.error('Failed to encrypt page for lock:', page.id, err)
          encrypted.push(page)
        }
      } else {
        encrypted.push(page)
      }
    }
    setPages(encrypted)
    pagesRef.current = encrypted
    appLockKeyRef.current = null
  }, [executeSave])

  // App lock encryption: re-encrypt all pages with a new key (password change)
  const reEncryptAppLockPages = useCallback(async (newKey, newSalt) => {
    appLockKeyRef.current = { key: newKey, salt: newSalt }
    // Pages are already decrypted in memory (user is unlocked)
    // Just save — preparePagesForStorage will encrypt with the new key
    await savePagesToStorage(pagesRef.current)
  }, [savePagesToStorage])

  // App lock encryption: remove all app-lock encryption (disable app lock)
  const removeAppLockEncryption = useCallback(async () => {
    // Pages should already be decrypted in memory
    const cleaned = pagesRef.current.map(p => {
      if (p.appLockEncrypted) {
        const { appLockEncrypted: _, ...rest } = p
        return rest
      }
      return p
    })
    appLockKeyRef.current = null
    setPages(cleaned)
    pagesRef.current = cleaned
    await savePagesToStorage(cleaned)
  }, [savePagesToStorage])

  // Self-destruct: track pages currently animating out
  const [selfDestructingPages, setSelfDestructingPages] = useState(new Set())
  const selfDestructingPagesRef = useRef(new Set())

  const completeSelfDestruct = useCallback((pageId) => {
    selfDestructingPagesRef.current.delete(pageId)
    setSelfDestructingPages(prev => {
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })
    // Navigate away first if we're viewing this page, so the editor doesn't show stale content
    if (currentPageRef.current?.id === pageId) {
      const remaining = pagesRef.current.filter(p => p.type !== 'folder' && p.id !== pageId)
      if (remaining.length > 0) {
        setCurrentPage(remaining[0])
      }
    }
    const page = pagesRef.current.find(p => p.id === pageId)
    if (page) deletePage(page)
  }, [deletePage, setCurrentPage])

  // Self-destruct: check for expired pages every 5 seconds
  useEffect(() => {
    const checkExpired = () => {
      const now = Date.now()
      const expired = pagesRef.current.filter(
        p => p.selfDestructAt && p.selfDestructAt <= now && p.type !== 'folder'
      )
      expired.forEach(page => {
        if (!selfDestructingPagesRef.current.has(page.id)) {
          // Wait 2s after expiry so "Expired" badge is visible, then start dissolve
          const elapsed = now - page.selfDestructAt
          if (elapsed < 2000) return

          selfDestructingPagesRef.current.add(page.id)
          setSelfDestructingPages(prev => {
            const next = new Set(prev)
            next.add(page.id)
            return next
          })

          // For pages not being viewed, delete after sidebar dissolve animation (800ms)
          if (currentPageRef.current?.id !== page.id) {
            setTimeout(() => {
              selfDestructingPagesRef.current.delete(page.id)
              setSelfDestructingPages(prev => {
                const next = new Set(prev)
                next.delete(page.id)
                return next
              })
              deletePage(page)
            }, 900)
          }
        }
      })
    }

    const interval = setInterval(checkExpired, 1000)
    return () => clearInterval(interval)
  }, [deletePage])

  // Initialize on mount
  useEffect(() => {
    if (!isInitializedRef.current) {
      fetchPages()
    }
  }, [fetchPages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
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
    removeLockFromUnlockedPage,
    fetchPages,
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
    wipeAllPages,
    enterDuressHideMode,
    recoverFromDuressMode,
    movePageToContainer,
    setSelfDestruct,
    cancelSelfDestruct,
    navigateToPage,
    selfDestructingPages,
    completeSelfDestruct,
    editorReloadKey,
    decryptAllAppLockPages,
    encryptAndClearAppLockPages,
    reEncryptAppLockPages,
    removeAppLockEncryption,
  }
}