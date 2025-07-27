import React, { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function TagModal({ isOpen, onClose, onConfirm, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState('#3B82F6')
  const [isDeleting, setIsDeleting] = useState(false)
  const { theme } = useTheme()
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      if (tag) {
        setTagName(tag.name)
        setTagColor(tag.color)
      } else {
        setTagName('')
        setTagColor('#3B82F6')
      }
      setIsDeleting(false)
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
    } else if (theme === 'dark') {
      return 'bg-gray-800 text-white'
    } else {
      return 'bg-white text-gray-900'
    }
  }

  const getInputClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 border-green-600 text-green-400 shadow-[0_0_5px_rgba(0,255,0,0.3)] font-mono'
    } else if (theme === 'dark') {
      return 'bg-gray-700 border-gray-600 text-white'
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
    } else if (theme === 'dark') {
      switch (type) {
        case 'primary':
          return `${baseClasses} bg-indigo-600 hover:bg-indigo-700 text-white`
        case 'delete':
          return `${baseClasses} bg-red-600 hover:bg-red-700 text-white`
        default:
          return `${baseClasses} bg-gray-700 hover:bg-gray-600 text-white border border-gray-600`
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
    }
  }

  const handleDelete = () => {
    if (isDeleting) {
      onDelete(tag.id)
    } else {
      setIsDeleting(true)
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50">
      <div className="relative w-full max-w-md p-6 mx-auto">
        <div className={`relative transform overflow-hidden rounded-lg shadow-xl transition-all ${getModalClasses()}`}>
          <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
            <button
              type="button"
              className={`rounded-md bg-transparent text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${theme === 'dark' ? 'hover:text-gray-300' : 'hover:text-gray-500'} ${theme === 'fallout' ? 'text-green-400 hover:text-green-300 focus:ring-green-500 font-mono' : ''}`}
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                <h3 className={`text-lg font-medium leading-6 ${theme === 'fallout' ? 'text-green-400 font-mono' : ''}`}>
                  {tag ? 'Edit Tag' : 'Create New Tag'}
                </h3>
                <div className="mt-4">
                  <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                      <label className={`block text-sm font-medium mb-2 ${theme === 'fallout' ? 'text-green-300 font-mono' : ''}`}>
                        Tag Name
                      </label>
                      <input
                        ref={inputRef}
                        type="text"
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${getInputClasses()}`}
                        placeholder="Enter tag name"
                        maxLength={20}
                      />
                      {isNameTaken && (
                        <p className={`text-red-500 text-xs mt-1 ${theme === 'fallout' ? 'font-mono' : ''}`}>
                          A tag with this name already exists
                        </p>
                      )}
                    </div>
                    <div className="mb-6">
                      <label className={`block text-sm font-medium mb-2 ${theme === 'fallout' ? 'text-green-300 font-mono' : ''}`}>
                        Color
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {colors.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => handleColorChange(color)}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${
                              tagColor === color 
                                ? 'border-gray-900 scale-110' 
                                : theme === 'fallout' 
                                  ? 'border-green-600 hover:border-green-400' 
                                  : 'border-gray-300 hover:border-gray-400'
                            } ${theme === 'fallout' ? 'shadow-[0_0_3px_rgba(0,255,0,0.3)]' : ''}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
          <div className={`px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 ${theme === 'fallout' ? 'border-t border-green-600' : theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50'}`}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!tagName.trim() || isNameTaken}
              className={`w-full justify-center sm:ml-3 sm:w-auto ${getButtonClasses('primary')} ${
                (!tagName.trim() || isNameTaken) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {tag ? 'Update Tag' : 'Create Tag'}
            </button>
            {tag && (
              <button
                type="button"
                onClick={handleDelete}
                className={`mt-3 w-full justify-center sm:mt-0 sm:ml-3 sm:w-auto ${getButtonClasses('delete')}`}
              >
                {isDeleting ? 'Confirm Delete' : 'Delete Tag'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`mt-3 w-full justify-center sm:mt-0 sm:w-auto ${getButtonClasses('cancel')}`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}