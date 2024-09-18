'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
<<<<<<< HEAD
<<<<<<< HEAD
import { ChevronRight, ChevronLeft, Plus, Save, FileText, Trash2, Search } from 'lucide-react'

const EditorJS = dynamic(() => import('@editorjs/editorjs'), { ssr: false })
=======
import { ChevronLeft, ChevronRight, Plus, Save } from 'lucide-react'
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)
=======
import { ChevronLeft, ChevronRight, Plus, Save } from 'lucide-react'
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)

export default function RichTextEditor() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const editorRef = useRef(null)
<<<<<<< HEAD
=======
  const editorInstanceRef = useRef(null)
<<<<<<< HEAD
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)
=======
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)

  useEffect(() => {
    fetchPages()
  }, [])

  useEffect(() => {
    if (currentPage) {
      const setupEditor = async () => {
        if (!editorRef.current) {
          await initEditor();
        } else {
          await editorRef.current.isReady;
          editorRef.current.render(currentPage.content);
        }
      };
      setupEditor();
    }
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
<<<<<<< HEAD
    };
  }, [currentPage]);
=======
    }
  }, [currentPage])
<<<<<<< HEAD
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)
=======
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)

  const fetchPages = async () => {
    const response = await fetch('/api/pages')
    const data = await response.json()
    setPages(data)
    setCurrentPage(data[0])
  }

  const initEditor = async () => {
    if (typeof window === 'undefined') return;

    if (editorRef.current) {
      editorRef.current.destroy();
    }

    const EditorJS = (await import('@editorjs/editorjs')).default;
    const Header = (await import('@editorjs/header')).default;
    const List = (await import('@editorjs/list')).default;
    const Checklist = (await import('@editorjs/checklist')).default;
    const Quote = (await import('@editorjs/quote')).default;
    const CodeTool = (await import('@editorjs/code')).default;
    const InlineCode = (await import('@editorjs/inline-code')).default;
    const Marker = (await import('@editorjs/marker')).default;
    const Table = (await import('@editorjs/table')).default;
    const LinkTool = (await import('@editorjs/link')).default;
    const ImageTool = (await import('@editorjs/image')).default;
    const Embed = (await import('@editorjs/embed')).default;
    const Delimiter = (await import('@editorjs/delimiter')).default;

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
      data: currentPage?.content || {},
      onChange: () => {
        // Debounce the save operation to prevent frequent updates
        if (editor.debounceTimer) clearTimeout(editor.debounceTimer);
        editor.debounceTimer = setTimeout(async () => {
          const content = await editor.save();
          setCurrentPage(prev => ({ ...prev, content }));
        }, 300);
      },
    });

    await editor.isReady;
    editorRef.current = editor;
    return editor;
  }

  const handleNewPage = () => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { blocks: [] } }
    setPages([...pages, newPage])
    setCurrentPage(newPage)
  }

  const handleSavePage = async () => {
    if (editorRef.current) {
      const content = await editorRef.current.save();
      const updatedPages = pages.map(page => 
        page.id === currentPage.id ? { ...page, content } : page
      );
      setPages(updatedPages);
      await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPages),
      });
    }
  }

  const handleDeletePage = (pageId) => {
    const updatedPages = pages.filter(page => page.id !== pageId)
    setPages(updatedPages)
    if (currentPage.id === pageId) {
      setCurrentPage(updatedPages[0] || null)
    }
  }

  const handlePageSelect = async (page) => {
    if (editorRef.current && currentPage) {
      const content = await editorRef.current.save();
      setPages(prevPages => prevPages.map(p => 
        p.id === currentPage.id ? { ...p, content } : p
      ));
    }
    setCurrentPage(page);
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

<<<<<<< HEAD
  const filteredPages = pages.filter(page => 
    page.title.toLowerCase().includes(searchTerm.toLowerCase())
  )
=======
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
<<<<<<< HEAD
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)
=======
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className={`bg-muted transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-64' : 'w-0'}`}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4">
            <h2 className="text-lg font-semibold">Pages</h2>
            <Button variant="ghost" size="icon" onClick={handleNewPage}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-4 mb-2">
            <Input
              placeholder="Search pages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              startAdornment={<Search className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
          <ScrollArea className="flex-grow">
            {filteredPages.map(page => (
              <div
                key={page.id}
                className={`p-2 cursor-pointer hover:bg-accent flex justify-between items-center ${currentPage.id === page.id ? 'bg-accent' : ''}`}
                onClick={() => handlePageSelect(page)}
              >
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-2" />
                  {page.title}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDeletePage(page.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
<<<<<<< HEAD
            ))}
          </ScrollArea>
=======
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
>>>>>>> parent of 2adb202 (Update RichTextEditor.js)
        </div>
      </div>

      {/* Toggle Sidebar Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 left-2 z-10"
        onClick={toggleSidebar}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          {isEditing ? (
            <Input
              value={currentPage.title}
              onChange={(e) => setCurrentPage({ ...currentPage, title: e.target.value })}
              onBlur={() => setIsEditing(false)}
              autoFocus
            />
          ) : (
            <h1 className="text-2xl font-bold" onClick={() => setIsEditing(true)}>{currentPage.title}</h1>
          )}
          <Button onClick={handleSavePage}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
        <div id="editorjs" className="flex-1 p-8 overflow-auto" />
      </div>
    </div>
  )
}