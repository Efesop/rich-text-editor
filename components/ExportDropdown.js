import React, { useState, useRef, useEffect } from 'react';
import { Button } from "./ui/button";
import { Download } from 'lucide-react';
import { useTheme } from 'next-themes';

const ExportDropdown = ({ onExport }) => {
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

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center"
      >
        Export
      </Button>
      {isOpen && (
        <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border z-50`}>
          <div className="py-1" role="menu" aria-orientation="vertical">
            {exportOptions.map((option) => (
              <button
                key={option.value}
                className={`block w-full text-left px-4 py-2 text-sm ${
                  theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
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
