import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Custom hook for managing dropdown positioning with viewport awareness.
 * Handles click-outside detection, scroll/resize repositioning, and viewport boundaries.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.alignment - Horizontal alignment: 'left' | 'right' (default: 'right')
 * @param {string} options.verticalPosition - Vertical position: 'below' | 'above' | 'auto' (default: 'auto')
 * @returns {Object} Hook return values
 */
export function useDropdownPosition(options = {}) {
  const { alignment = 'right', verticalPosition = 'auto' } = options

  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)

  // Calculate dropdown position based on trigger element and viewport
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !dropdownRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const dropdownRect = dropdownRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    let top, left

    // Calculate vertical position
    const spaceBelow = viewportHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    const fitsBelow = spaceBelow >= dropdownRect.height
    const fitsAbove = spaceAbove >= dropdownRect.height

    if (verticalPosition === 'below' || (verticalPosition === 'auto' && fitsBelow)) {
      top = triggerRect.bottom
    } else if (verticalPosition === 'above' || (verticalPosition === 'auto' && fitsAbove)) {
      top = triggerRect.top - dropdownRect.height
    } else {
      // Default to below if neither fits well
      top = triggerRect.bottom
    }

    // Calculate horizontal position
    if (alignment === 'left') {
      left = triggerRect.left
    } else {
      // Right alignment (default)
      left = triggerRect.right - dropdownRect.width
    }

    // Ensure dropdown stays within viewport horizontally
    if (left < 0) {
      left = triggerRect.left
    } else if (left + dropdownRect.width > viewportWidth) {
      left = viewportWidth - dropdownRect.width - 8 // 8px padding from edge
    }

    // Ensure dropdown stays within viewport vertically
    if (top < 0) {
      top = 8 // 8px padding from top
    } else if (top + dropdownRect.height > viewportHeight) {
      top = viewportHeight - dropdownRect.height - 8 // 8px padding from bottom
    }

    setPosition({ top, left })
  }, [alignment, verticalPosition])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Reposition on scroll/resize when open
  useEffect(() => {
    if (isOpen) {
      // Initial position calculation (use requestAnimationFrame to ensure DOM is ready)
      requestAnimationFrame(calculatePosition)

      window.addEventListener('scroll', calculatePosition, true)
      window.addEventListener('resize', calculatePosition)
    }

    return () => {
      window.removeEventListener('scroll', calculatePosition, true)
      window.removeEventListener('resize', calculatePosition)
    }
  }, [isOpen, calculatePosition])

  // Toggle dropdown open state
  const toggle = useCallback((e) => {
    if (e) {
      e.stopPropagation()
    }
    setIsOpen((prev) => !prev)
  }, [])

  // Explicitly open dropdown
  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  // Explicitly close dropdown
  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  return {
    isOpen,
    position,
    triggerRef,
    dropdownRef,
    toggle,
    open,
    close,
    setIsOpen,
  }
}

export default useDropdownPosition
