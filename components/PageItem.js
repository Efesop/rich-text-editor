import React, { useState, useEffect, useRef } from 'react'
import { Button } from "../ui/button"
import { MoreVertical } from 'lucide-react'
import { useTheme } from 'next-themes'

const PageItem = ({ page, isActive, onSelect, onRename, onDelete, sidebarOpen, theme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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

  const truncateTitle = (title) => {
    if (title.length <= 3) return title;
    return title.slice(0, 3) + '...';
  };

  const activeClass = isActive
    ? theme === 'dark'
      ? 'bg-gray-700'
      : 'bg-gray-200'
    : '';

  return (
    <div
      className={`cursor-pointer flex justify-between items-center w-full ${activeClass} ${
        theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
      }`}
      onClick={() => onSelect(page)}
    >
      <div className={`flex items-center overflow-hidden py-2 px-2 w-full ${sidebarOpen ? 'px-4' : 'justify-center'}`}>
        <span className={`truncate ${sidebarOpen ? '' : 'text-center'}`} title={page.title}>
          {sidebarOpen ? page.title : truncateTitle(page.title)}
        </span>
        {sidebarOpen && page.tags && (
          <div className="flex flex-wrap space-x-1 ml-2">
            {page.tags.map((tag, index) => (
              <span key={index} className="bg-gray-200 text-gray-700 px-1 py-0.5 rounded text-xs" style={{ backgroundColor: tag.color.background, border: `1px solid ${tag.color.border}` }}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {sidebarOpen && (
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-white'
              } ring-1 ring-black ring-opacity-5 z-50`}>
                <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                  <button
                    className={`block px-4 py-2 text-sm w-full text-left ${
                      theme === 'dark'
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(page);
                      setIsOpen(false);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className={`block px-4 py-2 text-sm w-full text-left ${
                      theme === 'dark'
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(page);
                      setIsOpen(false);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PageItem;