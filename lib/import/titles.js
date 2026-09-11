/**
 * Titles for imported notes.
 *
 * DOM-free so it runs under `node --test`.
 */

// Dash cuts saved titles at 200 UTF-16 code units (validatePageStructure).
export const MAX_TITLE_LENGTH = 200

// C0 and C1 controls: tabs, line breaks and the like become spaces.
const CONTROL = new RegExp('[' + String.fromCharCode(0x00) + '-' + String.fromCharCode(0x1F) + String.fromCharCode(0x7F) + '-' + String.fromCharCode(0x9F) + ']', 'g')
// Invisible formatting a title never needs, some of which can disguise
// text: zero-width space and non-joiner, direction marks, bidi embeddings,
// overrides and isolates, and the byte order mark. The zero-width joiner
// stays, because emoji sequences use it.
const INVISIBLE = new RegExp('[' + [[0x200B, 0x200C], [0x200E, 0x200F], [0x202A, 0x202E], [0x2066, 0x2069], [0xFEFF, 0xFEFF]]
  .map(([from, to]) => String.fromCharCode(from) + '-' + String.fromCharCode(to))
  .join('') + ']', 'g')

/** Text split into user-perceived characters, so a cut never breaks an emoji or accent. */
export function graphemes (text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
  }
  return Array.from(text)
}

/** Text cut to at most `limit` UTF-16 code units, on a character boundary. */
export function cutText (text, limit) {
  if (text.length <= limit) return text
  let out = ''
  for (const part of graphemes(text)) {
    if (out.length + part.length > limit) break
    out += part
  }
  return out
}

/** Source text as one clean line: NFC, invisible characters removed, whitespace collapsed. */
export function cleanLine (raw) {
  if (typeof raw !== 'string') return ''
  return raw.normalize('NFC').replace(INVISIBLE, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * A note title. Falls back to the first non-empty line of `fallbackText`,
 * then to `fallback`, so a title is never empty.
 */
export function cleanTitle (raw, { fallbackText = '', fallback = 'Untitled' } = {}) {
  let title = cleanLine(raw)
  if (!title) {
    const firstLine = String(fallbackText || '').split('\n').map(cleanLine).find(Boolean)
    title = firstLine || cleanLine(fallback) || 'Untitled'
  }
  return cutText(title, MAX_TITLE_LENGTH).trimEnd()
}

/**
 * A title from a file path: no folders, no extension, and no 32-character
 * hex id of the kind Notion appends to exported names.
 */
export function titleFromFilename (path) {
  const base = String(path || '').split(/[\\/]/).pop()
  return base.replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/\s+[0-9a-f]{32}$/i, '')
}
