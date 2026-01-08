import React, { useState, useEffect, useRef } from 'react'
import { FolderPlus, X, Folder } from 'lucide-react'
import { useTheme } from 'next-themes'

export function FolderModal({ isOpen, onClose, onConfirm }) {
  const [folderName, setFolderName] = useState('')
  const inputRef = useRef(null)
  const { theme } = useTheme()

  useEffect(() => {
    if (isOpen) {
      setFolderName('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (folderName.trim()) {
      onConfirm(folderName.slice(0, 20))
      setFolderName('')
      onClose()
    }
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

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className={`
          relative w-full max-w-md transform transition-all duration-200
          ${isFallout 
            ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]' 
            : isDark 
              ? 'bg-gray-900 border border-gray-700/50 shadow-2xl' 
              : 'bg-white border border-gray-200 shadow-2xl'
          }
          rounded-2xl overflow-hidden
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with icon */}
        <div className={`
          px-6 pt-6 pb-4
          ${isFallout ? 'border-b border-green-500/30' : isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'}
        `}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`
                p-2.5 rounded-xl
                ${isFallout 
                  ? 'bg-green-500/20 text-green-400' 
                  : isDark 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'bg-blue-100 text-blue-600'
                }
              `}>
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  Create Folder
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDark ? 'text-gray-400' : 'text-gray-500'}
                `}>
                  Organize your pages into folders
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`
                p-2 rounded-lg transition-colors
                ${isFallout 
                  ? 'text-green-500 hover:bg-green-500/20' 
                  : isDark 
                    ? 'text-gray-400 hover:bg-gray-800' 
                    : 'text-gray-400 hover:bg-gray-100'
                }
              `}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Preview */}
          <div className={`
            mb-5 p-4 rounded-xl flex items-center gap-3
            ${isFallout 
              ? 'bg-gray-800/50 border border-green-500/20' 
              : isDark 
                ? 'bg-gray-800/50 border border-gray-700/50' 
                : 'bg-gray-50 border border-gray-100'
            }
          `}>
            <Folder className={`
              w-8 h-8
              ${isFallout ? 'text-green-400' : isDark ? 'text-blue-400' : 'text-blue-500'}
            `} />
            <span className={`
              text-base font-medium truncate
              ${isFallout ? 'text-green-300 font-mono' : isDark ? 'text-gray-200' : 'text-gray-700'}
            `}>
              {folderName || 'Folder name...'}
            </span>
          </div>

          {/* Input */}
          <div className="mb-6">
            <label className={`
              block text-sm font-medium mb-2
              ${isFallout ? 'text-green-400 font-mono' : isDark ? 'text-gray-300' : 'text-gray-700'}
            `}>
              Folder Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={folderName}
              onChange={handleInputChange}
              placeholder="Enter folder name..."
              maxLength={20}
              className={`
                w-full px-4 py-3 text-base rounded-xl transition-all duration-200
                focus:outline-none focus:ring-2
                ${isFallout 
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-600 font-mono focus:ring-green-500/50 focus:border-green-400' 
                  : isDark 
                    ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:ring-blue-500/50 focus:border-blue-500' 
                    : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500'
                }
              `}
            />
            <p className={`
              text-xs mt-2
              ${isFallout ? 'text-green-600 font-mono' : isDark ? 'text-gray-500' : 'text-gray-400'}
            `}>
              {folderName.length}/20 characters
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`
                flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                ${isFallout 
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono' 
                  : isDark 
                    ? 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className={`
                flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isFallout 
                  ? 'bg-green-500 text-gray-900 hover:bg-green-400 disabled:hover:bg-green-500 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]' 
                  : isDark 
                    ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:hover:bg-blue-600' 
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600'
                }
              `}
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
