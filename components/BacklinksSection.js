import React, { useState, useEffect } from 'react'
import { ArrowUpLeft, ChevronDown, ChevronRight, Lock } from 'lucide-react'

// Linked references at the foot of a note. Sits inside the same 650px editor
// column as the document, under a single hairline rule, so it costs no chrome
// and no layout — see ROADMAP.md "Page Linking & Knowledge Graph".
//
// Collapsed state is per-device on purpose: folding a section to read it is not
// an edit, and storing it in the note would bump the page, push a sync envelope
// and mint a version-history entry every time someone collapsed it.

const COLLAPSED_KEY = 'dash:backlinks:collapsed'
const VISIBLE_LIMIT = 6

function readCollapsed () {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCollapsed (map) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map))
  } catch { /* private mode / quota — collapsing just won't be remembered */ }
}

export default function BacklinksSection ({ backlinks, pageId, theme, onNavigate, isSmallScreen }) {
  const [collapsedMap, setCollapsedMap] = useState({})
  const [showAll, setShowAll] = useState(false)

  useEffect(() => { setCollapsedMap(readCollapsed()) }, [])
  useEffect(() => { setShowAll(false) }, [pageId])

  const isCollapsed = Boolean(collapsedMap[pageId])

  // A note with nothing linking to it shows nothing at all. Most notes will
  // have no backlinks for a long time and a permanent "none" footer on every
  // one of them is noise.
  if (!pageId || !backlinks || backlinks.length === 0) return null

  const toggle = () => {
    const next = { ...collapsedMap }
    if (isCollapsed) delete next[pageId]
    else next[pageId] = true
    setCollapsedMap(next)
    writeCollapsed(next)
  }

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const ruleClass = isFallout
    ? 'border-green-500/25'
    : isDark
      ? 'border-white/10'
      : isDarkBlue
        ? 'border-[#1c2438]'
        : 'border-neutral-200'

  const labelClass = isFallout
    ? 'text-green-600'
    : isDark
      ? 'text-[#6b6b6b]'
      : isDarkBlue
        ? 'text-[#5d6b88]'
        : 'text-neutral-400'

  const accentClass = isFallout
    ? 'text-green-400'
    : isDark
      ? 'text-[#8f8f8f]'
      : isDarkBlue
        ? 'text-[#7dafe8]'
        : 'text-neutral-500'

  const cardClass = isFallout
    ? 'bg-green-500/[0.06] hover:bg-green-500/[0.12]'
    : isDark
      ? 'bg-white/[0.04] hover:bg-white/[0.07]'
      : isDarkBlue
        ? 'bg-[#141825] hover:bg-[#1a2035]'
        : 'bg-neutral-100/70 hover:bg-neutral-100'

  const titleClass = isFallout
    ? 'text-green-300'
    : isDark
      ? 'text-[#e8e8e8]'
      : isDarkBlue
        ? 'text-[#e0e6f0]'
        : 'text-neutral-800'

  const snippetClass = isFallout
    ? 'text-green-600'
    : isDark
      ? 'text-[#909090]'
      : isDarkBlue
        ? 'text-[#8d9bb2]'
        : 'text-neutral-500'

  const markClass = isFallout
    ? 'text-green-300 bg-green-500/15'
    : isDark
      ? 'text-[#d8d8d8] bg-white/10'
      : isDarkBlue
        ? 'text-[#7dafe8] bg-[#3b82f6]/[0.14]'
        : 'text-blue-700 bg-blue-500/10'

  const visible = showAll ? backlinks : backlinks.slice(0, VISIBLE_LIMIT)
  const hidden = backlinks.length - visible.length
  const label = `${backlinks.length} linked reference${backlinks.length === 1 ? '' : 's'}`

  return (
    <section className={`mt-11 pt-5 border-t ${ruleClass}`} aria-label="Linked references">
      <button
        type='button'
        onClick={toggle}
        aria-expanded={!isCollapsed}
        className='flex items-center gap-2 w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-current rounded'
      >
        <ArrowUpLeft className={`h-3.5 w-3.5 flex-shrink-0 ${accentClass}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}>{label}</span>
        {isCollapsed
          ? <ChevronRight className={`h-3.5 w-3.5 ml-auto flex-shrink-0 ${labelClass}`} />
          : <ChevronDown className={`h-3.5 w-3.5 ml-auto flex-shrink-0 ${labelClass}`} />}
      </button>

      {!isCollapsed && (
        <>
          {/* items-start so a short card (a locked page's "Locked" row) sizes to
              its content instead of stretching to match a tall neighbour. */}
          <div className={`mt-3 grid gap-2.5 items-start ${isSmallScreen ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {visible.map(ref => (
              <button
                type='button'
                key={ref.pageId}
                onClick={() => onNavigate?.(ref.pageId)}
                className={`text-left rounded-lg px-3.5 py-3 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-current ${cardClass}`}
              >
                <span className='flex items-center gap-1.5'>
                  {ref.isLocked && <Lock className={`h-3 w-3 flex-shrink-0 ${labelClass}`} />}
                  <span className={`text-sm font-semibold ${titleClass}`}>{ref.title}</span>
                  {ref.count > 1 && (
                    <span className={`text-[11px] font-medium ml-auto flex-shrink-0 ${labelClass}`}>{ref.count}</span>
                  )}
                </span>
                {ref.isLocked ? (
                  <span className={`block mt-1.5 text-[13px] leading-snug ${labelClass}`}>Locked</span>
                ) : (
                  ref.snippets.map((snippet, index) => (
                    <span key={index} className={`block mt-1.5 text-[13px] leading-snug ${snippetClass}`}>
                      {snippet.before}
                      <span className={`rounded px-1 ${markClass}`}>{snippet.linkText}</span>
                      {snippet.after}
                    </span>
                  ))
                )}
              </button>
            ))}
          </div>

          {hidden > 0 && (
            <button
              type='button'
              onClick={() => setShowAll(true)}
              className={`mt-3 flex items-center gap-1.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-1 focus-visible:ring-current rounded ${accentClass}`}
            >
              Show {hidden} more
              <ChevronDown className='h-3.5 w-3.5' />
            </button>
          )}
        </>
      )}
    </section>
  )
}
