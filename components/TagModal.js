import React, { useState, useEffect, useRef } from 'react'
import { getTagChipStyle, ensureHex } from '@/utils/colorUtils'
import { X, Plus, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function TagModal({ isOpen, onClose, onConfirm, onDelete, tag, existingTags, deleteTagFromAllPages, pages = [] }) {
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState('#3B82F6')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { tagName, affectedPages }
  const { theme } = useTheme()
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      if (tag) {
        setTagName(tag.name)
        setTagColor(ensureHex(tag.color))
        setShowCreateNew(true)
      } else {
        setTagName('')
        setTagColor('#3B82F6')
        setShowCreateNew(false)
      }
      setIsDeleting(false)
      setDeleteConfirm(null)
    }
  }, [isOpen, tag])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const getModalClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-900 text-green-400 shadow-[0_0_20px_rgba(0,255,0,0.3)] border border-green-600'
    } else if (theme === 'darkblue') {
      return 'bg-[#141825] text-[#e0e6f0] border border-[#1c2438]'
    } else if (theme === 'dark') {
      return 'bg-[#1a1a1a] text-white'
    } else {
      return 'bg-white text-gray-900'
    }
  }

  const getInputClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 border-green-600 text-green-400 shadow-[0_0_5px_rgba(0,255,0,0.3)] font-mono'
    } else if (theme === 'darkblue') {
      return 'bg-[#1a2035] border-[#1c2438] text-[#e0e6f0]'
    } else if (theme === 'dark') {
      return 'bg-[#2f2f2f] border-[#3a3a3a] text-white'
    } else {
      return 'bg-white border-gray-300 text-gray-900'
    }
  }

  const getButtonClasses = (type) => {
    const baseClasses = 'px-3 py-2 text-sm font-medium rounded-md transition-all duration-200'

    if (theme === 'fallout') {
      switch (type) {
        case 'primary':
          return `${baseClasses} bg-green-600 hover:bg-green-700 text-gray-900 shadow-[0_0_5px_rgba(0,255,0,0.4)] font-mono`
        case 'delete':
          return `${baseClasses} bg-red-600 hover:bg-red-700 text-white shadow-[0_0_5px_rgba(255,0,0,0.4)] font-mono`
        default:
          return `${baseClasses} bg-gray-700 hover:bg-gray-600 text-green-400 border border-green-600 font-mono`
      }
    } else if (theme === 'darkblue') {
      switch (type) {
        case 'primary':
          return `${baseClasses} bg-blue-500 hover:bg-blue-400 text-white`
        case 'delete':
          return `${baseClasses} bg-red-600 hover:bg-red-500 text-white`
        default:
          return `${baseClasses} bg-[#1a2035] hover:bg-[#232b42] text-[#8b99b5] border border-[#1c2438]`
      }
    } else if (theme === 'dark') {
      switch (type) {
        case 'primary':
          return `${baseClasses} bg-indigo-600 hover:bg-indigo-700 text-white`
        case 'delete':
          return `${baseClasses} bg-red-600 hover:bg-red-700 text-white`
        default:
          return `${baseClasses} bg-[#2f2f2f] hover:bg-[#3a3a3a] text-white border border-[#3a3a3a]`
      }
    } else {
      switch (type) {
        case 'primary':
          return `${baseClasses} bg-indigo-600 hover:bg-indigo-700 text-white`
        case 'delete':
          return `${baseClasses} bg-red-600 hover:bg-red-700 text-white`
        default:
          return `${baseClasses} bg-white hover:bg-gray-50 text-gray-900 border border-gray-300`
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (tagName.trim()) {
      onConfirm({
        id: tag?.id || Date.now(),
        name: tagName.trim(),
        color: tagColor
      })
      setTagName('')
      setTagColor('#3B82F6')
      setShowCreateNew(false)
    }
  }

  const handleExistingTagSelect = (existingTag) => {
    onConfirm(existingTag)
    onClose()
  }

  const getAffectedPages = (name) => {
    return pages.filter(p => (p.tagNames || []).includes(name)).map(p => p.title)
  }

  const handleDelete = () => {
    if (isDeleting) {
      onDelete(tag.id)
    } else {
      setIsDeleting(true)
    }
  }

  const handleDragDelete = (name) => {
    const affected = getAffectedPages(name)
    if (affected.length > 0) {
      setDeleteConfirm({ tagName: name, affectedPages: affected })
    } else {
      deleteTagFromAllPages(name)
    }
  }

  const confirmDragDelete = () => {
    if (deleteConfirm) {
      deleteTagFromAllPages(deleteConfirm.tagName)
      setDeleteConfirm(null)
    }
  }

  const handleColorChange = (color) => {
    setTagColor(color)
  }

  const isNameTaken = existingTags?.some(existingTag => 
    existingTag.name.toLowerCase() === tagName.toLowerCase() && 
    (!tag || existingTag.id !== tag.id)
  )

  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ]

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50 p-4" onClick={handleOverlayClick} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}>
      <div className="relative w-full max-w-lg mx-auto">
        <div style={{ animation: 'dash-modal-in 150ms ease-out forwards' }} className={`relative transform rounded-lg shadow-xl transition-all ${getModalClasses()}`}>
          <div className="absolute right-0 top-0 pr-6 pt-6">
            <button
              type="button"
              className={`rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme === 'fallout' ? 'text-green-400 hover:text-green-300 focus:ring-green-500 font-mono' : theme === 'darkblue' ? 'text-[#8b99b5] hover:text-[#e0e6f0] focus:ring-blue-500' : theme === 'dark' ? 'text-[#8e8e8e] hover:text-[#c0c0c0] focus:ring-indigo-500' : 'text-gray-400 hover:text-gray-500 focus:ring-indigo-500'}`}
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="px-6 pb-4 pt-6">
            <div className="w-full">
              <div className="w-full">
                <div className="flex items-center mb-4">
                  {!tag && showCreateNew && (
                    <button
                      type="button"
                      onClick={() => setShowCreateNew(false)}
                      className={`mr-3 p-1 rounded-md transition-colors ${theme === 'fallout' ? 'hover:bg-gray-800 text-green-400' : theme === 'darkblue' ? 'hover:bg-[#232b42] text-[#8b99b5]' : theme === 'dark' ? 'hover:bg-[#2f2f2f] text-[#8e8e8e]' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  )}
                  <h3 className={`text-lg font-semibold ${theme === 'fallout' ? 'text-green-400 font-mono' : ''}`}>
                    {tag ? 'Edit Tag' : showCreateNew ? 'Create New Tag' : 'Add Tag to Page'}
                  </h3>
                </div>
                <div className="space-y-4">
                  {!tag && !showCreateNew && existingTags && existingTags.length > 0 && (
                    <div>
                      <label className={`block text-sm font-medium mb-3 ${theme === 'fallout' ? 'text-green-300 font-mono' : ''}`}>
                        Select an existing tag
                      </label>
                      <div className="flex flex-wrap gap-2 mb-6 max-h-48 overflow-y-auto">
                        {existingTags.map((existingTag) => (
                          <button
                            key={existingTag.id}
                            type="button"
                            draggable
                            onClick={() => handleExistingTagSelect(existingTag)}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', JSON.stringify({ id: existingTag.id, name: existingTag.name }))
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => {}}
                            className="inline-flex items-center rounded-md font-medium border px-2 py-1 text-xs transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-grab active:cursor-grabbing"
                            style={getTagChipStyle(existingTag.color, theme)}
                          >
                            {existingTag.name}
                          </button>
                        ))}
                      </div>
                      {/* Trash drop zone - visible when dragging */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          setIsDragOver(true)
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setIsDragOver(false)
                          try {
                            const data = JSON.parse(e.dataTransfer.getData('text/plain'))
                            if (data?.name) {
                              handleDragDelete(data.name)
                            }
                          } catch {}
                        }}
                        className={`
                          flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 mb-4 transition-all duration-200
                          ${isDragOver
                            ? theme === 'fallout'
                              ? 'border-red-500 bg-red-500/20 text-red-400 scale-105'
                              : 'border-red-400 bg-red-50 text-red-500 scale-105 dark:bg-red-500/15'
                            : theme === 'fallout'
                              ? 'border-green-600/40 text-green-500/60'
                              : theme === 'darkblue'
                                ? 'border-[#1c2438] text-[#5d6b88]'
                                : theme === 'dark'
                                  ? 'border-[#3a3a3a] text-[#6b6b6b]'
                                  : 'border-gray-300 text-gray-400'
                          }
                        `}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className={`text-xs font-medium ${theme === 'fallout' ? 'font-mono' : ''}`}>
                          {isDragOver ? 'Release to delete' : 'Drag here to delete'}
                        </span>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className={`w-full border-t ${theme === 'fallout' ? 'border-green-600' : theme === 'darkblue' ? 'border-[#1c2438]' : theme === 'dark' ? 'border-[#3a3a3a]' : 'border-gray-300'}`} />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className={`px-3 ${theme === 'fallout' ? 'bg-gray-900 text-green-300 font-mono' : theme === 'darkblue' ? 'bg-[#141825] text-[#8b99b5]' : theme === 'dark' ? 'bg-[#1a1a1a] text-[#8e8e8e]' : 'bg-white text-gray-600'}`}>
                            or create a new one
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <button
                          type="button"
                          onClick={() => setShowCreateNew(true)}
                          className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${getButtonClasses('primary')}`}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Tag
                        </button>
                      </div>
                    </div>
                  )}
                  {(tag || showCreateNew) && (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${theme === 'fallout' ? 'text-green-300 font-mono' : ''}`}>
                        Tag Name
                      </label>
                      <input
                        ref={inputRef}
                        type="text"
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${getInputClasses()}`}
                        placeholder="Enter tag name"
                        maxLength={20}
                      />
                      {isNameTaken && (
                        <p className={`text-red-500 text-xs mt-1 ${theme === 'fallout' ? 'font-mono' : ''}`}>
                          A tag with this name already exists
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-3 ${theme === 'fallout' ? 'text-green-300 font-mono' : ''}`}>
                        Choose Color
                      </label>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-3">
                          {colors.map((color) => {
                            const tagStyle = getTagChipStyle(color, theme)
                            const isSelected = tagColor === color
                            return (
                              <button
                                key={color}
                                type="button"
                                onClick={() => handleColorChange(color)}
                                className={`w-8 h-8 rounded-full transition-all ${
                                  isSelected 
                                    ? 'scale-110' 
                                    : 'hover:scale-105'
                                }`}
                                style={{ 
                                  backgroundColor: tagStyle.backgroundColor,
                                  ...(isSelected && {
                                    boxShadow: `0 0 0 2px ${tagStyle.borderColor}, 0 0 0 4px rgba(0,0,0,0.1)`
                                  })
                                }}
                              />
                            )
                          })}
                        </div>
                        <div className="flex items-center">
                          <span className={`text-xs mr-2 ${theme === 'fallout' ? 'text-green-300 font-mono' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-gray-600'}`}>
                            Preview:
                          </span>
                          <span
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border"
                            style={getTagChipStyle(tagColor, theme)}
                          >
                            {tagName || 'Example Tag'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </form>
                  )}
                  {!tag && !showCreateNew && (!existingTags || existingTags.length === 0) && (
                    <div className="text-center py-8">
                      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${theme === 'fallout' ? 'bg-gray-800 border border-green-600' : theme === 'darkblue' ? 'bg-[#1a2035] border border-[#1c2438]' : theme === 'dark' ? 'bg-[#2f2f2f]' : 'bg-gray-100'}`}>
                        <Plus className={`h-8 w-8 ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-gray-500'}`} />
                      </div>
                      <h4 className={`text-base font-medium mb-2 ${theme === 'fallout' ? 'text-green-400 font-mono' : theme === 'darkblue' ? 'text-[#e0e6f0]' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        No tags yet
                      </h4>
                      <p className={`text-sm mb-6 ${theme === 'fallout' ? 'text-green-300 font-mono' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-gray-600'}`}>
                        Create your first tag to start organizing your pages.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCreateNew(true)}
                        className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${getButtonClasses('primary')}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Tag
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Delete confirmation overlay */}
          {deleteConfirm && (
            <div className={`px-6 py-4 ${theme === 'fallout' ? 'border-t border-green-600' : theme === 'darkblue' ? 'border-t border-[#1c2438]' : theme === 'dark' ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-200'}`}>
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${theme === 'fallout' ? 'text-red-400' : 'text-amber-500'}`} />
                <div>
                  <p className={`text-sm font-medium mb-1 ${theme === 'fallout' ? 'font-mono' : ''}`}>
                    Delete "{deleteConfirm.tagName}"?
                  </p>
                  <p className={`text-xs ${theme === 'fallout' ? 'text-green-300 font-mono' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-gray-500'}`}>
                    This tag will be removed from {deleteConfirm.affectedPages.length} page{deleteConfirm.affectedPages.length !== 1 ? 's' : ''}:
                  </p>
                  <ul className={`text-xs mt-1 space-y-0.5 ${theme === 'fallout' ? 'text-green-300 font-mono' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-gray-500'}`}>
                    {deleteConfirm.affectedPages.map((name, i) => (
                      <li key={i}>• {name}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${getButtonClasses('cancel')}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDragDelete}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${getButtonClasses('delete')}`}
                >
                  Delete from all pages
                </button>
              </div>
            </div>
          )}

          <div className={`px-6 py-4 flex flex-col sm:flex-row-reverse gap-2 ${theme === 'fallout' ? 'border-t border-green-600' : theme === 'darkblue' ? 'bg-[#0c1017] border-t border-[#1c2438]' : theme === 'dark' ? 'bg-[#141414]' : 'bg-gray-50'}`}>
            {(tag || showCreateNew) && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!tagName.trim() || isNameTaken}
                className={`px-4 py-2 text-sm font-medium rounded-md ${getButtonClasses('primary')} ${
                  (!tagName.trim() || isNameTaken) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {tag ? 'Update Tag' : 'Create Tag'}
              </button>
            )}
            {tag && (
              <button
                type="button"
                onClick={handleDelete}
                className={`px-4 py-2 text-sm font-medium rounded-md ${getButtonClasses('delete')}`}
              >
                {isDeleting ? (
                  (() => {
                    const affected = getAffectedPages(tag.name)
                    return affected.length > 0
                      ? `Confirm — removes from ${affected.length} page${affected.length !== 1 ? 's' : ''}`
                      : 'Confirm Delete'
                  })()
                ) : 'Delete Tag'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-md ${getButtonClasses('cancel')}`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}