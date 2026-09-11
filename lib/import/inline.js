/**
 * Inline text for imported notes.
 *
 * Converters turn formatted source text into runs, and this module writes runs
 * as the HTML each editor field keeps. Editor.js sanitizes every field again on
 * save, with rules that differ per tool (a tool's own rules merged over its
 * inline tools' rules, see components/Editor.js), and the app sanitizes on load
 * (utils/securityUtils.js). The HTML written here is a fixed point of both, so
 * an imported note opened and saved without edits comes back unchanged.
 *
 * DOM-free so it runs under `node --test`.
 */

/**
 * @typedef {object} TextRun
 * @property {string} text
 * @property {boolean} [b] bold
 * @property {boolean} [i] italic
 * @property {boolean} [u] underline
 * @property {boolean} [s] strikethrough
 * @property {boolean} [mark] highlight
 * @property {boolean} [code] inline code
 * @property {string} [href] web, mail or phone link
 * @property {string} [pageRef] link to another note, resolved when the import commits
 *
 * @typedef {{br: true}} BreakRun
 */

export const MARKS = Object.freeze(['b', 'i', 'u', 's', 'mark', 'code'])

const INLINE_TOOL_MARKS = Object.freeze(['b', 'i', 'u', 'mark', 'code'])

/**
 * What each kind of field keeps on save:
 * - rich: paragraphs, list items, callouts, toggles and photo captions
 * - quote: quote text and caption, which keep <br> and the inline tools' tags (no <s>)
 * - table: table cells, which keep only the inline tools' tags (no <br>, no <s>)
 * - heading: headers, which keep only the marker and inline code tools
 *
 * Links in quotes and tables follow the link tool's rules (rel="nofollow").
 * Page links need data-page-id and class, which only rich fields keep.
 */
export const FIELD_PROFILES = Object.freeze({
  rich: Object.freeze({ marks: MARKS, lineBreaks: true, links: 'rich', pageLinks: true }),
  quote: Object.freeze({ marks: INLINE_TOOL_MARKS, lineBreaks: true, links: 'nofollow', pageLinks: false }),
  table: Object.freeze({ marks: INLINE_TOOL_MARKS, lineBreaks: false, links: 'nofollow', pageLinks: false }),
  heading: Object.freeze({ marks: Object.freeze(['mark', 'code']), lineBreaks: false, links: null, pageLinks: false })
})

// The tags the editor's own tools write, classes included, so the inline
// toolbar recognises imported formatting.
const OPEN_TAG = Object.freeze({
  b: '<b>',
  i: '<i>',
  u: '<u class="cdx-underline">',
  s: '<s>',
  mark: '<mark class="cdx-marker">',
  code: '<code class="inline-code">'
})

const NBSP = String.fromCharCode(0xA0)
const REPLACEMENT = String.fromCharCode(0xFFFD)
// Controls a note has no use for. Tab, line feed, form feed and carriage return
// are HTML whitespace and become spaces instead.
const CONTROL = new RegExp('[' + [[0x00, 0x08], [0x0B, 0x0B], [0x0E, 0x1F], [0x7F, 0x9F], [0xFFFE, 0xFFFF]]
  .map(([from, to]) => String.fromCharCode(from) + '-' + String.fromCharCode(to))
  .join('') + ']', 'g')
const HTML_WHITESPACE = /[\t\n\f\r ]+/g
const LINE_END_SPACES = new RegExp('[ ' + NBSP + ']+$')

function wellFormed (text) {
  if (typeof text.toWellFormed === 'function') return text.toWellFormed()
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        out += text[i] + text[i + 1]
        i++
      } else {
        out += REPLACEMENT
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      out += REPLACEMENT
    } else {
      out += text[i]
    }
  }
  return out
}

/** Text with invisible controls removed and broken surrogate pairs replaced. */
export function cleanInlineText (text) {
  return typeof text === 'string' ? wellFormed(text).replace(CONTROL, '') : ''
}

/** Text escaped the way the DOM serializes it, so parsing it back changes nothing. */
export function escapeHtmlText (text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(NBSP).join('&nbsp;')
}

