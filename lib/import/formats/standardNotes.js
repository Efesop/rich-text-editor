/**
 * Standard Notes backups, decrypted.
 *
 * A decrypted backup is JSON, { version, items }, downloaded as a zip holding
 * "Standard Notes Backup and Import File.txt" (older apps download that file
 * on its own). Notes, tags and files are items; tags point at their notes and
 * at their parent tag. Each note's type decides how its text reads: plain
 * text, Markdown, HTML, code, or a Lexical editor state for Super notes.
 *
 * Authenticator notes hold two-factor secrets and are left out unless the
 * person asks for them. Files themselves aren't in the backup.
 *
 * DOM-free so it runs under `node --test`.
 */

import { finishBlocks } from '../blocks.js'
import { noteDates, parseIsoDate } from '../dates.js'
import { htmlToDrafts, parseHtml } from '../htmlToBlocks.js'
import { runsText } from '../inline.js'
import { markdownToDrafts } from '../markdownToBlocks.js'
import { plainTextDrafts } from '../plainText.js'
import { dataUrlResource, isPhotoType } from '../resources.js'
import { cleanTitle } from '../titles.js'
import { lexicalToDrafts, parseLexicalState } from './lexical.js'

export class StandardNotesBackupError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'StandardNotesBackupError'
    this.code = code
  }
}

/**
 * The items of a decrypted backup.
 *
 * @throws {StandardNotesBackupError} 'encrypted-backup' or 'not-a-backup'
 */
export function parseBackup (text) {
  let backup
  try {
    backup = JSON.parse(text)
  } catch {
    throw new StandardNotesBackupError('not-a-backup', 'This file is not a Standard Notes backup')
  }
  if (!backup || typeof backup !== 'object' || !Array.isArray(backup.items)) {
    throw new StandardNotesBackupError('not-a-backup', 'This file is not a Standard Notes backup')
  }
  const readable = backup.items.filter(item => item && typeof item === 'object' && item.content_type !== 'SN|ItemsKey')
  if (readable.some(item => typeof item.content === 'string')) {
    throw new StandardNotesBackupError('encrypted-backup', 'This Standard Notes backup is encrypted')
  }
  return readable
}

function noteKind (content) {
  switch (content.noteType) {
    case 'super': return 'super'
    case 'markdown':
    case 'task': return 'markdown'
    case 'rich-text': return 'html'
    case 'code': return 'code'
    case 'spreadsheet': return 'spreadsheet'
    case 'authentication': return 'authenticator'
    case 'plain-text': return 'plain'
  }
  const editor = String(content.editorIdentifier || '')
  if (/super-editor/.test(editor)) return 'super'
  if (/token-vault|authenticator/.test(editor)) return 'authenticator'
  if (/markdown|task-editor/.test(editor)) return 'markdown'
  if (/plus-editor|bold-editor/.test(editor)) return 'html'
  if (/code-editor/.test(editor)) return 'code'
  if (/sheets/.test(editor)) return 'spreadsheet'
  return parseLexicalState(content.text) ? 'super' : 'plain'
}

function references (item, type) {
  return (Array.isArray(item?.content?.references) ? item.content.references : []).filter(ref => ref && (!type || ref.content_type === type || ref.reference_type === type))
}

function firstLine (drafts) {
  for (const draft of drafts) {
    const runs = draft.runs || draft.summaryRuns
    const line = runs ? runsText(runs).split('\n').find(part => part.trim()) : ''
    if (line) return line
  }
  return ''
}

/**
 * Import notes from a decrypted Standard Notes backup, one at a time. Notes
 * left out come back as { skipped: true } with the reason, and a note that
 * can't be converted as { failed: true }.
 *
 * @param {import('../source.js').SourceFile} file - the backup's JSON file
 * @param {{signal?: AbortSignal, newId?: () => string, pageRefFor?: (uuid: string) => string, includeAuthenticator?: boolean}} [options]
 */
