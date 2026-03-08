import React, { useState, useEffect } from 'react'
import {
  X, Sparkles, Lock, ShieldCheck, ShieldAlert, Timer, KeyRound,
  Link, Code, GripVertical, Undo2, Search, Focus, Keyboard, Palette, Fingerprint,
  FolderOpen, Download, Plus
} from 'lucide-react'
import { featuresList } from '@/lib/releaseNotes'

const iconMap = {
  Lock, ShieldCheck, ShieldAlert, Timer, KeyRound,
  Link, Code, GripVertical, Undo2, Search, Focus, Keyboard, Palette, Sparkles,
  FolderOpen, Download, Plus
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'security', label: 'Security' },
  { key: 'editor', label: 'Editor' },
  { key: 'navigation', label: 'Navigation' }
]

// CSS-only animated illustrations for each feature
function FeatureIllustration({ animation, theme }) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const accent = isFallout ? '#4ade80' : isDarkBlue ? '#60a5fa' : isDark ? '#60a5fa' : '#3b82f6'
  const muted = isFallout ? '#166534' : isDarkBlue ? '#1c2438' : isDark ? '#3a3a3a' : '#e5e7eb'
  const textMuted = isFallout ? '#22c55e' : isDarkBlue ? '#5d6b88' : isDark ? '#6b6b6b' : '#9ca3af'

  switch (animation) {
    case 'lock':
      // Blue text lines that transform into matrix-style cascading numbers
      return (
        <div className="dash-feat-illus dash-feat-illus-lock">
          <div className="dash-feat-lock-doc" style={{ borderColor: muted, background: `${accent}08` }}>
            <div className="dash-feat-lock-doc-lines">
              <div className="dash-feat-lock-line-1" style={{ background: accent }} />
              <div className="dash-feat-lock-line-2" style={{ background: `${accent}99` }} />
              <div className="dash-feat-lock-line-3" style={{ background: accent }} />
              <div className="dash-feat-lock-line-4" style={{ background: `${accent}99` }} />
              <div className="dash-feat-lock-line-5" style={{ background: accent }} />
            </div>
            <div className="dash-feat-lock-matrix" style={{ color: accent }}>
              <div className="dash-feat-lock-col dash-feat-lock-col-1">
                <span>4</span><span>7</span><span>1</span><span>0</span><span>9</span><span>3</span>
              </div>
              <div className="dash-feat-lock-col dash-feat-lock-col-2">
                <span>8</span><span>2</span><span>5</span><span>6</span><span>1</span><span>4</span>
              </div>
              <div className="dash-feat-lock-col dash-feat-lock-col-3">
                <span>0</span><span>3</span><span>9</span><span>7</span><span>2</span><span>8</span>
              </div>
              <div className="dash-feat-lock-col dash-feat-lock-col-4">
                <span>6</span><span>1</span><span>4</span><span>5</span><span>0</span><span>3</span>
              </div>
              <div className="dash-feat-lock-col dash-feat-lock-col-5">
                <span>2</span><span>9</span><span>7</span><span>3</span><span>8</span><span>1</span>
              </div>
            </div>
          </div>
        </div>
      )

    case 'shield':
      // App screen with lock overlay sliding down, then fingerprint appears
      return (
        <div className="dash-feat-illus dash-feat-illus-shield">
          <div className="dash-feat-shield-app" style={{ borderColor: muted, background: `${accent}05` }}>
            <div className="dash-feat-shield-content">
              <div style={{ background: muted, width: '80%', height: 2, borderRadius: 1 }} />
              <div style={{ background: muted, width: '60%', height: 2, borderRadius: 1 }} />
              <div style={{ background: muted, width: '70%', height: 2, borderRadius: 1 }} />
            </div>
            <div className="dash-feat-shield-overlay" style={{ background: isDark || isDarkBlue || isFallout ? '#0a0a0a' : '#f1f5f9', borderColor: accent }}>
              <div className="dash-feat-shield-fp" style={{ color: accent }}>
                <Fingerprint size={18} />
              </div>
            </div>
          </div>
        </div>
      )

    case 'duress':
      // Password dots entered, then all content lines vanish
      return (
        <div className="dash-feat-illus dash-feat-illus-duress">
          <div className="dash-feat-duress-screen" style={{ borderColor: muted, background: `${accent}05` }}>
            <div className="dash-feat-duress-pass">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="dash-feat-duress-dot" style={{ background: accent, animationDelay: `${i * 0.3}s` }} />
              ))}
            </div>
            <div className="dash-feat-duress-content">
              <div className="dash-feat-duress-line" style={{ background: textMuted, width: '80%' }} />
              <div className="dash-feat-duress-line" style={{ background: textMuted, width: '60%' }} />
              <div className="dash-feat-duress-line" style={{ background: textMuted, width: '70%' }} />
            </div>
          </div>
        </div>
      )

    case 'timer':
      // Document burning up from the bottom with flames
      return (
        <div className="dash-feat-illus dash-feat-illus-timer">
          <div className="dash-feat-timer-doc" style={{ borderColor: muted }}>
            <div className="dash-feat-timer-doc-lines">
              <div style={{ background: textMuted, width: '80%', height: 2, borderRadius: 1 }} />
              <div style={{ background: textMuted, width: '55%', height: 2, borderRadius: 1 }} />
              <div style={{ background: textMuted, width: '68%', height: 2, borderRadius: 1 }} />
            </div>
            <div className="dash-feat-timer-flames">
              <div className="dash-feat-flame dash-feat-flame-1" />
              <div className="dash-feat-flame dash-feat-flame-2" />
              <div className="dash-feat-flame dash-feat-flame-3" />
              <div className="dash-feat-flame dash-feat-flame-4" />
              <div className="dash-feat-flame dash-feat-flame-5" />
            </div>
            <div className="dash-feat-timer-burn" />
          </div>
        </div>
      )

    case 'key':
      // Grid of words appearing one by one
      return (
        <div className="dash-feat-illus dash-feat-illus-key">
          <div className="dash-feat-key-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="dash-feat-key-word" style={{ background: muted, animationDelay: `${i * 0.3}s` }}>
                <span className="dash-feat-key-num" style={{ color: textMuted }}>{i}</span>
                <span className="dash-feat-key-bar" style={{ background: `${accent}50` }} />
              </div>
            ))}
          </div>
        </div>
      )

    case 'link':
      // Two pages connecting with a line
      return (
        <div className="dash-feat-illus dash-feat-illus-link">
          <div className="dash-feat-link-page" style={{ borderColor: textMuted, background: `${accent}08` }}>
            <div style={{ background: textMuted, width: '80%', height: 2, borderRadius: 1 }} />
            <div style={{ background: textMuted, width: '50%', height: 2, borderRadius: 1 }} />
          </div>
          <div className="dash-feat-link-line" style={{ background: accent }} />
          <div className="dash-feat-link-page" style={{ borderColor: textMuted, background: `${accent}08` }}>
            <div style={{ background: textMuted, width: '70%', height: 2, borderRadius: 1 }} />
            <div style={{ background: textMuted, width: '40%', height: 2, borderRadius: 1 }} />
          </div>
        </div>
      )

    case 'code':
      // Code lines with blue syntax highlighting
      return (
        <div className="dash-feat-illus dash-feat-illus-code">
          <div className="dash-feat-code-lines">
            <div className="dash-feat-code-line" style={{ animationDelay: '0s' }}>
              <span style={{ background: '#3b82f6', width: 14, height: 3 }} />
              <span style={{ background: '#93c5fd', width: 20, height: 3 }} />
            </div>
            <div className="dash-feat-code-line" style={{ animationDelay: '0.4s', paddingLeft: 8 }}>
              <span style={{ background: '#60a5fa', width: 10, height: 3 }} />
              <span style={{ background: '#bfdbfe', width: 16, height: 3 }} />
            </div>
            <div className="dash-feat-code-line" style={{ animationDelay: '0.8s', paddingLeft: 8 }}>
              <span style={{ background: '#2563eb', width: 22, height: 3 }} />
            </div>
            <div className="dash-feat-code-line" style={{ animationDelay: '1.2s' }}>
              <span style={{ background: '#3b82f6', width: 6, height: 3 }} />
            </div>
          </div>
        </div>
      )

    case 'drag':
      // Items reordering vertically
      return (
        <div className="dash-feat-illus dash-feat-illus-drag">
          <div className="dash-feat-drag-item dash-feat-drag-item-1" style={{ background: muted }}>
            <div className="dash-feat-drag-grip" style={{ color: textMuted }}>⋮⋮</div>
            <div style={{ background: textMuted, width: '60%', height: 3, borderRadius: 1 }} />
          </div>
          <div className="dash-feat-drag-item dash-feat-drag-item-2" style={{ background: `${accent}20`, borderColor: accent }}>
            <div className="dash-feat-drag-grip" style={{ color: accent }}>⋮⋮</div>
            <div style={{ background: accent, width: '50%', height: 3, borderRadius: 1, opacity: 0.6 }} />
          </div>
          <div className="dash-feat-drag-item dash-feat-drag-item-3" style={{ background: muted }}>
            <div className="dash-feat-drag-grip" style={{ color: textMuted }}>⋮⋮</div>
            <div style={{ background: textMuted, width: '45%', height: 3, borderRadius: 1 }} />
          </div>
        </div>
      )

    case 'undo':
      // Text appearing then rewinding
      return (
        <div className="dash-feat-illus dash-feat-illus-undo">
          <div className="dash-feat-undo-text">
            <div className="dash-feat-undo-line" style={{ background: textMuted }} />
            <div className="dash-feat-undo-cursor" style={{ background: accent }} />
          </div>
          <div className="dash-feat-undo-arrow" style={{ color: accent }}>↺</div>
        </div>
      )

    case 'search':
      // Search bar with typing text and results
      return (
        <div className="dash-feat-illus dash-feat-illus-search">
          <div className="dash-feat-search-bar" style={{ borderColor: muted, background: `${accent}05` }}>
            <div className="dash-feat-search-icon" style={{ color: textMuted }}>⌕</div>
            <div className="dash-feat-search-text" style={{ background: accent }} />
          </div>
          <div className="dash-feat-search-results">
            <div className="dash-feat-search-result" style={{ background: `${accent}15` }}>
              <div style={{ background: textMuted, width: '70%', height: 2, borderRadius: 1 }} />
            </div>
            <div className="dash-feat-search-result" style={{ background: muted }}>
              <div style={{ background: textMuted, width: '50%', height: 2, borderRadius: 1 }} />
            </div>
          </div>
        </div>
      )

    case 'focus':
      // Paragraph lines with center one highlighted, others dimmed
      return (
        <div className="dash-feat-illus dash-feat-illus-focus">
          <div className="dash-feat-focus-line dash-feat-focus-dim" style={{ background: muted, width: '80%' }} />
          <div className="dash-feat-focus-line dash-feat-focus-dim" style={{ background: muted, width: '65%' }} />
          <div className="dash-feat-focus-line dash-feat-focus-active" style={{ background: accent, width: '75%' }} />
          <div className="dash-feat-focus-line dash-feat-focus-dim" style={{ background: muted, width: '55%' }} />
          <div className="dash-feat-focus-line dash-feat-focus-dim" style={{ background: muted, width: '70%' }} />
        </div>
      )

    case 'keyboard':
      // Keyboard keys pressing
      return (
        <div className="dash-feat-illus dash-feat-illus-keyboard">
          <div className="dash-feat-kb-row">
            <div className="dash-feat-kb-key" style={{ borderColor: muted, color: textMuted }}>⌘</div>
            <div className="dash-feat-kb-key dash-feat-kb-key-press" style={{ borderColor: accent, color: accent, background: `${accent}15` }}>P</div>
          </div>
        </div>
      )

    case 'palette':
      // Theme circles with lighter fills and darker borders
      return (
        <div className="dash-feat-illus dash-feat-illus-palette">
          <div className="dash-feat-palette-circles">
            <div className="dash-feat-palette-circle" style={{ background: '#f8fafc', border: '2px solid #475569' }} />
            <div className="dash-feat-palette-circle" style={{ background: '#4b5563', border: '2px solid #1f2937' }} />
            <div className="dash-feat-palette-circle" style={{ background: '#93c5fd', border: '2px solid #1e3a5f' }} />
            <div className="dash-feat-palette-circle dash-feat-palette-circle-glow" style={{ background: '#86efac', border: '2px solid #166534' }} />
          </div>
        </div>
      )

    case 'folders':
      // Folder with pages sliding in, each with a colored tag
      return (
        <div className="dash-feat-illus dash-feat-illus-folders">
          <div className="dash-feat-sidebar-list">
            <div className="dash-feat-sidebar-item" style={{ background: `${accent}15` }}>
              <div className="dash-feat-sidebar-chevron" style={{ color: accent }}>&#9654;</div>
              <div style={{ background: accent, width: '55%', height: 2, borderRadius: 1 }} />
            </div>
            <div className="dash-feat-sidebar-nested">
              <div className="dash-feat-sidebar-page dash-feat-sidebar-page-1">
                <div style={{ background: accent, width: '60%', height: 2, borderRadius: 1, opacity: 0.5 }} />
                <div className="dash-feat-sidebar-tag" style={{ background: '#3b82f6', borderRadius: 2 }} />
              </div>
              <div className="dash-feat-sidebar-page dash-feat-sidebar-page-2">
                <div style={{ background: accent, width: '40%', height: 2, borderRadius: 1, opacity: 0.5 }} />
                <div className="dash-feat-sidebar-tag" style={{ background: '#60a5fa', borderRadius: 2 }} />
              </div>
              <div className="dash-feat-sidebar-page dash-feat-sidebar-page-3">
                <div style={{ background: accent, width: '50%', height: 2, borderRadius: 1, opacity: 0.5 }} />
                <div className="dash-feat-sidebar-tag" style={{ background: '#93c5fd', borderRadius: 2 }} />
              </div>
            </div>
          </div>
        </div>
      )

    case 'export':
      // Document with arrow going out
      return (
        <div className="dash-feat-illus dash-feat-illus-export">
          <div className="dash-feat-export-doc" style={{ borderColor: muted }}>
            <div style={{ background: textMuted, width: '70%', height: 2, borderRadius: 1 }} />
            <div style={{ background: textMuted, width: '50%', height: 2, borderRadius: 1 }} />
            <div style={{ background: textMuted, width: '60%', height: 2, borderRadius: 1 }} />
          </div>
          <div className="dash-feat-export-arrow" style={{ color: accent }}>
            <Download size={14} />
          </div>
          <div className="dash-feat-export-formats">
            <span className="dash-feat-export-fmt dash-feat-export-fmt-1" style={{ color: accent, borderColor: `${accent}40` }}>PDF</span>
            <span className="dash-feat-export-fmt dash-feat-export-fmt-2" style={{ color: textMuted, borderColor: `${textMuted}40` }}>MD</span>
            <span className="dash-feat-export-fmt dash-feat-export-fmt-3" style={{ color: accent, borderColor: `${accent}40` }}>DOCX</span>
          </div>
        </div>
      )

    case 'blockmenu':
      // Plus button expanding into menu items
      return (
        <div className="dash-feat-illus dash-feat-illus-blockmenu">
          <div className="dash-feat-bm-plus" style={{ color: accent, borderColor: `${accent}40` }}>
            <Plus size={10} />
          </div>
          <div className="dash-feat-bm-items">
            <div className="dash-feat-bm-item dash-feat-bm-item-1" style={{ background: muted }}>
              <div style={{ background: accent, width: 4, height: 4, borderRadius: 1 }} />
              <div style={{ background: textMuted, width: 18, height: 2, borderRadius: 1 }} />
            </div>
            <div className="dash-feat-bm-item dash-feat-bm-item-2" style={{ background: muted }}>
              <div style={{ background: accent, width: 4, height: 4, borderRadius: 1 }} />
              <div style={{ background: textMuted, width: 14, height: 2, borderRadius: 1 }} />
            </div>
            <div className="dash-feat-bm-item dash-feat-bm-item-3" style={{ background: muted }}>
              <div style={{ background: accent, width: 4, height: 4, borderRadius: 1 }} />
              <div style={{ background: textMuted, width: 20, height: 2, borderRadius: 1 }} />
            </div>
          </div>
        </div>
      )

    default:
      return null
  }
}

