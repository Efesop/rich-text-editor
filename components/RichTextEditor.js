'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText, Trash2, Search } from 'lucide-react'

const EditorJS = dynamic(() => import('@editorjs/editorjs'), { ssr: false })

export default function RichTextEditor() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const editorRef = useRef(null)
  const editorInstanceRef = useRef(null)

  const loadEditorJS = useCallback(async () => {
    if (editorInstanceRef.current && typeof editorInstanceRef.current.destroy === 'function') {
      editorInstanceRef.current.destroy();
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
      onChange: async () => {
        const content = await editor.save();
        setCurrentPage(prev => ({ ...prev, content }));
      },
      onReady: () => {
        console.log('Editor.js is ready to work!');
      },
      autofocus: false,
      placeholder: 'Let`s write an awesome story!',
    });

    await editor.isReady;
    editorInstanceRef.current = editor;
  }, []);

  useEffect(() => {
    fetchPages()
  }, [])

  useEffect(() => {
    if (currentPage && typeof window !== 'undefined') {
      loadEditorJS().then(() => {
        if (editorInstanceRef.current) {
          editorInstanceRef.current.render(currentPage.content);
        }
      });
    }
    return () => {
      if (editorInstanceRef.current && typeof editorInstanceRef.current.destroy === 'function') {
        editorInstanceRef.current.destroy();
        editorInstanceRef.current = null;
      }
    };
  }, [currentPage, loadEditorJS]);

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

  const handleNewPage = () => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { blocks: [] } }
    setPages([...pages, newPage])
    setCurrentPage(newPage)
  }

  const handleSavePage = async () => {
    if (editorInstanceRef.current) {
      try {
        const content = await editorInstanceRef.current.save();
        const updatedPage = { ...currentPage, content };
        const updatedPages = pages.map(page => 
          page.id === currentPage.id ? updatedPage : page
        );
        setPages(updatedPages);
        await fetch(`/api/pages/${currentPage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedPage),
        });
      } catch (error) {
        console.error('Error saving page:', error);
      }
    }
  }

  const handleDeletePage = async (pageId) => {
    try {
      await fetch(`/api/pages/${pageId}`, { method: 'DELETE' });
      const updatedPages = pages.filter(page => page.id !== pageId);
      setPages(updatedPages);
      if (currentPage.id === pageId) {
        setCurrentPage(updatedPages[0] || null);
      }
    } catch (error) {
      console.error('Error deleting page:', error);
    }
  }

  const handlePageSelect = async (page) => {
    if (currentPage && editorInstanceRef.current) {
      try {
        const savedData = await editorInstanceRef.current.save();
        const updatedCurrentPage = { ...currentPage, content: savedData };
        setPages(prevPages => prevPages.map(p => 
          p.id === currentPage.id ? updatedCurrentPage : p
        ));
        await fetch(`/api/pages/${currentPage.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedCurrentPage),
        });
      } catch (error) {
        console.error('Error saving current page:', error);
      }
    }
    setCurrentPage(page);
    if (editorInstanceRef.current) {
      editorInstanceRef.current.render(page.content);
    } else {
      loadEditorJS();
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const filteredPages = pages.filter(page => 
    page.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-white overflow-hidden">
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
            ))}
          </ScrollArea>
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