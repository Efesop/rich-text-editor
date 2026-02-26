import React, { useState, useEffect } from 'react'
import { FolderPlus, X, Folder, Check } from 'lucide-react'

export function MoveToFolderModal({ isOpen, onClose, onConfirm, folders, currentFolderId, theme }) {
  const [selectedFolderId, setSelectedFolderId] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(null)
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (selectedFolderId) {
      onConfirm(selectedFolderId)
    }
    onClose()
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  const availableFolders = (Array.isArray(folders) ? folders : [])
    .filter(f => f.id !== currentFolderId)
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
        {/* Header */}
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
                  Move to Folder
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDark ? 'text-gray-400' : 'text-gray-500'}
                `}>
                  Select a destination folder
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
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            {availableFolders.length === 0 ? (
              <div className="py-12 text-center">
                <div className={`
                  w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center
                  ${isFallout
                    ? 'bg-green-500/10 border border-green-500/30'
                    : isDark
                      ? 'bg-gray-800 border border-gray-700'
                      : 'bg-gray-100 border border-gray-200'
                  }
                `}>
                  <Folder className={`
                    w-8 h-8
                    ${isFallout ? 'text-green-500/50' : isDark ? 'text-gray-600' : 'text-gray-400'}
                  `} />
                </div>
                <h3 className={`
                  text-base font-medium mb-2
                  ${isFallout ? 'text-green-400 font-mono' : isDark ? 'text-gray-300' : 'text-gray-700'}
                `}>
                  No folders available
                </h3>
                <p className={`
                  text-sm
                  ${isFallout ? 'text-green-600 font-mono' : isDark ? 'text-gray-500' : 'text-gray-500'}
                `}>
                  Create a folder first to move pages into it.
                </p>
              </div>
            ) : (
              <div className={`
                max-h-72 overflow-y-auto space-y-2 pr-1
                ${isFallout ? 'scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-800' : ''}
              `}>
                {availableFolders.map(folder => {
                  const isSelected = selectedFolderId === folder.id
                  return (
                    <label
                      key={folder.id}
                      className={`
                        flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150
                        ${isSelected
                          ? isFallout
                            ? 'bg-green-500/20 border-2 border-green-500/60'
                            : isDark
                              ? 'bg-blue-500/20 border-2 border-blue-500/60'
                              : 'bg-blue-50 border-2 border-blue-500'
                          : isFallout
                            ? 'bg-gray-800/50 border border-green-500/20 hover:border-green-500/40'
                            : isDark
                              ? 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600'
                              : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                        }
                      `}
                      onClick={() => setSelectedFolderId(folder.id)}
                    >
                      {/* Radio-style indicator */}
                      <div className={`
                        w-5 h-5 rounded-full flex items-center justify-center transition-all
                        ${isSelected
                          ? isFallout
                            ? 'bg-green-500 border-green-500'
                            : 'bg-blue-500 border-blue-500'
                          : isFallout
                            ? 'border-2 border-green-500/40'
                            : isDark
                              ? 'border-2 border-gray-600'
                              : 'border-2 border-gray-300'
                        }
                      `}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>
                      <Folder className={`
                        w-4 h-4 flex-shrink-0
                        ${isFallout
                          ? 'text-green-400'
                          : isDark
                            ? 'text-gray-400'
                            : 'text-gray-500'
                        }
                      `} />
                      <span className={`
                        flex-1 text-sm font-medium truncate
                        ${isFallout
                          ? 'text-green-300 font-mono'
                          : isDark
                            ? 'text-gray-200'
                            : 'text-gray-700'
                        }
                      `}>
                        {folder.title}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className={`
            px-6 py-4 flex gap-3
            ${isFallout ? 'border-t border-green-500/30' : isDark ? 'border-t border-gray-800' : 'border-t border-gray-100'}
          `}>
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
              disabled={!selectedFolderId}
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
              Move
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