export async function * standardNotesNotes (file, { signal, newId, pageRefFor = uuid => uuid, includeAuthenticator = false } = {}) {
  const items = parseBackup(await file.text())
  const live = items.filter(item => !item.deleted && item.content && typeof item.content === 'object')
  const notes = live.filter(item => item.content_type === 'Note')
  const notesById = new Map(notes.map(note => [note.uuid, note]))
  const filesById = new Map(live.filter(item => item.content_type === 'File').map(item => [item.uuid, item]))
  const tagsById = new Map(live.filter(item => item.content_type === 'Tag').map(item => [item.uuid, item]))

  const tagPath = (tag) => {
    const names = []
    const seen = new Set()
    for (let current = tag; current && !seen.has(current.uuid) && names.length < 20; current = tagsById.get(references(current, 'TagToParentTag')[0]?.uuid)) {
      seen.add(current.uuid)
      names.unshift(String(current.content.title || '').trim())
    }
    return names.filter(Boolean).join('/')
  }
  const tagsForNote = new Map()
  for (const tag of tagsById.values()) {
    const path = tagPath(tag)
    if (!path) continue
    for (const ref of references(tag, 'Note')) {
      if (!tagsForNote.has(ref.uuid)) tagsForNote.set(ref.uuid, [])
      tagsForNote.get(ref.uuid).push(path)
    }
  }
  const filesForNote = new Map()
  for (const attached of filesById.values()) {
    for (const ref of references(attached, 'FileToNote')) {
      if (!filesForNote.has(ref.uuid)) filesForNote.set(ref.uuid, [])
      filesForNote.get(ref.uuid).push(attached)
    }
  }
  const source = (label) => ({ path: file.path, container: file.container ?? null, label })

  for (const note of notes) {
    if (signal?.aborted) throw signal.reason ?? new Error('Import cancelled')
    const content = note.content
    const label = cleanTitle(content.title, { fallbackText: typeof content.text === 'string' ? content.text : '' })
    if (content.trashed) {
      yield { key: note.uuid, skipped: true, reason: 'in-trash', title: label, source: source(label) }
      continue
    }
    const kind = noteKind(content)
    if (kind === 'authenticator' && !includeAuthenticator) {
      yield { key: note.uuid, skipped: true, reason: 'authenticator', title: label, source: source(label) }
      continue
    }

    try {
      const issues = {}
      const report = (code, count = 1) => {
        issues[code] = (issues[code] || 0) + count
      }
      const add = (found) => {
        for (const [code, count] of Object.entries(found)) report(code, count)
      }
      const text = typeof content.text === 'string' ? content.text : ''
      const resources = []
      const bubbles = new Set()
      let drafts

      if (kind === 'super') {
        const state = parseLexicalState(text)
        if (state) {
          const converted = lexicalToDrafts(state, {
            noteLink: uuid => {
              bubbles.add(uuid)
              const target = notesById.get(uuid)
              return target ? { pageRef: pageRefFor(uuid), title: cleanTitle(target.content.title) } : null
            },
            fileName: uuid => filesById.get(uuid)?.content?.name || null,
            dataResource: (src, name) => {
              const resource = dataUrlResource(src, `${note.uuid}/inline-${resources.length + 1}`)
              if (!resource) return null
              if (name) resource.name = name
              resources.push(resource)
              return { key: resource.key, photo: isPhotoType(resource.mimeType) }
            }
          })
          drafts = converted.drafts
          add(converted.issues)
        } else {
          report('unreadable-super-note')
          drafts = [{ kind: 'code', code: text, language: 'json' }]
        }
      } else if (kind === 'markdown') {
        const converted = markdownToDrafts(text)
        drafts = converted.drafts
        add(converted.issues)
      } else if (kind === 'html') {
        const converted = htmlToDrafts(parseHtml(text))
        drafts = converted.drafts
        add(converted.issues)
      } else if (kind === 'code' || kind === 'spreadsheet' || kind === 'authenticator') {
        if (kind === 'spreadsheet') report('spreadsheet-kept-as-code')
        if (kind === 'authenticator') report('authenticator-secrets')
        drafts = [{ kind: 'code', code: text, language: kind === 'code' ? '' : 'json' }]
      } else {
        drafts = plainTextDrafts(text)
      }

      for (const attached of filesForNote.get(note.uuid) || []) {
        report('file-not-in-backup')
        drafts.push({ kind: 'paragraph', runs: [{ text: `[File not included in the backup: ${attached.content.name || 'file'}]`, i: true }] })
      }
      const linked = references(note, 'NoteToNote').map(ref => ref.uuid).filter(uuid => notesById.has(uuid) && !bubbles.has(uuid))
      if (linked.length > 0) {
        const runs = [{ text: 'Linked notes:', i: true }]
        linked.forEach((uuid, index) => {
          runs.push({ text: index === 0 ? ' ' : ', ' }, { text: cleanTitle(notesById.get(uuid).content.title), pageRef: pageRefFor(uuid) })
        })
        drafts.push({ kind: 'paragraph', runs })
      }

      const blocks = finishBlocks(drafts, { newId, report })
      const title = cleanTitle(content.title, { fallbackText: firstLine(drafts) })
      const clientUpdated = content.appData?.['org.standardnotes.sn']?.client_updated_at
      const dates = noteDates({
        created: parseIsoDate(note.created_at),
        updated: parseIsoDate(clientUpdated) ?? parseIsoDate(note.updated_at),
        fileTime: file.lastModified
      })
      yield {
        key: note.uuid,
        title,
        createdAt: dates.createdAt,
        lastEdited: dates.lastEdited,
        tags: tagsForNote.get(note.uuid) || [],
        blocks,
        issues,
        resources,
        source: source(title)
      }
    } catch (error) {
      yield { key: note.uuid, failed: true, title: label, reason: error?.message || String(error), source: source(label) }
    }
  }
}
