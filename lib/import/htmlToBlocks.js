/**
 * HTML to note drafts, for every importer that reads HTML: Evernote's ENML,
 * Notion's HTML export, Markdown (rendered to HTML first) and rich text notes.
 *
 * Walks a DOM parsed by htmlparser2 and describes the note as drafts
 * (lib/import/blocks.js). Formats plug in through options:
 *
 *   handleElement(node, walker) -> true when the format handled the element
 *   checkbox(node)              -> {checked} when an element is a checkbox
 *   resolveLink(href, node)     -> {pageRef} | {href} | {file, name?} | null
 *   resolveImage(src, node)     -> {resource} | {href} | null
 *
 * Nothing is fetched: a remote image becomes a link.
 *
 * DOM-free so it runs under `node --test`.
 */

import { parseDocument } from 'htmlparser2'
import { flattenDrafts } from './blocks.js'
import { safeHref } from './inline.js'

/** A DOM from HTML, with entities decoded and self-closing tags (ENML's) understood. */
export function parseHtml (html) {
  return parseDocument(String(html ?? ''), { decodeEntities: true, recognizeSelfClosing: true })
}

const SKIP = new Set([
  'head', 'title', 'meta', 'link', 'base', 'script', 'style', 'noscript', 'template',
  'svg', 'canvas', 'button', 'select', 'option', 'datalist', 'param', 'track', 'map', 'area'
])

const BLOCKS = new Set([
  'html', 'body', 'main', 'article', 'section', 'nav', 'aside', 'header', 'footer', 'address',
  'div', 'p', 'center', 'form', 'fieldset', 'legend', 'hgroup', 'dl', 'dt', 'dd', 'summary',
  'figcaption', 'caption', 'search', 'en-note'
])

const HEADINGS = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }

const MARK_TAGS = {
  b: 'b', strong: 'b',
  i: 'i', em: 'i', cite: 'i', dfn: 'i', var: 'i',
  u: 'u', ins: 'u',
  s: 's', strike: 's', del: 's',
  mark: 'mark',
  code: 'code', kbd: 'code', samp: 'code', tt: 'code'
}

const MEDIA = new Set(['video', 'audio', 'iframe', 'embed', 'object'])

const BOX = String.fromCharCode(0x2610)
const CHECKED_BOX = String.fromCharCode(0x2611)
const VISIBLE_TEXT = new RegExp('[^\\s' + String.fromCharCode(0xA0) + ']')

const isTag = (node) => node && (node.type === 'tag' || node.type === 'script' || node.type === 'style')

/** The text inside a node, with <br> as line feeds. */
export function nodeText (node) {
  if (!node) return ''
  if (node.type === 'text' || node.type === 'cdata' && !node.children) return node.data || ''
  if (isTag(node) && node.name === 'br') return '\n'
  if (isTag(node) && SKIP.has(node.name)) return ''
  return (node.children || []).map(nodeText).join('')
}

/** An element's inline CSS as a map of lower-cased property names to values. */
export function parseStyle (style) {
  const declarations = new Map()
  for (const part of String(style || '').split(';')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    const name = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).replace(/!important/i, '').trim()
    if (name) declarations.set(name, value)
  }
  return declarations
}

function languageFromClass (className) {
  const match = /(?:^|\s)(?:language|lang)-(\S+)/i.exec(className || '')
  return match ? match[1] : ''
}

/** Code as it reads: <br> and block elements end lines. */
export function codeText (node) {
  if (!node) return ''
  if (node.type === 'text') return node.data || ''
  if (node.type === 'cdata') return (node.children || []).map(codeText).join('')
  if (!isTag(node)) return ''
  if (node.name === 'br') return '\n'
  if (SKIP.has(node.name)) return ''
  const inner = (node.children || []).map(codeText).join('')
  return (node.name === 'div' || node.name === 'p') && !inner.endsWith('\n') ? inner + '\n' : inner
}

function fileNameFromUrl (src) {
  try {
    const path = new URL(src).pathname
    return decodeURIComponent(path.split('/').pop() || '')
  } catch {
    return ''
  }
}

