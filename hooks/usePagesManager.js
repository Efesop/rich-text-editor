import { useState, useEffect, useCallback, useRef } from 'react'
import { hashPassword, verifyPassword } from '@/utils/passwordUtils'
import { sanitizeEditorContent, validatePageStructure } from '@/utils/securityUtils'
import useTagStore from '../store/tagStore'
import { readPages, savePages as savePagesToFallback } from '@/lib/persistentStorage'

export function usePagesManager() {
  const [pages, setPages] = useState([])
  const [currentPage, _setCurrentPage] = useState(null)
  const { tags, addTag, removeTag, updateTag } = useTagStore()
  const [saveStatus, setSaveStatus] = useState('saved')
  const [tempUnlockedPages, setTempUnlockedPages] = useState(new Set())
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [pageToAccess, setPageToAccess] = useState(null)
  
  // Refs to prevent race conditions and stale closures
  const pagesRef = useRef([])
  const currentPageRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const isInitializedRef = useRef(false)

  // Update refs when state changes
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  // Debounced save function to prevent excessive saves
  const savePagesToStorage = useCallback(async (updatedPages) => {
    // Clear any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setSaveStatus('saving')
    
    // Debounce the actual save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Use the latest pages if no specific pages provided
        const pagesToSave = updatedPages || pagesRef.current
        if (typeof window !== 'undefined' && window.electron?.invoke) {
          await window.electron.invoke('save-pages', pagesToSave)
        } else {
          await savePagesToFallback(pagesToSave)
        }
        setSaveStatus('saved')
      } catch (error) {
        console.error('Error saving pages:', error)
        setSaveStatus('error')
        // Retry once after a delay
        setTimeout(() => {
          const toSave = updatedPages || pagesRef.current
          const op = (typeof window !== 'undefined' && window.electron?.invoke)
            ? window.electron.invoke('save-pages', toSave)
            : savePagesToFallback(toSave)
          Promise.resolve(op)
            .then(() => setSaveStatus('saved'))
            .catch(() => setSaveStatus('error'))
        }, 1000)
      }
    }, 150) // Short debounce to batch rapid updates
  }, [])

  const fetchPages = useCallback(async () => {
    try {
      const data = await readPages()
      const validPages = Array.isArray(data) ? data : []
      
      setPages(validPages)
      pagesRef.current = validPages
      
      if (validPages.length > 0 && !currentPageRef.current) {
        const firstPage = validPages[0]
        setCurrentPage(firstPage)
      } else if (validPages.length === 0) {
        // Create initial page if none exist
        const newPage = await createNewPage()
        setCurrentPage(newPage)
      }
      
      isInitializedRef.current = true
    } catch (error) {
      console.error('Error fetching pages:', error)
      // Create a default page if we can't fetch any
      const newPage = await createNewPage()
      setCurrentPage(newPage)
      isInitializedRef.current = true
    }
  }, [])

  const createNewPage = useCallback(async () => {
    const newPage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // More unique IDs
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

  const savePage = useCallback(async (pageContent) => {
    const currentPageData = currentPageRef.current
    if (!currentPageData || !pageContent) return

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

      // Update pages state atomically
      setPages(prevPages => {
        const newPages = prevPages.map(p => 
          p.id === validation.sanitized.id ? validation.sanitized : p
        )
        
        // If page not found, add it (shouldn't happen but safety check)
        if (!newPages.find(p => p.id === validation.sanitized.id)) {
          newPages.unshift(validation.sanitized)
        }
        
        pagesRef.current = newPages
        savePagesToStorage(newPages)
        return newPages
      })

      // Update current page if it's the one being saved
      _setCurrentPage(validation.sanitized)
    } catch (error) {
      console.error('Error saving page:', error)
      // Show user-friendly error message
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('saved'), 3000)
    }
  }, [savePagesToStorage])

  const deletePage = useCallback(async (pageToDelete) => {
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
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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

    try {
      const hashedPassword = await hashPassword(password)
      const updatedPage = { ...page, password: { hash: hashedPassword } }
      
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

    try {
      const isPasswordCorrect = await verifyPassword(password, page.password.hash)
      
      if (isPasswordCorrect) {
        if (temporary) {
          setTempUnlockedPages(prev => new Set(prev).add(page.id))
        } else {
          // Permanently unlock the page
          const updatedPage = { ...page }
          delete updatedPage.password
          
          setPages(prevPages => {
            const newPages = prevPages.map(p => 
              p.id === updatedPage.id ? updatedPage : p
            )
            pagesRef.current = newPages
            savePagesToStorage(newPages)
            return newPages
          })
          
          page = updatedPage
        }
        
        _setCurrentPage(page)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error unlocking page:', error)
      return false
    }
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

    // Clear any temporary unlocks when switching pages
    if (currentPageRef.current?.id !== page.id) {
      setTempUnlockedPages(new Set())
    }

    if (page.password && !tempUnlockedPages.has(page.id)) {
      setPageToAccess(page)
      setIsPasswordModalOpen(true)
    } else {
      _setCurrentPage(page)
    }
  }, [tempUnlockedPages])

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
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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

    setPages(prevPages => {
      const folderToDelete = prevPages.find(item => item.id === folderId && item.type === 'folder')
      
         if (folderToDelete) {
        // Move pages out of folder before deleting
        const updatedPages = prevPages.map(item => {
          if (folderToDelete.pages.includes(item.id)) {
            const { folderId, ...pageWithoutFolder } = item
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
  }, [savePagesToStorage])

  const removePageFromFolder = useCallback(async (pageId, folderId) => {
    if (!pageId || !folderId) return

    setPages(prevPages => {
      const newPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          return { ...item, pages: item.pages.filter(id => id !== pageId) }
        }
        if (item.id === pageId) {
          const { folderId, ...pageWithoutFolder } = item
          return pageWithoutFolder
        }
        return item
      })
      
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      return newPages
    })
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
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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
  }
}