/**
 * A note read once for export.
 *
 * utils/exportUtils.js used to switch over raw Editor.js blocks once per
 * format, and the copies drifted apart: callouts and toggles vanished, a
 * missing caption printed "undefined", an empty table crashed the export,
 * inline formatting came out as raw HTML tags, and nested lists came out
 * flat. Here a note becomes a list of plain export items, inline formatting
 * is parsed once, and each format only decides how an item looks.
 *
 * DOM-free so it runs under `node --test`.
 */

import { formatListNumber, isListItemType, listIndentOf, numberListItems, withIndent } from '../lib/listIndent.js'
import { dataUrlToBytes, imageAttachmentId, imageDimensions, sniffImageType } from '../lib/attachmentRefs.js'
import { migrateEditorData } from './migrateBlocks.js'

export const CALLOUT_LABELS = Object.freeze({ info: 'Info', tip: 'Tip', done: 'Done', warning: 'Warning', danger: 'Danger' })

const NBSP = String.fromCharCode(160)
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Decode the HTML entities the editor writes. A non-breaking space becomes a plain space. */
export function decodeEntities (text) {
  return String(text)
    .replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, name) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        if (code === 160) return ' '
        return Number.isInteger(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : match
      }
      const value = NAMED_ENTITIES[name.toLowerCase()]
      return value === undefined ? match : value
    })
    .split(NBSP).join(' ')
}

const FORMAT_TAGS = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline', s: 'strike', strike: 'strike', del: 'strike', code: 'code', mark: 'mark' }
const RUN_FORMATS = ['bold', 'italic', 'underline', 'strike', 'code', 'mark']
const LINE_BREAKING_TAGS = new Set(['p', 'div', 'li'])

function linkTarget (attributes) {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes || '')
  const href = decodeEntities((match && (match[1] ?? match[2] ?? match[3])) || '').trim()
  return /^(https?:|mailto:)/i.test(href) ? href : null
}

function sameStyle (a, b) {
  return RUN_FORMATS.every(format => Boolean(a[format]) === Boolean(b[format])) && (a.href || null) === (b.href || null)
}

/**
 * The editor's inline HTML as runs of formatted text. <br> becomes "\n".
 * Only web and mailto links keep their address; page links become text.
 *
 * @returns {Array<{text: string, bold?: boolean, italic?: boolean, underline?: boolean, strike?: boolean, code?: boolean, mark?: boolean, href?: string}>}
 */
export function inlineRuns (html) {
  const runs = []
  if (typeof html !== 'string' || html === '') return runs
  const source = html.replace(/<!--[\s\S]*?-->/g, '')
  const depth = Object.fromEntries(RUN_FORMATS.map(format => [format, 0]))
  const links = []
  const add = (text) => {
    if (!text) return
    const run = { text }
    for (const format of RUN_FORMATS) {
      if (depth[format] > 0) run[format] = true
    }
    const href = links[links.length - 1]
    if (href) run.href = href
    const previous = runs[runs.length - 1]
    if (previous && sameStyle(previous, run)) previous.text += text
    else runs.push(run)
  }
  let position = 0
  for (const match of source.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    add(decodeEntities(source.slice(position, match.index)))
    position = match.index + match[0].length
    const closing = match[1] === '/'
    const tag = match[2].toLowerCase()
    if (tag === 'br') {
      add('\n')
    } else if (tag === 'a') {
      if (closing) links.pop()
      else links.push(linkTarget(match[3]))
    } else if (FORMAT_TAGS[tag]) {
      const format = FORMAT_TAGS[tag]
      depth[format] = Math.max(0, depth[format] + (closing ? -1 : 1))
    } else if (closing && LINE_BREAKING_TAGS.has(tag)) {
      add('\n')
    }
  }
  add(decodeEntities(source.slice(position)))
  const last = runs[runs.length - 1]
  if (last) {
    last.text = last.text.replace(/\n+$/, '')
    if (!last.text) runs.pop()
  }
  return runs
}

/** The editor's inline HTML as plain text. */
export function inlineText (html) {
  return inlineRuns(html).map(run => run.text).join('')
}

// --- Markdown ----------------------------------------------------------------

const MARKDOWN_MARKERS = { bold: ['**', '**'], italic: ['*', '*'], strike: ['~~', '~~'], mark: ['==', '=='], underline: ['<u>', '</u>'] }
const MARKDOWN_ORDER = ['bold', 'italic', 'strike', 'mark', 'underline']

