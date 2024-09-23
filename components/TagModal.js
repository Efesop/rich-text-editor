import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useTheme } from 'next-themes'
import { X, ChevronDown } from 'lucide-react'

export default function TagModal({ isOpen, onClose, onConfirm, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState('')
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { theme } = useTheme()
  const inputRef = useRef(null)
  const modalRef = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (tag) {
      setTagName(tag)
    } else {
      setTagName('')
    }
  }, [tag])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose()
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && tagName.trim()) {
        onConfirm(tagName.trim())
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, onConfirm, tagName])

  useEffect(() => {
    if (!isOpen) {
      setShowDeleteWarning(false)
      setIsDropdownOpen(false)
    }
  }, [isOpen])

  const isExistingTag = existingTags.includes(tagName)

  if (!isOpen) return null

  const handleConfirm = () => {
    if (tagName.trim()) {
      onConfirm(tagName.trim())
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div 
        ref={modalRef}
        className={`relative rounded-lg shadow-xl border p-6 w-80 ${
          theme === 'dark' 
            ? 'bg-gray-800 border-gray-700 text-white' 
            : 'bg-white border-gray-200 text-black'
        }`}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="absolute top-2 right-2"
        >
          <X className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold mb-4">
          {tag ? 'Edit Tag' : 'Add Tag'}
        </h2>
        <div className="relative">
          <Input
            ref={inputRef}
            placeholder="Enter or select a tag"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            className="w-full mb-4"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="absolute right-0 top-0 h-full"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          {isDropdownOpen && (
            <div 
              ref={dropdownRef}
              className={`absolute left-0 mt-1 w-full rounded-md shadow-lg ${
                theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } border z-50`}
            >
              <div className="py-1" role="menu" aria-orientation="vertical">
                {existingTags.map((existingTag, index) => (
                  <button
                    key={index}
                    className={`block w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark'
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    onClick={() => {
                      setTagName(existingTag)
                      setIsDropdownOpen(false)
                    }}
                  >
                    {existingTag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end space-x-2">
          <Button
            onClick={handleConfirm}
            disabled={!tagName.trim()}
          >
            {isExistingTag ? 'Select Tag' : 'Create Tag'}
          </Button>
        </div>
        {tag && (
          <div className="mt-4">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteWarning(true)}
              className="w-full"
            >
              Delete
            </Button>
            {showDeleteWarning && (
              <div className="mt-4 text-sm text-red-600">
                <p>Are you sure you want to delete this tag? This action will remove the tag across all pages.</p>
                <div className="flex justify-end space-x-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteWarning(false)}
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={onDelete}
                    variant="destructive"
                    size="sm"
                  >
                    Confirm Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
