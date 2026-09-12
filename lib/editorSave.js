/**
 * What savePage stores when the editor saves a note.
 *
 * The editor saves a note as soon as it opens, edited or not. So a save keeps
 * every other field of the note (validatePageStructure), and moves
 * `lastEdited` only when the note's content changed. `lastEdited` is what sync
 * compares when two devices change the same note (lib/syncPull.js,
 * lib/syncRebase.js): moved on every open, a note that was only read would
 * beat a real edit made on another device.
 *
 * DOM-free, so it runs under `node --test`.
 */

import { sanitizeEditorContent, validatePageStructure } from '../utils/securityUtils.js'
import { migrateEditorData } from '../utils/migrateBlocks.js'
import { linkifyTableBlocks } from './markdownBlocks.js'

/**
 * The blocks the editor saves back after loading `content`: repaired
 * (utils/migrateBlocks.js), with web addresses in tables linked (as
 * components/Editor.js does) and sanitized. Content that is already sanitized
 * is only sanitized again when a repair or a link changed it.
 */
function editorBlocks (content, { sanitized = false } = {}) {
  const stored = Array.isArray(content?.blocks) ? content.blocks : []
  const blocks = stored.filter(block => block && typeof block === 'object')
  const linked = linkifyTableBlocks(migrateEditorData({ blocks }).blocks)
  if (sanitized && linked === blocks) return blocks
  return sanitizeEditorContent({ blocks: linked }).blocks
}

// A link's rel and target don't change what a note shows, and each editor
// tool keeps or drops them by its own rules when it saves: the table tool
// saves a linked cell without the rel that linking added.
const LINK_TAG = /<a\s[^>]*>/gi
const UNSHOWN_LINK_ATTRIBUTE = /\s(?:rel|target)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi

function withoutUnshownLinkAttributes (value) {
  if (typeof value === 'string') {
    return value.includes('<a') ? value.replace(LINK_TAG, tag => tag.replace(UNSHOWN_LINK_ATTRIBUTE, '')) : value
  }
  if (Array.isArray(value)) return value.map(withoutUnshownLinkAttributes)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutUnshownLinkAttributes(item)]))
  }
  return value
}

// Without block ids, which the editor gives a block that has none each time
// the note loads, and without a left alignment, which it saves for every
// paragraph and heading that has none (components/editor-tools/AlignmentTune.js).
// Such a block shows on the left anyway. Code is kept as typed, not as HTML.
function fingerprintBlocks (blocks) {
  return JSON.stringify(blocks.map(({ id: _id, tunes, ...block }) => {
    const data = block.type === 'code' ? block.data : withoutUnshownLinkAttributes(block.data)
    return tunes?.alignment?.alignment === 'left' ? { ...block, data } : { ...block, data, tunes }
  }))
}

/**
 * A comparable form of a note's content. Two contents with the same
 * fingerprint differ at most in what loading a note in the editor changes:
 * block ids, repairs, links in tables, a link's rel and target, and the
 * default left alignment.
 */
export function contentFingerprint (content) {
  return fingerprintBlocks(editorBlocks(content))
}

/**
 * The note after the editor saves `content` into it.
 *
 * @param {object} page - the note as stored now
 * @param {object} content - what the editor saved
 * @param {object} [options]
 * @param {number} [options.now]
 * @param {string} [options.storedFingerprint] - the stored note's contentFingerprint, when already known
 * @returns {{isValid: boolean, errors: string[], sanitized: object|null, fingerprint: string|null, edited: boolean}}
 *   validatePageStructure's result, with `lastEdited` set to `now` when the
 *   content changed. `fingerprint` is the saved content's, for the next save
 *   of the note to pass back as `storedFingerprint`.
 */
export function applyEditorSave (page, content, { now = Date.now(), storedFingerprint } = {}) {
  // Sanitized here and again inside validatePageStructure, as savePage always has.
  const validation = validatePageStructure({ ...page, content: sanitizeEditorContent(content) })
  if (!validation.isValid) return { ...validation, fingerprint: null, edited: false }
  const fingerprint = fingerprintBlocks(editorBlocks(validation.sanitized.content, { sanitized: true }))
  const edited = fingerprint !== (storedFingerprint ?? contentFingerprint(page.content))
  if (edited) validation.sanitized.lastEdited = now
  return { ...validation, fingerprint, edited }
}
