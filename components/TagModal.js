import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useTheme } from 'next-themes'

export default function TagModal({ isOpen, onClose, onConfirm, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState('')
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
        <select
          className={`w-full p-2 mb-4 text-sm border rounded ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-black'
          }`}
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
        >
          <option value="">Select existing tag</option>
          {existingTags.map((existingTag, index) => (
            <option key={index} value={existingTag}>
              {existingTag}
            </option>
          ))}
        </select>
        <Input
          ref={inputRef}
          placeholder="Or create new tag"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          className={`w-full p-2 mb-4 text-sm border rounded ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-black'
          }`}
        />
        <div className="flex justify-end space-x-2">
          {tag && (
            <Button
              variant="destructive"
              onClick={onDelete}
              className={`px-3 py-1 text-sm rounded ${
                theme === 'dark'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              Delete
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
            {tag ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}
