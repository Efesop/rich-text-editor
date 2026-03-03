import React, { useState, useRef, useEffect } from 'react';
import { Button } from "./ui/button";
import { ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';

const ExportDropdown = ({ onExport, className: wrapperClassName = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { theme } = useTheme();

  const exportOptions = [
    { label: 'Export as PDF', value: 'pdf' },
    { label: 'Export as Markdown', value: 'markdown' },
    { label: 'Export as Plain Text', value: 'text' },
    { label: 'Export as RTF', value: 'rtf' },
    { label: 'Export as Word Document', value: 'docx' },
    { label: 'Export as CSV', value: 'csv' },
    { label: 'Export as JSON', value: 'json' },
    { label: 'Export as XML', value: 'xml' },
    { label: 'Export all pages (Encrypted)', value: 'dashpack', special: true }
  ];

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

  const getDropdownItemClasses = (isSpecial = false) => {
    if (isSpecial) {
      switch (theme) {
        case 'fallout':
          return 'text-green-400 hover:bg-green-600/20 font-bold border-l-2 border-green-600 pl-3'
        case 'dark':
          return 'text-[#ececec] hover:bg-[#3a3a3a] font-semibold border-l-2 border-[#6b6b6b] pl-3'
        case 'darkblue':
          return 'text-[#e0e6f0] hover:bg-[#232b42] font-semibold border-l-2 border-blue-500 pl-3'
        default:
          return 'text-neutral-900 hover:bg-neutral-50 font-semibold border-l-2 border-neutral-400 pl-3'
      }
    }

    switch (theme) {
      case 'fallout':
        return 'text-green-400 hover:bg-gray-800 hover:text-green-300'
      case 'dark':
        return 'text-[#c0c0c0] hover:bg-[#3a3a3a] hover:text-[#ececec]'
      case 'darkblue':
        return 'text-[#8b99b5] hover:bg-[#232b42] hover:text-[#e0e6f0]'
      default:
        return 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    }
  }

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

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center ${wrapperClassName}`}
      >
        Export
        <ChevronDown className="ml-1 h-4 w-4" />
      </Button>
      {isOpen && (
        <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg ${getDropdownClasses()} border z-[60]`}>
          <div className="py-1" role="menu" aria-orientation="vertical">
            {exportOptions.map((option) => (
              <button
                key={option.value}
                className={`block w-full text-left px-4 py-2 text-sm ${getDropdownItemClasses(option.special)}`}
                onClick={() => {
                  onExport(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportDropdown;
