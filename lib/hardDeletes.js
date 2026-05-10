/**
 * Hard-delete tombstone tracking.
 *
 * When a page is PERMANENTLY deleted on this device, we record the id +
 * timestamp here so a subsequent sync pull can't reinsert it. Common
 * resurrection scenario:
 *   1. Mac permanentlyDelete page X → push tombstone envelope (v=42)
 *   2. iPhone has X open in editor, autosaves moments after Mac's push
 *      → server stores iPhone's alive envelope (v=43)
 *   3. Mac pulls (or doorbell), sees envelope v=43 for id X. Mac has
 *      no local copy (hard-deleted) → applyPulledChanges falls into
 *      `if (!existing)` branch → INSERTS X as new. Page reappears.
 *
 * Without server-side tombstone enforcement (a deeper change), this set
 * is the client-side defense: applyPulledChanges checks isHardDeleted()
 * before inserting brand-new pages and drops the envelope if matched.
 *
 * Storage: localStorage (works in Electron renderer + Capacitor WebView
 * + browser with no extra IPC). The id list is small (a few KB at most)
 * and not sensitive — IDs are random UUIDs. TTL: 30 days, mirroring
 * trash retention. Sweep on each load.
 */

const KEY = 'dash-hard-deletes'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function safeParse (raw) {
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  } catch {
    return {}
  }
}

function safeWrite (obj) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch (err) {
    console.warn('[hardDeletes] persist failed', err)
  }
}

/**
 * Read the current hard-delete map { id: timestamp }. Sweeps expired
 * entries and writes the trimmed result back if anything was pruned.
 */
export function loadHardDeletes () {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(KEY)
  if (!raw) return {}
  const map = safeParse(raw)
  const now = Date.now()
  let pruned = false
  for (const id of Object.keys(map)) {
    const ts = map[id]
    if (typeof ts !== 'number' || now - ts > TTL_MS) {
      delete map[id]
      pruned = true
    }
  }
  if (pruned) safeWrite(map)
  return map
}

/**
 * Record that resourceId was permanently deleted just now. No-op if the
 * id is already present (preserves the original timestamp so the TTL
 * countdown is from first delete, not re-confirmation).
 */
export function recordHardDelete (resourceId) {
  if (!resourceId || typeof resourceId !== 'string') return
  const map = loadHardDeletes()
  if (map[resourceId]) return
  map[resourceId] = Date.now()
  safeWrite(map)
}

/**
 * Remove an id from the tombstone set. Used when the user explicitly
 * undoes a delete (currently no UI for that, but reserved).
 */
export function clearHardDelete (resourceId) {
  if (!resourceId) return
  const map = loadHardDeletes()
  if (!map[resourceId]) return
  delete map[resourceId]
  safeWrite(map)
}

/**
 * Build the predicate `applyPulledChanges` expects. Captures a
 * snapshot at call time — caller refreshes the snapshot per pull, not
 * per envelope, so we don't hit localStorage in a tight loop.
 */
export function makeIsHardDeleted () {
  const map = loadHardDeletes()
  return (id) => Object.prototype.hasOwnProperty.call(map, id)
}
