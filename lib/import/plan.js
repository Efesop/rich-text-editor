/**
 * Planning an import: every note read and converted, checked against what is
 * already in Dash and against itself, and counted, before anything is written.
 *
 * A plan holds the converted notes with their Dash ids already chosen, so
 * links between them work. Choices the person makes in the preview (skipping
 * duplicates) are applied by selectNotes without scanning again.
 *
 * DOM-free so it runs under `node --test`.
 */

import { noteFingerprint } from './fingerprint.js'
import { planTags } from './tags.js'
import { isPhotoType } from './resources.js'
import { bytesToHex } from '../../utils/cryptoUtils.js'
import { MAX_ATTACHMENT_BYTES } from '../attachmentLimits.js'
import { inlineText } from '../../utils/exportBlocks.js'

export const MAX_FOLDER_TITLE_LENGTH = 30
const SAMPLE_COUNT = 20
const ISSUE_NOTE_NAMES = 50

const defaultYield = () => new Promise(resolve => setTimeout(resolve, 0))

async function sha256 (text) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

// What identifies a note across imports: its blocks' text and its files, but
// not the paths it was found at.
async function importFingerprint (note) {
  const descriptor = new Map((note.resources || []).map(resource => [resource.key, `${resource.name}|${resource.size}|${resource.md5 || ''}`]))
  const shape = (note.blocks || []).map(block => {
    const { importResource, ...data } = block.data || {}
    return `${block.type}:${importResource ? descriptor.get(importResource) || '' : ''}:${JSON.stringify(data)}`
  })
  return sha256(`${note.title}\n${shape.join('\n')}`)
}

function noteHasFiles (note) {
  return (note.resources || []).length > 0 || (note.blocks || []).some(block => block.data?.importResource)
}

// Text cut to a length, at a word when there is one to cut at.
function cutAtWord (text, length) {
  if (text.length <= length) return text
  const cut = text.slice(0, length)
  const space = cut.lastIndexOf(' ')
  return (text[length] !== ' ' && space > 0 ? cut.slice(0, space) : cut).trim()
}

/** A folder title that no existing folder has, at most 30 characters. */
export function uniqueFolderTitle (title, existingPages = []) {
  const taken = new Set(existingPages.filter(page => page?.type === 'folder').map(page => String(page.title).toLowerCase()))
  const base = cutAtWord(String(title || 'Imported notes').trim(), MAX_FOLDER_TITLE_LENGTH)
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const candidate = cutAtWord(base, MAX_FOLDER_TITLE_LENGTH - suffix.length) + suffix
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

function snippet (blocks) {
  for (const block of blocks || []) {
    const data = block.data || {}
    const html = data.text ?? data.summary ?? data.caption
    const text = typeof html === 'string' ? inlineText(html).replace(/\s+/g, ' ').trim() : ''
    if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text
  }
  return ''
}

/**
 * Reads everything an adapter produces into a plan.
 *
 * @param {object} options
 * @param {(context: {pageRefFor: (key: string) => string, signal?: AbortSignal}) => AsyncIterable<object>} options.readNotes
 *   the format adapter, already given its files
 * @param {Array} [options.existingPages] - everything in Dash now
 * @param {Array<{name: string}>} [options.existingTags]
 * @param {(fingerprint: string) => string|null} [options.importedBefore] - the page an earlier import made from a note like this
 * @param {Array<{path: string, container?: string|null}>} [options.sourceFiles] - every file picked, to account for the ones no note used
 * @param {string} [options.folderTitle]
 * @param {(progress: {found: number, label: string}) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {() => string} [options.newPageId]
 * @param {() => Promise<void>} [options.yieldToUi]
 */
export async function scanImport ({
  readNotes,
  existingPages = [],
  existingTags = [],
  importedBefore = () => null,
  sourceFiles = [],
  folderTitle = 'Imported notes',
  onProgress,
  signal,
  newPageId = () => crypto.randomUUID(),
  yieldToUi = defaultYield,
  sliceMs = 12
}) {
  const ids = new Map()
  const pageRefFor = (key) => {
    if (!ids.has(key)) ids.set(key, newPageId())
    return ids.get(key)
  }
  const checkCancelled = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Import cancelled', 'AbortError')
  }
  let sliceStart = Date.now()
  const breathe = async () => {
    if (Date.now() - sliceStart >= sliceMs) {
      await yieldToUi()
      sliceStart = Date.now()
    }
    checkCancelled()
  }

  const notes = []
  const skipped = []
  const failed = []
  for await (const item of readNotes({ pageRefFor, signal })) {
    checkCancelled()
    if (item.failed) failed.push(item)
    else if (item.skipped) skipped.push(item)
    else notes.push({ ...item, id: pageRefFor(item.key) })
    onProgress?.({ found: notes.length + skipped.length + failed.length, label: item.title || '' })
    await breathe()
  }

  // Notes already in Dash: unlocked, not in Trash, with words to compare
  const livePages = new Map()
  const byFingerprint = new Map()
  for (const page of existingPages) {
    if (!page || page.type === 'folder' || page.trashed) continue
    livePages.set(page.id, page)
    if (page.password || !Array.isArray(page.content?.blocks)) continue
    const fingerprint = await noteFingerprint({ title: page.title, blocks: page.content.blocks })
    if (fingerprint && !byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, page.id)
    await breathe()
  }

  const firstInImport = new Map()
  for (const note of notes) {
    note.fingerprint = await noteFingerprint({ title: note.title, blocks: note.blocks })
    note.importFingerprint = await importFingerprint(note)
    note.hasFiles = noteHasFiles(note)
    const before = importedBefore(note.importFingerprint)
    if (before && livePages.has(before)) {
      note.duplicate = { kind: 'imported-before', pageId: before }
    } else if (note.fingerprint && !note.hasFiles && byFingerprint.has(note.fingerprint)) {
      note.duplicate = { kind: 'in-dash', pageId: byFingerprint.get(note.fingerprint) }
    } else if (firstInImport.has(note.importFingerprint)) {
      note.duplicate = { kind: 'in-import', key: firstInImport.get(note.importFingerprint).key }
    } else {
      firstInImport.set(note.importFingerprint, note)
    }
    await breathe()
  }

  // Files nothing used: not a note, not a note's photo or file, and not the
  // file notes were read from (an .enex file or a backup)
  const accounted = new Set([...notes, ...skipped, ...failed].flatMap(item => [item.key, item.source?.path].filter(Boolean)))
  for (const note of notes) {
    for (const resource of note.resources || []) accounted.add(resource.key)
  }
  const unusedFiles = sourceFiles
    .filter(file => !accounted.has(file.path) && !/(^|\/)\.(obsidian|git|github|vscode|stfolder)(\/|$)/.test(file.path))
    .map(file => ({ path: file.path, container: file.container ?? null, reason: 'not-used' }))

  return {
    notes,
    skipped,
    failed,
    unusedFiles,
    assignedIds: new Set(ids.values()),
    folderTitle: uniqueFolderTitle(folderTitle, existingPages),
    existingTagNames: existingTags.map(tag => tag.name).filter(Boolean)
  }
}

