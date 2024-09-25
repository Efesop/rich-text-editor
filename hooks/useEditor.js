import { useState, useRef, useCallback } from 'react'
import { loadEditorJS } from '../utils/editorUtils'

const useEditor = (pages, setPages, currentPage, setCurrentPage, tags, setTags) => {
  const [saveStatus, setSaveStatus] = useState('saved');
  const [wordCount, setWordCount] = useState(0);
  const editorInstanceRef = useRef(null);

  const fetchPages = useCallback(() => {
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
  }, [setPages, setCurrentPage]);

  const handleNewPage = useCallback(() => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { blocks: [] } };
    const updatedPages = [...pages, newPage];
    setPages(updatedPages);
    setCurrentPage(newPage);
    window.electron.invoke('save-pages', updatedPages).catch((error) => {
      console.error('Error saving pages:', error);
    });
  }, [pages, setPages, setCurrentPage]);

  const handleDeletePage = useCallback(async (page) => {
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
  }, [pages, setPages, currentPage, setCurrentPage]);

  const loadPage = useCallback((page) => {
    setCurrentPage(page);
    setTags(page.tags || []);
    if (editorInstanceRef.current) {
      editorInstanceRef.current.render(page.content);
    }
    // Calculate word count
    const wordCount = (page.content?.blocks || []).reduce((count, block) => {
      let text = ''
      switch (block.type) {
        case 'paragraph':
        case 'header':
        case 'quote':
          text = block.data.text?.trim() || ''
          break
        case 'list':
        case 'checklist':
          text = block.data.items?.map(item => item.text).join(' ').trim() || ''
          break
        case 'table':
          text = block.data.content.flat().join(' ').trim() || ''
          break
        case 'code':
          text = block.data.code?.trim() || ''
          break
        default:
          text = ''
      }
      if (text) {
        return count + text.split(/\s+/).filter(word => word.length > 0).length
      }
      return count
    }, 0);
    setWordCount(wordCount);
  }, [setCurrentPage, setTags, setWordCount]);

  const savePage = useCallback(async () => {
    if (editorInstanceRef.current && currentPage) {
      const content = await editorInstanceRef.current.save();
      const updatedPage = { ...currentPage, content, tags };
      const updatedPages = pages.map(p => p.id === updatedPage.id ? updatedPage : p);
      setPages(updatedPages);
      window.electron.invoke('save-pages', updatedPages).catch((error) => {
        console.error('Error saving pages:', error);
      });
    }
  }, [currentPage, pages, tags, setPages]);

  const handlePageSelect = useCallback(async (page) => {
    if (editorInstanceRef.current) {
      await savePage();
    }
    loadPage(page);
  }, [savePage, loadPage]);

  const handleExport = useCallback(async (exportType) => {
    if (editorInstanceRef.current && currentPage) {
      try {
        const content = await editorInstanceRef.current.save();
        const fileName = currentPage.title || 'Untitled';
        // ... (rest of the export logic)
      } catch (error) {
        console.error('Error exporting content:', error);
      }
    }
  }, [currentPage]);

  const handleRemoveTag = useCallback((tag) => {
    const updatedTags = tags.filter(t => t.name !== tag.name);
    setTags(updatedTags);
    const updatedPage = { ...currentPage, tags: updatedTags };
    const updatedPages = pages.map(page => page.id === currentPage.id ? updatedPage : page);
    setPages(updatedPages);
    window.electron.invoke('save-pages', updatedPages).catch((error) => {
      console.error('Error saving pages:', error);
    });
  }, [tags, setTags, currentPage, pages, setPages]);

  const handleDeleteTag = useCallback((tag) => {
    setTags(tags.filter(t => t.name !== tag.name));
    const updatedPages = pages.map(page => ({
      ...page,
      tags: page.tags ? page.tags.filter(t => t.name !== tag.name) : []
    }));
    setPages(updatedPages);
    window.electron.invoke('save-pages', updatedPages).catch((error) => {
      console.error('Error saving pages:', error);
    });
  }, [tags, setTags, pages, setPages]);

  return {
    editorInstanceRef,
    saveStatus,
    wordCount,
    loadEditorJS: useCallback(() => loadEditorJS(editorInstanceRef, currentPage, pages, setPages, setSaveStatus, setWordCount), [currentPage, pages, setPages]),
    fetchPages,
    handleNewPage,
    handleDeletePage,
    loadPage,
    savePage,
    handlePageSelect,
    handleExport,
    handleRemoveTag,
    handleDeleteTag
  };
};

export default useEditor;