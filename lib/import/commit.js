/**
 * Committing an import: photos and files stored and read back, notes built
 * and checked, then merged into the note list in one step and saved, all under
 * a journal so an interrupted import can be put right on the next launch.
 *
 * Everything that touches storage or app state is passed in, so the order of
 * operations and every failure path can be tested under Node.
 *
 * DOM-free so it runs under `node --test`.
 */

import { buildImageBlockData } from '../imageAttachments.js'
import { sanitizeEditorContent, validatePageStructure } from '../../utils/securityUtils.js'
import { editorContent } from './blocks.js'
import { runsToHtml } from './inline.js'
import { finalizePageLinks } from './plan.js'
import { discardCreated } from './journal.js'

const JOURNAL_FLUSH_EVERY = 20

/** True when two JSON-like values hold the same data, whatever their key order. */
export function sameData (a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a).filter(key => a[key] !== undefined)
  const keysB = Object.keys(b).filter(key => b[key] !== undefined)
  return keysA.length === keysB.length && keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameData(a[key], b[key]))
}

const RESOURCE_PROBLEMS = Object.freeze({
  'too-large': 'too large to sync',
  unreadable: "it couldn't be read",
  'not-saved': "it couldn't be saved on this device"
})

function missingResourceBlock (block, resource, code) {
  const what = block.type === 'image' ? 'Photo' : 'File'
  const text = runsToHtml([{ text: `[${what} not imported: ${resource?.name || 'unnamed'}, ${RESOURCE_PROBLEMS[code] || "it couldn't be stored"}]`, i: true }])
  const caption = typeof block.data?.caption === 'string' ? block.data.caption : ''
  return { id: block.id, type: 'paragraph', data: { text: caption ? `${text}<br>${caption}` : text } }
}

function abortError (signal) {
  return signal?.reason ?? new DOMException('Import cancelled', 'AbortError')
}