function escapeMarkdown (text) {
  return text.replace(/[\\`*_[\]<~]/g, '\\$&')
}

function codeSpan (text) {
  const clean = text.replace(/\n/g, ' ')
  const longest = Math.max(0, ...(clean.match(/`+/g) || []).map(ticks => ticks.length))
  const fence = '`'.repeat(longest + 1)
  const pad = clean.startsWith('`') || clean.endsWith('`') ? ' ' : ''
  return fence + pad + clean + pad + fence
}

function markdownUrl (url) {
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url
}

/**
 * The editor's inline HTML as Markdown. Formatting opens and closes only
 * where it changes, and spaces stay outside the markers, so the result
 * parses back the way it looks.
 *
 * @param {string} html
 * @param {{lineBreak?: string}} [options] - what a <br> becomes
 */
export function inlineMarkdown (html, { lineBreak = '  \n' } = {}) {
  let out = ''
  const active = []
  let link = null

  const closeFormats = (keep) => {
    if (active.length <= keep) return
    const trailing = /\s*$/.exec(out)[0]
    out = out.slice(0, out.length - trailing.length)
    while (active.length > keep) out += MARKDOWN_MARKERS[active.pop()][1]
    out += trailing
  }
  const setLink = (href) => {
    if (href === link) return
    if (link !== null) {
      closeFormats(0)
      out += `](${markdownUrl(link)})`
    }
    link = href
    if (link !== null) out += '['
  }

  for (const run of inlineRuns(html)) {
    setLink(run.href || null)
    const wanted = MARKDOWN_ORDER.filter(format => run[format])
    let same = 0
    while (same < active.length && same < wanted.length && active[same] === wanted[same]) same++
    closeFormats(same)
    let text = run.code ? codeSpan(run.text) : run.text.split('\n').map(escapeMarkdown).join(lineBreak)
    if (wanted.length > same) {
      const leading = /^\s*/.exec(text)[0]
      if (leading.length === text.length) {
        out += text
        continue
      }
      out += leading
      text = text.slice(leading.length)
      for (const format of wanted.slice(same)) {
        out += MARKDOWN_MARKERS[format][0]
        active.push(format)
      }
    }
    out += text
  }
  setLink(null)
  closeFormats(0)
  return out
}

// A line that would turn into a heading, quote, list item or rule if left as it is.
function escapeLineStart (line) {
  const [, space, rest] = /^(\s*)([\s\S]*)$/.exec(line)
  if (/^#{1,6}(\s|$)/.test(rest) || rest.startsWith('>') || /^[-+](\s|$)/.test(rest) || /^(=+|-+)\s*$/.test(rest)) {
    return space + '\\' + rest
  }
  const ordered = /^(\d+)([.)])(\s|$)/.exec(rest)
  return ordered ? space + ordered[1] + '\\' + rest.slice(ordered[1].length) : line
}

// --- Items -------------------------------------------------------------------

const str = (value) => typeof value === 'string' ? value : ''

// @editorjs/list blocks, which migrateEditorData leaves alone, as list items.
function expandLegacyLists (blocks) {
  const out = []
  for (const block of blocks) {
    if (block?.type !== 'list' || !Array.isArray(block.data?.items)) {
      out.push(block)
      continue
    }
    const type = block.data.style === 'ordered' ? 'numberedListItem' : 'bulletListItem'
    const walk = (items, depth) => {
      for (const item of items) {
        const text = typeof item === 'string' ? item : str(item?.content) || str(item?.text)
        out.push({ type, data: withIndent({ text }, depth) })
        if (Array.isArray(item?.items) && item.items.length > 0) walk(item.items, depth + 1)
      }
    }
    walk(block.data.items, 0)
  }
  return out
}

