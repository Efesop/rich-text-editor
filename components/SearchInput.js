import React from 'react'
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { ChevronDown } from 'lucide-react'
import { useTheme } from 'next-themes'
import SearchDropdown from './SearchDropdown'

const SearchInput = ({ 
  value, 
  onChange, 
  filter, 
  onFilterChange, 
  placeholder,
  pages = [],
  folders = [],
  tags = [],
  onSelectPage,
  onSelectFolder,
  onSelectTag,
  showDropdown = true
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const dropdownRef = React.useRef(null)
  const { theme } = useTheme()

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'title', label: 'Page Names' },
    { value: 'content', label: 'Page Content' },
    { value: 'tags', label: 'Tags' },
  ]

  React.useEffect(() => {
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

  const borderColor = theme === 'fallout' ? 'border-green-600' : theme === 'dark' ? 'border-gray-700' : 'border-gray-300'

  const getDropdownClasses = () => {
    switch (theme) {
      case 'fallout':
        return 'bg-gray-900 border-green-600 text-green-400'
      case 'dark':
        return 'bg-gray-800 border-gray-700 text-white'
      default:
        return 'bg-white border-gray-200 text-gray-900'
    }
  }

  const getDropdownItemClasses = (isActive = false) => {
    const activeClasses = isActive 
      ? (theme === 'fallout' ? 'bg-gray-800 text-green-300' : theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900')
      : ''
    
    switch (theme) {
      case 'fallout':
        return `block w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-gray-800 hover:text-green-300 ${activeClasses}`
      case 'dark':
        return `block w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 hover:text-white ${activeClasses}`
      default:
        return `block w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 hover:text-gray-900 ${activeClasses}`
    }
  }

  // If showDropdown is enabled, use the new SearchDropdown component
  if (showDropdown) {
    return (
      <SearchDropdown
        searchTerm={value}
        onSearchTermChange={onChange}
        pages={pages}
        folders={folders}
        tags={tags}
        onSelectPage={onSelectPage}
        onSelectFolder={onSelectFolder}
        onSelectTag={onSelectTag}
        className="w-full"
      />
    )
  }

  // Fallback to original search input with filter dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`rounded-r-none ${borderColor}`}
        />
        <Button
          variant="outline"
          className={`rounded-l-none border-l-0 px-2 ${borderColor}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      {isOpen && (
        <div className={`absolute mt-2 w-48 rounded-md shadow-lg border z-10 ${getDropdownClasses()}`}>
          <div className="py-1" role="menu" aria-orientation="vertical">
            {filters.map((f) => (
              <button
                key={f.value}
                className={getDropdownItemClasses(filter === f.value)}
                role="menuitem"
                onClick={() => {
                  onFilterChange(f.value)
                  setIsOpen(false)
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchInput