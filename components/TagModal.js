import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, ChevronDown } from 'lucide-react'
import useTagStore from '../store/tagStore'

const colors = [
  { background: '#E3F2FD', border: '#90CAF9' }, // Light Blue
  { background: '#E8F5E9', border: '#A5D6A7' }, // Light Green
  { background: '#FFF3E0', border: '#FFCC80' }, // Light Orange
  { background: '#F3E5F5', border: '#CE93D8' }, // Light Purple
  { background: '#FFEBEE', border: '#EF9A9A' }  // Light Red
]

export default function TagModal({ isOpen, onClose, onConfirm, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState(tag?.name || '')
  const [tagColor, setTagColor] = useState(tag?.color || colors[0])
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const deleteTag = useTagStore(state => state.deleteTag)

  useEffect(() => {
    if (isOpen) {
      setTagName(tag?.name || '')
      setTagColor(tag?.color || colors[0])
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
    if (tagName.trim()) {
      onConfirm({ name: tagName.trim(), color: tagColor })
      onClose()
    }
  }

  const filteredTags = existingTags.filter(t => 
    t.name.toLowerCase().includes(tagName.toLowerCase()) && t.name !== tagName
  )
  const isExistingTag = existingTags.some(t => t.name === tagName)

  const handleDelete = () => {
    if (onDelete) {
      onDelete(tag)
    } else {
      deleteTag(tag)
    }
    setShowDeleteWarning(false)
    onClose()
  }

  return (
    <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div 
            className="relative transform overflow-visible rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 w-full sm:max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
              <button
                type="button"
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={onClose}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
              <div>
                <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">
                  {tag ? 'Edit Tag' : 'Add Tag'}
                </h3>
                <div className="mt-2">
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      placeholder="Enter or select a tag"
                      value={tagName}
                      onChange={(e) => {
                        setTagName(e.target.value)
                        setIsDropdownOpen(true)
                      }}
                      className="w-full pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-0 top-0 h-full"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    {isDropdownOpen && filteredTags.length > 0 && (
                      <div 
                        ref={dropdownRef}
                        className="absolute left-0 mt-1 w-full rounded-md shadow-lg bg-white border border-gray-200 z-50 max-h-40 overflow-y-auto"
                      >
                        <div className="py-1" role="menu" aria-orientation="vertical">
                          {filteredTags.map((existingTag, index) => (
                            <button
                              key={index}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                              onClick={() => {
                                setTagName(existingTag.name)
                                setTagColor(existingTag.color) // Set the color of the existing tag
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
                    <h4 className="text-sm font-medium text-gray-900">Select Color</h4>
                    <div className="flex space-x-2 mt-2">
                      {colors.map((color, index) => (
                        <button
                          key={index}
                          className={`w-6 h-6 rounded-full ${tagColor === color ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                          style={{ backgroundColor: color.background, border: `2px solid ${color.border}` }}
                          onClick={() => setTagColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
              <Button
                onClick={handleConfirm}
                disabled={!tagName.trim()}
                className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExistingTag ? 'Add' : 'Create'}
              </Button>
              {tag && (
                <Button
                  onClick={() => setShowDeleteWarning(true)}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:mt-0 sm:w-auto sm:mr-3"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDeleteWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4">Delete Tag</h3>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to delete this tag? This action cannot be undone and the tag will be removed from all pages where it's currently being used.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                onClick={() => setShowDeleteWarning(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
