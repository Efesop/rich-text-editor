import React from 'react'
import { Button } from "../ui/button"
import { X, Plus } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import ExportDropdown from '../ExportDropdown'
import EditorComponent from './EditorComponent'

const MainContent = ({
  currentPage,
  tags,
  saveStatus,
  wordCount,
  onExport,
  onRemoveTag,
  onAddTag,
  onEditTag,
  editorInstanceRef
}) => {
  const { theme } = useTheme();

  return (
    <div className="flex-1 flex flex-col">
      <div className={`flex flex-col p-4 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold">{currentPage.title}</h1>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>{wordCount} words</span>
            {saveStatus === 'saving' && <span className="text-yellow-500">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-green-500">Saved</span>}
            {saveStatus === 'error' && <span className="text-red-500">Error saving</span>}
            <ExportDropdown onExport={onExport} />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex items-center space-x-2 mt-2">
          {tags.map((tag, index) => (
            <span
              key={index}
              className="flex items-center px-2 py-1 rounded text-xs text-gray-700"
              style={{ backgroundColor: tag.color.background, border: `1px solid ${tag.color.border}` }}
            >
              <span
                className="cursor-pointer text-gray-700"
                onClick={() => onEditTag(tag)}
              >
                {tag.name}
              </span>
              <button
                className="ml-1 focus:outline-none"
                onClick={() => onRemoveTag(tag)}
              >
                <X className="h-3 w-3 text-gray-700" />
              </button>
            </span>
          ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={onAddTag}
          >
            <Plus className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} />
          </Button>
        </div>
      </div>
      <EditorComponent editorInstanceRef={editorInstanceRef} />
    </div>
  );
};

export default MainContent;