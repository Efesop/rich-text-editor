import { useState, useEffect, useCallback } from 'react'
import { hashPassword, verifyPassword } from '@/utils/passwordUtils'
import useTagStore from '../store/tagStore'

export function usePagesManager() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const { addTag, removeTag, deleteTag } = useTagStore()
  const [saveStatus, setSaveStatus] = useState('saved')

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

  const handleNewPage = useCallback(() => {
    const newPage = {
      id: Date.now().toString(),
      title: 'New Page',
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
      const updatedPages = [...prevPages, newPage]
      savePagesToStorage(updatedPages)
      return updatedPages
    })
    setCurrentPage(newPage)
  }, [])

  const savePage = useCallback(async (pageContent) => {
    if (currentPage) {
      const updatedPage = { ...currentPage, content: pageContent }
      setPages(prevPages => {
        const updatedPages = prevPages.map(p => p.id === updatedPage.id ? updatedPage : p)
        savePagesToStorage(updatedPages)
        return updatedPages
      })
    }
  }, [currentPage])

  const deletePage = useCallback(async (page) => {
    setPages(prevPages => {
      const updatedPages = prevPages.filter(p => p.id !== page.id)
      savePagesToStorage(updatedPages)
      return updatedPages
    })
    if (currentPage.id === page.id) {
      setCurrentPage(pages[0] || null)
    }
  }, [currentPage, pages])

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

  const unlockPage = useCallback(async (page, password) => {
    try {
      console.log('Attempting to unlock page:', page.id)
      console.log('Password type:', typeof password)
      console.log('Stored password type:', typeof page.password)
      
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
        const updatedPage = { ...page, password: null }
        setPages(prevPages => {
          const updatedPages = prevPages.map(p => p.id === updatedPage.id ? updatedPage : p)
          savePagesToStorage(updatedPages)
          return updatedPages
        })
        setCurrentPage(updatedPage)
        console.log('Page unlocked successfully')
        return true
      } else {
        console.log('Incorrect password')
        return false
      }
    } catch (error) {
      console.error('Error unlocking page:', error)
      return false
    }
  }, [])

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

  const addTagToPage = useCallback((pageId, tag) => {
    setPages(prevPages => prevPages.map(page => 
      page.id === pageId 
        ? { ...page, tags: [...(page.tags || []), tag] }
        : page
    ))
    if (currentPage && currentPage.id === pageId) {
      setCurrentPage(prevPage => ({ ...prevPage, tags: [...(prevPage.tags || []), tag] }))
    }
    addTag(tag)
  }, [currentPage, addTag])

  const removeTagFromPage = useCallback((pageId, tagName) => {
    setPages(prevPages => prevPages.map(page => 
      page.id === pageId 
        ? { ...page, tags: (page.tags || []).filter(t => t.name !== tagName) }
        : page
    ))
    if (currentPage && currentPage.id === pageId) {
      setCurrentPage(prevPage => ({ 
        ...prevPage, 
        tags: (prevPage.tags || []).filter(t => t.name !== tagName) 
      }))
    }
  }, [currentPage])

  const deleteTagFromAllPages = useCallback((tagName) => {
    setPages(prevPages => prevPages.map(page => ({
      ...page,
      tags: (page.tags || []).filter(t => t.name !== tagName)
    })))
    if (currentPage) {
      setCurrentPage(prevPage => ({ 
        ...prevPage, 
        tags: (prevPage.tags || []).filter(t => t.name !== tagName) 
      }))
    }
    deleteTag(tagName)
  }, [currentPage, deleteTag])

  return {
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
    fetchPages,
    addTagToPage,
    removeTagFromPage,
    deleteTagFromAllPages
  }
}
