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
  const isDarkBlue = theme === 'darkblue'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className={`
          relative w-full max-w-md transform transition-all duration-200
          ${isFallout
            ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
            : isDarkBlue
              ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
              : isDark
                ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
                : 'bg-white border border-gray-200 shadow-2xl'
          }
          rounded-2xl overflow-hidden
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`
          px-6 pt-6 pb-4
          ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'}
        `}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`
                p-2.5 rounded-xl
                ${isFallout
                  ? 'bg-green-500/20 text-green-400'
                  : isDarkBlue
                    ? 'bg-blue-500/20 text-blue-400'
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
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  Move to Folder
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}
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
                  : isDarkBlue
                    ? 'text-[#8b99b5] hover:bg-[#232b42]'
                    : isDark
                      ? 'text-[#8e8e8e] hover:bg-[#3a3a3a]'
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
                    : isDarkBlue
                      ? 'bg-[#1a2035] border border-[#1c2438]'
                      : isDark
                        ? 'bg-[#2f2f2f] border border-[#3a3a3a]'
                        : 'bg-gray-100 border border-gray-200'
                  }
                `}>
                  <Folder className={`
                    w-8 h-8
                    ${isFallout ? 'text-green-500/50' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}
                  `} />
                </div>
                <h3 className={`
                  text-base font-medium mb-2
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
                `}>
                  No folders available
                </h3>
                <p className={`
                  text-sm
                  ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}
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
                            : isDarkBlue
                              ? 'bg-blue-500/20 border-2 border-blue-500/60'
                              : isDark
                                ? 'bg-blue-500/20 border-2 border-blue-500/60'
                                : 'bg-blue-50 border-2 border-blue-500'
                          : isFallout
                            ? 'bg-gray-800/50 border border-green-500/20 hover:border-green-500/40'
                            : isDarkBlue
                              ? 'bg-[#0c1017]/50 border border-[#1c2438] hover:border-[#232b42]'
                              : isDark
                                ? 'bg-[#2f2f2f]/50 border border-[#3a3a3a]/50 hover:border-[#4a4a4a]'
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
                            : isDarkBlue
                              ? 'border-2 border-[#5d6b88]'
                              : isDark
                                ? 'border-2 border-[#4a4a4a]'
                                : 'border-2 border-gray-300'
                        }
                      `}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>
                      <Folder className={`
                        w-4 h-4 flex-shrink-0
                        ${isFallout
                          ? 'text-green-400'
                          : isDarkBlue
                            ? 'text-[#8b99b5]'
                            : isDark
                              ? 'text-[#8e8e8e]'
                              : 'text-gray-500'
                        }
                      `} />
                      <span className={`
                        flex-1 text-sm font-medium truncate
                        ${isFallout
                          ? 'text-green-300 font-mono'
                          : isDarkBlue
                            ? 'text-[#e0e6f0]'
                            : isDark
                              ? 'text-[#ececec]'
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
            ${isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'}
          `}>
            <button
              type="button"
              onClick={onClose}
              className={`
                flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                ${isFallout
                  ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
                  : isDarkBlue
                    ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
                    : isDark
                      ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
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
                  : isDarkBlue
                    ? 'bg-blue-500 text-white hover:bg-blue-400 disabled:hover:bg-blue-500'
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
