import React, { useState, useEffect } from 'react'
import { History, X, RotateCcw, Clock, FileText } from 'lucide-react'
import { readVersions } from '@/lib/versionStorage'
import DOMPurify from 'isomorphic-dompurify'

function formatTimestamp (isoStr) {
  const date = new Date(isoStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  let relative
  if (diffMins < 1) relative = 'Just now'
  else if (diffMins < 60) relative = `${diffMins}m ago`
  else if (diffHours < 24) relative = `${diffHours}h ago`
  else if (diffDays < 7) relative = `${diffDays}d ago`
  else relative = date.toLocaleDateString()

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return { relative, detail: `${dateStr}, ${time}` }
}

function renderBlockPreview (block) {
  if (!block || !block.type) return null
  const data = block.data || {}

  switch (block.type) {
    case 'paragraph':
      return <p className="mb-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.text || '') }} />
    case 'header':
      const Tag = `h${Math.min(data.level || 2, 6)}`
      return <Tag className="font-bold mb-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.text || '') }} />
    case 'bulletListItem':
    case 'numberedListItem':
      return <div className="ml-4 mb-0.5">&#8226; <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.text || '') }} /></div>
    case 'checklistItem':
      return <div className="ml-4 mb-0.5">{data.checked ? '\u2611' : '\u2610'} <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.text || '') }} /></div>
    case 'code':
      return <pre className="text-xs p-2 rounded mb-1 opacity-70 overflow-x-auto">{data.code || ''}</pre>
    case 'quote':
      return <blockquote className="border-l-2 pl-2 italic mb-1 opacity-80" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.text || '') }} />
    case 'delimiter':
      return <hr className="my-2 opacity-30" />
    case 'attachment':
      return <div className="text-xs opacity-60 mb-1">[Attachment: {data.filename || 'File'}]</div>
    case 'image':
      return <div className="text-xs opacity-60 mb-1">[Image]</div>
    case 'seedPhrase':
      return <div className="text-xs opacity-60 mb-1">[Seed Phrase]</div>
    default:
      return <div className="text-xs opacity-60 mb-1">[{block.type}]</div>
  }
}

export default function VersionHistoryModal ({ isOpen, onClose, page, onRestore, theme }) {
  const [versions, setVersions] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [loading, setLoading] = useState(false)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  useEffect(() => {
    if (!isOpen || !page) return
    setSelectedIndex(null)
    setLoading(true)
    readVersions(page.id).then(v => {
      setVersions(v || [])
      setLoading(false)
    }).catch(() => {
      setVersions([])
      setLoading(false)
    })
  }, [isOpen, page?.id])

  if (!isOpen) return null

  const selectedVersion = selectedIndex !== null ? versions[selectedIndex] : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      {/* Modal */}
      <div
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
        className={`
          relative w-full max-w-2xl transform transition-all duration-200
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
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  Version History
                </h2>
                <p className={`
                  text-sm mt-0.5 truncate max-w-xs
                  ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}
                `}>
                  {page?.title || 'Untitled'}
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
        <div className="flex" style={{ height: '400px' }}>
          {/* Version list (left) */}
          <div className={`
            w-56 flex-shrink-0 overflow-y-auto border-r
            ${isFallout ? 'border-green-500/30' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-100'}
          `}>
            {loading ? (
              <div className={`p-6 text-center text-sm ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}`}>
                Loading...
              </div>
            ) : versions.length === 0 ? (
              <div className="p-6 text-center">
                <div className={`
                  w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center
                  ${isFallout
                    ? 'bg-green-500/10 border border-green-500/30'
                    : isDarkBlue
                      ? 'bg-[#1a2035] border border-[#1c2438]'
                      : isDark
                        ? 'bg-[#2f2f2f] border border-[#3a3a3a]'
                        : 'bg-gray-100 border border-gray-200'
                  }
                `}>
                  <Clock className={`w-6 h-6 ${isFallout ? 'text-green-500/50' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}`} />
                </div>
                <p className={`text-sm ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}`}>
                  No versions yet
                </p>
                <p className={`text-xs mt-1 ${isFallout ? 'text-green-600/50 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}`}>
                  Versions are saved automatically as you edit
                </p>
              </div>
            ) : (
              <div className="py-1">
                {versions.map((version, index) => {
                  const { relative, detail } = formatTimestamp(version.timestamp)
                  const isSelected = selectedIndex === index
                  const blockCount = version.blocks?.length || 0
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedIndex(index)}
                      className={`
                        w-full text-left px-4 py-3 transition-colors
                        ${isSelected
                          ? isFallout
                            ? 'bg-green-500/20 border-l-2 border-green-500'
                            : isDarkBlue
                              ? 'bg-blue-500/10 border-l-2 border-blue-500'
                              : isDark
                                ? 'bg-blue-500/10 border-l-2 border-blue-500'
                                : 'bg-blue-50 border-l-2 border-blue-500'
                          : isFallout
                            ? 'hover:bg-green-500/10 border-l-2 border-transparent'
                            : isDarkBlue
                              ? 'hover:bg-[#1a2035] border-l-2 border-transparent'
                              : isDark
                                ? 'hover:bg-[#2f2f2f] border-l-2 border-transparent'
                                : 'hover:bg-gray-50 border-l-2 border-transparent'
                        }
                      `}
                    >
                      <div className={`text-sm font-medium ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-gray-900'}`}>
                        {relative}
                      </div>
                      <div className={`text-xs mt-0.5 ${isFallout ? 'text-green-600/60 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'}`}>
                        {detail}
                      </div>
                      <div className={`text-xs mt-0.5 ${isFallout ? 'text-green-600/40 font-mono' : isDarkBlue ? 'text-[#4a5670]' : isDark ? 'text-[#555]' : 'text-gray-400'}`}>
                        {blockCount} block{blockCount !== 1 ? 's' : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Preview (right) */}
          <div className={`flex-1 overflow-y-auto p-6 ${isFallout ? 'font-mono' : ''}`}>
            {selectedVersion ? (
              <div className={`text-sm leading-relaxed ${isFallout ? 'text-green-300' : isDarkBlue ? 'text-[#c8d0e0]' : isDark ? 'text-[#d0d0d0]' : 'text-gray-700'}`}>
                {selectedVersion.blocks?.map((block, i) => (
                  <div key={i}>{renderBlockPreview(block)}</div>
                ))}
                {(!selectedVersion.blocks || selectedVersion.blocks.length === 0) && (
                  <p className="opacity-50 italic">Empty page</p>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <FileText className={`w-10 h-10 mx-auto mb-2 ${isFallout ? 'text-green-500/30' : isDarkBlue ? 'text-[#2a3555]' : isDark ? 'text-[#3a3a3a]' : 'text-gray-200'}`} />
                  <p className={`text-sm ${isFallout ? 'text-green-600/40 font-mono' : isDarkBlue ? 'text-[#4a5670]' : isDark ? 'text-[#555]' : 'text-gray-400'}`}>
                    Select a version to preview
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
            type="button"
            disabled={selectedIndex === null}
            onClick={() => {
              if (selectedVersion) {
                onRestore(selectedVersion.blocks)
                onClose()
              }
            }}
            className={`
              flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 inline-flex items-center justify-center gap-2
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
            <RotateCcw className="w-4 h-4" />
            Restore as New Page
          </button>
        </div>
      </div>
    </div>
  )
}