/**
 * The notes a plan imports with the preview's choices, and everything it
 * leaves out, with tags worked out for just those notes.
 *
 * @param {object} plan - from scanImport
 * @param {{skipDuplicates?: boolean}} [choices]
 */
export function selectNotes (plan, { skipDuplicates = true } = {}) {
  const byKey = new Map(plan.notes.map(note => [note.key, note]))
  const importing = []
  const duplicates = []
  for (const note of plan.notes) {
    if (skipDuplicates && note.duplicate) duplicates.push(note)
    else importing.push(note)
  }
  const importedIds = new Set(importing.map(note => note.id))

  // Where links to a left-out duplicate should point instead
  const retarget = new Map()
  const tagsInto = new Map()
  for (const note of duplicates) {
    let target = note
    const seen = new Set()
    while (target?.duplicate?.kind === 'in-import' && !seen.has(target.key)) {
      seen.add(target.key)
      target = byKey.get(target.duplicate.key)
    }
    if (!target) continue
    const pageId = target.duplicate && target.duplicate.kind !== 'in-import' ? target.duplicate.pageId : target.id
    retarget.set(note.id, pageId)
    // A note found twice in the import keeps the tags of both copies
    if (importedIds.has(pageId)) {
      if (!tagsInto.has(pageId)) tagsInto.set(pageId, [])
      tagsInto.get(pageId).push(...note.tags)
    }
  }

  const tags = planTags(importing.flatMap(note => [...note.tags, ...(tagsInto.get(note.id) || [])]), plan.existingTagNames)
  const tagNamesFor = (note) => [...new Set([...note.tags, ...(tagsInto.get(note.id) || [])].map(tag => tags.names.get(tag)).filter(Boolean))]

  return { importing, duplicates, importedIds, retarget, tags, tagNamesFor }
}

const PAGE_LINK = /<a data-page-id="([^"]*)" class="page-link" href="#">([\s\S]*?)<\/a>/g
const RICH_FIELDS = Object.freeze({
  paragraph: ['text'],
  bulletListItem: ['text'],
  numberedListItem: ['text'],
  checklistItem: ['text'],
  callout: ['text'],
  toggle: ['summary', 'content'],
  image: ['caption']
})

