import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import NestedList from '@editorjs/nested-list'
import Checklist from '@editorjs/checklist'
import Quote from '@editorjs/quote'
import CodeTool from '@editorjs/code'
import InlineCode from '@editorjs/inline-code'
import Marker from '@editorjs/marker'
import Table from '@editorjs/table'
import LinkTool from '@editorjs/link'
import ImageTool from '@editorjs/image'
import Embed from '@editorjs/embed'
import Delimiter from '@editorjs/delimiter'
import Paragraph from '@editorjs/paragraph'

export const loadEditorJS = async (editorInstanceRef, currentPage, pages, setPages, setSaveStatus, setWordCount) => {
  if (editorInstanceRef.current) {
    return;
  }

  const editor = new EditorJS({
    holder: 'editorjs',
    tools: {
      header: Header,
      nestedlist: {
        class: NestedList,
        inlineToolbar: true,
        config: {
          defaultStyle: 'unordered'
        },
      },
      checklist: Checklist,
      quote: Quote,
      code: CodeTool,
      inlineCode: InlineCode,
      marker: Marker,
      table: Table,
      linkTool: LinkTool,
      image: ImageTool,
      embed: Embed,
      delimiter: Delimiter,
      paragraph: {
        class: Paragraph,
        inlineToolbar: true,
        config: {
          preserveBlank: true,
        },
      },
    },
    data: currentPage?.content || { blocks: [] },
    onChange: () => {
      if (editorInstanceRef.current.saveTimeout) {
        clearTimeout(editorInstanceRef.current.saveTimeout);
      }
      editorInstanceRef.current.saveTimeout = setTimeout(async () => {
        const content = await editorInstanceRef.current.save();
        const updatedPage = { ...currentPage, content };
        const updatedPages = pages.map(p => p.id === updatedPage.id ? updatedPage : p);
        setPages(updatedPages);
        window.electron.invoke('save-pages', updatedPages).catch((error) => {
          console.error('Error saving pages:', error);
        });
        setSaveStatus('saved');
        
        // Calculate word count
        const wordCount = content.blocks.reduce((count, block) => {
          let text = ''
          switch (block.type) {
            case 'paragraph':
            case 'header':
            case 'quote':
              text = block.data.text?.trim() || ''
              break
            case 'list':
            case 'checklist':
              text = block.data.items?.map(item => item.text).join(' ').trim() || ''
              break
            case 'table':
              text = block.data.content.flat().join(' ').trim() || ''
              break
            case 'code':
              text = block.data.code?.trim() || ''
              break
            default:
              text = ''
          }
          if (text) {
            return count + text.split(/\s+/).filter(word => word.length > 0).length
          }
          return count
        }, 0);
        setWordCount(wordCount);
      }, 1000);
    },
    onReady: () => {
      editorInstanceRef.current = editor;
    },
  });

  await editor.isReady;
  editorInstanceRef.current = editor;
};