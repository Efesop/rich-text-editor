/**
 * Markdown to note drafts, for Obsidian vaults, Notesnook's Markdown export,
 * other Markdown files and Standard Notes' Markdown notes.
 *
 * Markdown is rendered to HTML by marked (GitHub-flavoured, with single line
 * breaks kept, as Obsidian shows them) and converted by htmlToBlocks.
 * Obsidian's own syntax is understood: [[wikilinks]], ![[embeds]],
 * ==highlights==, > [!callouts], #tags and $maths$.
 *
 * DOM-free so it runs under `node --test`.
 */

import { Marked } from 'marked'
import { parse as parseYaml } from 'yaml'
import { htmlToDrafts, parseHtml } from './htmlToBlocks.js'
import { escapeHtmlAttribute, escapeHtmlText, runsText } from './inline.js'
import { cleanLine } from './titles.js'

// --- Frontmatter ------------------------------------------------------------

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

// Top-level "key: value" lines, for frontmatter the YAML parser refuses.
function lenientProperties (raw) {
  const properties = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w -]*?)\s*:\s*(.*)$/.exec(line)
    if (match) properties[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2')
  }
  return properties
}

/**
 * A Markdown file's YAML frontmatter and body.
 *
 * @returns {{properties: object|null, raw: string|null, body: string, unreadable?: boolean}}
 *   properties is null when there is no frontmatter; unreadable frontmatter
 *   comes back with the properties a line-by-line reading found
 */
export function splitFrontmatter (text) {
  const source = String(text ?? '')
  const match = FRONTMATTER.exec(source)
  if (!match) return { properties: null, raw: null, body: source.replace(/^\uFEFF/, '') }
  const raw = match[1] || ''
  const body = source.slice(match[0].length)
  try {
    const parsed = parseYaml(raw, { strict: false, uniqueKeys: false, maxAliasCount: 100, prettyErrors: false })
    if (parsed === null || parsed === undefined) return { properties: {}, raw, body }
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return { properties: parsed, raw, body }
  } catch {
    // fall through to the lenient reading
  }
  return { properties: lenientProperties(raw), raw, body, unreadable: true }
}

/** A frontmatter or database property value as text. */
export function propertyText (value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(propertyText).filter(Boolean).join(', ')
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Properties as a two-column table draft, or null when there are none to show. */
export function propertiesTable (entries) {
  const rows = entries
    .map(([name, value]) => [String(name), propertyText(value)])
    .filter(([name, value]) => name && value)
  if (rows.length === 0) return null
  return {
    kind: 'table',
    withHeadings: true,
    rows: [[[{ text: 'Property' }], [{ text: 'Value' }]], ...rows.map(([name, value]) => [[{ text: name }], [{ text: value }]])]
  }
}

/** Tags from a frontmatter value: a list, or a string separated by commas or spaces. */
export function frontmatterTags (value) {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined).map(item => String(item).trim()).filter(Boolean)
  if (typeof value !== 'string') return value === null || value === undefined ? [] : [String(value)]
  return value.split(value.includes(',') ? ',' : /\s+/).map(tag => tag.trim()).filter(Boolean)
}

// --- Obsidian syntax for marked --------------------------------------------

let collectedTags = null

