import React from 'react'
import { useTheme } from 'next-themes'

const EditorComponent = ({ editorInstanceRef }) => {
  const { theme } = useTheme();

  return (
    <div 
      id="editorjs" 
      className={`flex-1 p-8 overflow-auto codex-editor ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-black'}`} 
      ref={editorInstanceRef}
    />
  );
};

export default EditorComponent;