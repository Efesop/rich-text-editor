import React, { useState, useRef, useEffect } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'

const SortDropdown = ({ onSort, theme, activeSortOption, sidebarOpen }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState('bottom')

  const sortOptions = [
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

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
          theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-800 hover:text-white'
        } ${activeSortOption !== 'default' ? 'bg-blue-500 text-white' : ''}`}
        title={`Sort pages (${activeSort ? activeSort.label : 'Default'})`}
      >
        <ArrowUpDown className="w-4 h-4" />
      </button>
      {isOpen && (
        <div 
          ref={dropdownRef}
          className={`absolute z-10 w-32 rounded-md shadow-lg ${
            theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          } border ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {sortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSort(option.value)
                setIsOpen(false)
              }}
              className={`block w-full px-4 py-2 text-sm text-left ${
                theme === 'dark'
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
              } ${activeSortOption === option.value ? (theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100') : ''} focus:outline-none flex justify-between items-center`}
            >
              {option.label}
              {activeSortOption === option.value && (
                <Check className="w-4 h-4 text-blue-500" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SortDropdown