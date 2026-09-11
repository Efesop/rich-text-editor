/**
 * Editor.js blocks for imported notes, in the shapes the tools save.
 *
 * Converters describe a note as drafts: blocks whose text is still runs
 * (lib/import/inline.js). finishBlocks turns drafts into Editor.js blocks with
 * exactly the fields and HTML each tool's save() writes, so neither the app
 * sanitizer nor Editor.js changes an imported block. Photos and files stay
 * placeholders until the import commits and stores their bytes.
 *
 * Draft kinds:
 *   { kind: 'paragraph', runs, preserveSpaces? }
 *   { kind: 'blank' }                                   a blank line kept from the source
 *   { kind: 'heading', level: 1-6, runs }
 *   { kind: 'list', listType: 'bullet'|'numbered'|'checklist', indent, checked?, runs }
 *   { kind: 'quote', runs, captionRuns? }
 *   { kind: 'callout', variant, runs }
 *   { kind: 'toggle', summaryRuns, contentRuns, collapsed? }
 *   { kind: 'code', code, language? }
 *   { kind: 'table', rows: runs[][], withHeadings? }
 *   { kind: 'divider' }
 *   { kind: 'photo', resource, captionRuns? }
 *   { kind: 'file', resource, name }
 *
 * DOM-free so it runs under `node --test`.
 */

import { cleanInlineText, runsToHtml } from './inline.js'
import { MAX_LIST_INDENT, formatListNumber, withIndent } from '../listIndent.js'
import { CALLOUT_ORDER } from '../markdownShortcuts.js'
import { cleanAttachmentFilename } from '../attachmentRefs.js'

export const EDITOR_DATA_VERSION = '2.30.6'

// The languages CodeBlock offers (components/editor-tools/CodeBlock.js).
export const CODE_LANGUAGES = Object.freeze([
  'auto', 'plaintext', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'html', 'css', 'json', 'yaml', 'sql', 'bash', 'markdown'
])

const LANGUAGE_ALIASES = Object.freeze({
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript', ecmascript: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python', py3: 'python',
  rb: 'ruby',
  'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', 'objective-c++': 'cpp',
  h: 'c', 'objective-c': 'c', objc: 'c',
  'c#': 'csharp', cs: 'csharp',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin', kts: 'kotlin',
  htm: 'html', xml: 'html', xhtml: 'html', svg: 'html', vue: 'html', 'html/xml': 'html',
  scss: 'css', sass: 'css', less: 'css',
  yml: 'yaml',
  jsonc: 'json', json5: 'json',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', 'shell script': 'bash',
  md: 'markdown',
  mysql: 'sql', postgres: 'sql', postgresql: 'sql', psql: 'sql', sqlite: 'sql', plsql: 'sql', 'pl/sql': 'sql', tsql: 'sql',
  text: 'plaintext', txt: 'plaintext', plain: 'plaintext', 'plain text': 'plaintext', none: 'plaintext', nohighlight: 'plaintext'
})

/**
 * The CodeBlock language for a source's language name: the same language when
 * CodeBlock has it, automatic when the source named none, plain text otherwise.
 */
export function codeLanguage (raw) {
  const name = String(raw ?? '').trim().toLowerCase()
  if (!name) return 'auto'
  if (CODE_LANGUAGES.includes(name)) return name
  return LANGUAGE_ALIASES[name] || 'plaintext'
}

