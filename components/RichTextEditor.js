'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText, ChevronDown } from 'lucide-react'

export default function RichTextEditor() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageTitle, setPageTitle] = useState('')
  const editorRef = useRef(null)
  const editorInstanceRef = useRef(null)
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)

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
    setSidebarOpen(prev => !prev)
  }

  const handleTitleChange = (e) => {
    setPageTitle(e.target.value)
  }

  const handleTitleSave = async () => {
    setIsEditing(false)
    if (currentPage) {
      const updatedPage = { ...currentPage, title: pageTitle }
      setCurrentPage(updatedPage)
      setPages(prevPages => prevPages.map(page => 
        page.id === currentPage.id ? updatedPage : page
      ))
      try {
        await fetch(`/api/pages/${currentPage.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: pageTitle }),
        })
      } catch (error) {
        console.error('Error saving page title:', error)
      }
    }
  }

  // Update pageTitle when currentPage changes
  useEffect(() => {
    if (currentPage) {
      setPageTitle(currentPage.title)
    }
  }, [currentPage])

  const toggleWorkspace = () => {
    setWorkspaceCollapsed(!workspaceCollapsed)
  }

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 h-full bg-[#f7f6f3] border-r border-[#e0e0e0] transition-all duration-300 ease-in-out z-10 ${
          sidebarOpen ? 'w-60' : 'w-0'
        } overflow-hidden`}
      >
        <div className="flex flex-col h-full">
          <div 
            className="flex items-center justify-between p-4 border-b border-[#e0e0e0] cursor-pointer"
            onClick={toggleWorkspace}
          >
            <h2 className="text-sm font-medium text-[#37352f]">Your Workspace</h2>
            {workspaceCollapsed ? (
              <ChevronRight className="h-4 w-4 text-[#908e86]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#908e86]" />
            )}
          </div>
          {!workspaceCollapsed && (
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
                      className={`px-2 py-1 mx-1 rounded cursor-pointer text-sm ${
                        currentPage?.id === page.id 
                          ? 'bg-[#e9e8e3] text-[#37352f]' 
                          : 'text-[#6b6b6b] hover:bg-[#e9e8e3]'
                      }`}
                      onClick={() => handlePageSelect(page)}
                    >
                      {page.title}
                    </div>
                  ))}
                </nav>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? 'ml-60' : 'ml-0'}`}>
        {/* Top Bar */}
        <div className="flex items-center p-4 border-b border-gray-200 bg-white">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2"
            onClick={toggleSidebar}
          >
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-600" />
            )}
          </Button>
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