function positiveInteger (value, max) {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : 1
}

class Walker {
  constructor (options, shared, style = {}) {
    this.options = options
    this.shared = shared // { issues: Map, skip: Set }
    this.style = style
    this.drafts = []
    this.runs = []
    this.sawBreak = false
    this.pendingCheck = null
    this.item = null
    this.lists = []
  }

  report (code) {
    this.shared.issues.set(code, (this.shared.issues.get(code) || 0) + 1)
  }

  /** Drafts for some nodes, walked apart from the current block. */
  collect (nodes, style = this.style) {
    const walker = new Walker(this.options, this.shared, style)
    walker.walk(nodes)
    walker.flush()
    return walker.drafts
  }

  walk (nodes) {
    for (const node of nodes || []) this.node(node)
  }

  node (node) {
    if (!node) return
    if (node.type === 'text') {
      if (node.data) this.runs.push({ ...this.style, text: node.data })
    } else if (node.type === 'cdata') {
      this.walk(node.children)
    } else if (isTag(node)) {
      this.element(node)
    }
  }

  /** Adds runs to the current block. */
  inline (runs) {
    for (const run of runs) this.runs.push(run.br ? run : { ...this.style, ...run })
  }

  /** Ends the current block and adds a draft after it. */
  block (draft) {
    this.flush()
    this.drafts.push(draft)
  }

  /** Walks an element's children with its formatting, and optional extra style, applied. */
  withStyle (node, extra, fn) {
    const saved = this.style
    const style = { ...saved }
    const mark = MARK_TAGS[node.name]
    if (mark) style[mark] = true
    this.applyCss(node, style)
    if (extra) {
      delete style.href
      delete style.pageRef
      Object.assign(style, extra)
    }
    this.style = style
    try {
      fn()
    } finally {
      this.style = saved
    }
  }

  applyCss (node, style) {
    if (!node.attribs?.style) return
    const css = parseStyle(node.attribs.style)
    const weight = css.get('font-weight')
    if (weight) {
      if (/^(bold|bolder|[6-9]00)$/i.test(weight)) style.b = true
      else if (/^(normal|lighter|[1-5]00)$/i.test(weight)) delete style.b
    }
    const fontStyle = css.get('font-style')
    if (fontStyle) {
      if (/^(italic|oblique)/i.test(fontStyle)) style.i = true
      else if (/^normal$/i.test(fontStyle)) delete style.i
    }
    const decoration = [css.get('text-decoration'), css.get('text-decoration-line')].filter(Boolean).join(' ')
    if (/underline/i.test(decoration)) style.u = true
    if (/line-through/i.test(decoration)) style.s = true
    // Evernote's highlighter. Other background colours are page styling (web
    // clips are full of them), not highlights.
    if (css.has('--en-highlight') || /^true$/i.test(css.get('-evernote-highlight') || '')) style.mark = true
    if (css.has('color') || css.has('background-color') || css.has('background')) this.report('colours-dropped')
  }

  /**
   * Ends the current block: a paragraph, a list item or a checklist line. An
   * element holding nothing but line breaks (Evernote's empty line) is kept
   * as a blank line, but only where an element ends, not where a photo or
   * file splits a paragraph.
   */
  flush (keepBlank = false) {
    const runs = this.runs
    const sawBreak = this.sawBreak
    this.runs = []
    this.sawBreak = false
    const hasText = runs.some(run => !run.br && VISIBLE_TEXT.test(run.text))

    const item = this.item
    if (item && !item.emitted) {
      if (!hasText) return
      item.draft.runs = runs
      this.drafts.push(item.draft)
      item.emitted = true
      return
    }
    if (!hasText) {
      if (keepBlank && sawBreak && !item) this.drafts.push({ kind: 'blank' })
      return
    }
    if (item) {
      // More of the same list item, unless something else came in between
      const last = this.drafts[this.drafts.length - 1]
      if (last && last.kind === 'list') last.runs.push({ br: true }, ...runs)
      else this.drafts.push({ kind: 'paragraph', runs })
      return
    }
    if (this.pendingCheck) {
      const { checked } = this.pendingCheck
      this.pendingCheck = null
      this.drafts.push({ kind: 'list', listType: 'checklist', checked, indent: 0, runs })
      return
    }
    this.drafts.push({ kind: 'paragraph', runs })
  }

