/**
 * Folders of Markdown notes: Obsidian vaults, Notesnook's Markdown export, and
 * other Markdown or plain text folders, picked as a folder or a zip.
 *
 * A note's title is its file name, or the title in its frontmatter. Links find
 * notes by path, or by name the way Obsidian does, and embeds find files by
 * name anywhere in the folder. Obsidian canvases, bases and Excalidraw
 * drawings have nothing to become in Dash and are listed as skipped.
 *
 * DOM-free so it runs under `node --test`.
 */

import { finishBlocks } from '../blocks.js'
import { noteDates, parseAnyDate } from '../dates.js'
import { safeHref } from '../inline.js'
import { dropTitleHeading, frontmatterTags, markdownToDrafts, propertiesTable, propertyText, splitFrontmatter } from '../markdownToBlocks.js'
import { basename, dirname, extension, normalizePath, resolveRelative } from '../paths.js'
import { plainTextDrafts } from '../plainText.js'
import { dataUrlResource, isPhotoType, mimeTypeFor } from '../resources.js'
import { cleanTitle, titleFromFilename } from '../titles.js'

const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'txt'])
const HIDDEN = /(^|\/)\.(obsidian|git|github|vscode|stfolder)(\/|$)/
const TRASH = /(^|\/)\.trash(\/|$)/
const SPECIAL_FOLDERS = new Set(['attachments', '_attachments', '_archive', 'assets', 'files', 'images'])

const CREATED_KEYS = ['created', 'created_at', 'createdat', 'date created', 'creation date', 'date']
const UPDATED_KEYS = ['updated', 'updated_at', 'modified', 'last modified', 'date modified', 'last_modified', 'lastmod']

/** Notesnook's frontmatter dates, "DD-MM-YYYY hh:mm AM", in local time. */
export function parseNotesnookDate (text) {
  const match = /^\s*(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?\s*$/.exec(String(text ?? ''))
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  let hours = match[4] ? Number(match[4]) : 0
  const minutes = match[5] ? Number(match[5]) : 0
  if (match[7]) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (/p/i.test(match[7]) ? 12 : 0)
  }
  const date = new Date(year, month - 1, day, hours, minutes)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || hours > 23 || minutes > 59) return null
  return year >= 1971 && date.getTime() <= Date.now() + 2 * 86400000 ? date.getTime() : null
}

function propertyDate (value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value === 'number') return parseAnyDate(value)
  const text = propertyText(value)
  return parseAnyDate(text) ?? parseNotesnookDate(text) ?? parseAnyDate(text.replace(' ', 'T'))
}

const stemOf = (path) => basename(path).replace(/\.(md|markdown|txt)$/i, '')

/**
 * Import notes from a folder of Markdown or text files, one at a time. Files
 * left out come back as { skipped: true } with the reason, and a note that
 * can't be converted as { failed: true }.
 *
 * @param {import('../source.js').SourceFile[]} files
 * @param {{signal?: AbortSignal, newId?: () => string, pageRefFor?: (path: string) => string}} [options]
 */
