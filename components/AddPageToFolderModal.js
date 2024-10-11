import React, { useState } from 'react'
export function AddPageToFolderModal({ isOpen, onClose, onConfirm, pages, currentFolderId, theme }) {
  const [selectedPageIds, setSelectedPageIds] = useState([])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (selectedPageIds.length > 0) {
      onConfirm(selectedPageIds, currentFolderId)
    }
    onClose()
  }

  const handleCheckboxChange = (pageId) => {
    setSelectedPageIds(prevIds => 
      prevIds.includes(pageId)
        ? prevIds.filter(id => id !== pageId)
        : [...prevIds, pageId]
    )
  }

  if (!isOpen) return null

  const availablePages = pages.filter(page => page.type !== 'folder' && !page.folderId)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-black'} p-6 rounded-lg shadow-xl w-96`}>
        <h2 className="text-xl font-bold mb-4">Add Pages to Folder</h2>
        <form onSubmit={handleSubmit}>
          <div className="max-h-60 overflow-y-auto mb-4">
            {availablePages.map(page => (
              <div key={page.id} className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id={page.id}
                  checked={selectedPageIds.includes(page.id)}
                  onChange={() => handleCheckboxChange(page.id)}
                  className="mr-2"
                />
                <label htmlFor={page.id}>{page.title}</label>
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedPageIds.length === 0}
              className={`px-4 py-2 rounded ${selectedPageIds.length > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 cursor-not-allowed'} text-white`}
            >
              Add to Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}