  isCheckbox (node) {
    if (!isTag(node)) return null
    const custom = this.options.checkbox?.(node)
    if (custom) return custom
    if (node.name === 'input' && String(node.attribs.type || '').toLowerCase() === 'checkbox') {
      return { checked: 'checked' in node.attribs }
    }
    return null
  }

  // A checkbox before any text in an element, taken out of the walk.
  leadingCheckbox (node, throughBlocks) {
    for (const child of node.children || []) {
      if (child.type === 'text') {
        if (VISIBLE_TEXT.test(child.data || '')) return null
        continue
      }
      if (child.type === 'comment') continue
      if (!isTag(child) || this.shared.skip.has(child)) return null
      const check = this.isCheckbox(child)
      if (check) {
        this.shared.skip.add(child)
        return check
      }
      const wrapper = ['span', 'label', 'font', 'b', 'strong', 'i', 'em'].includes(child.name) ||
        (throughBlocks && ['p', 'div'].includes(child.name))
      return wrapper ? this.leadingCheckbox(child, throughBlocks) : null
    }
    return null
  }

  element (node) {
    if (this.shared.skip.has(node)) return
    if (this.options.handleElement?.(node, this)) return
    const name = node.name
    if (SKIP.has(name)) return

    if (name === 'br') {
      this.runs.push({ br: true })
      this.sawBreak = true
    } else if (name === 'hr') {
      this.block({ kind: 'divider' })
    } else if (HEADINGS[name]) {
      this.heading(node, HEADINGS[name])
    } else if (name === 'ul' || name === 'ol' || name === 'menu') {
      this.list(node)
    } else if (name === 'li') {
      this.listItem(node)
    } else if (name === 'blockquote') {
      this.quote(node)
    } else if (name === 'pre') {
      this.pre(node)
    } else if (name === 'table') {
      this.table(node)
    } else if (name === 'details') {
      this.details(node)
    } else if (name === 'figure') {
      this.figure(node)
    } else if (name === 'img') {
      this.image(node)
    } else if (name === 'a') {
      this.link(node)
    } else if (MEDIA.has(name)) {
      this.media(node)
    } else if (name === 'input') {
      const check = this.isCheckbox(node)
      if (check) this.inline([{ text: (check.checked ? CHECKED_BOX : BOX) + ' ' }])
    } else if (name === 'textarea') {
      this.block({ kind: 'paragraph', runs: [{ text: nodeText(node) }], preserveSpaces: true })
    } else if (name === 'math') {
      const tex = (node.children || []).flatMap(child => child.children || []).find(child => isTag(child) && child.name === 'annotation')
      this.inline([{ text: tex ? `$${nodeText(tex).trim()}$` : nodeText(node) }])
    } else if (BLOCKS.has(name)) {
      this.container(node)
    } else {
      this.withStyle(node, null, () => this.walk(node.children))
    }
  }

  container (node) {
    this.flush(true)
    const check = this.item ? null : this.leadingCheckbox(node, false)
    if (check) this.pendingCheck = check
    this.withStyle(node, null, () => this.walk(node.children))
    this.flush(true)
    if (check) this.pendingCheck = null
  }

  heading (node, level) {
    this.flush()
    const { runs, rest } = flattenDrafts(this.collect(node.children))
    this.drafts.push({ kind: 'heading', level, runs })
    this.drafts.push(...rest)
  }

  list (node) {
    this.flush()
    const outer = this.lists[this.lists.length - 1]
    this.lists.push({ type: node.name === 'ol' ? 'numbered' : 'bullet', depth: outer ? outer.depth + 1 : 0 })
    try {
      this.withStyle(node, null, () => this.walk(node.children))
      this.flush()
    } finally {
      this.lists.pop()
    }
  }

