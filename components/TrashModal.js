import React, { useState, useEffect } from 'react'
import { Trash2, X, RotateCcw, AlertTriangle, FileText, Clock } from 'lucide-react'

/**
 * Trash modal — lists soft-deleted pages with Restore + Delete forever
 * controls. Items auto-purge after 30 days (sweep handled in RichTextEditor /
 * a hook; this UI just renders + dispatches actions).
 *
 * Theme matches AppLockSettingsModal / SyncSettingsPanel.
 */

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const formatDaysLeft = (trashedAt) => {
  if (!trashedAt) return '—'
  const expiresAt = trashedAt + TRASH_RETENTION_MS
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'Expiring soon'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`
  const hours = Math.floor(ms / (60 * 60 * 1000))
  return `${hours} hour${hours === 1 ? '' : 's'} left`
}

const formatTrashedDate = (trashedAt) => {
  if (!trashedAt) return ''
  const d = new Date(trashedAt)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TrashModal ({
  isOpen,
  onClose,
  trashedPages = [],
  onRestore,
  onPermanentlyDelete,
  onEmptyTrash,
  theme
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteId(null)
      setConfirmEmptyAll(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const bgContainer = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white shadow-2xl'

  const headerBorder = isFallout ? 'border-b border-green-500/30'
    : isDarkBlue ? 'border-b border-[#1c2438]'
      : isDark ? 'border-b border-[#3a3a3a]'
        : 'border-b border-gray-100'

  const titleClasses = isFallout ? 'text-green-400 font-mono'
    : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'

  const subtitleClasses = isFallout ? 'text-green-600 font-mono text-xs'
    : isDarkBlue ? 'text-[#8b99b5] text-xs' : isDark ? 'text-[#8e8e8e] text-xs' : 'text-gray-500 text-xs'

  const closeBtn = isFallout ? 'text-green-600 hover:bg-green-900/30'
    : isDarkBlue ? 'text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'text-[#c0c0c0] hover:bg-[#2a2a2a]'
        : 'text-gray-500 hover:bg-gray-100'

  const iconContainerClasses = isFallout
    ? 'bg-red-500/15 border border-red-500/40 text-red-400'
    : 'bg-red-50 border border-red-200 text-red-600'

  const cardClasses = isFallout ? 'bg-gray-800/50 border border-green-500/20'
    : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438]'
      : isDark ? 'bg-[#222] border border-[#3a3a3a]/40'
        : 'bg-gray-50 border border-gray-100'

  const restoreBtn = isFallout ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
    : isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
      : isDark ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  const dangerBtn = isFallout ? 'bg-red-900/40 border border-red-500/40 text-red-400 hover:bg-red-900/60 font-mono'
    : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'

  return (
    <div className="dash-mobile-bottom-sheet fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />
      <div
        className={`relative w-full max-w-lg rounded-2xl overflow-hidden ${bgContainer}`}
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
      >
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${headerBorder}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconContainerClasses}`}>
                <Trash2 className="w-5 h-5 pointer-events-none" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${titleClasses}`}>Trash</h2>
                <p className={subtitleClasses}>
                  {trashedPages.length === 0
                    ? 'Empty'
                    : `${trashedPages.length} item${trashedPages.length === 1 ? '' : 's'} · auto-deletes after 30 days`
                  }
                </p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${closeBtn}`} aria-label="Close">
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {trashedPages.length === 0 ? (
            <div className={`p-8 rounded-xl ${cardClasses} text-center`}>
              <Trash2 className={`w-8 h-8 mx-auto mb-3 pointer-events-none ${subtitleClasses}`} />
              <p className={`text-sm ${titleClasses}`}>Trash is empty</p>
              <p className={`mt-1 ${subtitleClasses}`}>Deleted notes appear here for 30 days before being permanently removed.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {trashedPages.map(page => (
                <div key={page.id} className={`p-3 rounded-lg ${cardClasses}`}>
                  {confirmDeleteId === page.id ? (
                    <div>
                      <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 pointer-events-none" />
                        <p className={`text-xs leading-relaxed ${subtitleClasses}`}>
                          Permanently delete <strong className={titleClasses}>"{page.title || 'Untitled'}"</strong>? This cannot be undone.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium ${restoreBtn}`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDeleteId(null)
                            onPermanentlyDelete?.(page)
                          }}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium ${dangerBtn}`}
                        >
                          Delete forever
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <FileText className={`w-4 h-4 flex-shrink-0 pointer-events-none ${subtitleClasses}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${titleClasses}`}>{page.title || 'Untitled'}</p>
                          <p className={`flex items-center gap-1 ${subtitleClasses}`}>
                            <Clock className="w-3 h-3 pointer-events-none" />
                            <span>Trashed {formatTrashedDate(page.trashedAt)} · {formatDaysLeft(page.trashedAt)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => onRestore?.(page)}
                          className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${restoreBtn}`}
                          title="Restore"
                        >
                          <RotateCcw className="w-3 h-3 pointer-events-none" />
                          Restore
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(page.id)}
                          className={`p-1.5 rounded-md text-xs ${dangerBtn}`}
                          title="Delete forever"
                        >
                          <Trash2 className="w-3 h-3 pointer-events-none" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — Empty trash */}
        {trashedPages.length > 0 && (
          <div className={`px-6 py-3 ${headerBorder.replace('border-b', 'border-t')}`}>
            {confirmEmptyAll ? (
              <div className="flex items-center justify-between gap-3">
                <p className={`text-xs flex-1 ${subtitleClasses}`}>
                  Permanently delete all {trashedPages.length} item{trashedPages.length === 1 ? '' : 's'}? This cannot be undone.
                </p>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setConfirmEmptyAll(false)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${restoreBtn}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setConfirmEmptyAll(false)
                      onEmptyTrash?.()
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${dangerBtn}`}
                  >
                    Empty trash
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEmptyAll(true)}
                className={`w-full px-4 py-2 rounded-md text-xs font-medium ${dangerBtn}`}
              >
                Empty trash
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
