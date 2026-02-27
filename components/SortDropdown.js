import React, { useState, useRef, useEffect } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'

const SortDropdown = ({ onSort, theme, activeSortOption, sidebarOpen }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState('bottom')

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
    if (isOpen) {
      calculateDropdownPosition()
      window.addEventListener('resize', calculateDropdownPosition)
      window.addEventListener('scroll', calculateDropdownPosition)
    }

    return () => {
      window.removeEventListener('resize', calculateDropdownPosition)
      window.removeEventListener('scroll', calculateDropdownPosition)
    }
  }, [isOpen])

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
      default:
        return 'bg-white border-neutral-200 text-neutral-900'
    }
  }

  const getDropdownItemClasses = (isActive = false) => {
    const activeClasses = isActive
      ? (theme === 'fallout' ? 'bg-gray-800' : theme === 'dark' ? 'bg-[#3a3a3a]' : 'bg-neutral-100')
      : ''

    switch (theme) {
      case 'fallout':
        return `text-green-400 hover:bg-gray-800 ${activeClasses}`
      case 'dark':
        return `text-[#c0c0c0] hover:bg-[#3a3a3a] ${activeClasses}`
      default:
        return `text-neutral-600 hover:bg-neutral-100 ${activeClasses}`
    }
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
                <Check className={`w-4 h-4 ${theme === 'fallout' ? 'text-green-400' : 'text-blue-500'}`} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SortDropdown