/** An attribute value escaped the way the DOM serializes it. */
export function escapeHtmlAttribute (value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').split(NBSP).join('&nbsp;')
}

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
export const MAX_HREF_LENGTH = 2048

/**
 * A link address as it can be stored: web, mail and phone links only, as the
 * URL parser writes them. Null for anything else, which stays as plain text.
 */
export function safeHref (raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_HREF_LENGTH) return null
  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (!LINK_PROTOCOLS.has(url.protocol)) return null
  // Mail and phone addresses are opaque paths, which the parser leaves spaces,
  // quotes and angle brackets in.
  const href = url.href.replace(/[ "<>`]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
  // The parser percent-encodes these; refuse rather than store anything that
  // browsers serialize differently inside an attribute.
  return href.length <= MAX_HREF_LENGTH && !/[\s"<>]/.test(href) ? href : null
}

function styleOf (run, profile) {
  const style = {}
  for (const mark of profile.marks) {
    if (run[mark]) style[mark] = true
  }
  if (profile.pageLinks && typeof run.pageRef === 'string' && run.pageRef) {
    style.pageRef = run.pageRef
  } else if (profile.links && run.href) {
    const href = safeHref(run.href)
    if (href) style.href = href
  }
  return style
}

function sameStyle (a, b) {
  return MARKS.every(mark => Boolean(a[mark]) === Boolean(b[mark])) && a.href === b.href && a.pageRef === b.pageRef
}

function sharedStyle (a, b) {
  const style = {}
  for (const mark of MARKS) {
    if (a[mark] && b[mark]) style[mark] = true
  }
  if (a.href && a.href === b.href) style.href = a.href
  if (a.pageRef && a.pageRef === b.pageRef) style.pageRef = a.pageRef
  return style
}

// Spaces a browser would collapse, written as alternating non-breaking and
// ordinary spaces so they display as typed.
function keepSpaces (text, atLineStart, atLineEnd) {
  return text.replace(/ +/g, (spaces, offset) => {
    const starts = atLineStart && offset === 0
    const ends = atLineEnd && offset + spaces.length === text.length
    if (spaces.length === 1 && !starts && !ends) return ' '
    let out = ''
    for (let k = 0; k < spaces.length; k++) out += k % 2 === 0 ? NBSP : ' '
    return ends && out.endsWith(' ') ? out.slice(0, -1) + NBSP : out
  })
}

/**
 * Runs cleaned for a kind of field: formatting the field doesn't keep and
 * unsafe links dropped, whitespace collapsed the way HTML displays it,
 * neighbours with the same formatting merged, no more than one blank line in a
 * row, and nothing blank at either end.
 *
 * With `preserveSpaces` (plain text sources), spaces and tabs display as typed
 * and line feeds become line breaks.
 *
 * @param {Array<TextRun|BreakRun>} runs
 * @param {keyof FIELD_PROFILES} [profileName]
 * @returns {Array<TextRun|BreakRun>}
 */
export function normalizeRuns (runs, profileName = 'rich', { preserveSpaces = false } = {}) {
  const profile = FIELD_PROFILES[profileName]
  if (!profile) throw new Error(`Unknown field profile: ${profileName}`)

  // Clean the text and apply the profile.
  const items = []
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || typeof run !== 'object') continue
    if (run.br) {
      items.push({ br: true })
      continue
    }
    let text = cleanInlineText(run.text)
    if (!text) continue
    const style = styleOf(run, profile)
    if (preserveSpaces) {
      text = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\f/g, ' ')
      text.split('\n').forEach((line, index) => {
        if (index > 0) items.push({ br: true })
        if (line) items.push({ ...style, text: line })
      })
    } else {
      items.push({ ...style, text: text.replace(HTML_WHITESPACE, ' ') })
    }
  }

  // Line breaks a field can't hold become a space.
  const joined = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (!item.br || profile.lineBreaks) {
      joined.push(item)
      continue
    }
    const before = [...joined].reverse().find(entry => !entry.br)
    const after = items.slice(index + 1).find(entry => !entry.br)
    if (before && after) joined.push({ ...sharedStyle(before, after), text: ' ' })
  }

  // Collapse spaces across runs, or keep them as typed.
  const spaced = []
  let lineStart = true
  let endsWithSpace = false
  joined.forEach((item, index) => {
    if (item.br) {
      spaced.push(item)
      lineStart = true
      endsWithSpace = false
      return
    }
    let text = item.text
    if (preserveSpaces) {
      const next = joined[index + 1]
      text = keepSpaces(text, lineStart, !next || Boolean(next.br))
    } else if ((lineStart || endsWithSpace) && text.startsWith(' ')) {
      text = text.slice(1)
    }
    if (!text) return
    spaced.push({ ...item, text })
    lineStart = false
    endsWithSpace = text.endsWith(' ')
  })

  // No spaces at the end of a line.
  let lineEnd = true
  for (let index = spaced.length - 1; index >= 0; index--) {
    const item = spaced[index]
    if (item.br) {
      lineEnd = true
      continue
    }
    if (!lineEnd) continue
    const text = item.text.replace(LINE_END_SPACES, '')
    if (text) {
      item.text = text
      lineEnd = false
    } else {
      spaced.splice(index, 1)
    }
  }

  // No line breaks at either end, at most one blank line, neighbours merged.
  const out = []
  let breaks = 0
  for (const item of spaced) {
    if (item.br) {
      breaks++
      continue
    }
    if (out.length > 0) {
      for (let k = 0; k < Math.min(breaks, 2); k++) out.push({ br: true })
    }
    breaks = 0
    const last = out[out.length - 1]
    if (last && !last.br && sameStyle(last, item)) last.text += item.text
    else out.push({ ...item })
  }
  return out
}