const wikiLinks = {
  name: 'wikiLink',
  level: 'inline',
  start (src) {
    const index = src.indexOf('[[')
    if (index === -1) return undefined
    return index > 0 && src[index - 1] === '!' ? index - 1 : index
  },
  tokenizer (src) {
    const match = /^(!?)\[\[([^[\]\n]+?)\]\]/.exec(src)
    if (!match) return undefined
    const bar = match[2].indexOf('|')
    const target = (bar === -1 ? match[2] : match[2].slice(0, bar)).trim()
    const alias = bar === -1 ? '' : match[2].slice(bar + 1).trim()
    return { type: 'wikiLink', raw: match[0], embed: match[1] === '!', target, alias }
  },
  renderer (token) {
    const attributes = `data-target="${escapeHtmlAttribute(token.target)}" data-alias="${escapeHtmlAttribute(token.alias)}"`
    if (token.embed) return `<dash-embed ${attributes}></dash-embed>`
    const shown = token.alias || token.target.replace(/^#\^?/, '').replace(/#\^?/, ' > ')
    return `<dash-wikilink ${attributes}>${escapeHtmlText(shown)}</dash-wikilink>`
  }
}

const highlights = {
  name: 'highlight',
  level: 'inline',
  start (src) {
    const index = src.indexOf('==')
    return index === -1 ? undefined : index
  },
  tokenizer (src) {
    const match = /^==(?=\S)([^\n]*?\S)==(?!=)/.exec(src)
    if (!match) return undefined
    return { type: 'highlight', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) }
  },
  renderer (token) {
    return `<mark>${this.parser.parseInline(token.tokens)}</mark>`
  }
}

const inlineMaths = {
  name: 'inlineMath',
  level: 'inline',
  start (src) {
    const index = src.indexOf('$')
    return index === -1 ? undefined : index
  },
  tokenizer (src) {
    const match = /^\$(?![\s$])([^$\n]*?[^\s\\])\$(?!\d)/.exec(src)
    return match ? { type: 'inlineMath', raw: match[0], text: match[0] } : undefined
  },
  renderer (token) {
    return `<span>${escapeHtmlText(token.text)}</span>`
  }
}

const blockMaths = {
  name: 'blockMath',
  level: 'block',
  start (src) {
    const match = /(^|\n)[ \t]*\$\$/.exec(src)
    return match ? match.index + match[1].length : undefined
  },
  tokenizer (src) {
    const match = /^[ \t]*\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src)
    return match ? { type: 'blockMath', raw: match[0], text: match[1].trim() } : undefined
  },
  renderer (token) {
    return `<pre><code class="language-latex">$$\n${escapeHtmlText(token.text)}\n$$</code></pre>`
  }
}

const TAG = /^#((?:[\p{L}\p{N}_/-])*[\p{L}_/-](?:[\p{L}\p{N}_/-])*)/u

const inlineTags = {
  name: 'inlineTag',
  level: 'inline',
  start (src) {
    const match = /(^|\s)#[^\s#]/u.exec(src)
    return match ? match.index + match[1].length : undefined
  },
  tokenizer (src) {
    const match = TAG.exec(src)
    return match ? { type: 'inlineTag', raw: match[0], tag: match[1] } : undefined
  },
  renderer (token) {
    collectedTags?.add(token.tag)
    return `<span>${escapeHtmlText(token.raw)}</span>`
  }
}

const marked = new Marked({ gfm: true, breaks: true })
marked.use({ extensions: [wikiLinks, highlights, blockMaths, inlineMaths, inlineTags] })

// --- Callouts ---------------------------------------------------------------

const CALLOUT_VARIANTS = Object.freeze({
  note: 'info', info: 'info', abstract: 'info', summary: 'info', tldr: 'info', todo: 'info', question: 'info',
  help: 'info', faq: 'info', example: 'info', quote: 'info', cite: 'info',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'done', check: 'done', done: 'done',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger', error: 'danger', bug: 'danger'
})

const CALLOUT_MARKER = /^\s*\[!([^\]\s]+)\]([+-]?)[ \t]*/

