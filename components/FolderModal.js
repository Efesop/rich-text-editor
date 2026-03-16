import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { FolderPlus, X, Smile } from 'lucide-react'
import { useTheme } from 'next-themes'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

export function FolderModal({ isOpen, onClose, onConfirm }) {
  const [folderName, setFolderName] = useState('')
  const [emoji, setEmoji] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const inputRef = useRef(null)
  const { theme } = useTheme()
  const maxLength = 30

  useEffect(() => {
    if (isOpen) {
      setFolderName('')
      setEmoji(null)
      setShowEmojiPicker(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = () => {
    if (!folderName.trim()) return
    onConfirm(folderName.slice(0, maxLength), emoji)
    setFolderName('')
    setEmoji(null)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'
  const pickerTheme = (isFallout || isDark || isDarkBlue) ? 'dark' : 'light'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      <div
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
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
                  Create Folder
                </h2>
                <p className={`
                  text-sm mt-0.5
                  ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}
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
        <div className="p-6">
          {/* Emoji + Name Row */}
          <div className="mb-4">
            <label className={`
              block text-sm font-medium mb-2
              ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-700'}
            `}>
              Folder Name
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`
                  flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-lg transition-all duration-150
                  ${isFallout
                    ? 'bg-gray-800 border border-green-500/40 hover:bg-gray-700'
                    : isDarkBlue
                      ? 'bg-[#0c1017] border border-[#1c2438] hover:bg-[#1a2035]'
                      : isDark
                        ? 'bg-[#2f2f2f] border border-[#3a3a3a] hover:bg-[#3a3a3a]'
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                  }
                `}
                title="Choose icon"
              >
                {emoji || <Smile className={`w-5 h-5 ${isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}`} />}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value.slice(0, maxLength))}
                onKeyDown={handleKeyDown}
                placeholder="Enter folder name..."
                maxLength={maxLength}
                className={`
                  flex-1 px-4 py-3 text-base rounded-xl transition-all duration-200
                  focus:outline-none focus:ring-2
                  ${isFallout
                    ? 'bg-gray-800 border border-green-500/40 text-green-400 placeholder-green-600 font-mono focus:ring-green-500/50 focus:border-green-400'
                    : isDarkBlue
                      ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] placeholder-[#5d6b88] focus:ring-blue-500/50 focus:border-blue-500'
                      : isDark
                        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white placeholder-[#6b6b6b] focus:ring-blue-500/50 focus:border-blue-500'
                        : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500'
                  }
                `}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className={`
                text-xs
                ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}
              `}>
                {folderName.length}/{maxLength} characters
              </p>
              {emoji && (
                <button
                  type="button"
                  onClick={() => setEmoji(null)}
                  className={`
                    text-xs px-2 py-0.5 rounded transition-colors
                    ${isFallout
                      ? 'text-green-500 hover:bg-green-500/20'
                      : isDarkBlue
                        ? 'text-[#5d6b88] hover:bg-[#232b42]'
                        : isDark
                          ? 'text-[#6b6b6b] hover:bg-[#3a3a3a]'
                          : 'text-gray-400 hover:bg-gray-100'
                    }
                  `}
                >
                  Remove icon
                </button>
              )}
            </div>
          </div>

          {/* Full Emoji Picker */}
          {showEmojiPicker && (
            <div className="mb-4 rounded-xl overflow-hidden dash-emoji-picker">
              <Suspense fallback={
                <div className={`h-[300px] flex items-center justify-center text-sm ${
                  isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
                }`}>
                  Loading emojis...
                </div>
              }>
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    setEmoji(emojiData.emoji)
                    setShowEmojiPicker(false)
                  }}
                  theme={pickerTheme}
                  width="100%"
                  height={300}
                  searchPlaceholder="Search emojis..."
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled
                  lazyLoadEmojis
                  emojiStyle="native"
                  categories={[
                    { category: 'smileys_people', name: '' },
                    { category: 'animals_nature', name: '' },
                    { category: 'food_drink', name: '' },
                    { category: 'travel_places', name: '' },
                    { category: 'activities', name: '' },
                    { category: 'objects', name: '' },
                    { category: 'symbols', name: '' },
                    { category: 'flags', name: '' },
                  ]}
                />
              </Suspense>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
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
              onClick={handleSubmit}
              disabled={!folderName.trim()}
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
              Create Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
