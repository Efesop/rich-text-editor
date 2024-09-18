'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronLeft, ChevronRight, Plus, Save, MoreVertical, Pencil, Trash } from 'lucide-react'

export default function RichTextEditor() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageTitle, setPageTitle] = useState('')
  const editorRef = useRef(null)
  const editorInstanceRef = useRef(null)
  const [openDropdown, setOpenDropdown] = useState(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchPages()
  }, [])

  useEffect(() => {
    if (currentPage && typeof window !== 'undefined') {
      loadEditorJS()
    }
    return () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.destroy()
        editorInstanceRef.current = null
      }
    }
  }, [currentPage])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchPages = async () => {
    try {
      const response = await fetch('/api/pages')
      const data = await response.json()
      setPages(data)
      setCurrentPage(data[0])
    } catch (error) {
      console.error('Error fetching pages:', error)
      // Add a fallback or error state here
      setPages([])
      setCurrentPage(null)
    }
  }

  const loadEditorJS = async () => {
    if (editorInstanceRef.current) {
      editorInstanceRef.current.destroy()
    }

    const EditorJS = (await import('@editorjs/editorjs')).default
    const Header = (await import('@editorjs/header')).default
    const List = (await import('@editorjs/list')).default
    const Checklist = (await import('@editorjs/checklist')).default
    const Quote = (await import('@editorjs/quote')).default
    const CodeTool = (await import('@editorjs/code')).default
    const InlineCode = (await import('@editorjs/inline-code')).default
    const Marker = (await import('@editorjs/marker')).default
    const Table = (await import('@editorjs/table')).default
    const LinkTool = (await import('@editorjs/link')).default
    const ImageTool = (await import('@editorjs/image')).default
    const Embed = (await import('@editorjs/embed')).default
    const Delimiter = (await import('@editorjs/delimiter')).default

    const editor = new EditorJS({
      holder: 'editorjs',
      tools: {
        header: Header,
        list: List,
        checklist: Checklist,
        quote: Quote,
        code: CodeTool,
        inlineCode: InlineCode,
        marker: Marker,
        table: Table,
        linkTool: LinkTool,
        image: ImageTool,
        embed: Embed,
        delimiter: Delimiter,
      },
      data: currentPage.content, // Load the content of the current page
      onChange: () => {
        console.log('Editor content changed')
      },
      onReady: () => {
        console.log('Editor.js is ready to work!')
      },
      autofocus: true,
      placeholder: 'Let`s write an awesome story!',
    })

    editorInstanceRef.current = editor
  }

  const handleNewPage = () => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { time: Date.now(), blocks: [] } }
    setPages(prevPages => [...prevPages, newPage])
    setCurrentPage(newPage)
  }

  const handleSavePage = async () => {
    if (editorRef.current) {
      try {
        const savedData = await editorRef.current.save()
        const updatedPage = { ...currentPage, content: savedData }
        const updatedPages = pages.map(page => 
          page.id === currentPage.id ? updatedPage : page
        )
        setPages(updatedPages)
        setCurrentPage(updatedPage)
        await fetch('/api/pages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedPages),
        })
      } catch (error) {
        console.error('Error saving pages:', error)
      }
    }
  }

  const handlePageSelect = async (page) => {
    if (currentPage && editorInstanceRef.current) {
      try {
        const savedData = await editorInstanceRef.current.save()
        const updatedCurrentPage = { ...currentPage, content: savedData }
        setPages(prevPages => prevPages.map(p => 
          p.id === currentPage.id ? updatedCurrentPage : p
        ))
        await fetch(`/api/pages/${currentPage.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedCurrentPage),
        })
      } catch (error) {
        console.error('Error saving current page:', error)
      }
    }
    setCurrentPage(page)
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleTitleChange = (e) => {
    setPageTitle(e.target.value)
  }

  const handleTitleSave = async () => {
    setIsEditing(false)
    if (currentPage && editorInstanceRef.current) {
      try {
        const savedData = await editorInstanceRef.current.save()
        const updatedPage = { ...currentPage, title: pageTitle, content: savedData }
        setCurrentPage(updatedPage)
        setPages(prevPages => prevPages.map(page => 
          page.id === currentPage.id ? updatedPage : page
        ))
        await fetch(`/api/pages/${currentPage.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedPage),
        })
      } catch (error) {
        console.error('Error saving page:', error)
      }
    }
  }

  // Update pageTitle when currentPage changes
  useEffect(() => {
    if (currentPage) {
      setPageTitle(currentPage.title)
    }
  }, [currentPage])

  const toggleDropdown = (pageId) => {
    setOpenDropdown(openDropdown === pageId ? null : pageId)
  }

  const handleDeletePage = async (pageId) => {
    if (confirm("Are you sure you want to delete this page?")) {
      try {
        await fetch(`/api/pages/${pageId}`, {
          method: 'DELETE',
        })
        setPages(prevPages => prevPages.filter(page => page.id !== pageId))
        if (currentPage.id === pageId) {
          setCurrentPage(pages[0] || null)
        }
      } catch (error) {
        console.error('Error deleting page:', error)
      }
    }
  }

  const handleRenamePage = (pageId) => {
    const page = pages.find(p => p.id === pageId)
    const newTitle = prompt("Enter new page title:", page.title)
    if (newTitle && newTitle !== page.title) {
      const updatedPage = { ...page, title: newTitle }
      setPages(prevPages => prevPages.map(p => p.id === pageId ? updatedPage : p))
      if (currentPage.id === pageId) {
        setCurrentPage(updatedPage)
      }
      // You may want to add an API call here to update the page title on the server
    }
  }

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 h-full bg-[#f7f6f3] border-r border-[#e0e0e0] transition-all duration-300 ease-in-out z-10 ${
          sidebarOpen ? 'w-60' : 'w-12'
        } overflow-hidden`}
      >
        <div className="flex flex-col h-full">
          <div 
            className="flex items-center justify-between p-4 border-b border-[#e0e0e0] cursor-pointer"
            onClick={toggleSidebar}
          >
            {sidebarOpen && <h2 className="text-sm font-medium text-[#37352f]">Your Workspace</h2>}
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4 text-[#908e86]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#908e86]" />
            )}
          </div>
          {sidebarOpen && (
            <div className="flex-grow overflow-y-auto">
              <div className="p-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-[#37352f] hover:bg-[#e9e8e3]"
                  onClick={handleNewPage}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New page
                </Button>
              </div>
              <ScrollArea className="h-[calc(100vh-60px)]">
                <nav className="mt-2">
                  {pages.map(page => (
                    <div
                      key={page.id}
                      className="flex items-center px-2 py-1 mx-1 rounded cursor-pointer text-sm group hover:bg-[#e9e8e3] relative"
                    >
                      <div
                        className={`flex-grow ${
                          currentPage?.id === page.id 
                            ? 'text-[#37352f] font-medium' 
                            : 'text-[#6b6b6b]'
                        }`}
                        onClick={() => handlePageSelect(page)}
                      >
                        {page.title}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 p-0 h-6 w-6"
                        onClick={() => toggleDropdown(page.id)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {openDropdown === page.id && (
                        <div 
                          ref={dropdownRef}
                          className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10"
                        >
                          <button
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                            onClick={() => handleRenamePage(page.id)}
                          >
                            <Pencil className="h-4 w-4 inline mr-2" />
                            Rename
                          </button>
                          <button
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                            onClick={() => handleDeletePage(page.id)}
                          >
                            <Trash className="h-4 w-4 inline mr-2" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </nav>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? 'ml-60' : 'ml-12'}`}>
        {/* Top Bar */}
        <div className="flex items-center p-4 border-b border-gray-200 bg-white">
          {isEditing ? (
            <form onSubmit={(e) => { e.preventDefault(); handleTitleSave(); }} className="flex-1 mr-2">
              <Input
                value={pageTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleSave}
                autoFocus
                className="w-full"
              />
            </form>
          ) : (
            <h1 
              className="text-2xl font-bold text-gray-800 flex-1 mr-2 cursor-pointer" 
              onClick={() => setIsEditing(true)}
            >
              {currentPage?.title}
            </h1>
          )}
          <Button onClick={handleSavePage} className="bg-blue-500 hover:bg-blue-600 text-white">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>

        {/* Editor */}
        <div id="editorjs" className="flex-1 p-4 overflow-auto bg-white" />
      </div>
    </div>
  )
}