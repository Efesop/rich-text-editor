import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, ChevronDown, AlertTriangle } from 'lucide-react'

export default function TagModal({ isOpen, onClose, onConfirm, onRemove, onDelete, tag, existingTags }) {
  const [tagName, setTagName] = useState(tag || '')
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef(null)
  const modalRef = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTagName(tag || '')
      setShowDeleteWarning(false)
      setIsDropdownOpen(false)
      inputRef.current?.focus()
    }
  }, [isOpen, tag])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose()
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && !inputRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (tagName.trim()) {
      onConfirm(tagName.trim())
      onClose()
    }
  }

  const handleRemove = () => {
    onRemove(tag)
    onClose()
  }

  const handleDelete = () => {
    onDelete(tag)
    setShowDeleteWarning(false)
    onClose()
  }

  const filteredTags = existingTags.filter(t => 
    t.toLowerCase().includes(tagName.toLowerCase()) && t !== tagName
  )

  const isExistingTag = existingTags.includes(tagName)

  return (
    <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div ref={modalRef} className="relative transform overflow-visible rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 w-full sm:max-w-xs">
            <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
              <button
                type="button"
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={onClose}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
              <div>
                <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">
                  {tag ? 'Edit Tag' : 'Add Tag'}
                </h3>
                <div className="mt-2">
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      placeholder="Enter or select a tag"
                      value={tagName}
                      onChange={(e) => {
                        setTagName(e.target.value)
                        setIsDropdownOpen(true)
                      }}
                      className="w-full pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-0 top-0 h-full"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    {isDropdownOpen && filteredTags.length > 0 && (
                      <div 
                        ref={dropdownRef}
                        className="absolute left-0 mt-1 w-full rounded-md shadow-lg bg-white border border-gray-200 z-50 max-h-40 overflow-y-auto"
                      >
                        <div className="py-1" role="menu" aria-orientation="vertical">
                          {filteredTags.map((existingTag, index) => (
                            <button
                              key={index}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                              onClick={() => {
                                setTagName(existingTag)
                                setIsDropdownOpen(false)
                              }}
                            >
                              {existingTag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
              <Button
                onClick={handleConfirm}
                disabled={!tagName.trim()}
                className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExistingTag ? 'Add' : 'Create'}
              </Button>
              {tag && (
                <>
                  <Button
                    onClick={handleRemove}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-500 sm:mt-0 sm:w-auto sm:mr-3"
                  >
                    Remove from Page
                  </Button>
                  <Button
                    onClick={() => setShowDeleteWarning(true)}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:mt-0 sm:w-auto sm:mr-3"
                  >
                    Delete Global Tag
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDeleteWarning && (
        <div className="relative z-20" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
          <div className="fixed inset-0 z-20 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                      <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                      <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">Delete Tag</h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Are you sure you want to delete this tag? This action cannot be undone and the tag will be removed from all pages where it's currently being used.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <Button
                    onClick={handleDelete}
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                  >
                    Delete
                  </Button>
                  <Button
                    onClick={() => setShowDeleteWarning(false)}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
