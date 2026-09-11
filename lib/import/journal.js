/**
 * The import journal, kept in attachment storage, and the import registry,
 * kept in localStorage.
 *
 * The journal is written before an import stores its first file and marked
 * done once its notes are saved. On the next launch recoverImport works out
 * whether the notes landed. If they did, it restores the import's Recent
 * imports entry should that write not have lasted; if they didn't, it removes
 * the files the import created.
 *
 * The registry remembers which note each imported note became, so importing
 * the same export again skips what is already here, and it keeps a short
 * history of imports for their reports and undo.
 *
 * DOM-free so it runs under `node --test`.
 */

const REGISTRY_KEY = 'dash:import:registry'
const HISTORY_KEY = 'dash:import:history'
const MAX_REGISTRY_ENTRIES = 100000
const MAX_HISTORY = 10

function readJson (storage, key, fallback) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson (storage, key, value) {
  storage.setItem(key, JSON.stringify(value))
}

function isQuotaError (error) {
  return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014
}

// localStorage holds a few megabytes for the whole app. Writes `value`,
// shrinking it with `shrink` while it doesn't fit; returns whether it was written.
function writeFitting (storage, key, value, shrink) {
  let current = value
  for (let attempt = 0; attempt < 40 && current != null; attempt++) {
    try {
      writeJson(storage, key, current)
      return true
    } catch (error) {
      if (!isQuotaError(error)) return false
      current = shrink(current)
    }
  }
  return false
}

/** The journal's ids in attachment storage: its record, and the files announced since the record was last written */
export const IMPORT_JOURNAL_ID = '00000000-0000-0000-0000-00696d706f72'
export const IMPORT_JOURNAL_PENDING_ID = '00000000-0000-0000-0000-00696d706f73'

function asBytes (value) {
  if (!value) return null
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

/**
 * The journal lives in attachment storage (files on the Mac, IndexedDB on
 * iPhone) rather than localStorage: the desktop app loses the last seconds of
 * localStorage writes when it is killed, and with them the list of files to
 * take back.
 *
 * @param {{save: (id: string, buffer: ArrayBuffer) => Promise<unknown>, load: (id: string) => Promise<ArrayBuffer|Uint8Array|null>, remove: (id: string) => Promise<unknown>}} storage
 */
export function createImportJournal (storage) {
  const readEntry = async (id) => {
    const bytes = asBytes(await storage.load(id))
    if (!bytes) return null
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return null
    }
  }
  const writeEntry = (id, value) => storage.save(id, new TextEncoder().encode(JSON.stringify(value)).buffer)
  return {
    /** The record, with the files announced since it was last written counted in */
    read: async () => {
      const record = await readEntry(IMPORT_JOURNAL_ID)
      if (!record) return null
      const pending = await readEntry(IMPORT_JOURNAL_PENDING_ID)
      if (pending?.importId !== record.importId || !Array.isArray(pending.ids)) return record
      const known = new Set(record.createdIds || [])
      return { ...record, createdIds: [...(record.createdIds || []), ...pending.ids.filter(id => !known.has(id))] }
    },
    write: (record) => writeEntry(IMPORT_JOURNAL_ID, record),
    /** Small enough to write before every file: only the files since the record was last written */
    writePending: (importId, ids) => writeEntry(IMPORT_JOURNAL_PENDING_ID, { importId, ids }),
    clear: async (importId) => {
      const current = await readEntry(IMPORT_JOURNAL_ID)
      if (current && importId && current.importId !== importId) return
      await storage.remove(IMPORT_JOURNAL_PENDING_ID)
      await storage.remove(IMPORT_JOURNAL_ID)
    }
  }
}

/**
 * Removes the files an import created, returning the ids still stored.
 *
 * @param {string[]} ids
 * @param {(ids: string[]) => Promise<{remaining: string[]}>} discardAttachments
 * @returns {Promise<string[]>}
 */
export async function discardCreated (ids, discardAttachments) {
  const candidates = Array.isArray(ids) ? ids : []
  if (candidates.length === 0) return []
  try {
    const result = await discardAttachments(candidates)
    return Array.isArray(result?.remaining) ? result.remaining : candidates
  } catch {
    return candidates
  }
}

