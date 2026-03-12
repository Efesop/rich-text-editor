import React, { useState, useEffect, useCallback } from 'react'

export default function MiniOutline({ headings, isVisible, theme, scrollContainerRef }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  // Track active heading based on scroll position
  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container || !headings.length || !isVisible) return

    const onScroll = () => {
      const blocks = container.querySelectorAll('.ce-block')
      const containerTop = container.scrollTop + 120
      let active = 0
      headings.forEach((h, i) => {
        const block = blocks[h.blockIndex]
        if (block && block.offsetTop <= containerTop) active = i
      })
      setActiveIndex(active)
    }

    onScroll()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [headings, scrollContainerRef, isVisible])

  const scrollToHeading = useCallback((blockIndex) => {
    const container = scrollContainerRef?.current
    if (!container) return
    const blocks = container.querySelectorAll('.ce-block')
    const target = blocks[blockIndex]
    if (target) {
      const containerRect = container.getBoundingClientRect()
      const blockRect = target.getBoundingClientRect()
      const scrollTop = container.scrollTop + (blockRect.top - containerRect.top) - 80
      container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
    }
  }, [scrollContainerRef])

  if (!isVisible || !headings.length) return null

  const getLineWidth = (level) => {
    if (level === 2) return 'w-4'
    if (level === 3) return 'w-2.5'
    return 'w-1.5'
  }

  const getLineColor = (isActive) => {
    if (isActive) {
      if (isFallout) return 'bg-green-400'
      if (isDarkBlue) return 'bg-[#8b99b5]'
      if (isDark) return 'bg-[#8e8e8e]'
      return 'bg-neutral-500'
    }
    if (isFallout) return 'bg-green-500/30'
    if (isDarkBlue) return 'bg-[#2a3452]'
    if (isDark) return 'bg-[#3a3a3a]'
    return 'bg-neutral-300'
  }

  const getTextColor = (isActive) => {
    if (isActive) {
      if (isFallout) return 'text-green-400'
      if (isDarkBlue) return 'text-[#c0ccdf]'
      if (isDark) return 'text-[#ccc]'
      return 'text-neutral-600'
    }
    if (isFallout) return 'text-green-500/50'
    if (isDarkBlue) return 'text-[#5d6b88]'
    if (isDark) return 'text-[#555]'
    return 'text-neutral-400'
  }

  const containerBg = isExpanded
    ? (isFallout ? 'bg-gray-900/80' : isDarkBlue ? 'bg-[#141825]/90' : isDark ? 'bg-[#1a1a1a]/90' : 'bg-white/90')
    : (isFallout ? 'bg-gray-900/40' : isDarkBlue ? 'bg-[#141825]/60' : isDark ? 'bg-[#1a1a1a]/60' : 'bg-white/60')

  const hoverBg = isFallout ? 'hover:bg-green-500/5' : isDarkBlue ? 'hover:bg-[#1c2438]/60' : isDark ? 'hover:bg-[#2a2a2a]/60' : 'hover:bg-neutral-100/60'

  const borderColor = isExpanded
    ? (isFallout ? 'border border-green-500/20' : isDarkBlue ? 'border border-[#2a3452]' : isDark ? 'border border-[#333]' : 'border border-neutral-200')
    : 'border border-transparent'

  return (
    <div
      className="absolute right-2 top-1/2 -translate-y-1/2 z-10"
      style={{ pointerEvents: 'auto' }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div
        className={`
          flex flex-col items-end rounded-md backdrop-blur-sm
          transition-all duration-200 ease-out
          ${isExpanded ? 'py-2.5 px-1.5 max-h-[40vh] overflow-y-auto thin-scrollbar items-stretch' : 'py-0.5 px-0.5'}
          ${containerBg} ${borderColor}
        `}
      >
        {headings.map((h, i) => {
          const isActive = i === activeIndex
          const indent = h.level === 3 ? 'pl-1' : h.level === 4 ? 'pl-2' : ''

          return (
            <button
              key={`${h.blockIndex}-${i}`}
              onClick={() => scrollToHeading(h.blockIndex)}
              style={{
                marginTop: i === 0 ? 0 : 4,
                transition: 'margin-top 200ms ease-out, height 200ms ease-out',
                ...(isExpanded ? {} : { height: 3, minHeight: 0, padding: 0 })
              }}
              className={`flex items-center cursor-pointer rounded
                ${isExpanded ? `gap-1.5 py-px ${hoverBg}` : 'gap-0 leading-none'}
                ${indent}
              `}
            >
              <span
                className={`rounded-full flex-shrink-0 transition-all ${isExpanded ? 'h-[2px]' : 'h-px'} ${getLineWidth(h.level)} ${getLineColor(isActive)}`}
              />
              <span
                className={`whitespace-nowrap transition-all duration-200 ease-out overflow-hidden leading-snug
                  ${getTextColor(isActive)}
                  ${isActive ? 'font-medium' : ''}
                  ${isExpanded ? 'max-w-[150px] opacity-100 truncate text-xs' : 'max-w-0 opacity-0 text-xs'}
                `}
              >
                {h.text}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
