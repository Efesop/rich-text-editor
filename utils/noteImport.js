/**
 * The browser half of note imports (lib/import): the apps people import from,
 * reading what they pick, and decoding or re-encoding photos where an import
 * has to. Loaded only when the import dialog opens.
 */

import { openSources } from '@/lib/import/source'
import { detectExport, detectionMessage } from '@/lib/import/detect'
import { scanImport, selectNotes, summarizeSelection } from '@/lib/import/plan'
import { commitImport } from '@/lib/import/commit'
import { storeImportResource } from '@/lib/import/attachments'
import { createImportJournal, createImportRegistry, recoverImport } from '@/lib/import/journal'
import { enexNotes } from '@/lib/import/formats/enex'
import { notionNotes } from '@/lib/import/formats/notion'
import { markdownNotes } from '@/lib/import/formats/markdownVault'
import { standardNotesNotes } from '@/lib/import/formats/standardNotes'
import { getAttachmentIdKey } from '@/lib/attachmentIdKey'
import { attachmentBackend, deleteAttachment, loadAttachment, saveAttachment } from '@/lib/attachmentStorage'
import { sniffImageType } from '@/lib/attachmentRefs'

export { detectionMessage, selectNotes, summarizeSelection }

/** Where notes can come from, with how to make the export Dash reads. */
export const IMPORT_SOURCES = Object.freeze([
  {
    id: 'evernote',
    name: 'Evernote',
    format: 'evernote',
    accept: '.enex',
    folder: false,
    help: 'In Evernote, select a notebook or some notes, choose Export, and pick ENEX (.enex). Export each notebook to its own file to keep notebook names as tags.'
  },
  {
    id: 'notion',
    name: 'Notion',
    format: 'notion',
    accept: '.zip',
    folder: false,
    help: 'In Notion, open Settings, choose Export all workspace content (or Export on a page), pick HTML, and include subpages and files. Choose the zip, or every part of it.'
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    format: 'markdown',
    accept: '.zip,.md,.markdown,.txt',
    folder: true,
    help: 'Choose your vault folder, or a zip of it.'
  },
  {
    id: 'notesnook',
    name: 'Notesnook',
    format: 'markdown',
    accept: '.zip',
    folder: false,
    help: 'In Notesnook, open Settings, then Backup & export, choose Export all notes, and pick Markdown + Frontmatter. Choose the zip.'
  },
  {
    id: 'standard-notes',
    name: 'Standard Notes',
    format: 'standard-notes',
    accept: '.zip,.txt,.json',
    folder: false,
    help: 'In Standard Notes, open Preferences, then Backups, and download a decrypted backup. Choose the zip.'
  },
  {
    id: 'markdown',
    name: 'Markdown files',
    format: 'markdown',
    accept: '.zip,.md,.markdown,.txt',
    folder: true,
    help: 'Choose a folder of Markdown or text files, or a zip of it.'
  }
])

/** Photos and files can only be imported where attachments have real storage. */
export function canImportFiles () {
  return attachmentBackend() !== 'localStorage'
}

/** The files someone picked, with what export they are. */
export async function readPickedFiles (fileList, { signal } = {}) {
  const source = await openSources(Array.from(fileList || []), { signal })
  const detection = await detectExport(source.files)
  return { ...source, detection }
}

function notesReader (format, files, detection, options) {
  switch (format) {
    case 'evernote': {
      const exports = files.filter(file => /\.enex$/i.test(file.path))
      return (context) => (async function * () {
        for (const file of exports) yield * enexNotes(file, context)
      })()
    }
    case 'notion':
      return (context) => notionNotes(files, context)
    case 'markdown':
      return (context) => markdownNotes(files, context)
    case 'standard-notes':
      return (context) => standardNotesNotes(detection.backupFile, { ...context, includeAuthenticator: Boolean(options.includeAuthenticator) })
    default:
      throw new Error(`Dash can't import ${format} exports`)
  }
}

/**
 * Reads and converts every note in some picked files into a plan.
 *
 * @param {object} options
 * @param {object} options.picked - from readPickedFiles
 * @param {string} options.folderTitle
 * @param {Array} options.existingPages
 * @param {Array} options.existingTags
 * @param {boolean} [options.includeAuthenticator]
 * @param {(progress: object) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 */