  listItem (node) {
    this.flush()
    const list = this.lists[this.lists.length - 1] || { type: 'bullet', depth: 0 }
    const check = this.leadingCheckbox(node, true)
    const draft = { kind: 'list', listType: check ? 'checklist' : list.type, indent: list.depth, runs: [] }
    if (check) draft.checked = check.checked
    const saved = this.item
    this.item = { draft, emitted: false }
    try {
      this.withStyle(node, null, () => this.walk(node.children))
      this.flush()
    } finally {
      this.item = saved
    }
  }

  // Drafts inside a text field, in order: when something the field can't hold
  // comes up, the field ends, that block follows, and a new field starts.
  splitIntoFields (drafts, makeField) {
    let rest = drafts
    while (rest.length > 0) {
      const flat = flattenDrafts(rest)
      if (flat.runs.length > 0) this.drafts.push(makeField(flat.runs))
      if (flat.rest.length === 0) break
      this.drafts.push(flat.rest[0])
      rest = flat.rest.slice(1)
    }
  }

  quote (node) {
    this.flush()
    this.splitIntoFields(this.collect(node.children), runs => ({ kind: 'quote', runs }))
  }

  /** A callout from some drafts; what a callout can't hold follows it. */
  callout (drafts, variant) {
    this.flush()
    const { runs, rest } = flattenDrafts(drafts)
    this.drafts.push({ kind: 'callout', variant, runs })
    if (rest.length > 0) {
      this.report('callout-content-moved')
      this.drafts.push(...rest)
    }
  }

  /** A toggle from a summary and some drafts; what a toggle can't hold follows it. */
  toggle (summaryDrafts, drafts, collapsed) {
    this.flush()
    const summary = flattenDrafts(summaryDrafts)
    const content = flattenDrafts(drafts)
    this.drafts.push({ kind: 'toggle', summaryRuns: summary.runs, contentRuns: content.runs, collapsed: Boolean(collapsed) })
    const rest = [...summary.rest, ...content.rest]
    if (rest.length > 0) {
      this.report('toggle-content-moved')
      this.drafts.push(...rest)
    }
  }

  details (node) {
    const summary = (node.children || []).find(child => isTag(child) && child.name === 'summary')
    const body = (node.children || []).filter(child => child !== summary)
    this.toggle(summary ? this.collect(summary.children) : [], this.collect(body), !('open' in node.attribs))
  }

  pre (node) {
    this.flush()
    const code = (node.children || []).find(child => isTag(child) && child.name === 'code')
    const language = languageFromClass(code?.attribs.class) || languageFromClass(node.attribs.class) ||
      code?.attribs['data-language'] || node.attribs['data-language'] || ''
    this.drafts.push({ kind: 'code', code: codeText(node), language })
  }

