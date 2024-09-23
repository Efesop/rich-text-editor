'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText, Trash2, Search, MoreVertical, Download } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { RenameModal } from '@/components/RenameModal';
import ExportDropdown from '@/components/ExportDropdown';
import { 
  exportToPDF, 
  exportToMarkdown, 
  exportToPlainText,
  exportToRTF,
  exportToDocx,
  exportToCSV,
  exportToJSON,
  exportToXML,
  downloadFile 
} from '@/utils/exportUtils';

const PageItem = ({ page, isActive, onSelect, onRename, onDelete, sidebarOpen, theme }) => {
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

  const activeClass = isActive
    ? theme === 'dark'
      ? 'bg-gray-700'
      : 'bg-gray-200'
    : '';

  return (
    <div
      className={`cursor-pointer flex justify-between items-center ${activeClass} ${
        theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
      }`}
      onClick={() => onSelect(page)}
    >
      <div className="flex items-center overflow-hidden py-2 px-4 w-full">
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
            <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            } ring-1 ring-black ring-opacity-5`}>
              <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                <button
                  className={`block px-4 py-2 text-sm w-full text-left ${
                    theme === 'dark'
                      ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(page);
                    setIsOpen(false);
                  }}
                >
                  Rename
                </button>
                <button
                  className={`block px-4 py-2 text-sm w-full text-left ${
                    theme === 'dark'
                      ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
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

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-9 px-0"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

export default function RichTextEditor() {
  const { theme } = useTheme();
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const editorRef = useRef(null)
  const editorInstanceRef = useRef(null)
  const [saveStatus, setSaveStatus] = useState('saved');
  const [wordCount, setWordCount] = useState(0);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [pageToRename, setPageToRename] = useState(null);
  const [newPageTitle, setNewPageTitle] = useState('');

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
          const updatedPage = { ...currentPage, content };
          const updatedPages = pages.map(p => p.id === updatedPage.id ? updatedPage : p);
          setPages(updatedPages);
          window.electron.invoke('save-pages', updatedPages).catch((error) => {
            console.error('Error saving pages:', error);
          });
          setSaveStatus('saved');
          
          // Calculate word count
          const wordCount = content.blocks.reduce((count, block) => {
            if (block.type === 'paragraph' || block.type === 'header') {
              const text = block.data.text.trim();
              if (text) {
                return count + text.split(/\s+/).filter(word => word.length > 0).length;
              }
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
      if (editorInstanceRef.current) {
        editorInstanceRef.current.destroy();
        editorInstanceRef.current = null;
      }
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
    window.electron.invoke('read-pages').then((data) => {
      setPages(data);
      if (data.length > 0) {
        setCurrentPage(data[0]);
      } else {
        handleNewPage();
      }
    }).catch((error) => {
      console.error('Error fetching pages:', error);
      setPages([]);
      handleNewPage();
    });
  };

  const handleNewPage = () => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { blocks: [] } };
    const updatedPages = [...pages, newPage];
    setPages(updatedPages);
    setCurrentPage(newPage);
    window.electron.invoke('save-pages', updatedPages).catch((error) => {
      console.error('Error saving pages:', error);
    });
  };

  const handleDeletePage = async (page) => {
    if (confirm('Are you sure you want to delete this page?')) {
      try {
        const updatedPages = pages.filter(p => p.id !== page.id);
        setPages(updatedPages);
        window.electron.invoke('save-pages', updatedPages).catch((error) => {
          console.error('Error saving pages:', error);
        });
        if (currentPage.id === page.id) {
          setCurrentPage(updatedPages[0] || null);
        }
      } catch (error) {
        console.error('Error deleting page:', error);
      }
    }
  };

  const loadPage = (page) => {
    setCurrentPage(page);
    if (editorInstanceRef.current) {
      editorInstanceRef.current.render(page.content);
    }
    // Calculate word count
    const wordCount = (page.content?.blocks || []).reduce((count, block) => {
      if (block.type === 'paragraph' || block.type === 'header') {
        const text = block.data.text.trim();
        if (text) {
          return count + text.split(/\s+/).filter(word => word.length > 0).length;
        }
      }
      return count;
    }, 0);
    setWordCount(wordCount);
  };

  const savePage = async () => {
    if (editorInstanceRef.current && currentPage) {
      const content = await editorInstanceRef.current.save();
      const updatedPage = { ...currentPage, content };
      const updatedPages = pages.map(p => p.id === updatedPage.id ? updatedPage : p);
      setPages(updatedPages);
      window.electron.invoke('save-pages', updatedPages).catch((error) => {
        console.error('Error saving pages:', error);
      });
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

  const handleRenamePage = (page) => {
    setPageToRename(page);
    setNewPageTitle(page.title);
    setIsRenameModalOpen(true);
  };

  const confirmRename = async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
      try {
        const updatedPage = { ...pageToRename, title: newPageTitle };
        const updatedPages = pages.map(p => p.id === pageToRename.id ? updatedPage : p);
        
        setPages(updatedPages);
        if (currentPage.id === pageToRename.id) {
          setCurrentPage(updatedPage);
        }

        await window.electron.invoke('save-pages', updatedPages);

        if (currentPage.id === pageToRename.id && editorInstanceRef.current) {
          editorInstanceRef.current.render(updatedPage.content);
        }
      } catch (error) {
        console.error('Error updating page:', error);
      }
    }
    setIsRenameModalOpen(false);
    setPageToRename(null);
    setNewPageTitle('');
  };

  const handleExport = useCallback(async (exportType) => {
    if (editorInstanceRef.current && currentPage) {
      try {
        const content = await editorInstanceRef.current.save();
        const fileName = currentPage.title || 'Untitled';
        switch (exportType) {
          case 'pdf':
            exportToPDF(content, fileName);
            break;
          case 'markdown':
            const markdown = exportToMarkdown(content);
            downloadFile(markdown, `${fileName}.md`, 'text/markdown');
            break;
          case 'text':
            const text = exportToPlainText(content);
            downloadFile(text, `${fileName}.txt`, 'text/plain');
            break;
          case 'rtf':
            const rtf = exportToRTF(content);
            downloadFile(rtf, `${fileName}.rtf`, 'application/rtf');
            break;
          case 'docx':
            const docxBuffer = await exportToDocx(content);
            const docxBlob = new Blob([docxBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const docxUrl = URL.createObjectURL(docxBlob);
            const a = document.createElement('a');
            a.href = docxUrl;
            a.download = `${fileName}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(docxUrl);
            break;
          case 'csv':
            const csv = exportToCSV(content);
            downloadFile(csv, `${fileName}.csv`, 'text/csv');
            break;
          case 'json':
            const json = exportToJSON(content);
            downloadFile(json, `${fileName}.json`, 'application/json');
            break;
          case 'xml':
            const xml = exportToXML(content);
            downloadFile(xml, `${fileName}.xml`, 'application/xml');
            break;
          default:
            console.error('Unsupported export type');
        }
      } catch (error) {
        console.error('Error exporting content:', error);
      }
    }
  }, [currentPage]);

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>
      {/* Sidebar */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-64' : 'w-12'} flex flex-col h-full border-r ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-100 border-gray-200 text-black'}`}>
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
              className={`${
                theme === 'dark'
                  ? 'bg-gray-700 text-white border-gray-900'
                  : 'bg-white text-black'
              }`}
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
              theme={theme}
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
        <div className={`flex justify-between items-center p-4 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h1 
            className="text-2xl font-bold cursor-pointer" 
            onClick={() => handleRenamePage(currentPage)}
          >
            {currentPage.title}
          </h1>
          <div className="flex items-center space-x-4">
            <span className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>{wordCount} words</span>
            {saveStatus === 'saving' && <span className="text-yellow-500">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-green-500">Saved</span>}
            {saveStatus === 'error' && <span className="text-red-500">Error saving</span>}
            <ExportDropdown onExport={handleExport} />
            <ThemeToggle />
          </div>
        </div>
        <div id="editorjs" className={`flex-1 p-8 overflow-auto codex-editor ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-black'}`} />
      </div>

      <RenameModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onConfirm={confirmRename}
        title={newPageTitle}
        onTitleChange={setNewPageTitle}
      />
    </div>
  )
}