 import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import MultiBlockTuneEnhancer from './MultiBlockToolbar'
import { migrateEditorData } from '@/utils/migrateBlocks'
import { PageLinkInlineTool } from './editor-tools/PageLink'
import { stripImageMetadata } from '@/utils/imageUtils'

// Auto-linkify plain-text URLs in a string, skipping URLs already inside <a> tags
function autoLinkify(html) {
  if (!html || typeof html !== 'string') return html
  const urlPattern = /(?:https?:\/\/)[^\s<>"'`,)}\]]+/gi
  const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const linkify = (text) => text.replace(urlPattern, url => {
    // Strip trailing punctuation that's likely not part of the URL
    const cleaned = url.replace(/[.,;:!?]+$/, '')
    const trailing = url.slice(cleaned.length)
    return `<a href="${escapeAttr(cleaned)}" target="_blank" rel="noopener noreferrer">${cleaned}</a>${trailing}`
  })
  // If it already contains an <a tag, only linkify text outside existing links
  if (html.includes('<a ')) {
    const parts = html.split(/(<a\s[^>]*>.*?<\/a>)/gi)
    return parts.map(part => /^<a\s/i.test(part) ? part : linkify(part)).join('')
  }
  return linkify(html)
}

// Process table blocks to auto-linkify URLs in cells
function linkifyTableBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks
  let anyChanged = false
  const result = blocks.map(block => {
    if (block.type !== 'table' || !Array.isArray(block.data?.content)) return block
    let blockChanged = false
    const newContent = block.data.content.map(row =>
      Array.isArray(row) ? row.map(cell => {
        const linked = autoLinkify(cell)
        if (linked !== cell) blockChanged = true
        return linked
      }) : row
    )
    if (!blockChanged) return block
    anyChanged = true
    return { ...block, data: { ...block.data, content: newContent } }
  })
  return anyChanged ? result : blocks
}

/**
 * Parse markdown text into Editor.js block objects.
 * Supports: headings, bold/italic, lists, checkboxes, code blocks, blockquotes, links, horizontal rules.
 */
function parseMarkdownToBlocks (markdown) {
  const lines = markdown.split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (!line.trim()) { i++; continue }

    // Code block (fenced)
    if (line.trim().startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: 'codeBlock', data: { code: codeLines.join('\n') } })
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = Math.min(Math.max(headingMatch[1].length, 2), 4) // Clamp to 2-4 (Editor.js range)
      blocks.push({ type: 'header', data: { text: convertInlineMarkdown(headingMatch[2]), level } })
      i++; continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'delimiter', data: {} })
      i++; continue
    }

    // Checkbox list item
    const checkMatch = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)/)
    if (checkMatch) {
      blocks.push({ type: 'checklistItem', data: { text: convertInlineMarkdown(checkMatch[2]), checked: checkMatch[1].toLowerCase() === 'x' } })
      i++; continue
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*+]\s+(.+)/)
    if (ulMatch) {
      blocks.push({ type: 'bulletListItem', data: { text: convertInlineMarkdown(ulMatch[1]) } })
      i++; continue
    }

    // Ordered list item
    const olMatch = line.match(/^\d+\.\s+(.+)/)
    if (olMatch) {
      blocks.push({ type: 'numberedListItem', data: { text: convertInlineMarkdown(olMatch[1]) } })
      i++; continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', data: { text: convertInlineMarkdown(quoteLines.join('<br>')), caption: '' } })
      continue
    }

    // Regular paragraph
    blocks.push({ type: 'paragraph', data: { text: convertInlineMarkdown(line) } })
    i++
  }

  return blocks
}

/** Convert inline markdown (bold, italic, code, links, strikethrough) to HTML */
function convertInlineMarkdown (text) {
  if (!text) return ''
  return text
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Bold+italic: ***text*** or ___text___
    .replace(/\*{3}([^*]+)\*{3}/g, '<b><i>$1</i></b>')
    // Bold: **text** or __text__
    .replace(/\*{2}([^*]+)\*{2}/g, '<b>$1</b>')
    .replace(/_{2}([^_]+)_{2}/g, '<b>$1</b>')
    // Italic: *text* or _text_
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>')
    // Inline code: `text`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Strikethrough: ~~text~~
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    // Mark/highlight: ==text==
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
}