function exportItem (block, number) {
  const data = block.data && typeof block.data === 'object' ? block.data : {}
  if (isListItemType(block.type)) {
    const indent = listIndentOf(block)
    const listType = block.type === 'numberedListItem' ? 'numbered' : block.type === 'checklistItem' ? 'checklist' : 'bullet'
    const item = { kind: 'list-item', listType, indent, html: str(data.text) }
    if (listType === 'numbered') Object.assign(item, { number, label: formatListNumber(number, indent) })
    if (listType === 'checklist') item.checked = Boolean(data.checked)
    return item
  }
  switch (block.type) {
    case 'header':
      return { kind: 'heading', level: Math.min(Math.max(Number(data.level) || 2, 1), 6), html: str(data.text) }
    case 'paragraph':
      return { kind: 'paragraph', html: str(data.text) }
    case 'quote':
      return { kind: 'quote', html: str(data.text), captionHtml: str(data.caption) }
    case 'callout':
      return { kind: 'callout', variant: CALLOUT_LABELS[data.variant] ? data.variant : 'info', html: str(data.text) }
    case 'toggle':
      return { kind: 'toggle', summaryHtml: str(data.summary), contentHtml: str(data.content) }
    case 'code':
      return { kind: 'code', code: str(data.code), language: /^[a-z0-9+#.-]+$/i.test(str(data.language)) ? data.language : '' }
    case 'table': {
      const rows = (Array.isArray(data.content) ? data.content : []).filter(Array.isArray)
      const columns = rows.reduce((most, row) => Math.max(most, row.length), 0)
      if (rows.length === 0 || columns === 0) return null
      return { kind: 'table', withHeadings: Boolean(data.withHeadings), rows: rows.map(row => Array.from({ length: columns }, (_, i) => str(row[i]))) }
    }
    case 'image': {
      const attachmentId = imageAttachmentId(data)
      const url = attachmentId ? '' : str(data.file?.url) || str(data.url)
      if (!attachmentId && !url) return null
      return { kind: 'image', attachmentId, url, captionHtml: str(data.caption), filename: str(data.filename), mimeType: str(data.mimeType), width: data.width, height: data.height }
    }
    case 'embed': {
      const url = str(data.source) || str(data.embed)
      return url ? { kind: 'embed', url, service: str(data.service), captionHtml: str(data.caption) } : null
    }
    case 'attachment':
      return { kind: 'attachment', attachmentId: str(data.attachmentId), filename: str(data.filename), mimeType: str(data.mimeType), size: Number(data.size) || 0 }
    case 'delimiter':
      return { kind: 'divider' }
    case 'seedPhrase':
      return { kind: 'seed-phrase', words: (Array.isArray(data.words) ? data.words : []).map(str) }
    default:
      return typeof data.text === 'string' ? { kind: 'paragraph', html: data.text } : null
  }
}

/**
 * A note's content as export items, legacy blocks migrated, numbered list
 * items numbered and labelled the way the editor shows them.
 */
export function exportItems (content) {
  const source = content && Array.isArray(content.blocks) ? content : { blocks: [] }
  const blocks = expandLegacyLists(migrateEditorData(source).blocks).filter(block => block && typeof block === 'object')
  const numbers = numberListItems(blocks)
  const items = []
  blocks.forEach((block, index) => {
    const item = exportItem(block, numbers[index])
    if (item) items.push(item)
  })
  return items
}

/**
 * An image item's bytes, type and size: its attachment photo from `images`
 * (see utils/exportImages.js), or its inline data URL. Null for a web image
 * or a photo that isn't available.
 */
export function imageForItem (item, images = new Map()) {
  if (item?.kind !== 'image') return null
  if (item.attachmentId) return images.get(item.attachmentId) || null
  const decoded = dataUrlToBytes(item.url)
  const mimeType = decoded && sniffImageType(decoded.bytes)
  if (!mimeType) return null
  const size = imageDimensions(decoded.bytes)
  return { bytes: decoded.bytes, mimeType, width: size?.width, height: size?.height, dataUrl: item.url }
}

// Blank lines between blocks, single line breaks inside a list.
function joinBlocks (items, render) {
  let out = ''
  let previous = null
  for (const item of items) {
    const text = render(item)
    if (text === null || text === undefined) continue
    if (out) out += item.kind === 'list-item' && previous === 'list-item' ? '\n' : '\n\n'
    out += text
    previous = item.kind
  }
  return out ? out + '\n' : ''
}

const quoteLines = (text) => text.split('\n').map(line => line ? `> ${line}` : '>').join('\n')

function fence (code) {
  const longest = Math.max(0, ...(code.match(/`{3,}/g) || []).map(ticks => ticks.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

/**
 * The note as Markdown: nested list items indented four spaces a level,
 * callouts and toggles as Obsidian callouts (a toggle folds), photos as
 * images when `images` holds their data.
 *
 * @param {object} content - Editor.js content
 * @param {{images?: Map<string, {dataUrl: string}>}} [options]
 */
export function toMarkdown (content, { images = new Map() } = {}) {
  return joinBlocks(exportItems(content), item => {
    switch (item.kind) {
      case 'heading': {
        const text = inlineMarkdown(item.html, { lineBreak: ' ' }).trim()
        return text ? `${'#'.repeat(item.level)} ${text}` : null
      }
      case 'paragraph': {
        const text = inlineMarkdown(item.html)
        return text.trim() ? text.split('\n').map(escapeLineStart).join('\n') : null
      }
      case 'list-item': {
        const pad = '    '.repeat(item.indent)
        const marker = item.listType === 'numbered' ? `${item.number}.` : item.listType === 'checklist' ? `- [${item.checked ? 'x' : ' '}]` : '-'
        const continuation = '  \n' + pad + ' '.repeat(marker.length + 1)
        return `${pad}${marker} ${inlineMarkdown(item.html, { lineBreak: continuation })}`
      }
      case 'quote': {
        const lines = [quoteLines(inlineMarkdown(item.html, { lineBreak: '\n' }))]
        const caption = inlineMarkdown(item.captionHtml, { lineBreak: ' ' }).trim()
        if (caption) lines.push('>', `> — ${caption}`)
        return lines.join('\n')
      }
      case 'callout':
        return `> [!${item.variant}]\n${quoteLines(inlineMarkdown(item.html, { lineBreak: '\n' }))}`
      case 'toggle': {
        const summary = inlineMarkdown(item.summaryHtml, { lineBreak: ' ' }).trim()
        const body = inlineMarkdown(item.contentHtml, { lineBreak: '\n' })
        return `> [!note]-${summary ? ' ' + summary : ''}` + (body.trim() ? '\n' + quoteLines(body) : '')
      }
      case 'code': {
        const marks = fence(item.code)
        return `${marks}${item.language}\n${item.code}\n${marks}`
      }
      case 'table': {
        const cell = (html) => inlineMarkdown(html, { lineBreak: '<br>' }).replace(/\|/g, '\\|') || ' '
        const [header, ...body] = item.rows
        return [
          `| ${header.map(cell).join(' | ')} |`,
          `| ${header.map(() => '---').join(' | ')} |`,
          ...body.map(row => `| ${row.map(cell).join(' | ')} |`)
        ].join('\n')
      }
      case 'image': {
        const caption = inlineText(item.captionHtml).trim()
        const url = item.attachmentId ? images.get(item.attachmentId)?.dataUrl : item.url
        if (!url) return `*[Photo not included${caption ? ': ' + escapeMarkdown(caption) : ''}]*`
        return `![${caption.replace(/[[\]\\]/g, '\\$&')}](${markdownUrl(url)})`
      }
      case 'embed': {
        const label = inlineMarkdown(item.captionHtml, { lineBreak: ' ' }).trim() || escapeMarkdown(item.service || item.url)
        return `[${label}](${markdownUrl(item.url)})`
      }
      case 'attachment':
        return `[Attachment: ${escapeMarkdown(item.filename || 'File')}]`
      case 'divider':
        return '---'
      case 'seed-phrase':
        return `**Seed Phrase:**\n${item.words.map((word, i) => `${i + 1}. ${escapeMarkdown(word)}`).join('\n')}`
      default:
        return null
    }
  })
}

// --- Plain text ------------------------------------------------------------

/** What starts a list item in plain text, PDF and RTF: •, "1." / "a." / "i.", or [x]. */
export function listMarker (item) {
  if (item.listType === 'numbered') return `${item.label}.`
  if (item.listType === 'checklist') return item.checked ? '[x]' : '[ ]'
  return '•'
}

const indentLines = (text, pad) => text.split('\n').map(line => pad + line).join('\n')

/** The note as plain text. */
export function toPlainText (content) {
  return joinBlocks(exportItems(content), item => {
    switch (item.kind) {
      case 'heading':
      case 'paragraph': {
        const text = inlineText(item.html)
        return text.trim() ? text : null
      }
      case 'list-item': {
        const pad = '    '.repeat(item.indent)
        const marker = listMarker(item)
        const [first, ...rest] = inlineText(item.html).split('\n')
        return [`${pad}${marker} ${first}`, ...rest.map(line => pad + ' '.repeat(marker.length + 1) + line)].join('\n')
      }
      case 'quote': {
        const caption = inlineText(item.captionHtml).trim()
        return `"${inlineText(item.html)}"${caption ? ` — ${caption}` : ''}`
      }
      case 'callout':
        return `${CALLOUT_LABELS[item.variant]}: ${inlineText(item.html)}`
      case 'toggle': {
        const body = inlineText(item.contentHtml)
        return inlineText(item.summaryHtml) + (body.trim() ? '\n' + indentLines(body, '    ') : '')
      }
      case 'code':
        return item.code
      case 'table':
        return item.rows.map(row => row.map(cell => inlineText(cell).replace(/\s*\n\s*/g, ' ')).join('\t')).join('\n')
      case 'image': {
        const caption = inlineText(item.captionHtml).trim()
        return caption ? `[Image: ${caption}]` : '[Image]'
      }
      case 'embed':
        return [inlineText(item.captionHtml).trim(), item.url].filter(Boolean).join(' ')
      case 'attachment':
        return `[Attachment: ${item.filename || 'File'}]`
      case 'divider':
        return '---'
      case 'seed-phrase':
        return `Seed Phrase:\n${item.words.map((word, i) => `${i + 1}. ${word}`).join('\n')}`
      default:
        return null
    }
  })
}

// --- CSV -------------------------------------------------------------------

export const CSV_COLUMNS = ['Type', 'Level', 'Content', 'Checked']

/** One row per block, or per table row, list item and seed word. Level is a heading's level or a list item's indent. */
export function toCsvRows (content) {
  const rows = []
  for (const item of exportItems(content)) {
    switch (item.kind) {
      case 'heading':
        rows.push(['Header', item.level, inlineText(item.html), ''])
        break
      case 'paragraph':
        rows.push(['Paragraph', '', inlineText(item.html), ''])
        break
      case 'list-item': {
        const type = item.listType === 'numbered' ? 'Numbered Item' : item.listType === 'checklist' ? 'Checklist Item' : 'Bullet Item'
        const text = item.listType === 'numbered' ? `${item.label}. ${inlineText(item.html)}` : inlineText(item.html)
        rows.push([type, item.indent, text, item.listType === 'checklist' ? (item.checked ? 'Checked' : 'Unchecked') : ''])
        break
      }
      case 'quote': {
        const caption = inlineText(item.captionHtml).trim()
        rows.push(['Quote', '', inlineText(item.html) + (caption ? ` — ${caption}` : ''), ''])
        break
      }
      case 'callout':
        rows.push(['Callout', CALLOUT_LABELS[item.variant], inlineText(item.html), ''])
        break
      case 'toggle':
        rows.push(['Toggle', '', inlineText(item.summaryHtml), ''])
        if (inlineText(item.contentHtml).trim()) rows.push(['Toggle Content', '', inlineText(item.contentHtml), ''])
        break
      case 'code':
        rows.push(['Code', item.language, item.code, ''])
        break
      case 'table':
        for (const row of item.rows) rows.push(['Table Row', '', row.map(inlineText).join(', '), ''])
        break
      case 'image':
        rows.push(['Image', '', inlineText(item.captionHtml), ''])
        break
      case 'embed':
        rows.push(['Embed', item.service, item.url, ''])
        break
      case 'attachment':
        rows.push(['Attachment', '', item.filename || 'File', ''])
        break
      case 'divider':
        rows.push(['Delimiter', '', '---', ''])
        break
      case 'seed-phrase':
        item.words.forEach((word, i) => rows.push(['Seed Phrase', i + 1, word, '']))
        break
    }
  }
  return rows
}

// --- RTF -------------------------------------------------------------------

/** Text for an RTF document: \ { } escaped, anything outside ASCII as \uN?, line breaks as \line. */
export function rtfEscape (text) {
  let out = ''
  for (const char of String(text)) {
    const code = char.codePointAt(0)
    if (char === '\\' || char === '{' || char === '}') out += '\\' + char
    else if (char === '\n') out += '\\line '
    else if (char === '\t') out += '\\tab '
    else if (code < 0x20) continue
    else if (code < 0x80) out += char
    else if (code <= 0xFFFF) out += `\\u${code > 0x7FFF ? code - 0x10000 : code}?`
    else {
      const offset = code - 0x10000
      const high = 0xD800 + (offset >> 10)
      const low = 0xDC00 + (offset & 0x3FF)
      out += `\\u${high - 0x10000}?\\u${low - 0x10000}?`
    }
  }
  return out
}

function rtfRuns (html) {
  return inlineRuns(html).map(run => {
    let controls = ''
    if (run.bold) controls += '\\b'
    if (run.italic) controls += '\\i'
    if (run.underline) controls += '\\ul'
    if (run.strike) controls += '\\strike'
    if (run.code) controls += '\\f1'
    if (run.mark) controls += '\\highlight1'
    const text = controls ? `{${controls} ${rtfEscape(run.text)}}` : rtfEscape(run.text)
    if (!run.href) return text
    return `{\\field{\\*\\fldinst HYPERLINK "${run.href.replace(/[\\"{}]/g, '')}"}{\\fldrslt{\\ul ${text}}}}`
  }).join('')
}

function rtfPicture (image) {
  const type = image?.mimeType === 'image/png' ? 'pngblip' : image?.mimeType === 'image/jpeg' ? 'jpegblip' : null
  if (!type || !(image.bytes instanceof Uint8Array) || !image.width || !image.height) return null
  const widthTwips = Math.min(image.width * 15, 9000)
  const heightTwips = Math.round(widthTwips * image.height / image.width)
  let hex = ''
  for (let i = 0; i < image.bytes.length; i++) {
    hex += image.bytes[i].toString(16).padStart(2, '0')
    if (i % 64 === 63) hex += '\n'
  }
  return `{\\pict\\${type}\\picw${image.width}\\pich${image.height}\\picwgoal${widthTwips}\\pichgoal${heightTwips}\n${hex}}`
}

/**
 * The note as RTF, with nested list items indented, formatting kept, and PNG
 * or JPEG photos embedded when `images` holds their bytes.
 *
 * @param {object} content
 * @param {{images?: Map<string, {bytes: Uint8Array, mimeType: string, width?: number, height?: number}>}} [options]
 */
export function toRtf (content, { images = new Map() } = {}) {
  const paragraphs = []
  const para = (body, controls = '') => paragraphs.push(`\\pard\\sa120${controls} ${body}\\par`)
  for (const item of exportItems(content)) {
    switch (item.kind) {
      case 'heading':
        para(`{\\b\\fs${40 - (item.level - 1) * 4} ${rtfRuns(item.html)}}`)
        break
      case 'paragraph':
        para(rtfRuns(item.html))
        break
      case 'list-item':
        paragraphs.push(`\\pard\\li${360 * (item.indent + 1)}\\fi-360\\sa40 ${rtfEscape(listMarker(item))}\\tab ${rtfRuns(item.html)}\\par`)
        break
      case 'quote': {
        para(`{\\i ${rtfRuns(item.html)}}`, '\\li720')
        const caption = inlineText(item.captionHtml).trim()
        if (caption) para(rtfEscape(`— ${caption}`), '\\li720')
        break
      }
      case 'callout':
        para(`{\\b ${rtfEscape(CALLOUT_LABELS[item.variant])}:} ${rtfRuns(item.html)}`)
        break
      case 'toggle':
        para(`{\\b ${rtfRuns(item.summaryHtml)}}`)
        if (inlineText(item.contentHtml).trim()) para(rtfRuns(item.contentHtml), '\\li360')
        break
      case 'code':
        para(`{\\f1\\fs20 ${rtfEscape(item.code)}}`)
        break
      case 'table':
        for (const row of item.rows) para(row.map(cell => rtfRuns(cell)).join('\\tab '))
        break
      case 'image': {
        const picture = rtfPicture(imageForItem(item, images))
        const caption = inlineText(item.captionHtml).trim()
        if (picture) para(picture)
        if (!picture || caption) para(rtfEscape(picture ? caption : caption ? `[Image: ${caption}]` : '[Image]'))
        break
      }
      case 'embed':
        para(rtfEscape([inlineText(item.captionHtml).trim(), item.url].filter(Boolean).join(' ')))
        break
      case 'attachment':
        para(rtfEscape(`[Attachment: ${item.filename || 'File'}]`))
        break
      case 'divider':
        para('---')
        break
      case 'seed-phrase':
        para('{\\b Seed Phrase:}')
        item.words.forEach((word, i) => para(rtfEscape(`${i + 1}. ${word}`)))
        break
    }
  }
  const header = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Helvetica;}{\\f1\\fmodern Courier New;}}{\\colortbl;\\red255\\green235\\blue59;}\n'
  return header + paragraphs.join('\n') + '\n}'
}
