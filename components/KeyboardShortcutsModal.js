import React, { useMemo } from 'react'
import { Keyboard, X } from 'lucide-react'

export function KeyboardShortcutsModal({ isOpen, onClose, theme }) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
  const mod = isMac ? '⌘' : 'Ctrl'

  const sections = useMemo(() => [
    {
      title: 'General',
      shortcuts: [
        { label: 'New page', keys: [mod, 'N'] },
        { label: 'Save page', keys: [mod, 'S'] },
        { label: 'Search & filter', keys: [mod, 'Shift', 'K'] },
        { label: 'Search', keys: ['/'] },
        { label: 'Quick switcher', keys: [mod, 'P'] },
        { label: 'Toggle sidebar', keys: [mod, 'Shift', 'B'] },
        { label: 'Focus mode', keys: [mod, 'Shift', 'F'] },
        { label: 'Lock app', keys: [mod, 'Shift', 'L'] },
        { label: 'Keyboard shortcuts', keys: ['?'] }
      ]
    },
    {
      title: 'Page Management',
      shortcuts: [
        { label: 'Duplicate page', keys: [mod, 'D'] },
        { label: 'Delete page', keys: [mod, '⌫'] },
        { label: 'Previous page', keys: ['Alt', '↑'] },
        { label: 'Next page', keys: ['Alt', '↓'] },
        { label: 'Exit focus mode', keys: ['Esc'] }
      ]
    },
    {
      title: 'Editor',
      shortcuts: [
        { label: 'Bold', keys: [mod, 'B'] },
        { label: 'Italic', keys: [mod, 'I'] },
        { label: 'Underline', keys: [mod, 'U'] },
        { label: 'Inline code', keys: [mod, 'Shift', 'M'] },
        { label: 'Highlight', keys: [mod, 'Shift', 'H'] },
        { label: 'Undo', keys: [mod, 'Z'] },
        { label: 'Redo', keys: [mod, 'Shift', 'Z'] }
      ]
    }
  ], [mod])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const kbdClasses = isFallout
    ? 'bg-green-900/40 text-green-400 border-green-500/30'
    : isDarkBlue
      ? 'bg-[#1c2438] text-[#8b99b5] border-[#2a3550]'
      : isDark
        ? 'bg-[#2a2a2a] text-[#bbb] border-[#3a3a3a]'
        : 'bg-neutral-100 text-neutral-600 border-neutral-200'

  const labelClasses = isFallout
    ? 'text-green-300'
    : isDarkBlue
      ? 'text-[#c0ccdf]'
      : isDark
        ? 'text-[#ccc]'
        : 'text-neutral-700'

  const sectionTitleClasses = isFallout
    ? 'text-green-500'
    : isDarkBlue
      ? 'text-[#8b99b5]'
      : isDark
        ? 'text-[#888]'
        : 'text-neutral-400'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
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
                  ? 'bg-green-500/20 text-green-400'
                  : isDarkBlue
                    ? 'bg-blue-500/20 text-blue-400'
                    : isDark
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-blue-100 text-blue-600'
                }
              `}>
                <Keyboard size={20} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-neutral-900'}`}>
                  Keyboard Shortcuts
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isFallout ? 'hover:bg-green-900/30 text-green-500' :
                isDarkBlue ? 'hover:bg-[#1c2438] text-[#5d6b88]' :
                isDark ? 'hover:bg-[#2a2a2a] text-[#6b6b6b]' :
                'hover:bg-neutral-100 text-neutral-400'
              }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto thin-scrollbar">
          {sections.map((section, si) => (
            <div key={section.title} className={si > 0 ? 'mt-5' : ''}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${sectionTitleClasses}`}>
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between py-1">
                    <span className={`text-sm ${labelClasses}`}>{shortcut.label}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, ki) => (
                        <kbd
                          key={ki}
                          className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium rounded border ${kbdClasses}`}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 ${isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'}`}>
          <button
            onClick={onClose}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              isFallout ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' :
              isDarkBlue ? 'bg-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]' :
              isDark ? 'bg-[#2a2a2a] text-[#bbb] hover:bg-[#333]' :
              'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
