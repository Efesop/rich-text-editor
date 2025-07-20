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

  const borderColor = theme === 'dark' ? 'border-gray-700' : 'border-gray-300'

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
        <div className="absolute mt-2 w-48 rounded-md shadow-lg bg-white border border-gray-200 z-10">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {filters.map((f) => (
              <button
                key={f.value}
                className={`block w-full text-left px-4 py-2 text-sm ${
                  filter === f.value ? 'bg-gray-100 text-gray-900' : 'text-gray-900'
                } hover:bg-gray-100 hover:text-gray-900`}
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