// > [!type] Title, as a callout, or as a toggle when it folds (+ or -).
function obsidianCallout (node, walker) {
  const first = (node.children || []).find(child => child.type === 'tag')
  const text = first?.name === 'p' ? first.children?.[0] : null
  const match = text?.type === 'text' ? CALLOUT_MARKER.exec(text.data) : null
  if (!match) return false

  text.data = text.data.slice(match[0].length)
  const type = match[1].toLowerCase()
  const drafts = walker.collect(node.children)
  const lead = drafts[0]?.kind === 'paragraph' ? drafts[0].runs : []
  const breakAt = lead.findIndex(run => run.br)
  const titleRuns = breakAt === -1 ? lead : lead.slice(0, breakAt)
  const bodyRuns = breakAt === -1 ? [] : lead.slice(breakAt + 1)
  const body = [...(bodyRuns.length > 0 ? [{ kind: 'paragraph', runs: bodyRuns }] : []), ...drafts.slice(lead.length > 0 ? 1 : 0)]
  const variant = CALLOUT_VARIANTS[type] || 'info'
  const title = runsText(titleRuns).trim()
    ? titleRuns
    : variant === type ? [] : [{ text: type.charAt(0).toUpperCase() + type.slice(1) }]

  if (match[2]) {
    walker.toggle([{ kind: 'paragraph', runs: title }], body, match[2] === '-')
  } else {
    walker.callout([...(title.length > 0 ? [{ kind: 'heading', level: 1, runs: title }] : []), ...body], variant)
  }
  return true
}

// --- Conversion -------------------------------------------------------------

/**
 * Drafts from Markdown.
 *
 * @param {string} markdown - the body, without frontmatter
 * @param {object} [options]
 * @param {(href: string) => object|null} [options.resolveLink] - Markdown links, as for htmlToDrafts
 * @param {(src: string) => object|null} [options.resolveImage] - Markdown images, as for htmlToDrafts
 * @param {(target: string) => {pageRef: string}|null} [options.resolveWikiLink] - [[wikilinks]]
 * @param {(target: string) => {resource: string}|{file: string, name?: string}|{pageRef: string}|null} [options.resolveEmbed] - ![[embeds]]
 * @returns {{drafts: Array, issues: object, tags: string[]}}
 */
export function markdownToDrafts (markdown, options = {}) {
  const tags = new Set()
  collectedTags = tags
  let html
  try {
    html = marked.parse(String(markdown ?? ''))
  } finally {
    collectedTags = null
  }

  const result = htmlToDrafts(parseHtml(html), {
    resolveLink: options.resolveLink,
    resolveImage: options.resolveImage,
    handleElement (node, walker) {
      if (options.handleElement?.(node, walker)) return true
      if (node.name === 'blockquote') return obsidianCallout(node, walker)
      if (node.name === 'dash-wikilink') {
        const target = options.resolveWikiLink?.(node.attribs['data-target'] || '')
        if (!target?.pageRef) walker.report('wikilink-unresolved')
        walker.withStyle(node, target?.pageRef ? { pageRef: target.pageRef } : {}, () => walker.walk(node.children))
        return true
      }
      if (node.name === 'dash-embed') {
        const name = node.attribs['data-target'] || ''
        const alias = node.attribs['data-alias'] || ''
        const target = options.resolveEmbed?.(name)
        if (target?.resource) {
          walker.block({ kind: 'photo', resource: target.resource, captionRuns: [] })
        } else if (target?.file) {
          walker.block({ kind: 'file', resource: target.file, name: target.name || name.split('/').pop() })
        } else if (target?.pageRef) {
          walker.inline([{ text: alias && !/^\d+(x\d+)?$/.test(alias) ? alias : name, pageRef: target.pageRef }])
        } else {
          walker.report('embed-missing')
          walker.inline([{ text: `[Not found: ${name}]`, i: true }])
        }
        return true
      }
      return false
    }
  })
  return { ...result, tags: [...tags] }
}

/** The drafts without a first heading that only repeats the note's title. */
export function dropTitleHeading (drafts, title) {
  const index = drafts.findIndex(draft => draft.kind !== 'blank')
  const draft = drafts[index]
  if (!draft || draft.kind !== 'heading') return drafts
  const same = cleanLine(runsText(draft.runs)).toLowerCase() === cleanLine(title).toLowerCase()
  return same ? [...drafts.slice(0, index), ...drafts.slice(index + 1)] : drafts
}
