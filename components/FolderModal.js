import React, { useState, useEffect, useRef } from 'react'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useTheme } from 'next-themes'

export function FolderModal({ isOpen, onClose, onConfirm }) {
  const [folderName, setFolderName] = useState('')
  const inputRef = useRef(null)
  const { theme } = useTheme()

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm(folderName.slice(0, 20))
    setFolderName('')
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleInputChange = (e) => {
    setFolderName(e.target.value.slice(0, 20))
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div 
        className={`${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} p-6 rounded-lg shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Add New Folder</h2>
        <form onSubmit={handleSubmit}>
          <Input
            ref={inputRef}
            type="text"
            value={folderName}
            onChange={handleInputChange}
            placeholder="Enter folder name (max 20 chars)"
            className={`mb-4 ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
            maxLength={20}
          />
          <div className="flex justify-end space-x-2">
            <Button type="button" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button type="submit" disabled={!folderName.trim()}>
              Add Folder
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}