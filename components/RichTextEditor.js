'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText, Trash2, Search, MoreVertical } from 'lucide-react'

const EditorJS = dynamic(() => import('@editorjs/editorjs'), { ssr: false })

const PageItem = ({ page, isActive, onSelect, onRename, onDelete, sidebarOpen }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const truncateTitle = (title) => {
    if (title.length <= 3) return title;
    return title.slice(0, 3) + '...';
  };

  return (
    <div
      className={`p-2 cursor-pointer hover:bg-gray-200 flex justify-between items-center ${isActive ? 'bg-gray-200' : ''}`}
      onClick={() => onSelect(page)}
    >
      <div className="flex items-center overflow-hidden">
        {sidebarOpen ? (
          <span className="truncate">{page.title}</span>
        ) : (
          <span className="w-8 text-center" title={page.title}>
            {truncateTitle(page.title)}
          </span>
        )}
      </div>
      {sidebarOpen && (
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {isOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
              <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                <button
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(page);
                    setIsOpen(false);
                  }}
                >
                  Rename
                </button>
                <button
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(page);
                    setIsOpen(false);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
        header: {
          class: Header,
          inlineToolbar: true,
          config: {
            placeholder: 'Enter a header',
            levels: [1, 2, 3, 4, 5, 6],
            defaultLevel: 2
          }
        },
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
      readOnly: false,
      autofocus: true,
      placeholder: 'Write something...',
    });

    await editor.isReady;
    editorInstanceRef.current = editor;

    editor.on('change', () => {
      if (editorInstanceRef.current.saveTimeout) {
        clearTimeout(editorInstanceRef.current.saveTimeout);
      }
      editorInstanceRef.current.saveTimeout = setTimeout(async () => {
        const content = await editor.save();
        setCurrentPage(prev => ({...prev, content}));
      }, 1000);
    });
  }, [currentPage]);

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
        const outputData = await editorInstanceRef.current.save();
        const updatedPage = { ...currentPage, content: outputData };
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

  const handleDeletePage = async (page) => {
    if (confirm('Are you sure you want to delete this page?')) {
      try {
        await fetch(`/api/pages/${page.id}`, { method: 'DELETE' });
        const updatedPages = pages.filter(p => p.id !== page.id);
        setPages(updatedPages);
        if (currentPage.id === page.id) {
          setCurrentPage(updatedPages[0] || null);
        }
      } catch (error) {
        console.error('Error deleting page:', error);
      }
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

  const handleRenamePage = async (page) => {
    const newTitle = prompt('Enter new title:', page.title);
    if (newTitle && newTitle !== page.title) {
      const updatedPage = { ...page, title: newTitle };
      const updatedPages = pages.map(p => p.id === page.id ? updatedPage : p);
      setPages(updatedPages);
      if (currentPage.id === page.id) {
        setCurrentPage(updatedPage);
      }
      try {
        await fetch(`/api/pages/${page.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedPage),
        });
      } catch (error) {
        console.error('Error updating page title:', error);
      }
    }
  };

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className={`bg-gray-100 transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-64' : 'w-12'} flex flex-col h-full border-r`}>
        <div className="flex justify-between items-center p-4">
          {sidebarOpen && <h2 className="text-lg font-semibold">Pages</h2>}
          <Button variant="ghost" size="icon" onClick={handleNewPage}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {sidebarOpen && (
          <div className="px-4 mb-2">
            <Input
              placeholder="Search pages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              startAdornment={<Search className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        )}
        <ScrollArea className="flex-grow">
          {filteredPages.map(page => (
            <PageItem
              key={page.id}
              page={page}
              isActive={currentPage.id === page.id}
              onSelect={handlePageSelect}
              onRename={handleRenamePage}
              onDelete={handleDeletePage}
              sidebarOpen={sidebarOpen}
            />
          ))}
        </ScrollArea>
        <Button
          variant="ghost"
          size="icon"
          className="m-2"
          onClick={toggleSidebar}
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h1 
            className="text-2xl font-bold cursor-pointer" 
            onClick={() => handleRenamePage(currentPage)}
          >
            {currentPage.title}
          </h1>
          <Button onClick={handleSavePage}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
        <div id="editorjs" className="flex-1 p-8 overflow-auto codex-editor" />
      </div>
    </div>
  )
}