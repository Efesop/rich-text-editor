import React from 'react'
import { Radio, X, Check, Clock } from 'lucide-react'
import useLiveNotesStore from '../store/liveNotesStore'

/**
 * LiveNotificationsPanel — Dropdown panel showing edit requests and live note activity
 * Appears when clicking the bell icon (alongside update notifications)
 */
export default function LiveNotificationsPanel ({ isOpen, onClose, theme, onApproveRequest }) {
  const { editRequests, dismissEditRequest } = useLiveNotesStore()

  if (!isOpen || editRequests.length === 0) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const formatTime = (timestamp) => {
    const diff = Date.now() - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  return (
    <div
      className={`
        fixed z-50 w-80 rounded-xl shadow-2xl overflow-hidden
        ${isFallout
          ? 'bg-gray-900 border-2 border-green-500/60'
          : isDarkBlue
            ? 'bg-[#141825] border border-[#1c2438]'
            : isDark
              ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50'
              : 'bg-white border border-gray-200'
        }
      `}
      style={{
        top: '60px',
        right: '16px',
        animation: 'dash-modal-in 150ms ease-out forwards',
      }}
    >
      {/* Header */}
      <div className={`
        px-4 py-3 flex items-center justify-between
        ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'}
      `}>
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${
            isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'
          }`} />
          <span className={`text-sm font-medium ${
            isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'
          }`}>
            Edit Requests
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            isFallout ? 'bg-green-500/20 text-green-400' : isDarkBlue ? 'bg-blue-500/20 text-blue-400' : isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
          }`}>
            {editRequests.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded-lg transition-colors ${
            isFallout ? 'text-green-500 hover:bg-green-500/20' : isDarkBlue ? 'text-[#8b99b5] hover:bg-[#232b42]' : isDark ? 'text-[#8e8e8e] hover:bg-[#3a3a3a]' : 'text-gray-400 hover:bg-gray-100'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Requests */}
      <div className="max-h-64 overflow-y-auto">
        {editRequests.map((req) => (
          <div
            key={req.id}
            className={`
              px-4 py-3 flex items-center justify-between
              ${isFallout ? 'border-b border-green-500/10' : isDarkBlue ? 'border-b border-[#1c2438]/50' : isDark ? 'border-b border-[#2a2a2a]' : 'border-b border-gray-50'}
            `}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${
                isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'
              }`}>
                {req.alias || 'Someone'}
              </p>
              <p className={`text-xs truncate ${
                isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-400'
              }`}>
                wants to edit &ldquo;{req.title || 'a note'}&rdquo;
              </p>
              <div className={`flex items-center gap-1 mt-0.5 text-xs ${
                isFallout ? 'text-green-700' : isDarkBlue ? 'text-[#4d5b78]' : isDark ? 'text-[#555]' : 'text-gray-300'
              }`}>
                <Clock className="w-3 h-3" />
                {formatTime(req.timestamp)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 ml-3">
              <button
                onClick={() => {
                  onApproveRequest?.(req)
                  dismissEditRequest(req.id)
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isFallout
                    ? 'text-green-400 hover:bg-green-500/20'
                    : isDarkBlue
                      ? 'text-blue-400 hover:bg-blue-500/10'
                      : isDark
                        ? 'text-blue-400 hover:bg-blue-500/10'
                        : 'text-blue-600 hover:bg-blue-50'
                }`}
                title="Approve"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => dismissEditRequest(req.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isFallout
                    ? 'text-green-600 hover:bg-green-500/10'
                    : isDarkBlue
                      ? 'text-[#5d6b88] hover:bg-[#232b42]'
                      : isDark
                        ? 'text-[#6b6b6b] hover:bg-[#3a3a3a]'
                        : 'text-gray-400 hover:bg-gray-100'
                }`}
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
