import React, { useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'

export function RenameModal({ isOpen, onClose, onConfirm, title, onTitleChange }) {
  const inputRef = useRef(null)
  const modalRef = useRef(null)
  const { theme } = useTheme()
  const maxLength = 50

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, onClose])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onConfirm()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const getModalClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-900 border-green-600 text-green-400 shadow-[0_0_20px_rgba(0,255,0,0.3)]'
    } else if (theme === 'dark') {
      return 'bg-gray-800 border-gray-700 text-white'
    } else {
      return 'bg-white border-gray-200 text-black'
    }
  }

  const getInputClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 border-green-600 text-green-400 shadow-[0_0_5px_rgba(0,255,0,0.3)] font-mono'
    } else if (theme === 'dark') {
      return 'bg-gray-700 border-gray-600 text-white'
    } else {
      return 'bg-white border-gray-300 text-black'
    }
  }

  const getButtonClasses = (type) => {
    if (theme === 'fallout') {
      if (type === 'primary') {
        return 'bg-green-600 hover:bg-green-700 text-gray-900 shadow-[0_0_5px_rgba(0,255,0,0.4)] font-mono'
      } else {
        return 'bg-gray-700 hover:bg-gray-600 text-green-400 border border-green-600 font-mono'
      }
    } else if (theme === 'dark') {
      if (type === 'primary') {
        return 'bg-blue-600 hover:bg-blue-700 text-white'
      } else {
        return 'bg-gray-700 hover:bg-gray-600 text-white'
      }
    } else {
      if (type === 'primary') {
        return 'bg-blue-500 hover:bg-blue-600 text-white'
      } else {
        return 'bg-gray-200 hover:bg-gray-300 text-black'
      }
    }
  }

  const getTextClasses = () => {
    if (theme === 'fallout') {
      return 'text-green-400 font-mono'
    } else if (theme === 'dark') {
      return 'text-gray-400'
    } else {
      return 'text-gray-600'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div 
        ref={modalRef}
        className={`rounded shadow-xl border p-4 w-64 ${getModalClasses()}`}
      >
        <h2 className={`mb-2 text-lg font-medium ${theme === 'fallout' ? 'font-mono text-green-400' : ''}`}>
          Rename Page
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value.slice(0, maxLength))}
          maxLength={maxLength}
          onKeyDown={handleKeyDown}
          className={`w-full p-2 mb-1 text-sm border rounded ${getInputClasses()}`}
        />
        <p className={`text-xs mb-4 ${getTextClasses()}`}>
          {title.length}/{maxLength} characters
        </p>
        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className={`px-3 py-1 text-sm rounded ${getButtonClasses('cancel')}`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1 text-sm rounded ${getButtonClasses('primary')}`}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