export default function FeaturesPanel({ isOpen, onClose, theme }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setAnimateIn(true))
    } else {
      setAnimateIn(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const filtered = activeCategory === 'all'
    ? featuresList
    : featuresList.filter(f => f.category === activeCategory)

  const panelBg = isFallout
    ? 'bg-gray-900 border-l-2 border-green-500/60'
    : isDarkBlue
      ? 'bg-[#141825] border-l border-[#1c2438]'
      : isDark
        ? 'bg-[#1a1a1a] border-l border-[#3a3a3a]/50'
        : 'bg-white border-l border-gray-200'

  const chipActive = isFallout
    ? 'bg-green-500/20 text-green-300 border-green-500/60'
    : isDarkBlue
      ? 'bg-blue-500/20 text-blue-300 border-blue-500/60'
      : isDark
        ? 'bg-blue-500/20 text-blue-300 border-blue-500/60'
        : 'bg-blue-50 text-blue-700 border-blue-400'

  const chipInactive = isFallout
    ? 'text-green-600 border-green-500/20 hover:border-green-500/40'
    : isDarkBlue
      ? 'text-[#5d6b88] border-[#1c2438] hover:border-[#232b42]'
      : isDark
        ? 'text-[#6b6b6b] border-[#3a3a3a]/50 hover:border-[#4a4a4a]'
        : 'text-gray-500 border-gray-200 hover:border-gray-300'

  const cardBg = isFallout
    ? 'bg-gray-800/50 border-green-500/15 hover:border-green-500/30'
    : isDarkBlue
      ? 'bg-[#0c1017]/50 border-[#1c2438] hover:border-[#232b42]'
      : isDark
        ? 'bg-[#232323] border-[#3a3a3a]/50 hover:border-[#4a4a4a]'
        : 'bg-gray-50/80 border-gray-200/60 hover:border-gray-300'

  const titleColor = isFallout
    ? 'text-green-300 font-mono'
    : isDarkBlue
      ? 'text-[#e0e6f0]'
      : isDark
        ? 'text-[#ececec]'
        : 'text-gray-900'

  const descColor = isFallout
    ? 'text-green-600 font-mono'
    : isDarkBlue
      ? 'text-[#5d6b88]'
      : isDark
        ? 'text-[#6b6b6b]'
        : 'text-gray-500'

  const iconBg = isFallout
    ? 'bg-green-500/10 text-green-400'
    : isDarkBlue
      ? 'bg-[#1a2035] text-[#8b99b5]'
      : isDark
        ? 'bg-[#2f2f2f] text-[#8e8e8e]'
        : 'bg-gray-100 text-gray-500'

  const shortcutBg = isFallout
    ? 'bg-green-500/10 text-green-400 border-green-500/30'
    : isDarkBlue
      ? 'bg-[#1a2035] text-[#5d6b88] border-[#1c2438]'
      : isDark
        ? 'bg-[#2f2f2f] text-[#6b6b6b] border-[#3a3a3a]'
        : 'bg-gray-100 text-gray-500 border-gray-200'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 bottom-0 z-50 w-[440px] max-w-[90vw]
          flex flex-col shadow-2xl
          transition-transform duration-300 ease-out
          ${animateIn ? 'translate-x-0' : 'translate-x-full'}
          ${panelBg}
        `}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0
          ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'}
        `}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isFallout ? 'bg-green-500/20 text-green-400' : isDarkBlue ? 'bg-blue-500/20 text-blue-400' : isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'}`}>
                Dash Features
              </h2>
              <p className={`text-xs mt-0.5 ${descColor}`}>
                {featuresList.length} features available
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

        {/* Category chips */}
        <div className="px-6 py-3 flex gap-2 flex-shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${activeCategory === cat.key ? chipActive : chipInactive}
              `}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Feature cards */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
          {filtered.map((feature, index) => {
            const Icon = iconMap[feature.icon] || Sparkles
            return (
              <div
                key={feature.title}
                className={`
                  p-4 rounded-xl border transition-all duration-200
                  dash-feat-card-enter
                  ${cardBg}
                `}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex gap-3">
                  {/* Left: icon + text */}
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-medium ${titleColor}`}>
                        {feature.title}
                      </h3>
                      {feature.shortcut && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${shortcutBg}`}>
                          {feature.shortcut}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${descColor}`}>
                      {feature.description}
                    </p>
                  </div>
                  {/* Right: animated illustration */}
                  <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center">
                    <FeatureIllustration animation={feature.animation} theme={theme} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
