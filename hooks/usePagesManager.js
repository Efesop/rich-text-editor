import { useState, useEffect, useCallback } from 'react'
import { hashPassword, verifyPassword } from '@/utils/passwordUtils'
import useTagStore from '../store/tagStore'

export function usePagesManager() {
  const [pages, setPages] = useState([])
  const [currentPage, _setCurrentPage] = useState(null)
  const { tags, addTag, removeTag, updateTag } = useTagStore()
  const [saveStatus, setSaveStatus] = useState('saved')
  const [tempUnlockedPages, setTempUnlockedPages] = useState(new Set())
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [pageToAccess, setPageToAccess] = useState(null)

  const fetchPages = useCallback(async () => {
    try {
      const data = await window.electron.invoke('read-pages')
      setPages(data)
      if (data.length > 0) {
        setCurrentPage(data[0])
      } else {
        const newPage = handleNewPage()
        setCurrentPage(newPage)
      }
    } catch (error) {
      console.error('Error fetching pages:', error)
      const newPage = handleNewPage()
      setCurrentPage(newPage)
    }
  }, [])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])
  const savePagesToStorage = useCallback(async (updatedPages) => {
    setSaveStatus('saving')
    try {
      await window.electron.invoke('save-pages', updatedPages)
      setSaveStatus('saved')
    } catch (error) {
      console.error('Error saving pages:', error)
      setSaveStatus('error')
    }
  }, [])

  const handleNewPage = useCallback(() => {
    const newPage = {
      id: Date.now().toString(),
      title: 'New Page'.slice(0, 20),
      content: {
        time: Date.now(),
        blocks: [],
        version: '2.30.6'
      },
      tags: [],
      createdAt: new Date().toISOString(),
      password: null
    }
  
    setPages(prevPages => {
      const updatedPages = [newPage, ...prevPages]
      savePagesToStorage(updatedPages)
      return updatedPages
    })
    setCurrentPage(newPage)
    return newPage
  }, [])

  const savePage = useCallback(async (pageContent) => {
    if (currentPage) {
      const updatedPage = { 
        ...currentPage, 
        content: {
          time: Date.now(),
          blocks: pageContent.blocks,
          version: pageContent.version
        }
      }
      setPages(prevPages => {
        const filteredPages = prevPages.filter(p => p.id !== updatedPage.id)
        const updatedPages = [updatedPage, ...filteredPages]
        savePagesToStorage(updatedPages)
        return updatedPages
      })
    }
  }, [currentPage, savePagesToStorage])

  const deletePage = useCallback(async (page) => {
    setPages(prevPages => {
      let updatedPages = prevPages.filter(p => p.id !== page.id)
      
      // If the page was in a folder, update the folder's pages array
      if (page.folderId) {
        updatedPages = updatedPages.map(item => {
          if (item.id === page.folderId && item.type === 'folder') {
            return {
              ...item,
              pages: item.pages.filter(pageId => pageId !== page.id)
            }
          }
          return item
        })
      }

      if (updatedPages.length === 0) {
        // If all pages are deleted, create a new default page
        const newPage = {
          id: Date.now().toString(),
          title: 'New Page',
          content: { time: Date.now(), blocks: [] },
          tags: [],
          createdAt: new Date().toISOString(),
          password: null
        }
        updatedPages.push(newPage)
      }
      savePagesToStorage(updatedPages)
      return updatedPages
    })
    if (currentPage.id === page.id) {
      setCurrentPage(pages[0] || null)
    }
  }, [currentPage, pages, savePagesToStorage])

  const renamePage = useCallback(async (page, newTitle) => {
    const updatedPage = { ...page, title: newTitle }
    setPages(prevPages => {
      const updatedPages = prevPages.map(p => p.id === page.id ? updatedPage : p)
      savePagesToStorage(updatedPages)
      return updatedPages
    })
    if (currentPage.id === page.id) {
      setCurrentPage(updatedPage)
    }
  }, [currentPage])

  const lockPage = useCallback(async (page, password) => {
    try {
      const hashedPassword = await hashPassword(password)
      const updatedPage = { ...page, password: { hash: hashedPassword } }
      setPages(prevPages => {
        const updatedPages = prevPages.map(p => p.id === updatedPage.id ? updatedPage : p)
        savePagesToStorage(updatedPages)
        return updatedPages
      })
      setCurrentPage(updatedPage)
      return true
    } catch (error) {
      console.error('Error locking page:', error)
      return false
    }
  }, [])

  const unlockPage = useCallback(async (page, password, temporary = false) => {
    try {
      console.log('Attempting to unlock page:', page.id)
      
      if (!page.password || !page.password.hash) {
        console.error('Page is not locked or password hash is missing')
        return false
      }

      if (typeof password !== 'string') {
        console.error('Invalid password type')
        return false
      }

      const isPasswordCorrect = await verifyPassword(password, page.password.hash)
      
      if (isPasswordCorrect) {
        if (temporary) {
          setTempUnlockedPages(prev => new Set(prev).add(page.id))
        } else {
          const updatedPage = { ...page, password: null }
          setPages(prevPages => {
            const updatedPages = prevPages.map(p => p.id === updatedPage.id ? updatedPage : p)
            savePagesToStorage(updatedPages)
            return updatedPages
          })
          page = updatedPage // Use the updated page for setting current page
        }
        _setCurrentPage(page) // Directly set the current page
        console.log('Page unlocked successfully and set as current')
        return true
      } else {
        console.log('Incorrect password')
        return false
      }
    } catch (error) {
      console.error('Error unlocking page:', error)
      return false
    }
  }, [setPages, _setCurrentPage, setTempUnlockedPages, savePagesToStorage])

  const addTagToPage = useCallback((pageId, tag) => {
    const trimmedTag = { ...tag, name: tag.name.slice(0, 15) }
    addTag(trimmedTag) // This will only add the tag if it doesn't already exist
    setPages(prevPages => {
      const updatedPages = prevPages.map(page => 
        page.id === pageId 
          ? { ...page, tagNames: [...new Set([...(page.tagNames || []), trimmedTag.name])] }
          : page
      )
      // Use a setTimeout to ensure this runs after the state has been updated
      setTimeout(() => savePagesToStorage(updatedPages), 0)
      return updatedPages
    })
    if (currentPage && currentPage.id === pageId) {
      setCurrentPage(prevPage => ({ 
        ...prevPage, 
        tagNames: [...new Set([...(prevPage.tagNames || []), trimmedTag.name])] 
      }))
    }
    // Add this line to save the updated pages
    savePagesToStorage(pages)
  }, [currentPage, addTag, pages, savePagesToStorage])

  const removeTagFromPage = useCallback((pageId, tagName) => {
    setPages(prevPages => {
      const updatedPages = prevPages.map(page => 
        page.id === pageId 
          ? { ...page, tagNames: (page.tagNames || []).filter(t => t !== tagName) }
          : page
      )
      // Use a setTimeout to ensure this runs after the state has been updated
      setTimeout(() => savePagesToStorage(updatedPages), 0)
      return updatedPages
    })
    if (currentPage && currentPage.id === pageId) {
      setCurrentPage(prevPage => ({ 
        ...prevPage, 
        tagNames: (prevPage.tagNames || []).filter(t => t !== tagName) 
      }))
    }
    // Add this line to save the updated pages
    savePagesToStorage(pages)
  }, [currentPage, pages, savePagesToStorage])

  const deleteTagFromAllPages = useCallback((tagName) => {
    setPages(prevPages => prevPages.map(page => ({
      ...page,
      tagNames: (page.tagNames || []).filter(t => t !== tagName)
    })))
    if (currentPage) {
      setCurrentPage(prevPage => ({ 
        ...prevPage, 
        tagNames: (prevPage.tagNames || []).filter(t => t !== tagName) 
      }))
    }
    removeTag(tagName)
  }, [currentPage, removeTag])

  const setCurrentPage = useCallback((page) => {
    if (page.password && !tempUnlockedPages.has(page.id)) {
      // Page is locked and not temporarily unlocked
      setPageToAccess(page)
      setIsPasswordModalOpen(true)
    } else {
      _setCurrentPage(page)
      // Clear temporary unlock when switching pages
      setTempUnlockedPages(new Set())
    }
  }, [tempUnlockedPages])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  const updateTagInPages = useCallback((oldName, updatedTag) => {
    setPages(prevPages => prevPages.map(page => ({
      ...page,
      tagNames: page.tagNames?.map(tagName => tagName === oldName ? updatedTag.name : tagName)
    })))
    if (currentPage) {
      setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: prevPage.tagNames?.map(tagName => tagName === oldName ? updatedTag.name : tagName)
      }))
    }
    updateTag(oldName, updatedTag) // This calls the updateTag function from useTagStore
  }, [currentPage, updateTag])

  const createFolder = useCallback((folderName) => {
    const newFolder = {
      id: Date.now().toString(),
      title: folderName,
      type: 'folder',
      pages: []
    }
    setPages(prevPages => {
      const updatedPages = [newFolder, ...prevPages]
      savePagesToStorage(updatedPages)
      return updatedPages
    })
  }, [savePagesToStorage])

  const deleteFolder = useCallback((folderId) => {
    setPages(prevPages => {
      const updatedPages = prevPages.filter(item => {
        if (item.id === folderId && item.type === 'folder') {
          // Move pages from the deleted folder back to the root
          item.pages.forEach(pageId => {
            const page = prevPages.find(p => p.id === pageId)
            if (page) {
              delete page.folderId
            }
          })
          return false
        }
        return true
      })
      savePagesToStorage(updatedPages)
      return updatedPages
    })
  }, [savePagesToStorage])

  const addPageToFolder = useCallback((pageId, folderId) => {
    setPages(prevPages => {
      const updatedPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          return { ...item, pages: [...new Set([...item.pages, pageId])] }
        }
        if (item.id === pageId) {
          return { ...item, folderId }
        }
        return item
      })
      savePagesToStorage(updatedPages)
      return updatedPages
    })
  }, [savePagesToStorage])

  const removePageFromFolder = useCallback((pageId, folderId) => {
    setPages(prevPages => {
      const updatedPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          return { ...item, pages: item.pages.filter(id => id !== pageId) }
        }
        if (item.id === pageId) {
          const { folderId, ...pageWithoutFolder } = item
          return pageWithoutFolder
        }
        return item
      })
      savePagesToStorage(updatedPages)
      return updatedPages
    })
  }, [savePagesToStorage])

  const renameFolder = useCallback((folderId, newName) => {
    setPages(prevPages => {
      const updatedPages = prevPages.map(item => {
        if (item.id === folderId && item.type === 'folder') {
          return { ...item, title: newName }
        }
        return item
      })
      savePagesToStorage(updatedPages)
      return updatedPages
    })
  }, [savePagesToStorage])

  const handleDuplicatePage = useCallback((page) => {
    const newPage = {
      ...page,
      id: Date.now().toString(),
      title: `${page.title} (Copy)`,
      createdAt: new Date().toISOString(),
    }
    setPages(prevPages => {
      let updatedPages = [...prevPages]
      const pageIndex = updatedPages.findIndex(p => p.id === page.id)
      if (pageIndex !== -1) {
        updatedPages.splice(pageIndex + 1, 0, newPage)
      } else {
        updatedPages.unshift(newPage)
      }
      if (page.folderId) {
        const folderIndex = updatedPages.findIndex(item => item.id === page.folderId && item.type === 'folder')
        if (folderIndex !== -1) {
          updatedPages[folderIndex] = {
            ...updatedPages[folderIndex],
            pages: [...updatedPages[folderIndex].pages, newPage.id]
          }
        }
        newPage.folderId = page.folderId
      }
      savePagesToStorage(updatedPages)
      return updatedPages
    })
    setCurrentPage(newPage)
  }, [savePagesToStorage, setCurrentPage])

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