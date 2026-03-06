import React, { useState } from 'react'
import { Timer, X } from 'lucide-react'

const DURATIONS = [
  { label: '1 Hour', value: 60 * 60 * 1000 },
  { label: '1 Day', value: 24 * 60 * 60 * 1000 },
  { label: '7 Days', value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 Days', value: 30 * 24 * 60 * 60 * 1000 }
]

export default function SelfDestructModal({ isOpen, onClose, onConfirm, pageTitle, theme }) {
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[0].value)
  const [isCustom, setIsCustom] = useState(false)
  const [customValue, setCustomValue] = useState(2)
  const [customUnit, setCustomUnit] = useState('hours')

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const customMs = customValue * (customUnit === 'days' ? 24 * 60 * 60 * 1000 : customUnit === 'hours' ? 60 * 60 * 1000 : 60 * 1000)
  const effectiveDuration = isCustom ? customMs : selectedDuration
  const deleteDate = new Date(Date.now() + effectiveDuration)
  const formatDate = (d) => {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const isValidCustom = isCustom ? customValue >= 1 && customValue <= (customUnit === 'days' ? 365 : customUnit === 'hours' ? 8760 : 525600) : true

  const handleConfirm = () => {
    if (!isValidCustom) return
    onConfirm(effectiveDuration)
    onClose()
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`
          relative w-full max-w-sm transform transition-all duration-200
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
                  Self-Destruct
                </h2>
                <p className={`
                  text-sm mt-0.5 truncate max-w-[200px]
                  ${isFallout ? 'text-green-500/70 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'}
                `}>
                  {pageTitle}
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

        {/* Duration options */}
        <div className="p-6 space-y-2">
          <p className={`
            text-xs mb-3
            ${isFallout ? 'text-green-600 font-mono' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'}
          `}>
            This page will be permanently deleted after:
          </p>
          {DURATIONS.map((d) => {
            const isSelected = !isCustom && selectedDuration === d.value
            return (
              <button
                key={d.value}
                onClick={() => { setSelectedDuration(d.value); setIsCustom(false) }}
                className={`
                  w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${isSelected
                    ? isFallout
                      ? 'bg-green-500/20 border-2 border-green-500/60 text-green-300'
                      : isDarkBlue
                        ? 'bg-blue-500/20 border-2 border-blue-500/60 text-[#e0e6f0]'
                        : isDark
                          ? 'bg-blue-500/20 border-2 border-blue-500/60 text-white'
                          : 'bg-blue-50 border-2 border-blue-500 text-gray-900'
                    : isFallout
                      ? 'bg-gray-800/50 border border-green-500/20 text-green-400 hover:border-green-500/40'
                      : isDarkBlue
                        ? 'bg-[#0c1017]/50 border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                        : isDark
                          ? 'bg-[#2f2f2f]/50 border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                          : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span>{d.label}</span>
              </button>
            )
          })}

          {/* Custom duration */}
          <button
            onClick={() => setIsCustom(true)}
            className={`
              w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all
              ${isCustom
                ? isFallout
                  ? 'bg-green-500/20 border-2 border-green-500/60 text-green-300'
                  : isDarkBlue
                    ? 'bg-blue-500/20 border-2 border-blue-500/60 text-[#e0e6f0]'
                    : isDark
                      ? 'bg-blue-500/20 border-2 border-blue-500/60 text-white'
                      : 'bg-blue-50 border-2 border-blue-500 text-gray-900'
                : isFallout
                  ? 'bg-gray-800/50 border border-green-500/20 text-green-400 hover:border-green-500/40'
                  : isDarkBlue
                    ? 'bg-[#0c1017]/50 border border-[#1c2438] text-[#8b99b5] hover:border-[#232b42]'
                    : isDark
                      ? 'bg-[#2f2f2f]/50 border border-[#3a3a3a]/50 text-[#c0c0c0] hover:border-[#4a4a4a]'
                      : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <span>Custom</span>
          </button>

          {isCustom && (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min="1"
                max={customUnit === 'days' ? 365 : customUnit === 'hours' ? 8760 : 525600}
                value={customValue}
                onChange={(e) => setCustomValue(Math.max(1, parseInt(e.target.value) || 1))}
                className={`
                  w-20 px-3 py-2 rounded-lg text-sm text-center
                  focus:outline-none focus:ring-2
                  ${isFallout
                    ? 'bg-gray-800 border border-green-500/40 text-green-400 font-mono focus:ring-green-500/50'
                    : isDarkBlue
                      ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] focus:ring-blue-500/50'
                      : isDark
                        ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-white focus:ring-blue-500/50'
                        : 'bg-white border border-gray-200 text-gray-900 focus:ring-blue-500/30'
                  }
                `}
              />
              <div className={`flex rounded-lg overflow-hidden border ${isFallout ? 'border-green-500/40' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-200'}`}>
                {['minutes', 'hours', 'days'].map((unit) => (
                  <button
                    key={unit}
                    onClick={() => setCustomUnit(unit)}
                    className={`
                      px-3 py-2 text-sm font-medium transition-all
                      ${customUnit === unit
                        ? isFallout
                          ? 'bg-green-500/20 text-green-300'
                          : isDarkBlue
                            ? 'bg-blue-500/20 text-[#e0e6f0]'
                            : isDark
                              ? 'bg-blue-500/20 text-white'
                              : 'bg-blue-50 text-blue-700'
                        : isFallout
                          ? 'bg-gray-800 text-green-500 hover:bg-gray-700'
                          : isDarkBlue
                            ? 'bg-[#0c1017] text-[#5d6b88] hover:bg-[#141825]'
                            : isDark
                              ? 'bg-[#2f2f2f] text-[#6b6b6b] hover:bg-[#3a3a3a]'
                              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }
                    `}
                  >
                    {unit.charAt(0).toUpperCase() + unit.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <div className={`
            mt-4 px-3 py-2 rounded-lg text-xs
            ${isFallout
              ? 'bg-red-500/10 text-red-400 border border-red-500/30 font-mono'
              : isDarkBlue
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : isDark
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                  : 'bg-red-50 text-red-600 border border-red-200'
            }
          `}>
            Will be deleted on {formatDate(deleteDate)}
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
            onClick={handleConfirm}
            disabled={!isValidCustom}
            className={`
              flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
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