// For the bookkeeping around the notes going in: its failure must not fail the import
function attempt (fn) {
  try {
    const result = fn()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch { /* best effort */ }
}

/**
 * Commits a selection from a plan.
 *
 * @param {object} plan - from scanImport
 * @param {object} selection - from selectNotes
 * @param {object} deps
 * @param {(request: {resource: object, as: 'photo'|'file'}) => Promise<{kind: 'photo'|'file', attachmentId: string, data: object, notices?: string[]}>} deps.storeResource
 * @param {{write: (record: object) => Promise<void>, clear: (importId: string) => Promise<void>}} deps.journal
 * @param {(changes: {pages: object[], folder: object}) => Promise<void>} deps.mergeAndSave - adds the notes and folder, saves, and confirms; undoes its own change when it throws
 * @param {(ids: string[]) => Promise<void>} deps.discardAttachments - removes attachments this import stored that nothing uses
 * @param {(names: string[]) => void} [deps.addTags]
 * @param {(pairs: Array<[string, string]>) => void} [deps.recordImported]
 * @param {() => string} [deps.newId]
 * @param {() => number} [deps.now]
 * @param {(progress: {phase: string, done: number, total: number}) => void} [deps.onProgress]
 * @param {AbortSignal} [deps.signal] - honoured until the notes are being saved
 * @param {() => Promise<Set<string>>} [deps.savedPageIds] - ids in storage, checked before taking files back after a failed save
 * @param {(entry: object) => void} [deps.recordHistory] - adds the import to Recent imports
 * @param {string|null} [deps.format] - the source, for Recent imports
 */
export async function commitImport (plan, selection, deps) {
  const {
    storeResource, journal, mergeAndSave, discardAttachments, savedPageIds,
    addTags = () => {}, recordImported = () => {}, recordHistory = () => {}, format = null,
    newId = () => crypto.randomUUID(), now = () => Date.now(), onProgress, signal
  } = deps
  const importId = newId()
  const folderId = newId()
  const startedAt = now()
  const record = { importId, folderId, startedAt, state: 'storing', pageIds: selection.importing.map(note => note.id), createdIds: [] }
  await journal.write(record)
  const created = new Set()
  // Each file is announced before it is written, so an import that stops
  // between two journal writes still knows every file it wrote
  let pendingIds = []
  const beforeSave = async (attachmentId) => {
    if (created.has(attachmentId) || pendingIds.includes(attachmentId)) return
    pendingIds = [...pendingIds, attachmentId]
    await journal.writePending(importId, pendingIds)
  }

  const stored = new Map()
  const resourceReport = { stored: 0, failed: [], notices: {} }
  let merged = false
  let unflushed = 0

  try {
    // Photos and files
    const total = selection.importing.length
    let done = 0
    for (const note of selection.importing) {
      if (signal?.aborted) throw abortError(signal)
      const resources = new Map((note.resources || []).map(resource => [resource.key, resource]))
      for (const block of note.blocks) {
        const key = block.data?.importResource
        if (!key) continue
        const as = block.type === 'image' ? 'photo' : 'file'
        const cacheKey = `${as}:${key}`
        if (stored.has(cacheKey)) continue
        if (signal?.aborted) throw abortError(signal)
        const resource = resources.get(key)
        try {
          if (!resource) throw Object.assign(new Error('missing'), { code: 'unreadable' })
          const result = await storeResource({ resource, as, beforeSave })
          stored.set(cacheKey, result)
          resourceReport.stored++
          for (const notice of result.notices || []) {
            if (!resourceReport.notices[notice]) resourceReport.notices[notice] = []
            resourceReport.notices[notice].push(resource.name)
          }
          // Only files this import created are taken back if it stops: a file
          // stored before belongs to notes already in Dash
          if (result.created && !created.has(result.attachmentId)) {
            created.add(result.attachmentId)
            record.createdIds.push(result.attachmentId)
            if (++unflushed >= JOURNAL_FLUSH_EVERY) {
              await journal.write(record)
              // A file whose storing failed stays announced until the import ends
              pendingIds = pendingIds.filter(id => !created.has(id))
              await journal.writePending(importId, pendingIds)
              unflushed = 0
            }
          }
        } catch (error) {
          if (signal?.aborted) throw abortError(signal)
          const code = error?.code || 'unreadable'
          stored.set(cacheKey, { error: code })
          resourceReport.failed.push({ name: resource?.name || key, note: note.title, reason: code })
        }
      }
      onProgress?.({ phase: 'files', done: ++done, total })
    }
    if (signal?.aborted) throw abortError(signal)
    record.state = 'saving'
    await journal.write(record)

    // Notes
    const pages = []
    const failedNotes = []
    for (const note of selection.importing) {
      const resources = new Map((note.resources || []).map(resource => [resource.key, resource]))
      let blocks = note.blocks.map(block => {
        const key = block.data?.importResource
        if (!key) return block
        const as = block.type === 'image' ? 'photo' : 'file'
        const result = stored.get(`${as}:${key}`)
        if (!result || result.error) return missingResourceBlock(block, resources.get(key), result?.error)
        if (result.kind === 'photo') {
          return { id: block.id, type: 'image', data: buildImageBlockData({ ...result.data, caption: block.data.caption || '' }) }
        }
        return { id: block.id, type: 'attachment', data: result.data }
      })
      blocks = finalizePageLinks(blocks, { assignedIds: plan.assignedIds, importedIds: selection.importedIds, retarget: selection.retarget })
      const lastEdited = note.lastEdited ?? startedAt
      const page = {
        id: note.id,
        title: note.title,
        content: editorContent(blocks, lastEdited),
        tags: [],
        tagNames: selection.tagNamesFor(note),
        createdAt: note.createdAt ?? new Date(lastEdited).toISOString(),
        password: null,
        folderId,
        lastEdited
      }
      // What is written must be exactly what Dash keeps when it loads the note
      const validation = validatePageStructure(page)
      if (!validation.isValid || !sameData(sanitizeEditorContent(page.content), page.content) ||
          page.content.blocks.some(block => block.data?.importResource)) {
        failedNotes.push({ key: note.key, title: note.title, reason: 'unexpected-content', source: note.source })
        continue
      }
      pages.push(page)
    }

    const folder = { id: folderId, title: plan.folderTitle, type: 'folder', pages: pages.map(page => page.id), createdAt: new Date(startedAt).toISOString() }
    record.pageIds = folder.pages
    record.history = { folderTitle: plan.folderTitle, format, at: now(), counts: { imported: pages.length, failed: plan.failed.length + failedNotes.length } }
    await journal.write(record)

    // Remembered before the notes go in: an entry whose note never landed is
    // ignored, while one written after could be lost if the app stops
    const imported = new Set(folder.pages)
    attempt(() => recordImported(selection.importing.filter(note => imported.has(note.id)).map(note => [note.importFingerprint, note.id])))

    onProgress?.({ phase: 'saving', done: 0, total: pages.length })
    merged = true
    await mergeAndSave({ pages, folder })

    // The notes are in: nothing from here on may fail the import. The journal
    // stays, marked done, so the next launch can restore the Recent imports
    // entry if the app stops before that write lasts.
    attempt(() => addTags(selection.tags.added))
    attempt(() => recordHistory({ ...record.history, importId, folderId, pageIds: folder.pages }))
    record.state = 'done'
    await journal.write(record).catch(() => {})

    return {
      importId,
      folderId,
      folderTitle: plan.folderTitle,
      pageIds: folder.pages,
      notes: {
        imported: pages.length,
        duplicates: selection.duplicates.map(note => ({ title: note.title, kind: note.duplicate.kind, source: note.source })),
        skipped: plan.skipped.map(item => ({ title: item.title, reason: item.reason, source: item.source })),
        failed: [...plan.failed.map(item => ({ title: item.title, reason: item.reason, source: item.source })), ...failedNotes]
      },
      resources: resourceReport,
      unusedFiles: plan.unusedFiles
    }
  } catch (error) {
    if (merged) error.importMergeFailed = true
    // mergeAndSave takes its notes back out before it throws. If storage has
    // them anyway, their files stay and the journal lets the next launch decide.
    let landed = false
    if (merged && savedPageIds) {
      try {
        const saved = await savedPageIds()
        landed = record.pageIds.some(id => saved.has(id))
      } catch {
        landed = true
      }
    }
    if (!landed) {
      // Take back the files this import created; the journal stays until they are gone
      const remaining = await discardCreated([...record.createdIds, ...pendingIds.filter(id => !created.has(id))], discardAttachments)
      try {
        if (remaining.length === 0) {
          await journal.clear(importId)
        } else {
          await journal.write({ ...record, state: 'discarding', createdIds: remaining })
          await journal.writePending(importId, [])
        }
      } catch { /* the journal as last written still lists them */ }
    }
    throw error
  }
}
