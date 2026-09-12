/**
 * Markdown to Editor.js blocks, for pasted markdown and AI replies.
 *
 * DOM-free so it runs under `node --test`. Used by components/Editor.js (the
 * markdown paste handler), components/RichTextEditor.js and
 * components/AIPanel.js.
 *
 * Handles headings, bold and italic, lists (nesting becomes indent),
 * checkboxes, fenced code, blockquotes, links, images, tables and horizontal
 * rules.
 *
 * Nothing in this file may use a regex lookbehind: Safari before 16.4 can't
 * parse one, and it would stop the whole editor loading there.
 */

import { MAX_LIST_INDENT, withIndent } from './listIndent.js'

/** Auto-link plain-text URLs in an HTML string, skipping URLs already inside <a> tags. */
export function autoLinkify (html) {
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

/**
 * Table blocks with plain-text URLs in their cells linked. The editor does
 * this when a note loads and when it saves (components/Editor.js). Returns
 * `blocks` itself when nothing changed.
 */
export function linkifyTableBlocks (blocks) {
  if (!Array.isArray(blocks)) return blocks
  let anyChanged = false
  const result = blocks.map(block => {
    if (block.type !== 'table' || !Array.isArray(block.data?.content)) return block
    let blockChanged = false
    const newContent = block.data.content.map(row =>
      Array.isArray(row)
        ? row.map(cell => {
          const linked = autoLinkify(cell)
          if (linked !== cell) blockChanged = true
          return linked
        })
        : row
    )
    if (!blockChanged) return block
    anyChanged = true
    return { ...block, data: { ...block.data, content: newContent } }
  })
  return anyChanged ? result : blocks
}

/** Width of a line's leading whitespace, with tabs stopping every 4 columns. */
function leadingWidth (line) {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width += 1
    else if (ch === '\t') width += 4 - (width % 4)
    else break
  }
  return width
}

/**
 * Parse markdown text into Editor.js block objects.
 */
export function parseMarkdownToBlocks (markdown) {
  const lines = markdown.split('\n')
  const blocks = []
  let i = 0

  // Leading widths of the current list's open levels, outermost first. A line
  // indented past the innermost level goes one level deeper, however far past
  // it is; a line indented less closes levels until one fits.
  let listColumns = []
  const listLevel = (line) => {
    const width = leadingWidth(line)
    while (listColumns.length && width < listColumns[listColumns.length - 1]) listColumns.pop()
    if (!listColumns.length || width > listColumns[listColumns.length - 1]) listColumns.push(width)
    return Math.min(listColumns.length - 1, MAX_LIST_INDENT)
  }

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines. A blank line between list items keeps the nesting.
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
      blocks.push({ type: 'code', data: { code: codeLines.join('\n'), encoding: 'raw' } })
      listColumns = []
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = Math.min(Math.max(headingMatch[1].length, 2), 4) // Clamp to 2-4 (Editor.js range)
      blocks.push({ type: 'header', data: { text: convertInlineMarkdown(headingMatch[2]), level } })
      listColumns = []
      i++; continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'delimiter', data: {} })
      listColumns = []
      i++; continue
    }

    // Image ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (imgMatch) {
      blocks.push({ type: 'image', data: { file: { url: imgMatch[2] }, caption: imgMatch[1] } })
      listColumns = []
      i++; continue
    }

    // Checkbox list item
    const checkMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)/)
    if (checkMatch) {
      const data = { text: convertInlineMarkdown(checkMatch[2]), checked: checkMatch[1].toLowerCase() === 'x' }
      blocks.push({ type: 'checklistItem', data: withIndent(data, listLevel(line)) })
      i++; continue
    }

    // Unordered list item
    const ulMatch = line.match(/^\s*[-*+]\s+(.+)/)
    if (ulMatch) {
      blocks.push({ type: 'bulletListItem', data: withIndent({ text: convertInlineMarkdown(ulMatch[1]) }, listLevel(line)) })
      i++; continue
    }

    // Ordered list item
    const olMatch = line.match(/^\s*\d+\.\s+(.+)/)
    if (olMatch) {
      blocks.push({ type: 'numberedListItem', data: withIndent({ text: convertInlineMarkdown(olMatch[1]) }, listLevel(line)) })
      i++; continue
    }

    // Markdown table (| col | col | with separator row |---|---|)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows = []
      let j = i
      // Collect consecutive lines that look like table rows
      while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
        const row = lines[j].trim()
        tableRows.push(row)
        j++
      }
      // Need at least 2 rows (header + separator, or header + data)
      if (tableRows.length >= 2) {
        const parseRow = (row) => row.split('|').slice(1, -1).map(cell => convertInlineMarkdown(cell.trim()))
        const content = []
        let withHeadings = false
        for (let r = 0; r < tableRows.length; r++) {
          // Skip separator rows (|---|---|)
          if (/^\|[\s:]*[-]+[\s:]*(\|[\s:]*[-]+[\s:]*)+\|$/.test(tableRows[r])) {
            withHeadings = r === 1 // separator after first row means first row is header
            continue
          }
          content.push(parseRow(tableRows[r]))
        }
        if (content.length > 0) {
          blocks.push({ type: 'table', data: { content, withHeadings } })
          listColumns = []
          i = j
          continue
        }
      }
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', data: { text: convertInlineMarkdown(quoteLines.join('<br>')), caption: '' } })
      listColumns = []
      continue
    }

    // Regular paragraph
    blocks.push({ type: 'paragraph', data: { text: convertInlineMarkdown(line) } })
    listColumns = []
    i++
  }

  return blocks
}

/** Convert inline markdown (bold, italic, code, links, strikethrough) to HTML */
function convertInlineMarkdown (text) {
  if (!text) return ''
  const result = text
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Bold+italic: ***text*** or ___text___
    .replace(/\*{3}([^*]+)\*{3}/g, '<b><i>$1</i></b>')
    // Bold: **text** or __text__
    .replace(/\*{2}([^*]+)\*{2}/g, '<b>$1</b>')
    .replace(/_{2}([^_]+)_{2}/g, '<b>$1</b>')
    // Italic: *text* or _text_. The underscore form must not start or end
    // inside a word, so snake_case survives. The character before is captured
    // and put back rather than checked with a lookbehind.
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/(^|[^a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '$1<i>$2</i>')
    // Inline code: `text`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Strikethrough: ~~text~~
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    // Mark/highlight: ==text==
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
  // Auto-linkify bare URLs that aren't already inside <a> tags
  return autoLinkify(result)
}
