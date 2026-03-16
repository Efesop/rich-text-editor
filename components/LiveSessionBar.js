import React, { useState, useEffect } from 'react'
import { Shield, X } from 'lucide-react'

/**
 * LiveSessionBar — Compact inline bar that sits between the page header and editor
 *
 * Shows: Live dot, participant avatars, duration, E2E badge, end button
 * Modern, minimal design — no heavy banner
 */

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
]

export default function LiveSessionBar ({ participants, status, onEndSession, theme, isHost }) {
  const [elapsed, setElapsed] = useState(0)
  const [startTime] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [startTime])

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  // Generate avatar circles for participants
  const participantCount = Math.max(participants || 1, 1)
  const avatars = Array.from({ length: Math.min(participantCount, 5) }, (_, i) => ({
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    label: i === 0 ? (isHost ? 'You' : 'Host') : `Guest ${i}`,
  }))

  return (
    <div className={`
      flex items-center justify-between px-4 py-1.5 text-xs
      ${isFallout
        ? 'border-b border-green-500/20'
        : isDarkBlue
          ? 'border-b border-[#1c2438]'
          : isDark
            ? 'border-b border-[#2a2a2a]'
            : 'border-b border-gray-100'
      }
    `}>
      {/* Left: Live indicator + avatars */}
      <div className="flex items-center gap-3">
        {/* Live pill */}
        <div className={`
          flex items-center gap-1.5 px-2 py-0.5 rounded-full
          ${isFallout
            ? 'bg-green-500/15'
            : isConnected
              ? 'bg-red-500/10'
              : 'bg-yellow-500/10'
          }
        `}>
          <div className={`w-1.5 h-1.5 rounded-full ${
            isConnected
              ? isFallout ? 'bg-green-400 animate-pulse' : 'bg-red-500 animate-pulse'
              : isConnecting
                ? 'bg-yellow-400 animate-pulse'
                : 'bg-gray-400'
          }`} />
          <span className={`font-medium ${
            isFallout ? 'text-green-400 font-mono'
              : isConnected
                ? isDarkBlue ? 'text-red-400' : isDark ? 'text-red-400' : 'text-red-600'
                : isDarkBlue ? 'text-yellow-400' : isDark ? 'text-yellow-400' : 'text-yellow-600'
          }`}>
            {isConnected ? 'LIVE' : isConnecting ? 'CONNECTING' : 'OFFLINE'}
          </span>
        </div>

        {/* Participant avatars */}
        {isConnected && (
          <div className="flex items-center -space-x-1.5">
            {avatars.map((avatar, i) => (
              <div
                key={i}
                title={avatar.label}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ${
                  isFallout ? 'ring-gray-900' : isDarkBlue ? 'ring-[#0f1219]' : isDark ? 'ring-[#1a1a1a]' : 'ring-white'
                }`}
                style={{ backgroundColor: avatar.color, zIndex: avatars.length - i }}
              >
                {avatar.label[0]}
              </div>
            ))}
            {participantCount > 5 && (
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ${
                isFallout ? 'bg-gray-700 text-green-400 ring-gray-900'
                  : isDarkBlue ? 'bg-[#232b42] text-[#8b99b5] ring-[#0f1219]'
                  : isDark ? 'bg-[#3a3a3a] text-[#8e8e8e] ring-[#1a1a1a]'
                  : 'bg-gray-200 text-gray-500 ring-white'
              }`}>
                +{participantCount - 5}
              </div>
            )}
          </div>
        )}

        {/* Duration */}
        <span className={`tabular-nums ${
          isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#555]' : 'text-gray-400'
        }`}>
          {formatTime(elapsed)}
        </span>

        {/* E2E badge */}
        <div className={`flex items-center gap-0.5 ${
          isFallout ? 'text-green-700 font-mono' : isDarkBlue ? 'text-[#4d5b78]' : isDark ? 'text-[#444]' : 'text-gray-300'
        }`}>
          <Shield className="w-3 h-3" />
          <span>E2E</span>
        </div>
      </div>

      {/* Right: End Session */}
      <button
        onClick={onEndSession}
        className={`
          flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors
          ${isFallout
            ? 'text-green-500/70 hover:text-green-400 hover:bg-green-500/10'
            : isDarkBlue
              ? 'text-[#5d6b88] hover:text-red-400 hover:bg-red-500/10'
              : isDark
                ? 'text-[#555] hover:text-red-400 hover:bg-red-500/10'
                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          }
        `}
      >
        <X className="w-3 h-3" />
        End
      </button>
    </div>
  )
}
