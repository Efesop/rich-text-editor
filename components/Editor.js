 import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import MultiBlockTuneEnhancer from './MultiBlockToolbar'
import { migrateEditorData } from '@/utils/migrateBlocks'
import { PageLinkInlineTool } from './editor-tools/PageLink'
import { stripImageMetadata } from '@/utils/imageUtils'

export default function Editor({ data, onChange, holder, onPageLinkClick }) {
  const editorRef = useRef(null)
  const isInitializedRef = useRef(false)
  const dataRef = useRef(data)
  const onChangeRef = useRef(onChange)
  const multiBlockEnhancerRef = useRef(null)
  const undoRef = useRef(null)
  const lastSavedRef = useRef(null) // Dedup: prevent MutationObserver feedback loops

  // Update refs when props change
  useEffect(() => {
    dataRef.current = data
    onChangeRef.current = onChange
  }, [data, onChange])

  // Memoize editor configuration to prevent unnecessary re-initializations
  const editorConfig = useMemo(() => ({
    holder: holder,
    placeholder: "Start typing or press '/'",
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
        rel: 'noopener noreferrer',
        'data-page-id': true,
        class: true
      },
      br: true
    },
    onChange: async (api, event) => {
      try {
        // Renumber ordered list items on any editor change
        if (typeof window !== 'undefined' && window._renumberListItems) {
          window._renumberListItems()
        }
        // Debounce the onChange to prevent excessive saves
        if (editorRef.current?.onChange) {
          clearTimeout(editorRef.current.onChange)
        }
        editorRef.current.onChange = setTimeout(async () => {
          try {
            const content = await api.saver.save()
            // Dedup: EditorJS MutationObserver fires onChange on ANY DOM mutation,
            // including React re-renders from our own save flow. Compare blocks
            // structurally to only propagate actual user edits.
            const blocksStr = JSON.stringify(content.blocks)
            if (blocksStr === lastSavedRef.current) {
              if (window.__DASH_DEBUG) console.log('[editor] onChange skipped — no structural change')
              return
            }
            lastSavedRef.current = blocksStr
            if (window.__DASH_DEBUG) console.log('[editor] onChange →', content.blocks?.length, 'blocks')
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
        CodeBlock,
        InlineCode,
        Marker,
        Table,
        ImageTool,
        Embed,
        Delimiter,
        OriginalParagraph,
        NestedList,
        Underline,
        AlignmentTune,
        Undo,
        DragDrop,
        BulletListItem,
        NumberedListItem,
        ChecklistItemTool,
        SeedPhraseTool
      ] = await Promise.all([
        import('@editorjs/editorjs').then(m => m.default),
        import('@editorjs/header').then(m => m.default),
        import('@editorjs/checklist').then(m => m.default),
        import('@editorjs/quote').then(m => m.default),
        import('./editor-tools/CodeBlock').then(m => m.default),
        import('@editorjs/inline-code').then(m => m.default),
        import('@editorjs/marker').then(m => m.default),
        import('@editorjs/table').then(m => m.default),
        import('@editorjs/image').then(m => m.default),
        import('@editorjs/embed').then(m => m.default),
        import('@editorjs/delimiter').then(m => m.default),
        import('@editorjs/paragraph').then(m => m.default),
        import('@editorjs/nested-list').then(m => m.default),
        import('@editorjs/underline').then(m => m.default),
        import('editorjs-text-alignment-blocktune').then(m => m.default),
        import('editorjs-undo').then(m => m.default),
        import('editorjs-drag-drop').then(m => m.default),
        import('./editor-tools/BulletListItem').then(m => m.default),
        import('./editor-tools/NumberedListItem').then(m => m.default),
        import('./editor-tools/ChecklistItem').then(m => m.default),
        import('./editor-tools/SeedPhrase').then(m => m.default),
      ])

      // Auto-link bare URLs in HTML (skip URLs already inside <a> tags)
      const autoLinkUrls = (html) => {
        if (!html || !html.includes('://')) return html
        const parts = html.split(/(<a[^>]*>.*?<\/a>)/gi)
        return parts.map(part => {
          if (part.match(/^<a\s/i)) return part
          return part.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
        }).join('')
      }

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
                rel: 'noopener noreferrer',
                'data-page-id': true,
                class: true
              }
            }
          }
        }

        validate(savedData) {
          return true
        }

        onPaste(event) {
          const html = event.detail.data?.innerHTML || ''
          const linked = autoLinkUrls(html)
          this._data = { text: linked }
          window.requestAnimationFrame(() => {
            if (this._element) {
              this._element.innerHTML = this._data.text || ''
            }
          })
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
          tunes: ['alignment'],
          config: {
            placeholder: 'Enter a header',
            levels: [2, 3, 4],
            defaultLevel: 2
          }
        },
        bulletListItem: {
          class: BulletListItem,
          inlineToolbar: true,
        },
        numberedListItem: {
          class: NumberedListItem,
          inlineToolbar: true,
        },
        checklistItem: {
          class: ChecklistItemTool,
          inlineToolbar: true,
        },
        seedPhrase: {
          class: SeedPhraseTool,
        },
        // Legacy tools kept for backwards compatibility (migration converts data before render)
        // Hidden from toolbox and conversion menus — only used to render unmigrated blocks
        nestedlist: {
          class: class extends NestedList {
            static get toolbox() { return false }
            static get conversionConfig() { return undefined }
            static get pasteConfig() { return {} }
          },
          inlineToolbar: true,
          config: {
            defaultStyle: 'unordered'
          }
        },
        checklist: {
          class: class extends Checklist {
            static get toolbox() { return false }
            static get conversionConfig() { return undefined }
          },
          inlineToolbar: true,
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
          class: CodeBlock,
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
        pageLink: {
          class: PageLinkInlineTool,
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
        image: {
          class: ImageTool,

          config: {
            uploader: {
              async uploadByFile (file) {
                const MAX_SIZE = 5 * 1024 * 1024 // 5MB
                if (file.size > MAX_SIZE) {
                  throw new Error('Image too large. Maximum size is 5MB.')
                }
                const url = await stripImageMetadata(file)
                return { success: 1, file: { url } }
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
        delimiter: {
          class: class extends Delimiter {
            static get toolbox() {
              const parent = Delimiter.toolbox
              return { ...parent, title: 'Divider' }
            }
          },
        },
        underline: {
          class: Underline,
          shortcut: 'CMD+U'
        },
        alignment: {
          class: AlignmentTune,
          config: {
            default: 'left'
          }
        },
        paragraph: {
          class: Paragraph,
          inlineToolbar: true,
          tunes: ['alignment']
        }
      }

      return { EditorJS, tools, Undo, DragDrop }
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

        const { EditorJS, tools, Undo, DragDrop } = await initializeTools()

        if (isCancelled) return

        // Validate data structure
        const validData = data && typeof data === 'object' && Array.isArray(data.blocks)
          ? data
          : { time: Date.now(), blocks: [], version: '2.30.6' }

        // Migrate old nestedlist/checklist blocks to individual item blocks
        const migratedData = migrateEditorData(validData)

        editorRef.current = new EditorJS({
          ...editorConfig,
          tools,
          data: migratedData
        })

        await editorRef.current.isReady
        isInitializedRef.current = true

        // Enable undo/redo (Cmd+Z / Cmd+Shift+Z)
        const undoInstance = new Undo({
          editor: editorRef.current,
          maxLength: 50,
          config: {
            debounceTimer: 250,
            shortcuts: {
              undo: 'CMD+Z',
              redo: 'CMD+SHIFT+Z'
            }
          }
        })
        // Initialize with current data so undo doesn't revert to empty
        undoInstance.initialize(migratedData)
        undoRef.current = undoInstance

        // Enable drag-and-drop block reordering
        new DragDrop(editorRef.current)

        // Initialize multi-block tune enhancer
        if (!multiBlockEnhancerRef.current) {
          multiBlockEnhancerRef.current = new MultiBlockTuneEnhancer(editorRef.current)
        }

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
      if (editorRef.current && isInitializedRef.current && data !== dataRef.current && JSON.stringify(data) !== JSON.stringify(dataRef.current)) {
        try {
          if (window.__DASH_DEBUG) console.log('[editor] data prop changed, re-rendering')
          lastSavedRef.current = null // Reset dedup on page switch
          await editorRef.current.isReady
          const validData = data && typeof data === 'object' && Array.isArray(data.blocks)
            ? data
            : { time: Date.now(), blocks: [], version: '2.30.6' }

          // Migrate old nestedlist/checklist blocks to individual item blocks
          const migratedData = migrateEditorData(validData)
          await editorRef.current.render(migratedData)
          dataRef.current = data
          // Reset undo history for the new page so undo doesn't cross pages
          if (undoRef.current) {
            undoRef.current.initialize(migratedData)
          }
        } catch (error) {
          console.error('Error updating editor data:', error)
        }
      }
    }

    updateEditorData()
  }, [data])

  // Handle link clicks (page links + external links)
  const onPageLinkClickRef = useRef(onPageLinkClick)
  useEffect(() => { onPageLinkClickRef.current = onPageLinkClick }, [onPageLinkClick])

  useEffect(() => {
    const handleLinkClick = (event) => {
      const link = event.target.closest('a')
      if (!link) return

      // Check for internal page link first
      const pageId = link.getAttribute('data-page-id')
      if (pageId) {
        event.preventDefault()
        event.stopPropagation()
        onPageLinkClickRef.current?.(pageId)
        return
      }

      if (link.href) {
        event.preventDefault()
        const href = link.href
        // Block dangerous URL schemes
        if (href.startsWith('javascript:') || href.startsWith('data:')) {
          return
        }
        if (window.electron?.openExternal) {
          window.electron.openExternal(href)
        } else {
          window.open(href, '_blank', 'noopener,noreferrer')
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
      const existingDarkBlueStyle = document.getElementById('editorjs-darkblue-override')
      if (existingDarkBlueStyle) {
        existingDarkBlueStyle.remove()
      }

      // Get current theme from html class (next-themes uses attribute="class" on <html>)
      const htmlEl = document.documentElement
      const isFallout = htmlEl.classList.contains('fallout')
      
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

          /* Override Editor.js CSS custom properties for Fallout theme */
          .fallout .ce-popover {
            --color-background: #1a1a1a;
            --color-text-primary: #22c55e;
            --color-text-secondary: #16a34a;
            --color-border: #22c55e;
            --color-shadow: rgba(0,0,0,0.3);
            --color-border-icon: rgba(34,197,94,0.3);
            --color-background-item-hover: #2a2a2a;
            --color-background-item-focus: rgba(34,197,94,0.15);
            --color-text-icon-active: #4ade80;
            --color-background-icon-active: rgba(34,197,94,0.2);
          }
          .fallout .ce-popover__container {
            background: #1a1a1a !important;
          }
          .fallout .ce-popover-item__title {
            color: #22c55e !important;
          }
          .fallout .ce-popover-item__icon svg {
            color: #22c55e !important;
          }
          .fallout .ce-popover-item-separator__line {
            background: rgba(34,197,94,0.3) !important;
          }

          /* Multi-block converter styles for fallout theme */
          .fallout .multi-block-indicator {
            background: #1a1a1a !important;
            border: 1px solid #22c55e !important;
            color: #22c55e !important;
          }
        `
        document.head.appendChild(style)
      }

      // Also inject for dark theme
      const isDark = htmlEl.classList.contains('dark')
      if (isDark) {
        const darkStyle = document.getElementById('editorjs-dark-override')
        if (darkStyle) {
          darkStyle.remove()
        }

        const style = document.createElement('style')
        style.id = 'editorjs-dark-override'
        style.textContent = `
          /* Override Editor.js CSS custom properties for Dark theme */
          .dark .ce-popover {
            --color-background: #2f2f2f;
            --color-text-primary: #ececec;
            --color-text-secondary: #8e8e8e;
            --color-border: #3a3a3a;
            --color-shadow: rgba(0,0,0,0.45);
            --color-border-icon: #3a3a3a;
            --color-background-item-hover: #3a3a3a;
            --color-background-item-focus: rgba(107,159,255,0.15);
            --color-text-icon-active: #6b9fff;
            --color-background-icon-active: rgba(107,159,255,0.15);
          }
          .dark .ce-popover__container {
            background: #2f2f2f !important;
          }
          .dark .ce-popover-item__title {
            color: #ececec !important;
          }
          .dark .ce-popover-item__icon svg {
            color: #ececec !important;
          }
          .dark .ce-popover-item-separator__line {
            background: #3a3a3a !important;
          }
          .dark .ce-popover__search .cdx-search-field {
            background: #1a1a1a !important;
            border-color: #3a3a3a !important;
          }
          .dark .ce-popover__search .cdx-search-field__input {
            color: #ececec !important;
          }
          .dark .ce-popover__search .cdx-search-field__input::placeholder {
            color: #6b6b6b !important;
          }

          /* Multi-block converter styles for dark theme */
          .dark .multi-block-indicator {
            background: #2f2f2f !important;
            border: 1px solid #3a3a3a !important;
            color: #ececec !important;
          }
        `
        document.head.appendChild(style)
      }

      // Also inject for dark blue theme
      const isDarkBlue = htmlEl.classList.contains('darkblue')
      if (isDarkBlue) {
        const darkBlueStyle = document.getElementById('editorjs-darkblue-override')
        if (darkBlueStyle) {
          darkBlueStyle.remove()
        }

        const style = document.createElement('style')
        style.id = 'editorjs-darkblue-override'
        style.textContent = `
          /* Override Editor.js CSS custom properties for Dark Blue theme */
          .darkblue .ce-popover {
            --color-background: #1a2035;
            --color-text-primary: #e0e6f0;
            --color-text-secondary: #5d6b88;
            --color-border: #1c2438;
            --color-shadow: rgba(0,0,0,0.45);
            --color-border-icon: #1c2438;
            --color-background-item-hover: #232b42;
            --color-background-item-focus: rgba(59,130,246,0.15);
            --color-text-icon-active: #3b82f6;
            --color-background-icon-active: rgba(59,130,246,0.15);
          }
          .darkblue .ce-popover__container {
            background: #1a2035 !important;
          }
          .darkblue .ce-popover-item__title {
            color: #e0e6f0 !important;
          }
          .darkblue .ce-popover-item__icon svg {
            color: #e0e6f0 !important;
          }
          .darkblue .ce-popover-item-separator__line {
            background: #1c2438 !important;
          }
          .darkblue .ce-popover__search .cdx-search-field {
            background: #141825 !important;
            border-color: #1c2438 !important;
          }
          .darkblue .ce-popover__search .cdx-search-field__input {
            color: #e0e6f0 !important;
          }
          .darkblue .ce-popover__search .cdx-search-field__input::placeholder {
            color: #5d6b88 !important;
          }

          /* Multi-block converter styles for dark blue theme */
          .darkblue .multi-block-indicator {
            background: #1a2035 !important;
            border: 1px solid #1c2438 !important;
            color: #e0e6f0 !important;
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
    
    observer.observe(document.documentElement, {
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
      if (multiBlockEnhancerRef.current) {
        multiBlockEnhancerRef.current.destroy()
        multiBlockEnhancerRef.current = null
      }
      
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