export async function * markdownNotes (files, { signal, newId, pageRefFor = path => path } = {}) {
  const visible = files.filter(file => !HIDDEN.test(file.path))
  const notes = visible.filter(file => NOTE_EXTENSIONS.has(extension(file.path)) && !TRASH.test(file.path))
  const notePaths = new Set(notes.map(file => file.path))
  const byLowerPath = new Map(visible.map(file => [file.path.toLowerCase(), file]))
  const notesByStem = new Map()
  for (const note of notes) {
    const stem = stemOf(note.path).toLowerCase()
    if (!notesByStem.has(stem)) notesByStem.set(stem, [])
    notesByStem.get(stem).push(note.path)
  }
  const filesByName = new Map()
  for (const file of visible) {
    const name = basename(file.path).toLowerCase()
    if (!filesByName.has(name)) filesByName.set(name, [])
    filesByName.get(name).push(file.path)
  }
  const byPath = new Map(visible.map(file => [file.path, file]))
  const firstSegments = new Set(visible.map(file => file.path.split('/')[0]))
  const root = firstSegments.size === 1 && visible.every(file => file.path.includes('/')) ? [...firstSegments][0] : ''

  // The nearest of several same-named paths: in the note's own folder, then the shortest.
  const nearest = (paths, fromPath) => {
    if (!paths || paths.length === 0) return null
    const folder = dirname(fromPath)
    return [...paths].sort((a, b) => Number(dirname(b) === folder) - Number(dirname(a) === folder) || a.split('/').length - b.split('/').length || a.localeCompare(b))[0]
  }
  const exactPath = (candidate, fromPath) => {
    for (const path of [resolveRelative(fromPath, candidate), normalizePath(candidate), normalizePath(root ? `${root}/${candidate}` : candidate)]) {
      const hit = byLowerPath.get(path.toLowerCase())
      if (hit) return hit.path
    }
    return null
  }
  const findNote = (target, fromPath) => {
    const name = String(target || '').split('#')[0].trim()
    if (!name) return null
    const withExtension = /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`
    const exact = exactPath(withExtension, fromPath)
    if (exact && notePaths.has(exact)) return exact
    const suffix = `/${withExtension.toLowerCase()}`
    const candidates = (notesByStem.get(stemOf(name).toLowerCase()) || []).filter(path => !name.includes('/') || `/${path.toLowerCase()}`.endsWith(suffix))
    return nearest(candidates, fromPath)
  }
  const findFile = (target, fromPath) => {
    const name = String(target || '').split('#')[0].trim()
    if (!name) return null
    const exact = exactPath(name, fromPath)
    if (exact && !notePaths.has(exact)) return exact
    return nearest((filesByName.get(basename(name).toLowerCase()) || []).filter(path => !notePaths.has(path)), fromPath)
  }

  for (const file of visible) {
    if (signal?.aborted) throw signal.reason ?? new Error('Import cancelled')
    const ext = extension(file.path)
    const label = titleFromFilename(file.name)
    const source = { path: file.path, container: file.container ?? null, label }
    if (ext === 'canvas' || ext === 'base') {
      yield { key: file.path, skipped: true, reason: ext === 'canvas' ? 'canvas' : 'base', title: label, source }
      continue
    }
    if (!NOTE_EXTENSIONS.has(ext)) continue
    if (TRASH.test(file.path)) {
      yield { key: file.path, skipped: true, reason: 'in-trash', title: label, source }
      continue
    }
    try {
      const note = await convertNote(file, { findNote, findFile, sourceFor: path => byPath.get(path), pageRefFor, newId, root })
      yield note.skipped ? { ...note, source } : note
    } catch (error) {
      yield { key: file.path, failed: true, title: label, reason: error?.message || String(error), source }
    }
  }
}

async function convertNote (file, { findNote, findFile, sourceFor, pageRefFor, newId, root }) {
  const issues = {}
  const report = (code, count = 1) => {
    issues[code] = (issues[code] || 0) + count
  }
  const text = await file.text()
  const plain = extension(file.path) === 'txt'
  const { properties, raw, body, unreadable } = plain ? { properties: null, raw: null, body: text } : splitFrontmatter(text)
  const entries = Object.entries(properties || {})
  const property = (keys) => entries.find(([key]) => keys.includes(key.toLowerCase()))

  if (property(['excalidraw-plugin'])) {
    return { key: file.path, skipped: true, reason: 'excalidraw', title: titleFromFilename(file.name) }
  }

  const titleEntry = property(['title'])
  const tagEntries = entries.filter(([key]) => ['tags', 'tag'].includes(key.toLowerCase()))
  const createdEntry = property(CREATED_KEYS)
  const updatedEntry = property(UPDATED_KEYS)
  const created = createdEntry ? propertyDate(createdEntry[1]) : null
  const updated = updatedEntry ? propertyDate(updatedEntry[1]) : null
  const used = new Set([titleEntry, ...tagEntries, created !== null && createdEntry, updated !== null && updatedEntry].filter(Boolean))
  const title = cleanTitle(propertyText(titleEntry?.[1]), { fallback: titleFromFilename(file.name) })

  const resources = new Map()
  const resourceFor = (path) => {
    if (!resources.has(path)) {
      const source = sourceFor(path)
      resources.set(path, { key: path, name: basename(path), mimeType: mimeTypeFor(path), size: source.size, file: source })
    }
    return path
  }

  const drafts = []
  if (unreadable) {
    report('frontmatter-unreadable')
    drafts.push({ kind: 'code', code: raw, language: 'yaml' })
  }
  const table = propertiesTable(entries.filter(entry => !used.has(entry)))
  if (table) drafts.push(table)

  let inlineTags = []
  if (plain) {
    drafts.push(...plainTextDrafts(body))
  } else {
    const converted = markdownToDrafts(body, {
      resolveWikiLink: target => {
        const note = findNote(target, file.path)
        return note ? { pageRef: pageRefFor(note) } : null
      },
      resolveEmbed: target => {
        const name = String(target || '').split('#')[0]
        const ext = extension(name)
        if (!ext || ext === 'md' || ext === 'markdown' || ext === 'txt') {
          const note = findNote(target, file.path)
          return note ? { pageRef: pageRefFor(note) } : null
        }
        const path = findFile(name, file.path)
        if (!path) return null
        return isPhotoType(mimeTypeFor(path)) ? { resource: resourceFor(path) } : { file: resourceFor(path), name: basename(path) }
      },
      resolveLink: href => {
        const safe = safeHref(href)
        if (safe) return { href: safe }
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
        let decoded = href
        try {
          decoded = decodeURIComponent(href)
        } catch {}
        const note = /\.(md|markdown|txt)(#.*)?$/i.test(decoded) || !extension(decoded.split('#')[0]) ? findNote(decoded, file.path) : null
        if (note) return { pageRef: pageRefFor(note) }
        const path = findFile(decoded, file.path)
        return path ? { file: resourceFor(path), name: basename(path) } : null
      },
      resolveImage: src => {
        const inline = dataUrlResource(src, `${file.path}/inline-${resources.size + 1}`)
        if (inline) {
          resources.set(inline.key, inline)
          return { resource: inline.key }
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null
        let decoded = src
        try {
          decoded = decodeURIComponent(src)
        } catch {}
        const path = findFile(decoded, file.path)
        return path && isPhotoType(mimeTypeFor(path)) ? { resource: resourceFor(path) } : null
      }
    })
    drafts.push(...dropTitleHeading(converted.drafts, title))
    for (const [code, count] of Object.entries(converted.issues)) report(code, count)
    inlineTags = converted.tags
  }

  const relative = root ? file.path.slice(root.length + 1) : file.path
  const segments = relative.split('/')
  const folderTag = segments.length > 1 && !SPECIAL_FOLDERS.has(segments[0].toLowerCase()) ? segments[0] : ''
  const tags = []
  const seen = new Set()
  for (const tag of [folderTag, ...tagEntries.flatMap(([, value]) => frontmatterTags(value)), ...inlineTags]) {
    const clean = String(tag || '').replace(/^#+/, '').trim()
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase())
      tags.push(clean)
    }
  }

  const blocks = finishBlocks(drafts, { newId, report })
  const dates = noteDates({ created, updated, fileTime: file.lastModified })
  return {
    key: file.path,
    title,
    createdAt: dates.createdAt,
    lastEdited: dates.lastEdited,
    tags,
    blocks,
    issues,
    resources: [...resources.values()],
    source: { path: file.path, container: file.container ?? null, label: title }
  }
}
