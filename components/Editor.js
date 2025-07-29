 import React, { useEffect, useRef, useCallback, useMemo } from 'react'

export default function Editor({ data, onChange, holder }) {
  const editorRef = useRef(null)
  const isInitializedRef = useRef(false)
  const dataRef = useRef(data)
  const onChangeRef = useRef(onChange)

  // Update refs when props change
  useEffect(() => {
    dataRef.current = data
    onChangeRef.current = onChange
  }, [data, onChange])

  // Memoize editor configuration to prevent unnecessary re-initializations
  const editorConfig = useMemo(() => ({
    holder: holder,
    placeholder: 'Start writing...',
    minHeight: 100,
    autofocus: true,
    defaultBlock: 'paragraph',
    sanitizer: {
      p: true,
      b: true,
      i: true,
      strong: true,
      em: true,
      u: true,
      s: true,
      mark: true,
      code: true,
      a: {
        href: true,
        target: '_blank',
        rel: 'noopener noreferrer'
      },
      br: true
    },
    onChange: async (api, event) => {
      try {
        // Debounce the onChange to prevent excessive saves
        if (editorRef.current?.onChange) {
          clearTimeout(editorRef.current.onChange)
        }
        editorRef.current.onChange = setTimeout(async () => {
          try {
            const content = await api.saver.save()
            onChangeRef.current?.(content)
          } catch (error) {
            console.error('Error saving editor content:', error)
          }
        }, 300)
      } catch (error) {
        console.error('Error in editor onChange:', error)
      }
    }
  }), [holder])

  // Initialize editor tools
  const initializeTools = useCallback(async () => {
    try {
      const [
        EditorJS,
        Header,
        Checklist,
        Quote,
        CodeTool,
        InlineCode,
        Marker,
        Table,
        LinkTool,
        ImageTool,
        Embed,
        Delimiter,
        OriginalParagraph,
        NestedList
      ] = await Promise.all([
        import('@editorjs/editorjs').then(m => m.default),
        import('@editorjs/header').then(m => m.default),
        import('@editorjs/checklist').then(m => m.default),
        import('@editorjs/quote').then(m => m.default),
        import('@editorjs/code').then(m => m.default),
        import('@editorjs/inline-code').then(m => m.default),
        import('@editorjs/marker').then(m => m.default),
        import('@editorjs/table').then(m => m.default),
        import('@editorjs/link').then(m => m.default),
        import('@editorjs/image').then(m => m.default),
        import('@editorjs/embed').then(m => m.default),
        import('@editorjs/delimiter').then(m => m.default),
        import('@editorjs/paragraph').then(m => m.default),
        import('@editorjs/nested-list').then(m => m.default)
      ])

      // Enhanced Paragraph tool that preserves empty paragraphs and improves formatting
      const Paragraph = class extends OriginalParagraph {
        static get sanitize() {
          return {
            text: {
              br: true,
              b: true,
              strong: true,
              i: true,
              em: true,
              u: true,
              s: true,
              mark: true,
              code: true,
              a: {
                href: true,
                target: '_blank',
                rel: 'noopener noreferrer'
              }
            }
          }
        }
        
        validate(savedData) {
          return true
        }

        render() {
          const wrapper = super.render()
          wrapper.style.lineHeight = '1.6'
          wrapper.style.fontSize = '16px'
          return wrapper
        }
      }

      const tools = {
        header: {
          class: Header,
          inlineToolbar: ['marker', 'inlineCode'],
          config: {
            placeholder: 'Enter a header',
            levels: [2, 3, 4],
            defaultLevel: 2
          }
        },
        nestedlist: {
          class: NestedList,
          inlineToolbar: true,
          config: {
            defaultStyle: 'unordered'
          }
        },
        checklist: {
          class: Checklist,
          inlineToolbar: true
        },
        quote: {
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: 'Enter a quote',
            captionPlaceholder: 'Quote\'s author'
          }
        },
        code: {
          class: CodeTool,
          config: {
            placeholder: 'Enter code'
          }
        },
        inlineCode: {
          class: InlineCode,
          shortcut: 'CMD+SHIFT+M'
        },
        marker: {
          class: Marker,
          shortcut: 'CMD+SHIFT+H'
        },
        table: {
          class: Table,
          inlineToolbar: true,
          config: {
            rows: 2,
            cols: 3,
            withHeadings: true
          }
        },
        linkTool: {
          class: LinkTool,
          config: {
            endpoint: '/api/fetchUrl' // You might want to implement this for better link previews
          }
        },
        image: {
          class: ImageTool,
          config: {
            uploader: {
              uploadByFile(file) {
                return new Promise((resolve, reject) => {
                  try {
                    const reader = new FileReader()
                    reader.onload = function (e) {
                      resolve({
                        success: 1,
                        file: {
                          url: e.target.result
                        }
                      })
                    }
                    reader.onerror = () => {
                      reject(new Error('Failed to read file'))
                    }
                    reader.readAsDataURL(file)
                  } catch (error) {
                    reject(error)
                  }
                })
              }
            },
            captionPlaceholder: 'Caption (optional)',
            withCaption: false
          }
        },
        embed: {
          class: Embed,
          config: {
            services: {
              youtube: true,
              vimeo: true,
              github: true,
              twitter: true
            }
          }
        },
        delimiter: Delimiter,
        paragraph: {
          class: Paragraph,
          inlineToolbar: true
        }
      }

      return { EditorJS, tools }
    } catch (error) {
      console.error('Error loading Editor.js tools:', error)
      throw error
    }
  }, [])

  // Initialize editor
  useEffect(() => {
    let isCancelled = false

    const initEditor = async () => {
      try {
        // Clean up existing editor first
        if (editorRef.current && typeof editorRef.current.destroy === 'function') {
          await editorRef.current.destroy()
          editorRef.current = null
        }

        if (isCancelled) return

        const { EditorJS, tools } = await initializeTools()
        
        if (isCancelled) return

        // Validate data structure
        const validData = data && typeof data === 'object' && Array.isArray(data.blocks) 
          ? data 
          : { time: Date.now(), blocks: [], version: '2.30.6' }

        editorRef.current = new EditorJS({
          ...editorConfig,
          tools,
          data: validData
        })

        await editorRef.current.isReady
        isInitializedRef.current = true

      } catch (error) {
        console.error('Error initializing Editor.js:', error)
        // Show fallback UI or retry logic could go here
      }
    }

    if (!isInitializedRef.current) {
      initEditor()
    }

    return () => {
      isCancelled = true
    }
  }, [editorConfig, initializeTools]) // Only re-init if config changes

  // Update editor data when data prop changes (without re-initializing)
  useEffect(() => {
    const updateEditorData = async () => {
      if (editorRef.current && isInitializedRef.current && data !== dataRef.current) {
        try {
          await editorRef.current.isReady
          const validData = data && typeof data === 'object' && Array.isArray(data.blocks) 
            ? data 
            : { time: Date.now(), blocks: [], version: '2.30.6' }
          
          await editorRef.current.render(validData)
          dataRef.current = data
        } catch (error) {
          console.error('Error updating editor data:', error)
        }
      }
    }

    updateEditorData()
  }, [data])

  // Handle link clicks
  useEffect(() => {
    const handleLinkClick = (event) => {
      const link = event.target.closest('a')
      if (link && link.href) {
        event.preventDefault()
        if (window.electron?.openExternal) {
          window.electron.openExternal(link.href)
        } else {
          window.open(link.href, '_blank', 'noopener,noreferrer')
        }
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

  // Inject custom CSS after Editor.js loads to override default styles
  useEffect(() => {
    const injectCustomCSS = () => {
      // Remove existing custom styles if any
      const existingStyle = document.getElementById('editorjs-fallout-override')
      if (existingStyle) {
        existingStyle.remove()
      }

      // Get current theme from body class
      const isFallout = document.body.classList.contains('fallout')
      
      if (isFallout) {
        const style = document.createElement('style')
        style.id = 'editorjs-fallout-override'
        style.textContent = `
          /* FORCE override Editor.js hover effects */
          .fallout .codex-editor .ce-block:hover .ce-block__content,
          .fallout .codex-editor .ce-block--selected .ce-block__content {
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            outline: none !important;
          }
          
          .fallout .codex-editor .ce-block:hover::before,
          .fallout .codex-editor .ce-block:hover::after,
          .fallout .codex-editor .ce-block::before,
          .fallout .codex-editor .ce-block::after {
            display: none !important;
            content: none !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          
          /* Force clean dropdown styling */
          .fallout .ce-popover,
          .fallout .ce-popover.ce-popover--opened {
            background: #1a1a1a !important;
            border: 1px solid #22c55e !important;
            color: #22c55e !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          }
          
          .fallout .ce-popover__item {
            background: transparent !important;
            color: #22c55e !important;
            border: none !important;
            box-shadow: none !important;
            outline: none !important;
            padding: 8px 12px !important;
          }
          
          .fallout .ce-popover__item:hover {
            background: #2a2a2a !important;
            color: #22c55e !important;
            border: none !important;
            box-shadow: none !important;
          }
        `
        document.head.appendChild(style)
      }
    }

    // Inject CSS after a short delay to ensure Editor.js has loaded
    const timer = setTimeout(injectCustomCSS, 100)
    
    // Also inject on theme changes
    const observer = new MutationObserver(() => {
      injectCustomCSS()
    })
    
    observer.observe(document.body, { 
      attributes: true, 
      attributeFilter: ['class'] 
    })

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        if (editorRef.current.onChange) {
          clearTimeout(editorRef.current.onChange)
        }
        if (typeof editorRef.current.destroy === 'function') {
          editorRef.current.destroy()
        }
      }
    }
  }, [])

  return (
    <div 
      id={holder} 
      className="editor-container"
      style={{
        minHeight: '200px',
        fontSize: '16px',
        lineHeight: '1.6'
      }}
    />
  )
}