/**
 * Finishes off an import the app stopped in the middle of. If its notes
 * landed, it adds the import to Recent imports in case the app stopped before
 * that. If they didn't, it removes the files the import created, and keeps
 * the journal until every one of them is gone.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createImportJournal>} deps.journal
 * @param {() => Promise<Set<string>>} deps.savedPageIds - the ids of the notes in storage
 * @param {(ids: string[]) => Promise<{remaining: string[]}>} deps.discardAttachments - removes the ones nothing uses, and says which are still stored
 * @param {(entry: object) => void} [deps.recordHistory] - adds an entry to Recent imports unless it is there already
 * @returns {Promise<{outcome: 'none'|'completed'|'rolled-back'|'pending', record?: object}>}
 */
export async function recoverImport ({ journal, savedPageIds, discardAttachments, recordHistory = () => {} }) {
  const record = await journal.read()
  if (!record) return { outcome: 'none' }
  const finish = async () => {
    if (record.history) {
      try {
        recordHistory({ ...record.history, importId: record.importId, folderId: record.folderId, pageIds: record.pageIds })
      } catch { /* the notes are in; only their Recent imports entry is missing */ }
    }
    await journal.clear(record.importId)
    return { outcome: 'completed', record }
  }
  // A finished import is never taken back, whatever happened to its notes since
  if (record.state === 'done') return finish()
  const saved = await savedPageIds()
  if ((record.pageIds || []).some(id => saved.has(id))) return finish()
  const remaining = await discardCreated(record.createdIds, discardAttachments)
  if (remaining.length > 0) {
    await journal.write({ ...record, state: 'discarding', createdIds: remaining })
    await journal.writePending(record.importId, [])
    return { outcome: 'pending', record }
  }
  await journal.clear(record.importId)
  return { outcome: 'rolled-back', record }
}

export function createImportRegistry (storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  return {
    /** The note an earlier import made from a note with this fingerprint. */
    lookup (fingerprint) {
      return readJson(storage, REGISTRY_KEY, {})[fingerprint] || null
    },
    lookupAll () {
      const entries = readJson(storage, REGISTRY_KEY, {})
      return (fingerprint) => entries[fingerprint] || null
    },
    record (pairs) {
      const entries = readJson(storage, REGISTRY_KEY, {})
      for (const [fingerprint, pageId] of pairs) {
        delete entries[fingerprint]
        entries[fingerprint] = pageId
      }
      const keys = Object.keys(entries)
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_REGISTRY_ENTRIES))) delete entries[key]
      // When it doesn't fit, the oldest half is forgotten
      return writeFitting(storage, REGISTRY_KEY, entries, current => {
        const names = Object.keys(current)
        if (names.length <= 1) return null
        return Object.fromEntries(names.slice(Math.floor(names.length / 2)).map(name => [name, current[name]]))
      })
    },
    history: () => readJson(storage, HISTORY_KEY, []),
    addHistory (entry) {
      const list = [entry, ...readJson(storage, HISTORY_KEY, []).filter(item => item.importId !== entry.importId)].slice(0, MAX_HISTORY)
      // When it doesn't fit, older entries give up their note lists first
      // (undo then goes by the folder), then the oldest entries go
      return writeFitting(storage, HISTORY_KEY, list, current => {
        for (let index = current.length - 1; index > 0; index--) {
          if (current[index].pageIds) return current.map((item, i) => (i === index ? { ...item, pageIds: undefined } : item))
        }
        return current.length > 1 ? current.slice(0, -1) : null
      })
    },
    /** Adds the entry unless Recent imports has it already, undone or not. */
    addHistoryIfMissing (entry) {
      if (readJson(storage, HISTORY_KEY, []).some(item => item.importId === entry.importId)) return true
      return this.addHistory(entry)
    },
    updateHistory (importId, changes) {
      writeJson(storage, HISTORY_KEY, readJson(storage, HISTORY_KEY, []).map(item => (item.importId === importId ? { ...item, ...changes } : item)))
    }
  }
}
