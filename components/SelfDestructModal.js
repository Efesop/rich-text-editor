import React, { useState } from 'react'
import { Timer, X, AlertTriangle, Clock } from 'lucide-react'

const DURATIONS = [
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '12 hours', value: 12 * 60 * 60 * 1000 },
  { label: '1 day', value: 24 * 60 * 60 * 1000 },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', value: 30 * 24 * 60 * 60 * 1000 }
]

export default function SelfDestructModal({ isOpen, onClose, onConfirm, pageTitle, theme }) {
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[0].value)
  const [isCustom, setIsCustom] = useState(false)
  const [customDays, setCustomDays] = useState(0)
  const [customHours, setCustomHours] = useState(2)
  const [customMinutes, setCustomMinutes] = useState(0)

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const customMs = (customDays * 24 * 60 * 60 * 1000) + (customHours * 60 * 60 * 1000) + (customMinutes * 60 * 1000)
  const effectiveDuration = isCustom ? customMs : selectedDuration
  const deleteDate = new Date(Date.now() + effectiveDuration)
  const formatDate = (d) => {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const isValidCustom = isCustom ? (customDays + customHours + customMinutes) >= 1 : true

  const handleConfirm = () => {
    if (!isValidCustom) return
    onConfirm(effectiveDuration)
    onClose()
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Theme helpers
  const cardBg = isFallout
    ? 'bg-gray-800/50 border border-green-500/20'
    : isDarkBlue
      ? 'bg-[#0c1017]/50 border border-[#1c2438]'
      : isDark
        ? 'bg-[#232323] border border-[#3a3a3a]/50'
        : 'bg-gray-50/80 border border-gray-200/60'

  const labelClasses = isFallout
    ? 'text-green-400 font-mono'
    : isDarkBlue
      ? 'text-[#e0e6f0]'
      : isDark
        ? 'text-[#c0c0c0]'
        : 'text-gray-700'

  const subtextClasses = isFallout
    ? 'text-green-600 font-mono'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-gray-500'

  const inputClasses = isFallout
    ? 'bg-gray-800 border border-green-500/40 text-green-400 font-mono focus:ring-green-500/50 focus:border-green-500/60'
    : isDarkBlue
      ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] focus:ring-blue-500/50 focus:border-blue-500/40'
      : isDark
        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white focus:ring-blue-500/50 focus:border-blue-500/40'
        : 'bg-white border border-gray-200 text-gray-900 focus:ring-blue-500/30 focus:border-blue-400'

  const pillSelected = isFallout
    ? 'bg-green-500/20 border border-green-500/60 text-green-300'
    : isDarkBlue
      ? 'bg-blue-500/20 border border-blue-500/60 text-[#e0e6f0]'
      : isDark
        ? 'bg-blue-500/20 border border-blue-500/60 text-white'
        : 'bg-red-50 border border-red-400 text-red-700'

  const pillUnselected = isFallout
    ? 'border border-green-500/20 text-green-400 hover:border-green-500/40'
    : isDarkBlue
      ? 'border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
      : isDark
        ? 'border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
        : 'border border-gray-200 text-gray-600 hover:border-gray-300'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`
          relative w-full max-w-lg transform transition-all duration-200
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
                  ? 'bg-red-500/20 text-red-400'
                  : isDarkBlue
                    ? 'bg-red-500/20 text-red-400'
                    : isDark
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-red-100 text-red-600'
                }
              `}>
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`
                  text-lg font-semibold
                  ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}
                `}>
                  Self-Destruct Timer
                </h2>
                <p className={`text-xs mt-0.5 ${subtextClasses}`}>
                  Automatically delete this page after a set time
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
        <div className="p-6 space-y-5">

          {/* Page being affected */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${cardBg}`}>
            <span className={`${subtextClasses} text-xs`}>Page:</span>
            <span className={`font-medium truncate ${labelClasses}`}>{pageTitle}</span>
          </div>

          {/* Timer selection */}
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`flex items-center gap-1.5 mb-3 ${labelClasses}`}>
              <Clock className="w-3.5 h-3.5" />
              <label className="text-xs font-medium">Delete after</label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => {
                const isSelected = !isCustom && selectedDuration === d.value
                return (
                  <button
                    key={d.value}
                    onClick={() => { setSelectedDuration(d.value); setIsCustom(false) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isSelected ? pillSelected : pillUnselected}`}
                  >
                    {d.label}
                  </button>
                )
              })}
              <button
                onClick={() => setIsCustom(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isCustom ? pillSelected : pillUnselected}`}
              >
                Custom
              </button>
            </div>
            {isCustom && (
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={customDays}
                    onChange={(e) => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className={`w-14 px-2 py-1.5 rounded-lg text-xs text-center focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                  <span className={`text-xs ${subtextClasses}`}>days</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={customHours}
                    onChange={(e) => setCustomHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                    className={`w-14 px-2 py-1.5 rounded-lg text-xs text-center focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                  <span className={`text-xs ${subtextClasses}`}>hrs</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                    className={`w-14 px-2 py-1.5 rounded-lg text-xs text-center focus:outline-none focus:ring-2 ${inputClasses}`}
                  />
                  <span className={`text-xs ${subtextClasses}`}>min</span>
                </div>
              </div>
            )}
          </div>

          {/* Deletion preview */}
          <div className={`
            flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs leading-relaxed
            ${isFallout
              ? 'bg-red-500/10 text-red-400 border border-red-500/30 font-mono'
              : isDarkBlue
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : isDark
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                  : 'bg-red-50 text-red-600 border border-red-200'
            }
          `}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>This page will be permanently deleted on <strong>{formatDate(deleteDate)}</strong>. This cannot be undone.</span>
          </div>
        </div>

        {/* Actions */}
        <div className={`
          px-6 py-4 flex gap-3
          ${isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'}
        `}>
          <button
            onClick={onClose}
            className={`
              flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
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
            onClick={handleConfirm}
            disabled={!isValidCustom}
            className={`
              flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isFallout
                ? 'bg-red-600 text-white hover:bg-red-500 disabled:hover:bg-red-600 font-mono'
                : 'bg-red-600 text-white hover:bg-red-500 disabled:hover:bg-red-600'
              }
            `}
          >
            Start Timer
          </button>
        </div>
      </div>
    </div>
  )
}
