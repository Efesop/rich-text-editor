'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText } from 'lucide-react'

export default function RichTextEditor() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const editorRef = useRef(null)
  const editorInstanceRef = useRef(null)

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
      data: currentPage.content,
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

  const handlePageSelect = (page) => {
    setCurrentPage(page)
  }

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev)
  }

  const handleTitleChange = (e) => {
    setCurrentPage(prev => ({ ...prev, title: e.target.value }))
  }

  const handleTitleSave = () => {
    setIsEditing(false)
    handleSavePage()
  }

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 h-full bg-gray-100 border-r border-gray-200 transition-all duration-300 ease-in-out z-10 ${
          sidebarOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-700">Pages</h2>
          <Button variant="ghost" size="icon" onClick={handleNewPage}>
            <Plus className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-60px)]">
          {pages.map(page => (
            <div
              key={page.id}
              className={`p-2 cursor-pointer hover:bg-gray-200 ${
                currentPage.id === page.id ? 'bg-gray-200' : ''
              }`}
              onClick={() => handlePageSelect(page)}
            >
              <FileText className="h-4 w-4 inline mr-2 text-gray-600" />
              <span className="text-gray-700">{page.title}</span>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
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
                value={currentPage.title}
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
              {currentPage.title}
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