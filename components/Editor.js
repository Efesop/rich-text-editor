import React, { useEffect, useRef } from 'react'

export default function Editor({ data, onChange, holder }) {
  const editorRef = useRef(null)

  useEffect(() => {
    let EditorJS

    const initEditor = async () => {
      EditorJS = (await import('@editorjs/editorjs')).default
      const Header = (await import('@editorjs/header')).default
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
      const OriginalParagraph = (await import('@editorjs/paragraph')).default
      const NestedList = (await import('@editorjs/nested-list')).default

      // Custom Paragraph tool that preserves empty paragraphs
      const Paragraph = class extends OriginalParagraph {
        static get sanitize() {
          return {
            text: {
              br: true,
            }
          }
        }
        
        validate(savedData) {
          return true
        }
      }

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
          image: {
            class: ImageTool,
            config: {
              uploader: {
                uploadByFile(file) {
                  return new Promise((resolve) => {
                    const reader = new FileReader()
                    reader.onload = function (e) {
                      resolve({
                        success: 1,
                        file: {
                          url: e.target.result
                        }
                      })
                    }
                    reader.readAsDataURL(file)
                  })
                }
              },
              captionPlaceholder: 'Caption (optional)',
              withCaption: false // This makes the caption optional
            }
          },
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

  useEffect(() => {
    const handleLinkClick = (event) => {
      const link = event.target.closest('a')
      if (link) {
        event.preventDefault()
        window.open(link.href, '_blank')
      }
    }

    const editorElement = document.getElementById(holder)
    if (editorElement) {
      editorElement.addEventListener('click', handleLinkClick)
    }

    return () => {
      if (editorElement) {
        editorElement.removeEventListener('click', handleLinkClick)
      }
    }
  }, [holder])

  return <div id={holder} />
}
