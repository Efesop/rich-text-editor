import React, { useState, useEffect, useRef } from 'react'
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { ChevronDown } from 'lucide-react'
import { useTheme } from 'next-themes'

const SearchInput = ({ value, onChange, filter, onFilterChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { theme } = useTheme();

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'title', label: 'Page Names' },
    { value: 'content', label: 'Page Content' },
    { value: 'tags', label: 'Tags' },
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getDropdownStyle = () => {
    const rect = dropdownRef.current?.getBoundingClientRect();
    return {
      zIndex: 9999,
      top: rect ? `${rect.bottom + window.scrollY}px` : '0',
      left: rect ? `${rect.left + window.scrollX}px` : '0',
      backgroundColor: theme === 'dark' ? 'rgb(31, 41, 55)' : 'white',
      color: theme === 'dark' ? 'white' : 'black',
      borderColor: theme === 'dark' ? 'rgb(55, 65, 81)' : 'rgb(229, 231, 235)',
    };
  };

  const inputClassName = `rounded-r-none ${theme === 'dark' ? 'border-gray-700' : ''}`;
  const buttonClassName = `rounded-l-none border-l-0 px-2 ${theme === 'dark' ? 'border-gray-700' : ''}`;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />
        <Button
          variant="outline"
          className={buttonClassName}
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      {isOpen && (
        <div className="fixed mt-2 w-48 rounded-md shadow-lg border" style={getDropdownStyle()}>
          <div className="py-1" role="menu" aria-orientation="vertical">
            {filters.map((f) => (
              <button
                key={f.value}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}
                onClick={() => {
                  onFilterChange(f.value);
                  setIsOpen(false);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchInput;