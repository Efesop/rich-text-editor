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
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [wordCount, setWordCount] = useState(0);

  const loadEditorJS = useCallback(async () => {
    if (editorInstanceRef.current) {
      return;
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
    const Paragraph = (await import('@editorjs/paragraph')).default;

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
        paragraph: {
          class: Paragraph,
          inlineToolbar: true,
          config: {
            preserveBlank: true,
          },
        },
      },
      data: currentPage?.content || { blocks: [] },
      onChange: () => {
        if (editorInstanceRef.current.saveTimeout) {
          clearTimeout(editorInstanceRef.current.saveTimeout);
        }
        editorInstanceRef.current.saveTimeout = setTimeout(async () => {
          const content = await editorInstanceRef.current.save();
          localStorage.setItem(`page_${currentPage.id}`, JSON.stringify(content));
          setSaveStatus('saved');
          
          // Calculate word count
          const wordCount = content.blocks.reduce((count, block) => {
            if (block.type === 'paragraph' || block.type === 'header') {
              return count + block.data.text.trim().split(/\s+/).length;
            }
            return count;
          }, 0);
          setWordCount(wordCount);
        }, 1000);
      },
      onReady: () => {
        editorInstanceRef.current = editor;
      },
    });

    await editor.isReady;
    editorInstanceRef.current = editor;
  }, [currentPage]);

  useEffect(() => {
    fetchPages()
  }, [])

  useEffect(() => {
    if (currentPage && typeof window !== 'undefined') {
      loadEditorJS();
    }
    return () => {
      if (editorInstanceRef.current && typeof editorInstanceRef.current.destroy === 'function') {
        editorInstanceRef.current.destroy();
        editorInstanceRef.current = null;
      }
    };
  }, [currentPage, loadEditorJS]);

  const fetchPages = () => {
    try {
      const storedPages = localStorage.getItem('pages');
      const data = storedPages ? JSON.parse(storedPages) : [];
      setPages(data);
      if (data.length > 0) {
        setCurrentPage(data[0]);
      } else {
        handleNewPage();
      }
    } catch (error) {
      console.error('Error fetching pages:', error);
      setPages([]);
      handleNewPage();
    }
  };

  const handleNewPage = () => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { blocks: [] } };
    const updatedPages = [...pages, newPage];
    setPages(updatedPages);
    setCurrentPage(newPage);
    localStorage.setItem('pages', JSON.stringify(updatedPages));
  };

  const handleDeletePage = async (page) => {
    if (confirm('Are you sure you want to delete this page?')) {
      try {
        const updatedPages = pages.filter(p => p.id !== page.id);
        setPages(updatedPages);
        localStorage.setItem('pages', JSON.stringify(updatedPages));
        if (currentPage.id === page.id) {
          setCurrentPage(updatedPages[0] || null);
        }
      } catch (error) {
        console.error('Error deleting page:', error);
      }
    }
  };

  const loadPage = (page) => {
    const savedContent = localStorage.getItem(`page_${page.id}`);
    if (savedContent) {
      page.content = JSON.parse(savedContent);
      const wordCount = page.content.blocks.reduce((count, block) => {
        if (block.type === 'paragraph' || block.type === 'header') {
          return count + block.data.text.trim().split(/\s+/).length;
        }
        return count;
      }, 0);
      setWordCount(wordCount);
    }
    setCurrentPage(page);
    if (editorInstanceRef.current) {
      editorInstanceRef.current.render(page.content);
    }
  };

  const savePage = async () => {
    if (editorInstanceRef.current) {
      const content = await editorInstanceRef.current.save();
      const updatedPage = { ...currentPage, content };
      const updatedPages = pages.map(p => p.id === updatedPage.id ? updatedPage : p);
      setPages(updatedPages);
      localStorage.setItem('pages', JSON.stringify(updatedPages));
    }
  };

  const handlePageSelect = async (page) => {
    if (editorInstanceRef.current) {
      await savePage();
    }
    loadPage(page);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const filteredPages = pages.filter(page => 
    page.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRenamePage = async (page) => {
    const newTitle = prompt('Enter new title:', page.title);
    if (newTitle && newTitle !== page.title) {
      try {
        let updatedPage = { ...page, title: newTitle };
        
        if (currentPage.id === page.id && editorInstanceRef.current) {
          const savedData = await editorInstanceRef.current.save();
          updatedPage.content = savedData;
        }

        const updatedPages = pages.map(p => p.id === page.id ? updatedPage : p);
        setPages(updatedPages);
        localStorage.setItem('pages', JSON.stringify(updatedPages));
        if (currentPage.id === page.id) {
          setCurrentPage(updatedPage);
        }

        // Re-render the editor with the updated content
        if (currentPage.id === page.id && editorInstanceRef.current) {
          editorInstanceRef.current.render(updatedPage.content);
        }
      } catch (error) {
        console.error('Error updating page:', error);
      }
    }
  };

  const exportToPDF = async () => {
    if (editorInstanceRef.current) {
      try {
        const content = await editorInstanceRef.current.save();
        // In Electron, we'll use a library like jsPDF to generate the PDF
        // For now, we'll just log the content
        console.log('Content to export as PDF:', content);
        alert('PDF export functionality will be implemented in the Electron app.');
      } catch (error) {
        console.error('Error exporting to PDF:', error);
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
          <div className="flex items-center space-x-4">
            <span className="text-gray-500">{wordCount} words</span>
            {saveStatus === 'saving' && <span className="text-yellow-500">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-green-500">Saved</span>}
            {saveStatus === 'error' && <span className="text-red-500">Error saving</span>}
          </div>
        </div>
        <div id="editorjs" className="flex-1 p-8 overflow-auto codex-editor" />
        <div className="flex justify-end p-4">
          <Button onClick={exportToPDF}>
            Export as PDF
          </Button>
        </div>
      </div>
    </div>
  )
}