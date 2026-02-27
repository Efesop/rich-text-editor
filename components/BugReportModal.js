import React, { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useTheme } from 'next-themes'

export function BugReportModal({ isOpen, onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('bug')
  const { theme } = useTheme()
  const modalRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ title, description, type })
    setTitle('')
    setDescription('')
    setType('bug')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className={`${theme === 'fallout' ? 'bg-gray-900 text-green-400 border-2 border-green-500/60' : theme === 'darkblue' ? 'bg-[#141825] text-[#e0e6f0] border border-[#1c2438]' : theme === 'dark' ? 'bg-[#2f2f2f] text-white' : 'bg-white text-gray-900'} p-6 rounded-lg shadow-xl max-w-md w-full`}
      >
        <h2 className="text-xl font-bold mb-4">Report a Bug / Request a Feature</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={`w-full p-2 rounded ${theme === 'fallout' ? 'bg-gray-800 text-green-400 border-green-500/40' : theme === 'darkblue' ? 'bg-[#1a2035] text-[#e0e6f0] border-[#1c2438]' : theme === 'dark' ? 'bg-[#3a3a3a]' : 'bg-gray-100'}`}
            >
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block mb-2">Title</label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the bug or feature request"
              className={`w-full p-2 rounded ${theme === 'fallout' ? 'bg-gray-800 text-green-400 border-green-500/40' : theme === 'darkblue' ? 'bg-[#1a2035] text-[#e0e6f0] border-[#1c2438]' : theme === 'dark' ? 'bg-[#3a3a3a]' : 'bg-gray-100'}`}
              rows="4"
              required
            ></textarea>
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button type="submit">
              Submit
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}