/** Code as a code block stores it: line feeds only, no blank lines at either end. */
export function cleanCode (code) {
  const lines = cleanInlineText(String(code ?? '')).replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** A block id of the kind Editor.js generates: ten URL-safe characters. */
export function createBlockId () {
  let id = ''
  for (const byte of crypto.getRandomValues(new Uint8Array(10))) id += ID_ALPHABET[byte & 63]
  return id
}

/** A note's content object around its blocks. */
export function editorContent (blocks, time = Date.now()) {
  return { time, blocks, version: EDITOR_DATA_VERSION }
}

const NBSP = String.fromCharCode(0xA0)
const BULLET = String.fromCharCode(0x2022)
const BOX = String.fromCharCode(0x2610)
const CHECKED_BOX = String.fromCharCode(0x2611)
const EM_DASH = String.fromCharCode(0x2014)

function withMark (runs, mark) {
  return (runs || []).map(run => (run && !run.br ? { ...run, [mark]: true } : run))
}

// A draft as one line of runs in a text field, or null when it can't be one.
function draftLine (draft, numbers) {
  if (draft.kind !== 'list') numbers.length = 0
  switch (draft.kind) {
    case 'paragraph':
      return draft.runs || []
    case 'blank':
      return []
    case 'heading':
      return withMark(draft.runs, 'b')
    case 'list': {
      const indent = Math.min(Math.max(0, Math.trunc(draft.indent || 0)), MAX_LIST_INDENT)
      numbers.length = Math.min(numbers.length, indent + 1)
      let marker = BULLET
      if (draft.listType === 'numbered') {
        numbers[indent] = (numbers[indent] || 0) + 1
        marker = formatListNumber(numbers[indent], indent) + '.'
      } else {
        numbers[indent] = 0
        if (draft.listType === 'checklist') marker = draft.checked ? CHECKED_BOX : BOX
      }
      return [{ text: NBSP.repeat(indent * 4) + marker + ' ' }, ...(draft.runs || [])]
    }
    case 'quote':
      return draft.captionRuns?.length
        ? [...(draft.runs || []), { br: true }, { text: EM_DASH + ' ' }, ...draft.captionRuns]
        : draft.runs || []
    case 'callout':
      return draft.runs || []
    case 'toggle':
      return [...withMark(draft.summaryRuns, 'b'), { br: true }, ...(draft.contentRuns || [])]
    default:
      return null
  }
}

/**
 * Drafts inside a text field (a quote, callout or toggle): one line per
 * paragraph or list item, list items with their marker and indent. Stops at
 * the first draft a text field can't hold.
 *
 * @returns {{runs: Array, rest: Array}} the runs, and the drafts from the first one that didn't fit
 */
export function flattenDrafts (drafts) {
  const runs = []
  const numbers = []
  let index = 0
  for (; index < drafts.length; index++) {
    const line = draftLine(drafts[index], numbers)
    if (line === null) break
    if (index > 0) runs.push({ br: true })
    runs.push(...line)
  }
  return { runs, rest: drafts.slice(index) }
}

// Source heading levels ranked per note: the largest in use becomes a level 2
// header, the next level 3, and everything smaller level 4.
function headingLevels (drafts) {
  const used = [...new Set(drafts.filter(draft => draft.kind === 'heading').map(draft => sourceLevel(draft.level)))].sort((a, b) => a - b)
  return new Map(used.map((level, rank) => [level, Math.min(2 + rank, 4)]))
}

function sourceLevel (level) {
  return Math.min(Math.max(Math.trunc(Number(level)) || 1, 1), 6)
}

const LIST_TYPES = Object.freeze({ bullet: 'bulletListItem', numbered: 'numberedListItem', checklist: 'checklistItem' })
const LIST_BLOCK_TYPES = new Set(Object.values(LIST_TYPES))

/**
 * Drafts as Editor.js blocks.
 *
 * Empty blocks are left out, blank lines kept once between blocks, and a list
 * item never sits more than one level deeper than the item above it.
 *
 * @param {Array} drafts
 * @param {{newId?: () => string, report?: (code: string) => void}} [options]
 */
export function finishBlocks (drafts, { newId = createBlockId, report = () => {} } = {}) {
  const levels = headingLevels(drafts)
  const blocks = []
  let blankPending = false
  let previousIndent = -1

  const push = (block) => {
    if (blankPending && blocks.length > 0) {
      blocks.push({ id: newId(), type: 'paragraph', data: { text: '' } })
      previousIndent = -1
    }
    blankPending = false
    blocks.push({ id: newId(), ...block })
    if (!LIST_BLOCK_TYPES.has(block.type)) previousIndent = -1
  }

  for (const draft of Array.isArray(drafts) ? drafts : []) {
    if (!draft) continue
    switch (draft.kind) {
      case 'blank':
        blankPending = true
        break
      case 'paragraph': {
        const text = runsToHtml(draft.runs, 'rich', { preserveSpaces: Boolean(draft.preserveSpaces) })
        if (text) push({ type: 'paragraph', data: { text } })
        break
      }
      case 'heading': {
        const text = runsToHtml(draft.runs, 'heading')
        if (text) push({ type: 'header', data: { text, level: levels.get(sourceLevel(draft.level)) } })
        break
      }
      case 'list': {
        const text = runsToHtml(draft.runs, 'rich', { preserveSpaces: Boolean(draft.preserveSpaces) })
        if (!text) break
        let indent = Math.max(0, Math.trunc(Number(draft.indent)) || 0)
        if (indent > MAX_LIST_INDENT) {
          indent = MAX_LIST_INDENT
          report('deep-list')
        }
        // The item above, unless a kept blank line is about to separate them
        const above = blankPending && blocks.length > 0 ? -1 : previousIndent
        indent = Math.min(indent, above + 1)
        const listType = LIST_TYPES[draft.listType] ? draft.listType : 'bullet'
        const data = listType === 'checklist' ? { text, checked: Boolean(draft.checked) } : { text }
        push({ type: LIST_TYPES[listType], data: withIndent(data, indent) })
        previousIndent = indent
        break
      }
      case 'quote': {
        const text = runsToHtml(draft.runs, 'quote')
        const caption = runsToHtml(draft.captionRuns, 'quote')
        if (text || caption) push({ type: 'quote', data: { text, caption, alignment: 'left' } })
        break
      }
      case 'callout': {
        const text = runsToHtml(draft.runs, 'rich')
        if (text) push({ type: 'callout', data: { text, variant: CALLOUT_ORDER.includes(draft.variant) ? draft.variant : 'info' } })
        break
      }
      case 'toggle': {
        const summary = runsToHtml(draft.summaryRuns, 'rich')
        const content = runsToHtml(draft.contentRuns, 'rich')
        if (summary || content) push({ type: 'toggle', data: { summary, content, defaultCollapsed: Boolean(draft.collapsed) } })
        break
      }
      case 'code': {
        const code = cleanCode(draft.code)
        if (code) push({ type: 'code', data: { code, language: codeLanguage(draft.language), encoding: 'raw' } })
        break
      }
      case 'table': {
        const rows = (Array.isArray(draft.rows) ? draft.rows : []).filter(Array.isArray)
        const columns = rows.reduce((most, row) => Math.max(most, row.length), 0)
        const content = rows.map(row => Array.from({ length: columns }, (_, index) => runsToHtml(row[index], 'table')))
        if (content.some(row => row.some(Boolean))) {
          push({ type: 'table', data: { withHeadings: Boolean(draft.withHeadings), stretched: false, content } })
        }
        break
      }
      case 'divider':
        push({ type: 'delimiter', data: {} })
        break
      case 'photo':
        push({ type: 'image', data: { importResource: draft.resource, caption: runsToHtml(draft.captionRuns, 'rich') } })
        break
      case 'file':
        push({ type: 'attachment', data: { importResource: draft.resource, filename: cleanAttachmentFilename(draft.name) || 'File' } })
        break
      default:
        report('unknown-draft')
    }
  }
  return blocks
}
