/**
 * Move attachments and version history out of localStorage into IndexedDB.
 *
 * lib/attachmentStorage.js and lib/versionStorage.js used to lack the
 * Capacitor check lib/storage.js has, so the iOS app kept both in
 * localStorage, which iOS purges under storage pressure. Now that they use
 * IndexedDB there, whatever is still in localStorage moves across. An entry
 * leaves localStorage only once its IndexedDB copy reads back intact, and
 * nothing that disagrees with an existing IndexedDB copy is ever removed.
 */

export const LEGACY_ATTACHMENT_PREFIX = 'attachment-'
export const LEGACY_VERSIONS_PREFIX = 'dash-versions-'

function legacyKeys (storage, prefix) {
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key)
  }
  return keys
}

export function base64ToBytes (base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toBytes (value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function sameBytes (a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * @param {object} args
 * @param {Storage} args.storage - localStorage
 * @param {{ loadAttachment: Function, saveAttachment: Function }} args.idb
 * @returns {Promise<{ moved: number, kept: number }>} kept entries stay in
 *   localStorage and are tried again next launch
 */
export async function migrateLegacyAttachments ({ storage, idb }) {
  const result = { moved: 0, kept: 0 }
  for (const key of legacyKeys(storage, LEGACY_ATTACHMENT_PREFIX)) {
    const id = key.slice(LEGACY_ATTACHMENT_PREFIX.length)
    try {
      const raw = storage.getItem(key)
      if (typeof raw !== 'string') continue
      const legacy = base64ToBytes(raw)
      let stored = toBytes(await idb.loadAttachment(id))
      if (!stored) {
        await idb.saveAttachment(id, legacy.buffer)
        stored = toBytes(await idb.loadAttachment(id))
      }
      if (!sameBytes(stored, legacy)) {
        // The copy didn't land, or IndexedDB holds different bytes under the
        // same id. Either way, keep what localStorage has.
        result.kept++
        continue
      }
      storage.removeItem(key)
      result.moved++
    } catch (err) {
      result.kept++
    }
  }
  return result
}

/**
 * Version snapshots are merged rather than replaced, because IndexedDB may
 * already hold snapshots captured after the fix.
 *
 * @param {object} args
 * @param {Storage} args.storage - localStorage
 * @param {{ readVersions: Function, saveVersions: Function }} args.idb
 * @param {number} args.maxVersions - the history length captureVersion keeps
 */
export async function migrateLegacyVersions ({ storage, idb, maxVersions }) {
  const result = { moved: 0, kept: 0 }
  for (const key of legacyKeys(storage, LEGACY_VERSIONS_PREFIX)) {
    const pageId = key.slice(LEGACY_VERSIONS_PREFIX.length)
    try {
      const legacy = JSON.parse(storage.getItem(key) || '[]')
      if (!Array.isArray(legacy)) {
        result.kept++
        continue
      }
      const current = await idb.readVersions(pageId)
      const merged = mergeVersionSnapshots(Array.isArray(current) ? current : [], legacy, maxVersions)
      const saved = await idb.saveVersions(pageId, merged)
      const readBack = await idb.readVersions(pageId)
      if (saved?.success === false || JSON.stringify(readBack) !== JSON.stringify(merged)) {
        result.kept++
        continue
      }
      storage.removeItem(key)
      result.moved++
    } catch (err) {
      result.kept++
    }
  }
  return result
}

/** Newest first, one per timestamp and content hash, capped at maxVersions. */
export function mergeVersionSnapshots (a, b, maxVersions) {
  const seen = new Set()
  const unique = []
  for (const snapshot of [...a, ...b]) {
    if (!snapshot || typeof snapshot.timestamp !== 'string') continue
    const identity = `${snapshot.timestamp}|${snapshot.contentHash}`
    if (seen.has(identity)) continue
    seen.add(identity)
    unique.push(snapshot)
  }
  unique.sort((x, y) => (x.timestamp < y.timestamp ? 1 : x.timestamp > y.timestamp ? -1 : 0))
  return unique.slice(0, maxVersions)
}
