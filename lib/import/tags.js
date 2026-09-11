/**
 * Tags for imported notes.
 *
 * Dash tag names are at most 15 characters. A source tag that fits keeps its
 * name, and lands on an existing Dash tag of exactly that name. A longer one
 * becomes its first ten characters, "~" and four characters of a hash of the
 * whole name: two long tags never collapse into one, importing the same tag
 * again finds the same name, and a shortened tag can't land on some existing
 * tag that merely starts the same way.
 */

import { cleanLine, cutText } from './titles.js'

export const MAX_TAG_LENGTH = 15
const HASH_LENGTH = 4

// FNV-1a over UTF-8: small, stable across platforms and runs.
function fnv1a (text) {
  let hash = 0x811C9DC5
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function shortHash (text) {
  return fnv1a(text).toString(36).padStart(HASH_LENGTH, '0').slice(-HASH_LENGTH)
}

/** A source tag's text: one clean line with any leading # removed. */
export function cleanTagText (raw) {
  return cleanLine(String(raw ?? '')).replace(/^#+\s*/, '')
}

function shortened (text, salt = '') {
  const prefix = cutText(text, MAX_TAG_LENGTH - HASH_LENGTH - 1).trimEnd()
  return `${prefix}~${shortHash(text + salt)}`
}

/** The Dash tag name for a source tag, or null when nothing is left of it. */
export function dashTagName (raw) {
  const text = cleanTagText(raw)
  if (!text) return null
  return text.length <= MAX_TAG_LENGTH ? text : shortened(text)
}

/**
 * How an import's tags land in Dash.
 *
 * Tags match case-insensitively: "work" lands on an existing "Work", and
 * "Work" and "WORK" in one import become one tag.
 *
 * @param {string[]} sourceTags - every tag the import uses, as the source wrote them
 * @param {string[]} [existingNames] - tag names already in Dash
 * @returns {{names: Map<string, string>, added: string[], shortened: Array<{from: string, to: string}>}}
 *   `names` maps each source tag to its Dash name; `added` lists names Dash
 *   doesn't have yet; `shortened` lists the tags whose names had to change
 */
export function planTags (sourceTags, existingNames = []) {
  const known = new Map()
  for (const name of existingNames) {
    if (typeof name === 'string' && !known.has(name.toLowerCase())) known.set(name.toLowerCase(), name)
  }
  const existing = new Set(known.keys())
  const names = new Map()
  const added = []
  const renamed = []
  const owner = new Map()
  for (const source of sourceTags || []) {
    if (names.has(source)) continue
    const text = cleanTagText(source)
    if (!text) continue
    let name = text.length <= MAX_TAG_LENGTH ? text : shortened(text)
    // Two long tags that share a hash: give the later one another name.
    for (let salt = 2; owner.has(name.toLowerCase()) && owner.get(name.toLowerCase()) !== text.toLowerCase(); salt++) {
      name = shortened(text, `#${salt}`)
    }
    owner.set(name.toLowerCase(), text.toLowerCase())
    name = known.get(name.toLowerCase()) || name
    known.set(name.toLowerCase(), name)
    names.set(source, name)
    if (text.length > MAX_TAG_LENGTH && !renamed.some(entry => entry.from === text)) renamed.push({ from: text, to: name })
    if (!existing.has(name.toLowerCase()) && !added.some(entry => entry.toLowerCase() === name.toLowerCase())) added.push(name)
  }
  return { names, added, shortened: renamed }
}
