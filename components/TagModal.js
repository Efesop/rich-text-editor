import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronDown } from 'lucide-react'
import useTagStore from '../store/tagStore'
import { useTheme } from 'next-themes'

const colors = [
  { background: '#E3F2FD', border: '#90CAF9' }, // Light Blue
  { background: '#E8F5E9', border: '#A5D6A7' }, // Light Green
  { background: '#FFF3E0', border: '#FFCC80' }, // Light Orange
  { background: '#F3E5F5', border: '#CE93D8' }, // Light Purple
  { background: '#FFEBEE', border: '#EF9A9A' }  // Light Red
]

export default function TagModal({ isOpen, onClose, onConfirm, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState(tag?.name || '')
  const [charCount, setCharCount] = useState(tag?.name?.length || 0)
  const [tagColor, setTagColor] = useState(tag?.color || colors[0])
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const [selectedColorIndex, setSelectedColorIndex] = useState(
    colors.findIndex(c => JSON.stringify(c) === JSON.stringify(tag?.color)) || 0
  )
  const { theme } = useTheme()

  const handleColorSelect = useCallback((color, index) => {
    setTagColor(color)
    setSelectedColorIndex(index)
  }, [])

  useEffect(() => {
    setTagColor(colors[selectedColorIndex])
  }, [selectedColorIndex])

  useEffect(() => {
    if (isOpen) {
      setTagName(tag?.name || '')
      setTagColor(tag?.color || colors[0])
      setSelectedColorIndex(
        tag?.color ? colors.findIndex(c => JSON.stringify(c) === JSON.stringify(tag.color)) : 0
      )
      setShowDeleteWarning(false)
      setIsDropdownOpen(false)
      inputRef.current?.focus()
    }
  }, [isOpen, tag])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && !inputRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (tagName.trim() && tagName.length <= 15) {
      const newTag = { name: tagName.trim(), color: tagColor }
      onConfirm(newTag)
      onClose()
    }
  }

  const filteredTags = existingTags.filter(t => 
    t.name.toLowerCase().includes(tagName.toLowerCase()) && t.name !== tagName
  )
  const isExistingTag = existingTags.some(t => t.name === tagName)

  const handleDelete = () => {
    onDelete(tag.name)
    setShowDeleteWarning(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50">
      <div className="relative w-full max-w-md p-6 mx-auto">
        <div className={`relative transform overflow-hidden rounded-lg shadow-xl transition-all ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
          <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
            <button
              type="button"
              className={`rounded-md bg-transparent text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${theme === 'dark' ? 'hover:text-gray-300' : 'hover:text-gray-500'}`}
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <h3 className="text-lg font-medium leading-6" id="modal-title">
              {tag ? 'Edit Tag' : 'Add Tag'}
            </h3>
            <div className="mt-2">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Enter or select a tag"
                  value={tagName}
                  onChange={(e) => {
                    const newValue = e.target.value.slice(0, 15);
                    setTagName(newValue);
                    setCharCount(newValue.length);
                    setIsDropdownOpen(true);
                  }}
                  className={`w-full px-3 py-2 border rounded-md ${
                    theme === 'dark' 
                      ? 'bg-gray-700 text-white border-gray-600' 
                      : 'bg-white text-gray-900 border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  maxLength={15}
                />
                <span className={`absolute right-3 top-2 text-xs ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {charCount}/15
                </span>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-500"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                {isDropdownOpen && filteredTags.length > 0 && (
                  <div 
                    ref={dropdownRef}
                    className={`absolute left-0 mt-1 w-full rounded-md shadow-lg border z-50 max-h-40 overflow-y-auto ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      {filteredTags.map((existingTag, index) => (
                        <button
                          key={index}
                          className={`block w-full text-left px-4 py-2 text-sm ${
                            theme === 'dark' 
                              ? 'text-gray-200 hover:bg-gray-600' 
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            setTagName(existingTag.name)
                            setTagColor(existingTag.color)
                            setIsDropdownOpen(false)
                          }}
                        >
                          {existingTag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <h4 className="text-sm font-medium">Select Color</h4>
                <div className="flex space-x-2 mt-2">
                  {colors.map((color, index) => (
                    <button
                      key={index}
                      className={`w-6 h-6 rounded-full transition-all duration-200 relative ${
                        selectedColorIndex === index ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: color.background, border: `2px solid ${color.border}` }}
                      onClick={() => handleColorSelect(color, index)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className={`px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 ${
            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
          }`}>
            <button
              onClick={handleConfirm}
              disabled={!tagName.trim()}
              className={`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold shadow-sm sm:ml-3 sm:w-auto ${
                theme === 'dark' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isExistingTag ? 'Add' : 'Create'}
            </button>
            {tag && (
              <button
                onClick={() => setShowDeleteWarning(true)}
                className={`mt-3 inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold shadow-sm sm:mt-0 sm:w-auto sm:mr-3 ${
                  theme === 'dark' 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {showDeleteWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            className={`relative transform overflow-hidden rounded-lg shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg ${
              theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              <h3 className="text-lg font-medium leading-6 mb-2">Delete Tag</h3>
              <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
                Are you sure you want to delete this tag? This action cannot be undone and the tag will be removed from all pages where it's currently being used.
              </p>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowDeleteWarning(false)}
                  className={`px-4 py-2 rounded ${
                    theme === 'dark' 
                      ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className={`px-4 py-2 rounded ${
                    theme === 'dark' 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}