export async function planImport ({ picked, folderTitle, existingPages, existingTags, includeAuthenticator = false, onProgress, signal }) {
  const registry = createImportRegistry()
  return scanImport({
    readNotes: notesReader(picked.detection.format, picked.files, picked.detection, { includeAuthenticator }),
    existingPages,
    existingTags,
    importedBefore: registry.lookupAll(),
    // Only folder-style exports have loose files worth accounting for
    sourceFiles: ['notion', 'markdown'].includes(picked.detection.format) ? picked.files : [],
    folderTitle,
    onProgress,
    signal
  })
}

// --- Photos ------------------------------------------------------------------

function decodeImage (bytes, mimeType) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'application/octet-stream' }))
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This photo cannot be decoded here'))
    }
    image.src = url
  })
}

function canvasBytes (canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) reject(new Error('The photo could not be encoded'))
      else blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject)
    }, type, quality)
  })
}

function drawn (image, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(image, 0, 0, width, height)
  return canvas
}

// Whether any pixel is see-through, checked on a small copy.
function hasTransparency (image) {
  const canvas = drawn(image, Math.min(64, image.naturalWidth), Math.min(64, image.naturalHeight))
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) return true
  }
  return false
}

/**
 * A copy of a photo small enough to store: the largest size that fits, as
 * JPEG at 0.92, or PNG when it has transparency. Browsers apply the photo's
 * orientation as they decode, so the copy stays upright. Null when it can't
 * be made to fit.
 */
export async function fitPhoto (bytes, maxBytes) {
  const image = await decodeImage(bytes, sniffImageType(bytes))
  const transparent = hasTransparency(image)
  const type = transparent ? 'image/png' : 'image/jpeg'
  let scale = Math.min(1, Math.sqrt(maxBytes / bytes.length) * 1.2)
  for (let step = 0; step < 12; step++) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const result = await canvasBytes(drawn(image, width, height), type, transparent ? undefined : 0.92)
    if (result.length <= maxBytes) return result
    scale *= 0.85
  }
  return null
}

/**
 * HEIC as JPEG at 0.95, or null where it can't be decoded. The Mac app asks
 * macOS; everywhere else the browser tries (iPhone and Safari can, Chrome
 * can't).
 */
export async function convertHeic (bytes) {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    try {
      const jpeg = await window.electron.invoke('convert-heic', bytes)
      return jpeg ? new Uint8Array(jpeg) : null
    } catch {
      return null
    }
  }
  try {
    const image = await decodeImage(bytes, 'image/heic')
    return await canvasBytes(drawn(image, image.naturalWidth, image.naturalHeight), 'image/jpeg', 0.95)
  } catch {
    return null
  }
}

// --- Committing --------------------------------------------------------------

/**
 * Commits a selection. The page manager supplies the steps that change notes.
 *
 * @param {object} plan
 * @param {object} selection
 * @param {{mergeImport: Function, discardImportAttachments: Function, addTags: (names: string[]) => void, format: string, onProgress?: Function, signal?: AbortSignal}} options
 */
// The journal lives in attachment storage, which a killed app doesn't lose
const importJournal = () => createImportJournal({ save: saveAttachment, load: loadAttachment, remove: deleteAttachment })

export async function runImport (plan, selection, { mergeImport, discardImportAttachments, readPages, addTags, format, onProgress, signal }) {
  const journal = importJournal()
  const registry = createImportRegistry()
  const report = await commitImport(plan, selection, {
    storeResource: (request) => storeImportResource(request, {
      keyBytes: getAttachmentIdKey(),
      storage: { save: saveAttachment, load: loadAttachment },
      convertHeic,
      fitPhoto
    }),
    journal,
    mergeAndSave: mergeImport,
    discardAttachments: discardImportAttachments,
    addTags,
    recordImported: (pairs) => registry.record(pairs),
    recordHistory: (entry) => registry.addHistory(entry),
    format,
    savedPageIds: readPages ? async () => new Set(((await readPages()) || []).map(page => page?.id)) : undefined,
    onProgress,
    signal
  })
  return report
}

/** Puts right an import the app stopped in the middle of. */
export async function recoverInterruptedImport ({ readPages, discardImportAttachments }) {
  return recoverImport({
    journal: importJournal(),
    savedPageIds: async () => new Set(((await readPages()) || []).map(page => page?.id)),
    discardAttachments: discardImportAttachments,
    recordHistory: (entry) => createImportRegistry().addHistoryIfMissing(entry)
  })
}

export function importHistory () {
  return createImportRegistry().history()
}

export function markImportUndone (importId) {
  createImportRegistry().updateHistory(importId, { undoneAt: Date.now() })
}