export default function Editor({ data, onChange, holder, onPageLinkClick, liveUpdateKey, readOnly }) {
  const editorRef = useRef(null)
  const isInitializedRef = useRef(false)
  const dataRef = useRef(data)
  const onChangeRef = useRef(onChange)
  const multiBlockEnhancerRef = useRef(null)
  const lastSavedRef = useRef(null) // Dedup: prevent MutationObserver feedback loops

  // Custom undo/redo state
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const isUndoRedoRef = useRef(false) // Suppresses snapshot capture after undo/redo renders
  const snapshotTimerRef = useRef(null)
  const MAX_UNDO_HISTORY = 50

  // Update refs when props change
  useEffect(() => {
    dataRef.current = data
    onChangeRef.current = onChange
  }, [data, onChange])

  // Toggle readOnly mode dynamically when prop changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !isInitializedRef.current) return
    editor.isReady.then(() => {
      if (editor.readOnly.isEnabled !== !!readOnly) {
        editor.readOnly.toggle(!!readOnly)
      }
    }).catch(() => {})
  }, [readOnly])

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
            // Auto-linkify plain-text URLs in table cells
            content.blocks = linkifyTableBlocks(content.blocks)
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

            // Capture undo snapshot (debounced to group rapid typing into one step)
            // Skip if this onChange was triggered by an undo/redo render
            if (!isUndoRedoRef.current) {
              if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
              snapshotTimerRef.current = setTimeout(() => {
                const snapshot = JSON.parse(blocksStr)
                undoStackRef.current.push(snapshot)
                if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
                  undoStackRef.current.shift()
                }
                redoStackRef.current = [] // Clear redo on new user edit
                if (window.__DASH_DEBUG) console.log('[undo] snapshot captured, stack size:', undoStackRef.current.length)
              }, 500)
            }
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

      return { EditorJS, tools, DragDrop }
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

        const { EditorJS, tools, DragDrop } = await initializeTools()

        if (isCancelled) return

        // Validate data structure
        const validData = data && typeof data === 'object' && Array.isArray(data.blocks)
          ? data
          : { time: Date.now(), blocks: [], version: '2.30.6' }

        // Migrate old nestedlist/checklist blocks to individual item blocks
        const migratedData = migrateEditorData(validData)
        // Auto-linkify plain-text URLs in table cells
        migratedData.blocks = linkifyTableBlocks(migratedData.blocks)

        editorRef.current = new EditorJS({
          ...editorConfig,
          tools,
          data: migratedData,
          readOnly: !!readOnly
        })

        await editorRef.current.isReady
        isInitializedRef.current = true

        // Expose flush function so external code can force-save before reading content
        window.__editorFlush = async () => {
          if (!editorRef.current || !isInitializedRef.current) return
          // Cancel any pending debounced save
          if (editorRef.current.onChange) {
            clearTimeout(editorRef.current.onChange)
            editorRef.current.onChange = null
          }
          const content = await editorRef.current.saver.save()
          if (content && content.blocks) {
            content.blocks = linkifyTableBlocks(content.blocks)
            const blocksStr = JSON.stringify(content.blocks)
            if (blocksStr !== lastSavedRef.current) {
              lastSavedRef.current = blocksStr
              onChangeRef.current?.(content)
            }
          }
        }

        // Initialize undo stack with initial data
        undoStackRef.current = [JSON.parse(JSON.stringify(migratedData.blocks))]
        redoStackRef.current = []

        // Enable drag-and-drop block reordering
        new DragDrop(editorRef.current)

        // Initialize multi-block tune enhancer
        if (!multiBlockEnhancerRef.current) {
          multiBlockEnhancerRef.current = new MultiBlockTuneEnhancer(editorRef.current)
        }

        // Auto-linkify URLs pasted into table cells
        const editorEl = document.getElementById(holder)
        if (editorEl) {
          const pasteHandler = () => {
            setTimeout(() => {
              const cells = editorEl.querySelectorAll('.tc-cell')
              cells.forEach(cell => {
                const html = cell.innerHTML
                if (!html || !(/https?:\/\//.test(html))) return
                const linked = autoLinkify(html)
                if (linked !== html) {
                  // Use DOMParser to safely apply linkified HTML
                  const doc = new DOMParser().parseFromString(linked, 'text/html')
                  cell.textContent = ''
                  while (doc.body.firstChild) {
                    cell.appendChild(doc.body.firstChild)
                  }
                }
              })
            }, 100)
          }
          editorEl.addEventListener('paste', pasteHandler)

          // Markdown paste handler — intercepts plain text that looks like markdown
          const markdownPasteHandler = async (e) => {
            const plain = e.clipboardData?.getData('text/plain')
            const html = e.clipboardData?.getData('text/html')
            // Only intercept if we have plain text but no rich HTML (or HTML is just wrapper tags)
            if (!plain || (html && !html.startsWith('<meta') && html.includes('<h'))) return
            // Check if the text looks like markdown (has at least 2 markdown patterns)
            const mdPatterns = [
              /^#{1,6}\s/m,           // headings
              /\*\*[^*]+\*\*/,        // bold
              /^[-*+]\s/m,            // unordered list
              /^\d+\.\s/m,            // ordered list
              /^>\s/m,                // blockquote
              /^```/m,                // code fence
              /^---+$/m,              // horizontal rule
              /^- \[[ x]\]/m,         // checkbox
              /\[([^\]]+)\]\([^)]+\)/, // links
            ]
            const matchCount = mdPatterns.filter(p => p.test(plain)).length
            if (matchCount < 2) return

            // Prevent default paste — we'll handle it
            e.preventDefault()
            e.stopPropagation()

            const blocks = parseMarkdownToBlocks(plain)
            if (!blocks.length) return

            const editor = editorRef.current
            if (!editor) return

            try {
              // Get current block index to insert after
              const currentIndex = editor.blocks.getCurrentBlockIndex()
              // Insert blocks
              for (let i = 0; i < blocks.length; i++) {
                await editor.blocks.insert(
                  blocks[i].type,
                  blocks[i].data,
                  undefined,
                  currentIndex + i + 1,
                  true
                )
              }
              // Remove the empty block we were on if it's empty
              const currentBlock = editor.blocks.getBlockByIndex(currentIndex)
              if (currentBlock) {
                const saved = await currentBlock.save()
                if (!saved?.data?.text?.trim()) {
                  editor.blocks.delete(currentIndex)
                }
              }
            } catch (err) {
              if (window.__DASH_DEBUG) console.error('[editor] markdown paste error:', err)
            }
          }
          editorEl.addEventListener('paste', markdownPasteHandler, true) // capture phase
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
          undoStackRef.current = [JSON.parse(JSON.stringify(migratedData.blocks))]
          redoStackRef.current = []
        } catch (error) {
          console.error('Error updating editor data:', error)
        }
      }
    }

    updateEditorData()
  }, [data])

  // Force re-render when live update arrives (bypasses data comparison)
  // Uses smart block diffing to preserve cursor position when possible
  useEffect(() => {
    if (!liveUpdateKey || !editorRef.current || !isInitializedRef.current) return
    const smartUpdate = async () => {
      try {
        await editorRef.current.isReady
        const validData = data && typeof data === 'object' && Array.isArray(data.blocks)
          ? data
          : { time: Date.now(), blocks: [], version: '2.30.6' }
        const migratedData = migrateEditorData(validData)
        const newBlocks = migratedData.blocks
        lastSavedRef.current = JSON.stringify(newBlocks)

        const editor = editorRef.current
        const currentCount = editor.blocks.getBlocksCount()
        const newCount = newBlocks.length

        // If block count changed (add/delete), fall back to full render
        if (currentCount !== newCount || newCount === 0) {
          await editor.render(migratedData)
          dataRef.current = data
          return
        }

        // Smart diff: only update blocks whose content changed
        let anyUpdated = false
        for (let i = 0; i < newCount; i++) {
          const currentBlock = editor.blocks.getBlockByIndex(i)
          if (!currentBlock) {
            // Block missing, fall back to full render
            await editor.render(migratedData)
            dataRef.current = data
            return
          }

          const currentSaved = await currentBlock.save()
          const newBlock = newBlocks[i]

          // If block type changed, must do full render (can't update type in place)
          if (currentSaved.tool !== newBlock.type) {
            await editor.render(migratedData)
            dataRef.current = data
            return
          }

          // Compare data — update in place if changed
          if (JSON.stringify(currentSaved.data) !== JSON.stringify(newBlock.data)) {
            try {
              await editor.blocks.update(currentBlock.id, newBlock.data)
              anyUpdated = true
              // Flash highlight on the changed block
              const blockEl = editor.blocks.getBlockByIndex(i)?.holder
              if (blockEl) {
                blockEl.classList.add('live-block-changed')
                setTimeout(() => blockEl.classList.remove('live-block-changed'), 1500)
              }
            } catch {
              // If update fails, fall back to full render
              await editor.render(migratedData)
              dataRef.current = data
              return
            }
          }
        }

        dataRef.current = data
        if (anyUpdated && window.__DASH_DEBUG) {
          console.log('[editor] live update: smart-diffed blocks')
        }
      } catch (error) {
        // If smart diff fails, fall back to full render
        try {
          const validData = data && typeof data === 'object' && Array.isArray(data.blocks)
            ? data
            : { time: Date.now(), blocks: [], version: '2.30.6' }
          const migratedData = migrateEditorData(validData)
          lastSavedRef.current = JSON.stringify(migratedData.blocks)
          await editorRef.current.render(migratedData)
          dataRef.current = data
        } catch (fallbackError) {
          console.error('Error in live update render:', fallbackError)
        }
      }
    }
    smartUpdate()
  }, [liveUpdateKey])

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

  // Custom undo/redo keyboard handler
  useEffect(() => {
    const handleKeyDown = async (e) => {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod || e.key !== 'z') return
      if (!editorRef.current || !isInitializedRef.current) return

      const isRedo = e.shiftKey

      if (isRedo) {
        if (redoStackRef.current.length === 0) return
        e.preventDefault()
        e.stopPropagation()

        // Capture current state before overwriting
        try {
          const current = await editorRef.current.saver.save()
          const currentStr = JSON.stringify(current.blocks)
          const lastUndo = undoStackRef.current[undoStackRef.current.length - 1]
          if (currentStr !== JSON.stringify(lastUndo)) {
            undoStackRef.current.push(current.blocks)
          }
        } catch (err) { /* ignore */ }

        const snapshot = redoStackRef.current.pop()
        if (window.__DASH_DEBUG) console.log('[undo] redo, redo stack:', redoStackRef.current.length)

        isUndoRedoRef.current = true
        try {
          await editorRef.current.render({ blocks: snapshot })
          lastSavedRef.current = JSON.stringify(snapshot)
          onChangeRef.current?.({ blocks: snapshot })
        } finally {
          // Keep flag true long enough to suppress the onChange pipeline
          // (300ms debounce + 500ms snapshot debounce = 800ms)
          setTimeout(() => { isUndoRedoRef.current = false }, 1000)
        }
      } else {
        // Before first undo, capture current state so we undo to the right place
        // (user may have typed since last snapshot was captured)
        if (!isUndoRedoRef.current) {
          try {
            const current = await editorRef.current.saver.save()
            const currentStr = JSON.stringify(current.blocks)
            const lastSnapshot = undoStackRef.current[undoStackRef.current.length - 1]
            if (currentStr !== JSON.stringify(lastSnapshot)) {
              undoStackRef.current.push(current.blocks)
              if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
                undoStackRef.current.shift()
              }
            }
          } catch (err) { /* ignore */ }
        }

        if (undoStackRef.current.length <= 1) return
        e.preventDefault()
        e.stopPropagation()

        // Pop current state and move to redo stack
        const currentSnapshot = undoStackRef.current.pop()
        redoStackRef.current.push(currentSnapshot)

        const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1]
        if (window.__DASH_DEBUG) console.log('[undo] undo, undo stack:', undoStackRef.current.length, 'redo stack:', redoStackRef.current.length)

        isUndoRedoRef.current = true
        try {
          await editorRef.current.render({ blocks: JSON.parse(JSON.stringify(previousSnapshot)) })
          lastSavedRef.current = JSON.stringify(previousSnapshot)
          onChangeRef.current?.({ blocks: previousSnapshot })
        } finally {
          setTimeout(() => { isUndoRedoRef.current = false }, 1000)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true) // Capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

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

  // Cleanup on unmount — flush pending save so no content is lost on page switch
  useEffect(() => {
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
      window.__editorFlush = null

      if (multiBlockEnhancerRef.current) {
        multiBlockEnhancerRef.current.destroy()
        multiBlockEnhancerRef.current = null
      }

      const editor = editorRef.current
      if (editor) {
        const hadPendingSave = !!editor.onChange
        if (editor.onChange) {
          clearTimeout(editor.onChange)
          editor.onChange = null
        }

        // If there was a pending debounced save, flush it before destroying
        // This prevents data loss when switching pages within the 300ms debounce window
        if (hadPendingSave && typeof editor.saver?.save === 'function') {
          editor.saver.save().then(content => {
            if (content && content.blocks) {
              const blocksStr = JSON.stringify(content.blocks)
              if (blocksStr !== lastSavedRef.current) {
                lastSavedRef.current = blocksStr
                onChangeRef.current?.(content)
              }
            }
          }).catch(() => {}).finally(() => {
            if (typeof editor.destroy === 'function') {
              editor.destroy()
            }
          })
        } else {
          if (typeof editor.destroy === 'function') {
            editor.destroy()
          }
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
