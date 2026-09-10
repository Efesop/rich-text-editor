/**
 * Backlinks — find the notes that link TO a given page.
 *
 * Page links are stored inline in block HTML by components/editor-tools/PageLink.js
 * as `<a data-page-id="<uuid>" class="page-link" href="#">Title</a>`, so finding
 * backlinks is a scan over the blocks we already hold — no new storage, no index.
 *
 * Deliberately DOM-free so it runs under `node --test` and on the server: block
 * text is Editor.js's own DOMPurify-sanitised output, and snippets come back as
 * plain strings ({ before, linkText, after }) rather than markup, so the UI can
 * render them as text nodes and never needs dangerouslySetInnerHTML.
 *
 * Locked pages: a locked page on disk has `content: null` and an encrypted
 * `encryptedContent` blob, so it simply cannot be scanned and contributes
 * nothing. One that is temp-unlocked this session HAS readable blocks, so it
 * contributes a title row with NO snippet — the same rule SearchModal already
 * applies when it labels locked results "Locked" instead of showing their
 * metadata.
 */

const MAX_SNIPPETS_PER_PAGE = 3
const CONTEXT_CHARS = 90

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…'
}

function decodeEntities (text) {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X'
      const code = hex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try { return String.fromCodePoint(code) } catch { return match }
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()]
    return named === undefined ? match : named
  })
}

/**
 * Strip tags and decode entities, collapsing runs of whitespace. Does NOT trim,
 * so callers can tell whether a snippet edge sat against a space.
 */
export function htmlToText (html) {
  if (typeof html !== 'string' || html === '') return ''
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/[\s ]+/g, ' ')
}

function escapeRegExp (value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkPattern (pageId) {
  // data-page-id may sit before or after class/href, hence the [^>]* on both sides.
  return new RegExp(
    `<a\\b[^>]*\\bdata-page-id\\s*=\\s*["']${escapeRegExp(pageId)}["'][^>]*>([\\s\\S]*?)<\\/a>`,
    'gi'
  )
}

/** Keep the tail of `text`, cut on a word boundary, prefixed with an ellipsis when clipped. */
function contextBefore (text) {
  if (text.length <= CONTEXT_CHARS) return text.trimStart()
  const tail = text.slice(-CONTEXT_CHARS)
  const space = tail.indexOf(' ')
  return '…' + (space === -1 ? tail : tail.slice(space + 1))
}

/** Keep the head of `text`, cut on a word boundary, suffixed with an ellipsis when clipped. */
function contextAfter (text) {
  if (text.length <= CONTEXT_CHARS) return text.trimEnd()
  const head = text.slice(0, CONTEXT_CHARS)
  const space = head.lastIndexOf(' ')
  return (space === -1 ? head : head.slice(0, space)) + '…'
}

/**
 * Walk any block `data` shape and yield every string in it. Generic on purpose:
 * text lives in `data.text` for paragraphs and headers, `data.items[]` for lists
 * (as strings OR { content, items } OR { text, checked }), `data.content[][]`
 * for table cells, `data.caption` for images and quotes. A recursive walk keeps
 * working when a new block type is added instead of silently missing its links.
 */
export function collectStrings (value, out = [], depth = 0) {
  if (depth > 8) return out
  if (typeof value === 'string') {
    if (value !== '') out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1)
    return out
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1)
  }
  return out
}

/** Every mention of `pageId` inside one HTML string, as { before, linkText, after }. */
export function snippetsFor (html, pageId) {
  const found = []
  if (typeof html !== 'string' || !html.includes('data-page-id')) return found
  const pattern = linkPattern(pageId)
  let match
  while ((match = pattern.exec(html)) !== null) {
    found.push({
      before: contextBefore(htmlToText(html.slice(0, match.index))),
      linkText: htmlToText(match[1]).trim(),
      after: contextAfter(htmlToText(html.slice(match.index + match[0].length)))
    })
    if (pattern.lastIndex === match.index) pattern.lastIndex++
  }
  return found
}

function recency (page) {
  const time = page?.content?.time
  if (typeof time === 'number' && Number.isFinite(time)) return time
  const created = Date.parse(page?.createdAt || '')
  return Number.isFinite(created) ? created : 0
}

/**
 * Find every page linking to `targetPageId`.
 *
 * @param {Array} pages - all pages (folders and trashed items are skipped)
 * @param {string} targetPageId
 * @param {{ maxSnippetsPerPage?: number }} [options]
 * @returns {Array<{ pageId, title, isLocked, count, snippets }>} newest linking page first
 */
export function findBacklinks (pages, targetPageId, options = {}) {
  if (!targetPageId || !Array.isArray(pages)) return []
  const maxSnippets = options.maxSnippetsPerPage ?? MAX_SNIPPETS_PER_PAGE
  const results = []

  for (const page of pages) {
    if (!page || page.id === targetPageId) continue
    if (page.type === 'folder' || page.trashed) continue

    const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : null
    if (!blocks || blocks.length === 0) continue

    const isLocked = Boolean(page.password?.hash)
    const snippets = []
    let count = 0

    for (const block of blocks) {
      for (const text of collectStrings(block?.data)) {
        if (!text.includes('data-page-id')) continue
        for (const snippet of snippetsFor(text, targetPageId)) {
          count += 1
          // A locked page contributes its title, never its contents.
          if (!isLocked && snippets.length < maxSnippets) snippets.push(snippet)
        }
      }
    }

    if (count > 0) {
      results.push({
        pageId: page.id,
        title: page.title || 'Untitled',
        isLocked,
        count,
        snippets,
        recency: recency(page)
      })
    }
  }

  results.sort((a, b) => b.recency - a.recency || a.title.localeCompare(b.title))
  return results
}
