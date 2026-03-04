import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { getTagChipStyle, ensureHex } from '@/utils/colorUtils'

export default function StackedTags({
  tags = [],
  maxVisible = 2,
  onRemoveTag: _onRemoveTag,
  size = 'sm',
  showRemove: _showRemove = false,
  className = '',
  theme,
  tagColorMap = {},
  hovered = false
}) {
  const { theme: contextTheme } = useTheme()
  const currentTheme = theme || contextTheme
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })
  const popupRef = useRef(null)
  const containerRef = useRef(null)
  const hoverTimeout = useRef(null)

  // Position popup using fixed coordinates from bounding rect
  const positionPopup = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    let top = rect.bottom + 4
    let left = rect.left

    // If popup would go off-screen bottom, show above
    if (top + 120 > viewportHeight) {
      top = rect.top - 4
    }
    // Clamp left to viewport
    if (left + 200 > window.innerWidth) {
      left = window.innerWidth - 210
    }
    setPopupPos({ top, left })
  }, [])

  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeout.current)
    hoverTimeout.current = setTimeout(() => {
      positionPopup()
      setIsPopupOpen(true)
    }, 300)
  }, [positionPopup])

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimeout.current)
    hoverTimeout.current = setTimeout(() => {
      setIsPopupOpen(false)
    }, 150)
  }, [])

  // Keep popup open when hovering over it
  const handlePopupEnter = useCallback(() => {
    clearTimeout(hoverTimeout.current)
  }, [])

  const handlePopupLeave = useCallback(() => {
    clearTimeout(hoverTimeout.current)
    hoverTimeout.current = setTimeout(() => {
      setIsPopupOpen(false)
    }, 150)
  }, [])

  useEffect(() => {
    return () => clearTimeout(hoverTimeout.current)
  }, [])

  if (tags.length === 0) return null

  const getTagColor = (tag) => {
    const explicit = tagColorMap && typeof tagColorMap[tag] === 'string' ? ensureHex(tagColorMap[tag]) : null
    if (explicit) {
      return {
        classes: `${currentTheme === 'dark' ? 'text-[#ececec]' : 'text-gray-800'}`,
        style: getTagChipStyle(explicit, currentTheme)
      }
    }
    const palette = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#F97316']
    const colorIndex = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % palette.length
    const hex = palette[colorIndex]
    return {
      classes: '',
      style: getTagChipStyle(hex, currentTheme)
    }
  }

  const getTagClasses = (tag) => {
    const baseClasses = `
      inline-flex items-center rounded-md font-medium
      border transition-all duration-150 ease-out
      ${size === 'xs' ? 'px-1 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-1.5 py-0.5 text-xs'}
    `
    const colorToken = getTagColor(tag)
    const colorClasses = typeof colorToken === 'string' ? colorToken : colorToken.classes
    return { classes: `${baseClasses} ${colorClasses} relative`, style: colorToken.style }
  }

  // Fixed-position popup rendered via portal-like positioning
  const popupContent = isPopupOpen && (
    <div
      ref={popupRef}
      className={`fixed rounded-md border shadow-lg p-2 ${
        currentTheme === 'fallout'
          ? 'bg-gray-900 border-green-600'
          : currentTheme === 'dark'
            ? 'bg-[#2f2f2f] border-[#3a3a3a]'
            : currentTheme === 'darkblue'
              ? 'bg-[#1a2035] border-[#1c2438]'
              : 'bg-white border-gray-200'
      }`}
      style={{ top: popupPos.top, left: popupPos.left, zIndex: 9999 }}
      role="tooltip"
      onMouseEnter={handlePopupEnter}
      onMouseLeave={handlePopupLeave}
    >
      <div className="flex flex-wrap gap-1 max-w-xs max-h-40 overflow-auto">
        {tags.map((tag, index) => {
          const token = getTagClasses(tag)
          return (
            <span
              key={`popup-${tag}-${index}`}
              className={token.classes}
              style={token.style}
            >
              {tag}
            </span>
          )
        })}
      </div>
    </div>
  )

  // Multiple tags: compact square colored chips with no text
  if (tags.length > 1) {
    const displayTags = tags.slice(0, 3)
    const extraCount = tags.length - 3

    return (
      <>
        <div
          ref={containerRef}
          className={`relative inline-flex items-center h-5 ${className}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {displayTags.map((tag, index) => {
            const color = getTagColor(tag)
            return (
              <span
                key={`${tag}-${index}`}
                className="rounded border"
                style={{
                  width: 18,
                  height: 18,
                  marginLeft: index === 0 ? 0 : -7,
                  zIndex: 100 - index,
                  flexShrink: 0,
                  ...(color.style || {}),
                }}
              />
            )
          })}
          {extraCount > 0 && (
            <span
              className={`text-[10px] leading-none ml-0.5 ${
                currentTheme === 'fallout' ? 'text-green-500'
                : currentTheme === 'dark' ? 'text-[#6b6b6b]'
                : currentTheme === 'darkblue' ? 'text-[#5d6b88]'
                : 'text-gray-400'
              }`}
              style={{ zIndex: 0 }}
            >
              +{extraCount}
            </span>
          )}
        </div>
        {popupContent}
      </>
    )
  }

  // Single tag: show with text, proper truncation, no hover popup
  const singleColor = getTagColor(tags[0])
  return (
    <div
      className={`relative inline-flex items-center h-5 ${className}`}
      style={{ maxWidth: 80 }}
    >
      <span
        className={`
          rounded-md font-medium border
          transition-all duration-150 ease-out
          px-1.5 py-0.5 text-xs
          block overflow-hidden text-ellipsis whitespace-nowrap
          ${typeof singleColor === 'string' ? singleColor : singleColor.classes}
        `}
        style={{ ...singleColor.style, maxWidth: '100%' }}
        title={tags[0]}
      >
        {tags[0]}
      </span>
    </div>
  )
}