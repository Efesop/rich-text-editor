/**
 * What kind of export some files are, read from their names and first bytes.
 *
 * People pick where their notes come from first; detection checks the files
 * are that export, and when they are some other export, says what to make
 * instead. Nothing here reads a file in full.
 *
 * DOM-free so it runs under `node --test`.
 */

import { decodeText } from './source.js'
import { extension } from './paths.js'

export const IMPORT_FORMATS = Object.freeze(['evernote', 'notion', 'markdown', 'standard-notes'])

const NOTION_NAME = /\s[0-9a-f]{32}\.(html?|md|csv)$/i

export const DETECTION_MESSAGES = Object.freeze({
  'notion-markdown': "This is Notion's Markdown export, which leaves out links between pages and some formatting. In Notion, open Settings, choose Export, pick HTML with subpages included, then choose that zip here.",
  'standard-notes-encrypted': 'This Standard Notes backup is encrypted. In Standard Notes, open Preferences, then Backups, and download a decrypted backup instead.',
  'notesnook-backup': "This is a Notesnook backup, which Dash can't read. In Notesnook, export your notes as Markdown and choose that zip here.",
  'evernote-html': "This is Evernote's HTML export. In Evernote, export your notes as ENEX (.enex) instead.",
  'unsupported-app': "Dash can't import notes from this app yet.",
  'nothing-found': 'No notes were found in these files.'
})

const FORMAT_NAMES = Object.freeze({ evernote: 'Evernote', notion: 'Notion', markdown: 'Markdown', 'standard-notes': 'Standard Notes' })

async function headText (file, bytes) {
  try {
    return decodeText(await file.head(bytes))
  } catch {
    return ''
  }
}

/**
 * The export these files are.
 *
 * @param {import('./source.js').SourceFile[]} files
 * @returns {Promise<{format: string|null, problem: string|null, noteFiles: number, flavour?: string, backupFile?: object}>}
 *   format is one of IMPORT_FORMATS, or null with a problem code from DETECTION_MESSAGES
 */
export async function detectExport (files) {
  const byExtension = (...extensions) => files.filter(file => extensions.includes(extension(file.path)))

  // Standard Notes: a JSON backup, usually named for what it is
  const jsonCandidates = byExtension('txt', 'json')
    .sort((a, b) => Number(/Backup and Import File/i.test(b.name)) - Number(/Backup and Import File/i.test(a.name)))
    .slice(0, 3)
  for (const file of jsonCandidates) {
    const head = await headText(file, 8192)
    if (!/^\s*\{/.test(head) || !/"items"\s*:/.test(head)) continue
    if (/"content"\s*:\s*"00\d:/.test(head) || /Encrypted Backup/i.test(file.name)) {
      return { format: null, problem: 'standard-notes-encrypted', noteFiles: 0 }
    }
    if (/"content_type"\s*:/.test(head) || /Backup and Import File/i.test(file.name)) {
      return { format: 'standard-notes', problem: null, noteFiles: 1, backupFile: file }
    }
  }

  if (byExtension('nnbackup').length > 0) return { format: null, problem: 'notesnook-backup', noteFiles: 0 }

  const enex = byExtension('enex')
  if (enex.length > 0) return { format: 'evernote', problem: null, noteFiles: enex.length }

  const html = byExtension('html', 'htm')
  const notionHtml = html.filter(file => NOTION_NAME.test(file.name))
  if (notionHtml.length > 0) {
    const head = await headText(notionHtml[0], 256 * 1024)
    if (/<article[^>]*class="page\b/i.test(head) || /notion/i.test(head)) {
      return { format: 'notion', problem: null, noteFiles: notionHtml.length }
    }
  }

  const markdown = byExtension('md', 'markdown')
  const notionMarkdown = markdown.filter(file => NOTION_NAME.test(file.name))
  if (notionMarkdown.length > 0 && notionMarkdown.length * 2 >= markdown.length) {
    return { format: null, problem: 'notion-markdown', noteFiles: 0 }
  }

  if (html.length > 0 && markdown.length === 0) {
    const head = await headText(html[0], 8192)
    if (/evernote/i.test(head)) return { format: null, problem: 'evernote-html', noteFiles: 0 }
  }

  if (markdown.length > 0) {
    const flavour = files.some(file => file.path.split('/').includes('.obsidian')) ? 'obsidian' : 'markdown'
    return { format: 'markdown', problem: null, noteFiles: markdown.length + byExtension('txt').length, flavour }
  }
  if (byExtension('txt').length > 0) return { format: 'markdown', problem: null, noteFiles: byExtension('txt').length, flavour: 'text' }

  if (byExtension('bear2bk', 'textbundle', 'one', 'onepkg').length > 0) return { format: null, problem: 'unsupported-app', noteFiles: 0 }
  return { format: null, problem: 'nothing-found', noteFiles: 0 }
}

/**
 * What to tell someone whose files don't match the app they picked, or null
 * when they do.
 */
export function detectionMessage (chosen, detection) {
  if (detection.problem) return DETECTION_MESSAGES[detection.problem]
  if (detection.format === chosen) return null
  // Markdown folders come from many apps, and Notesnook exports Markdown
  if (chosen === 'notesnook' && detection.format === 'markdown') return null
  const expected = FORMAT_NAMES[chosen] || 'that app'
  return `These files look like a ${FORMAT_NAMES[detection.format]} export, not ${expected}. Choose ${FORMAT_NAMES[detection.format]} instead, or pick the ${expected} export.`
}