function linkKey (run) {
  if (run.pageRef) return 'page:' + run.pageRef
  if (run.href) return 'href:' + run.href
  return ''
}

function openLink (run, profile) {
  if (run.pageRef) return `<a data-page-id="${escapeHtmlAttribute(run.pageRef)}" class="page-link" href="#">`
  const rel = profile.links === 'rich' ? 'noopener noreferrer' : 'nofollow'
  return `<a href="${escapeHtmlAttribute(run.href)}" target="_blank" rel="${rel}">`
}

/**
 * Runs as HTML a field of this kind keeps unchanged. Formatting nests in one
 * fixed order (bold, italic, underline, strikethrough, highlight, code) inside
 * at most one link.
 *
 * @param {Array<TextRun|BreakRun>} runs
 * @param {keyof FIELD_PROFILES} [profileName]
 * @param {{preserveSpaces?: boolean}} [options]
 */
export function runsToHtml (runs, profileName = 'rich', options = {}) {
  const profile = FIELD_PROFILES[profileName]
  const items = normalizeRuns(runs, profileName, options)
  let html = ''
  let link = ''
  const open = []
  const closeMarks = (keep) => {
    while (open.length > keep) html += `</${open.pop()}>`
  }
  for (const item of items) {
    const key = item.br ? '' : linkKey(item)
    if (key !== link) {
      closeMarks(0)
      if (link) html += '</a>'
      if (key) html += openLink(item, profile)
      link = key
    }
    if (item.br) {
      closeMarks(0)
      html += '<br>'
      continue
    }
    const wanted = MARKS.filter(mark => item[mark])
    let keep = 0
    while (keep < open.length && keep < wanted.length && open[keep] === wanted[keep]) keep++
    closeMarks(keep)
    for (const mark of wanted.slice(keep)) {
      html += OPEN_TAG[mark]
      open.push(mark)
    }
    html += escapeHtmlText(item.text)
  }
  closeMarks(0)
  if (link) html += '</a>'
  return html
}

/** The text of some runs, line breaks as line feeds. */
export function runsText (runs) {
  let text = ''
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run) continue
    if (run.br) text += '\n'
    else if (typeof run.text === 'string') text += run.text
  }
  return text
}
