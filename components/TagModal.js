import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useTheme } from 'next-themes'

export default function TagModal({ isOpen, onClose, onConfirm, onRemove, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState('')
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const { theme } = useTheme()
  const inputRef = useRef(null)
  const modalRef = useRef(null)

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
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        onConfirm(tagName)
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
    }
  }, [isOpen])

  const isExistingTag = existingTags.includes(tagName)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div 
        ref={modalRef}
        className={`rounded shadow-xl border p-4 w-64 ${
          theme === 'dark' 
            ? 'bg-gray-800 border-gray-700 text-white' 
            : 'bg-white border-gray-200 text-black'
        }`}
      >
        <h2 className="mb-2 text-lg font-medium">
          {tag ? 'Edit Tag' : 'Add Tag'}
        </h2>
        <Input
          ref={inputRef}
          placeholder="Enter or select a tag"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          list="existing-tags"
          className={`w-full p-2 mb-4 text-sm border rounded ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-black'
          }`}
        />
        <datalist id="existing-tags">
          {existingTags.map((existingTag, index) => (
            <option key={index} value={existingTag} />
          ))}
        </datalist>
        <div className="flex justify-end space-x-2">
          {tag && (
            <Button
              variant="destructive"
              onClick={onRemove}
              className={`px-3 py-1 text-sm rounded ${
                theme === 'dark'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              Remove
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            className={`px-3 py-1 text-sm rounded ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-black'
            }`}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(tagName)}
            className={`px-3 py-1 text-sm rounded ${
              theme === 'dark'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isExistingTag ? 'Select Tag' : 'Create Tag'}
          </Button>
        </div>
        {tag && (
          <div className="mt-4">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteWarning(true)}
              className={`w-full px-3 py-1 text-sm rounded ${
                theme === 'dark'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              Delete Tag
            </Button>
            {showDeleteWarning && (
              <div className="mt-2 text-sm text-red-600">
                <p>Are you sure you want to delete this tag? This action will remove the tag across all pages.</p>
                <div className="flex justify-end space-x-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteWarning(false)}
                    className={`px-3 py-1 text-sm rounded ${
                      theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-black'
                    }`}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={onDelete}
                    className={`px-3 py-1 text-sm rounded ${
                      theme === 'dark'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
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
