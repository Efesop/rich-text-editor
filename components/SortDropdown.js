import React, { useState, useRef, useEffect } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'

const SortDropdown = ({ onSort, theme, activeSortOption, sidebarOpen, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState('bottom')
  // Compact mode renders inside the sidebar ScrollArea (overflow clipped),
  // so the menu is positioned with `fixed` coordinates from the button rect.
  const [fixedPos, setFixedPos] = useState({ top: 0, left: 0 })

  const sortOptions = [
    { value: 'custom', label: 'Custom' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'a-z', label: 'A-Z' },
    { value: 'z-a', label: 'Z-A' },
    { value: 'tag', label: 'By Tag' },
  ]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const calculateDropdownPosition = () => {
    if (buttonRef.current && dropdownRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect()
      const dropdownRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      if (buttonRect.bottom + dropdownRect.height > viewportHeight) {
        setDropdownPosition('top')
      } else {
        setDropdownPosition('bottom')
      }
    }
  }

  useEffect(() => {
    if (isOpen && compact && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect()
      setFixedPos({ top: r.bottom + 4, left: Math.max(8, r.right - 128) })
    }
    if (isOpen) {
      calculateDropdownPosition()
      window.addEventListener('resize', calculateDropdownPosition)
      window.addEventListener('scroll', calculateDropdownPosition)
    }

    return () => {
      window.removeEventListener('resize', calculateDropdownPosition)
      window.removeEventListener('scroll', calculateDropdownPosition)
    }
  }, [isOpen, compact])

  const activeSort = sortOptions.find(option => option.value === activeSortOption)

  if (!sidebarOpen) {
    return null
  }

  const getDropdownClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 border-green-600/40 text-green-400'
      case 'dark':
        return 'bg-[#2f2f2f] border-[#3a3a3a] text-[#ececec] shadow-black/50'
      case 'darkblue':
        return 'bg-[#1a2035] border-[#1c2438] text-[#e0e6f0] shadow-black/50'
      default:
        return 'bg-white border-neutral-200 text-neutral-900'
    }
  }

  const getDropdownItemClasses = (isActive = false) => {
    const activeClasses = isActive
      ? (theme === 'fallout' ? 'bg-gray-800' : theme === 'dark' ? 'bg-[#3a3a3a]' : theme === 'darkblue' ? 'bg-[#232b42]' : 'bg-neutral-100')
      : ''

    switch (theme) {
      case 'fallout':
        return `text-green-400 hover:bg-gray-800 ${activeClasses}`
      case 'dark':
        return `text-[#c0c0c0] hover:bg-[#3a3a3a] ${activeClasses}`
      case 'darkblue':
        return `text-[#8b99b5] hover:bg-[#232b42] ${activeClasses}`
      default:
        return `text-neutral-600 hover:bg-neutral-100 ${activeClasses}`
    }
  }

  if (compact) {
    return (
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          title={`Sort: ${activeSort ? activeSort.label : 'Custom'}`}
          aria-label="Sort notes"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={`h-5 w-5 rounded flex items-center justify-center transition-colors ${
            theme === 'fallout'
              ? 'text-green-600 hover:text-green-400 hover:bg-gray-800'
              : theme === 'dark'
                ? 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#2f2f2f]'
                : theme === 'darkblue'
                  ? 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#232b42]'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <ArrowUpDown className="w-3 h-3 pointer-events-none" />
        </button>
        {isOpen && (
          <div
            ref={dropdownRef}
            className={`fixed z-[70] w-32 rounded-lg shadow-lg ${getDropdownClasses()} border`}
            style={{ top: fixedPos.top, left: fixedPos.left, animation: 'dash-dropdown-in 120ms ease-out forwards' }}
          >
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSort(option.value)
                  setIsOpen(false)
                }}
                className={`block w-full px-4 py-2 text-sm text-left ${getDropdownItemClasses(activeSortOption === option.value)} focus:outline-none flex justify-between items-center`}
              >
                {option.label}
                {activeSortOption === option.value && (
                  <Check className={`w-4 h-4 ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-blue-400' : 'text-blue-500'}`} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center px-2 py-1 rounded-md text-xs transition-colors ${
          theme === 'fallout'
            ? 'bg-gray-800 text-green-400 hover:bg-gray-700'
            : theme === 'dark'
              ? 'bg-[#2f2f2f] text-[#8e8e8e] hover:bg-[#3a3a3a]'
              : theme === 'darkblue'
                ? 'bg-[#1a2035] text-[#8b99b5] hover:bg-[#232b42]'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
        }`}
      >
        <ArrowUpDown className="w-3 h-3 mr-1" />
        {activeSort ? activeSort.label : 'Sort'}
      </button>
      {isOpen && (
        <div 
          ref={dropdownRef}
          className={`absolute right-0 w-32 rounded-lg shadow-lg ${getDropdownClasses()} border ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          style={{ animation: `${dropdownPosition === 'top' ? 'dash-dropdown-up-in' : 'dash-dropdown-in'} 120ms ease-out forwards` }}
        >
          {sortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSort(option.value)
                setIsOpen(false)
              }}
              className={`block w-full px-4 py-2 text-sm text-left ${getDropdownItemClasses(activeSortOption === option.value)} focus:outline-none flex justify-between items-center`}
            >
              {option.label}
              {activeSortOption === option.value && (
                <Check className={`w-4 h-4 ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-blue-400' : 'text-blue-500'}`} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SortDropdown