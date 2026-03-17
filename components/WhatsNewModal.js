import React, { useEffect, useState } from 'react'
import { X, Sparkles, Search, Timer, ShieldCheck, Focus, Code, Palette, Lock, GripVertical, Undo2, Keyboard, Link, KeyRound, ShieldAlert, Share2, ImageOff, Bot } from 'lucide-react'
import useWhatsNewStore from '../store/whatsNewStore'
import { releaseNotes } from '@/lib/releaseNotes'

const iconMap = {
  Sparkles,
  Search,
  Timer,
  ShieldCheck,
  Focus,
  Code,
  Palette,
  Lock,
  GripVertical,
  Undo2,
  Keyboard,
  Link,
  KeyRound,
  ShieldAlert,
  Share2,
  ImageOff,
  Bot
}

export default function WhatsNewModal({ appVersion, theme }) {
  const { isLoaded, shouldShow, dismiss, loadData } = useWhatsNewStore()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (isLoaded && appVersion && shouldShow(appVersion)) {
      setIsOpen(true)
    }
  }, [isLoaded, appVersion, shouldShow])

  const handleDismiss = () => {
    setIsOpen(false)
    dismiss(appVersion)
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleDismiss()
    }
  }

  if (!isOpen) return null

  if (!releaseNotes || releaseNotes.length === 0) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      {/* Modal */}
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
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  What's New in Dash
                </h2>
              </div>
            </div>
            <button
              onClick={handleDismiss}
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

        {/* Feature list */}
        <div className="p-6 space-y-5 max-h-80 overflow-y-auto">
          {releaseNotes.map((group, gi) => (
            <div key={gi}>
              <h3 className={`
                text-[11px] font-semibold uppercase tracking-wider mb-3
                ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#3d4d6b]' : isDark ? 'text-[#555]' : 'text-gray-300'}
              `}>
                {group.group}
              </h3>
              <div className="space-y-3">
                {group.features.map((feature, fi) => {
                  const Icon = iconMap[feature.icon] || Sparkles
                  return (
                    <div key={fi} className="flex gap-3">
                      <div className={`
                        flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
                        ${isFallout
                          ? 'bg-green-500/10 text-green-400'
                          : isDarkBlue
                            ? 'bg-[#1a2035] text-[#8b99b5]'
                            : isDark
                              ? 'bg-[#2f2f2f] text-[#8e8e8e]'
                              : 'bg-gray-100 text-gray-500'
                        }
                      `}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className={`
                          text-sm font-medium
                          ${isFallout ? 'text-green-300 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-gray-900'}
                        `}>
                          {feature.title}
                        </h3>
                        <p className={`
                          text-xs mt-0.5 leading-relaxed
                          ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}
                        `}>
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`
          px-6 py-4
          ${isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'}
        `}>
          <button
            onClick={handleDismiss}
            className={`
              w-full px-4 py-3 rounded-xl font-medium transition-all duration-200
              ${isFallout
                ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                : isDarkBlue
                  ? 'bg-blue-500 text-white hover:bg-blue-400'
                  : isDark
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