/**
 * Blocks with their page links pointed at notes that will exist: a link to a
 * left-out duplicate points at the note it duplicates, and a link to a note
 * that isn't imported becomes plain text. Links this import didn't make are
 * left alone.
 */
export function finalizePageLinks (blocks, { assignedIds, importedIds, retarget }) {
  let changed = false
  const out = blocks.map(block => {
    const fields = RICH_FIELDS[block.type]
    if (!fields) return block
    let data = block.data
    for (const field of fields) {
      const html = data?.[field]
      if (typeof html !== 'string' || !html.includes('data-page-id')) continue
      const next = html.replace(PAGE_LINK, (link, id, inner) => {
        if (!assignedIds.has(id) || importedIds.has(id)) return link
        const target = retarget.get(id)
        return target ? `<a data-page-id="${target}" class="page-link" href="#">${inner}</a>` : inner
      })
      if (next !== html) {
        data = { ...data, [field]: next }
        changed = true
      }
    }
    return data === block.data ? block : { ...block, data }
  })
  return changed ? out : blocks
}

/**
 * What a selection holds, for the preview: counts, issues, samples, and what
 * its photos and files mean for sync.
 *
 * @param {object} plan
 * @param {object} selection - from selectNotes
 * @param {{syncEnabled?: boolean, usedBytes?: number, quotaBytes?: number, uploadsPerMinute?: number, headroom?: number}} [sync]
 */
export function summarizeSelection (plan, selection, { syncEnabled = false, usedBytes = 0, quotaBytes = 500 * 1024 * 1024, uploadsPerMinute = 5, headroom = 0.9 } = {}) {
  const issues = {}
  const resources = new Map()
  for (const note of selection.importing) {
    for (const [code, count] of Object.entries(note.issues || {})) {
      if (!issues[code]) issues[code] = { count: 0, notes: [] }
      issues[code].count += count
      if (issues[code].notes.length < ISSUE_NOTE_NAMES) issues[code].notes.push(note.title)
    }
    for (const resource of note.resources || []) {
      if (!resources.has(resource.key)) resources.set(resource.key, resource)
    }
  }

  const photos = [...resources.values()].filter(resource => isPhotoType(resource.mimeType))
  const files = [...resources.values()].filter(resource => !isPhotoType(resource.mimeType))
  const tooLargeFiles = files.filter(resource => resource.size > MAX_ATTACHMENT_BYTES)
  // Photos over the limit are made smaller to fit; files can't be
  const syncBytes = photos.reduce((sum, r) => sum + Math.min(r.size, MAX_ATTACHMENT_BYTES), 0) +
    files.filter(r => r.size <= MAX_ATTACHMENT_BYTES).reduce((sum, r) => sum + r.size, 0)
  const room = Math.max(0, quotaBytes * headroom - usedBytes)
  let fitting = 0
  let spent = 0
  for (const resource of [...photos, ...files.filter(r => r.size <= MAX_ATTACHMENT_BYTES)]) {
    const size = Math.min(resource.size, MAX_ATTACHMENT_BYTES)
    if (spent + size > room) break
    spent += size
    fitting++
  }
  const uploads = photos.length + files.length - tooLargeFiles.length

  const skippedReasons = {}
  for (const item of [...plan.skipped, ...plan.unusedFiles]) skippedReasons[item.reason] = (skippedReasons[item.reason] || 0) + 1
  for (const note of selection.duplicates) skippedReasons[note.duplicate.kind] = (skippedReasons[note.duplicate.kind] || 0) + 1

  return {
    folderTitle: plan.folderTitle,
    counts: {
      found: plan.notes.length + plan.skipped.length + plan.failed.length,
      importing: selection.importing.length,
      duplicates: selection.duplicates.length,
      skipped: plan.skipped.length,
      failed: plan.failed.length,
      unusedFiles: plan.unusedFiles.length,
      photos: photos.length,
      files: files.length
    },
    skippedReasons,
    issues,
    tags: { added: selection.tags.added, shortened: selection.tags.shortened },
    samples: selection.importing.slice(0, SAMPLE_COUNT).map(note => ({ title: note.title, snippet: snippet(note.blocks), tagNames: selection.tagNamesFor(note) })),
    storage: {
      resourceBytes: [...resources.values()].reduce((sum, r) => sum + r.size, 0),
      syncBytes,
      tooLargeFiles: tooLargeFiles.map(r => ({ name: r.name, size: r.size })),
      waitingForRoom: syncEnabled ? uploads - fitting : 0,
      syncMinutes: syncEnabled ? Math.ceil(Math.min(uploads, fitting) / Math.max(1, uploadsPerMinute)) : 0
    }
  }
}
