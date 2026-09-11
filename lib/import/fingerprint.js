/**
 * Spotting a note that is already in Dash: an import run twice, or a note
 * imported before. Two notes match when their title, their blocks' kinds and
 * checkmarks, and their words are the same once formatting, case and
 * whitespace are set aside.
 *
 * A note with photos or files never matches on text alone, because its files
 * may differ. The import registry matches those.
 */

import { exportItems, inlineText } from '../../utils/exportBlocks.js'
import { bytesToHex } from '../../utils/cryptoUtils.js'

const text = inlineText

// Each item as a marker for its kind and the words it holds.
function itemParts (item) {
  switch (item.kind) {
    case 'heading':
      return { marker: 'heading', words: [text(item.html)] }
    case 'paragraph':
      return { marker: 'paragraph', words: [text(item.html)] }
    case 'list-item': {
      const marker = item.listType === 'checklist' ? (item.checked ? 'done' : 'todo') : item.listType
      return { marker: `${marker}:${item.indent}`, words: [text(item.html)] }
    }
    case 'quote':
      return { marker: 'quote', words: [text(item.html), text(item.captionHtml)] }
    case 'callout':
      return { marker: 'callout', words: [text(item.html)] }
    case 'toggle':
      return { marker: 'toggle', words: [text(item.summaryHtml), text(item.contentHtml)] }
    case 'code':
      return { marker: 'code', words: [item.code] }
    case 'table':
      return { marker: 'table', words: item.rows.flat().map(text) }
    case 'image':
      return { marker: 'photo', words: [text(item.captionHtml)] }
    case 'embed':
      return { marker: 'embed', words: [item.url] }
    case 'attachment':
      return { marker: 'file', words: [item.filename] }
    case 'divider':
      return { marker: 'divider', words: [] }
    case 'seed-phrase':
      return { marker: 'seed-phrase', words: item.words }
    default:
      return { marker: item.kind, words: [] }
  }
}

const normalize = (value) => String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

function itemsOf (blocks) {
  return exportItems({ blocks: Array.isArray(blocks) ? blocks : [] })
}

/** A note's words, normalized for comparison. */
export function noteBodyText (blocks) {
  return normalize(itemsOf(blocks).flatMap(item => itemParts(item).words).join(' '))
}

/** True when a note holds photos or files. */
export function noteHasFiles (blocks) {
  return itemsOf(blocks).some(item => item.kind === 'image' || item.kind === 'attachment')
}

/**
 * SHA-256 of a note's normalized title and blocks, or null for a note with no
 * words: a title alone is too weak to call two notes the same. Blank
 * paragraphs are left out, so spacing differences still match.
 */
export async function noteFingerprint ({ title = '', blocks = [] } = {}) {
  const parts = itemsOf(blocks).map(itemParts)
  if (!normalize(parts.flatMap(part => part.words).join(' '))) return null
  const shape = parts
    .map(part => ({ marker: part.marker, words: normalize(part.words.join(' ')) }))
    .filter(part => part.marker !== 'paragraph' || part.words)
    .map(part => `${part.marker} ${part.words}`)
    .join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(title) + '\n' + shape))
  return bytesToHex(new Uint8Array(digest))
}
