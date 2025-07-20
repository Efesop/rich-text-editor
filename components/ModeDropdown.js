import React, { useState, useRef, useEffect } from 'react'
import { Coffee, Sun, ChevronDown } from 'lucide-react'

const ModeDropdown = ({ onModeChange, theme }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMode, setCurrentMode] = useState('default')
  const dropdownRef = useRef(null)

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

  const handleModeChange = (mode) => {
    setCurrentMode(mode)
    setIsOpen(false)
    onModeChange(mode)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center px-3 py-2 rounded-md ${
          theme === 'dark'
            ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
            : 'bg-white text-gray-800 hover:bg-gray-100'
        }`}
      >
        {currentMode === 'cafe' ? (
          <Coffee className="h-4 w-4 mr-2" />
        ) : (
          <Sun className="h-4 w-4 mr-2" />
        )}
        <span>{currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} Mode</span>
        <ChevronDown className="h-4 w-4 ml-2" />
      </button>
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          } ring-1 ring-black ring-opacity-5 z-10`}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            <button
              onClick={() => handleModeChange('default')}
              className={`block w-full text-left px-4 py-2 text-sm ${
                theme === 'dark'
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Sun className="inline-block mr-2 h-4 w-4" />
              Default Mode
            </button>
            <button
              onClick={() => handleModeChange('cafe')}
              className={`block w-full text-left px-4 py-2 text-sm ${
                theme === 'dark'
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Coffee className="inline-block mr-2 h-4 w-4" />
              Cafe Mode
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ModeDropdown
