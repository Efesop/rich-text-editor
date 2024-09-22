import React, { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

export function RenameModal({ isOpen, onClose, onConfirm, title, onTitleChange }) {
  const { theme } = useTheme();
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        onConfirm();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div 
        ref={modalRef}
        className={`rounded shadow-xl border p-4 w-64 ${
          theme === 'dark' 
            ? 'bg-gray-800 border-gray-700 text-white' 
            : 'bg-white border-gray-200 text-black'
        }`}
      >
        <h2 className="mb-2 text-lg font-medium">
          Rename Page
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className={`w-full p-2 mb-4 text-sm border rounded ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-black'
          }`}
        />
        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className={`px-3 py-1 text-sm rounded ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-black'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1 text-sm rounded ${
              theme === 'dark'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