  table (node) {
    this.flush()
    const rows = []
    const collectRows = (parent, inHead) => {
      for (const child of parent.children || []) {
        if (!isTag(child)) continue
        if (child.name === 'tr') rows.push({ node: child, inHead })
        else if (child.name === 'thead') collectRows(child, true)
        else if (child.name === 'tbody' || child.name === 'tfoot') collectRows(child, false)
      }
    }
    collectRows(node, false)

    const grid = []
    const after = []
    let headerRow = rows.length > 0
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] = grid[rowIndex] || []
      let column = 0
      const cells = (row.node.children || []).filter(child => isTag(child) && (child.name === 'td' || child.name === 'th'))
      if (rowIndex === 0) headerRow = row.inHead || (cells.length > 0 && cells.every(cell => cell.name === 'th'))
      for (const cell of cells) {
        while (grid[rowIndex][column] !== undefined) column++
        const { runs, rest } = flattenDrafts(this.collect(cell.children))
        if (rest.length > 0) {
          this.report('table-content-moved')
          after.push(...rest)
        }
        const colspan = positiveInteger(cell.attribs.colspan, 50)
        const rowspan = positiveInteger(cell.attribs.rowspan, rows.length - rowIndex)
        for (let r = 0; r < rowspan; r++) {
          grid[rowIndex + r] = grid[rowIndex + r] || []
          for (let c = 0; c < colspan; c++) {
            grid[rowIndex + r][column + c] = r === 0 && c === 0 ? runs : []
          }
        }
        column += colspan
      }
    })
    const columns = grid.reduce((most, row) => Math.max(most, row.length), 0)
    const filled = grid.map(row => Array.from({ length: columns }, (_, index) => row[index] || []))
    if (filled.length > 0) this.drafts.push({ kind: 'table', rows: filled, withHeadings: headerRow })
    this.drafts.push(...after)
  }

  figure (node) {
    const caption = (node.children || []).find(child => isTag(child) && child.name === 'figcaption')
    const body = (node.children || []).filter(child => child !== caption)
    this.flush()
    const start = this.drafts.length
    this.withStyle(node, null, () => this.walk(body))
    this.flush()
    if (!caption) return
    const captionRuns = flattenDrafts(this.collect(caption.children)).runs
    const added = this.drafts.slice(start)
    if (added.length === 1 && added[0].kind === 'photo') added[0].captionRuns = captionRuns
    else if (captionRuns.length > 0) this.drafts.push({ kind: 'paragraph', runs: captionRuns.map(run => (run.br ? run : { ...run, i: true })) })
  }

  image (node) {
    const src = node.attribs.src || node.attribs['data-src'] || ''
    const alt = (node.attribs.alt || node.attribs.title || '').trim()
    const resolved = this.options.resolveImage ? this.options.resolveImage(src, node) : null
    if (resolved?.resource) {
      this.block({ kind: 'photo', resource: resolved.resource, captionRuns: [] })
      return
    }
    const href = resolved?.href || safeHref(src)
    if (href) {
      this.report('remote-photo')
      this.inline([{ text: alt || fileNameFromUrl(href) || 'Photo', href }])
      return
    }
    if (src) {
      this.report('missing-photo')
      this.inline([{ text: `[Photo not found: ${alt || src.split(/[\\/]/).pop()}]`, i: true }])
    }
  }

  link (node) {
    // A link around a photo (Notion links every photo to its file): the photo is what matters
    const meaningful = (node.children || []).filter(child => isTag(child) || (child.type === 'text' && VISIBLE_TEXT.test(child.data || '')))
    if (meaningful.length === 1 && isTag(meaningful[0]) && meaningful[0].name === 'img') {
      this.image(meaningful[0])
      return
    }
    const href = (node.attribs.href || '').trim()
    const target = href ? this.resolveLink(href, node) : null
    if (target?.file) {
      this.block({ kind: 'file', resource: target.file, name: target.name || nodeText(node).trim() })
      return
    }
    if (href && !target && !href.startsWith('#')) this.report('link-kept-as-text')
    const extra = target?.pageRef ? { pageRef: target.pageRef } : target?.href ? { href: target.href } : {}
    this.withStyle(node, extra, () => this.walk(node.children))
  }

  resolveLink (href, node) {
    if (this.options.resolveLink) return this.options.resolveLink(href, node)
    const safe = safeHref(href)
    return safe ? { href: safe } : null
  }

  media (node) {
    const source = (node.children || []).find(child => isTag(child) && child.name === 'source')
    const src = node.attribs.src || node.attribs.data || source?.attribs.src || ''
    if (!src) return
    const target = this.resolveLink(src, node)
    if (target?.file) {
      this.block({ kind: 'file', resource: target.file, name: target.name || fileNameFromUrl(src) })
      return
    }
    this.report('embedded-media')
    const href = target?.href || safeHref(src)
    this.inline([{ text: node.attribs.title || fileNameFromUrl(src) || src, ...(href ? { href } : {}) }])
  }
}

/**
 * Drafts from HTML nodes (a Document from parseHtml, or a list of nodes).
 *
 * @returns {{drafts: Array, issues: Object<string, number>}} issues counts things that couldn't be kept as they were
 */
export function htmlToDrafts (nodes, options = {}) {
  const shared = { issues: new Map(), skip: new Set() }
  const walker = new Walker(options, shared)
  walker.walk(Array.isArray(nodes) ? nodes : nodes?.children)
  walker.flush()
  return { drafts: walker.drafts, issues: Object.fromEntries(shared.issues) }
}
