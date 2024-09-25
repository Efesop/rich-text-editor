'use client'

import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import useTagStore from '../../store/tagStore'
import useEditor from '../../hooks/useEditor'
import Sidebar from './Sidebar'
import MainContent from './MainContent'
import { RenameModal } from '../RenameModal'
import TagModal from '../TagModal'

export default function RichTextEditor() {
  const { theme } = useTheme();
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchFilter, setSearchFilter] = useState('all')
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [pageToRename, setPageToRename] = useState(null)
  const [newPageTitle, setNewPageTitle] = useState('')
  const [tags, setTags] = useState([])
  const [tagToEdit, setTagToEdit] = useState(null)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const { tags: existingTags, addTag, removeTag, deleteTag } = useTagStore()

  const {
    editorInstanceRef,
    saveStatus,
    wordCount,
    loadEditorJS,
    fetchPages,
    handleNewPage,
    handleDeletePage,
    loadPage,
    savePage,
    handlePageSelect,
    handleExport,
    handleRemoveTag,
    handleDeleteTag
  } = useEditor(pages, setPages, currentPage, setCurrentPage, tags, setTags)

  useEffect(() => {
    fetchPages()
  }, [])

  useEffect(() => {
    if (currentPage && typeof window !== 'undefined') {
      loadEditorJS()
    }
  }, [currentPage, loadEditorJS])

  const handleRenamePage = (page) => {
    setPageToRename(page);
    setNewPageTitle(page.title);
    setIsRenameModalOpen(true);
  };

  const confirmRename = async () => {
    if (pageToRename && newPageTitle && newPageTitle !== pageToRename.title) {
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
    }
    setIsRenameModalOpen(false);
    setPageToRename(null);
    setNewPageTitle('');
  };

  const handleConfirmTag = (tag) => {
    const existingTag = existingTags.find(t => t.name === tag.name)
    if (existingTag) {
      const updatedCurrentTags = tags.map(t => t.name === existingTag.name ? tag : t)
      if (!updatedCurrentTags.some(t => t.name === tag.name)) {
        updatedCurrentTags.push(tag)
      }
      setTags(updatedCurrentTags)
      const updatedPages = pages.map(page => ({
        ...page,
        tags: page.tags ? page.tags.map(t => t.name === existingTag.name ? tag : t) : []
      }))
      setPages(updatedPages)
      window.electron.invoke('save-pages', updatedPages).catch((error) => {
        console.error('Error saving pages:', error)
      })
    } else {
      setTags([...tags, tag])
      addTag(tag)
    }
    setIsTagModalOpen(false)
  }

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'dark bg-gray-900 text-white' : 'bg-white text-black'}`}>
      <Sidebar
        pages={pages}
        currentPage={currentPage}
        sidebarOpen={sidebarOpen}
        searchTerm={searchTerm}
        searchFilter={searchFilter}
        onNewPage={handleNewPage}
        onPageSelect={handlePageSelect}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onSearchTermChange={setSearchTerm}
        onSearchFilterChange={setSearchFilter}
      />
      <MainContent
        currentPage={currentPage}
        tags={tags}
        saveStatus={saveStatus}
        wordCount={wordCount}
        onExport={handleExport}
        onRemoveTag={handleRemoveTag}
        onAddTag={() => {
          setTagToEdit(null)
          setIsTagModalOpen(true)
        }}
        onEditTag={(tag) => {
          setTagToEdit(tag)
          setIsTagModalOpen(true)
        }}
        editorInstanceRef={editorInstanceRef}
      />
      <RenameModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onConfirm={confirmRename}
        title={newPageTitle}
        onTitleChange={setNewPageTitle}
      />
      <TagModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        onConfirm={handleConfirmTag}
        onRemove={handleRemoveTag}
        onDelete={handleDeleteTag}
        tag={tagToEdit}
        existingTags={existingTags}
      />
    </div>
  )
}