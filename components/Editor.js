import React, { useEffect, useRef } from 'react'

export default function Editor({ data, onChange, holder }) {
  const editorRef = useRef(null)

  useEffect(() => {
    let EditorJS

    const initEditor = async () => {
      EditorJS = (await import('@editorjs/editorjs')).default
      const Header = (await import('@editorjs/header')).default
      const List = (await import('@editorjs/list')).default
      const Checklist = (await import('@editorjs/checklist')).default
      const Quote = (await import('@editorjs/quote')).default
      const CodeTool = (await import('@editorjs/code')).default
      const InlineCode = (await import('@editorjs/inline-code')).default
      const Marker = (await import('@editorjs/marker')).default
      const Table = (await import('@editorjs/table')).default
      const LinkTool = (await import('@editorjs/link')).default
      const ImageTool = (await import('@editorjs/image')).default
      const Embed = (await import('@editorjs/embed')).default
      const Delimiter = (await import('@editorjs/delimiter')).default
      const Paragraph = (await import('@editorjs/paragraph')).default
      const NestedList = (await import('@editorjs/nested-list')).default

      if (editorRef.current && typeof editorRef.current.destroy === 'function') {
        editorRef.current.destroy()
      }

      editorRef.current = new EditorJS({
        holder: holder,
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
          },
        },
        data: data || {},
        onChange: async () => {
          const content = await editorRef.current.save()
          onChange(content)
        },
      })
    }

    initEditor()

    return () => {
      if (editorRef.current && typeof editorRef.current.destroy === 'function') {
        editorRef.current.destroy()
      }
    }
  }, [data, onChange, holder])

  return <div id={holder} />
}
