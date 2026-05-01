/**
 * Dash Sync — Change Detection
 *
 * Given a "before" and "after" snapshot of the pages array, compute which
 * resources changed. Used by the save pipeline to enqueue only what actually
 * changed (avoids re-pushing unchanged pages on every save).
 *
 * Pure logic — no React, no IO, no globals. Fully testable.
 */

/**
 * @typedef {Object} ChangeSet
 * @property {Map<string, object>} notesUpserted - pageId → page object (full)
 * @property {Set<string>} notesDeleted - pageIds removed since "before"
 * @property {boolean} manifestChanged - folders / sort order / structure changed
 * @property {Map<string, object>} foldersUpserted - folderId → folder object
 * @property {Set<string>} foldersDeleted - folderIds removed
 */

/**
 * Compute changes between two pages arrays.
 *
 * Heuristic: compare each page by its ID. If a new page appears, it's an
 * upsert. If an existing page changes (different content/title/tags/folderId),
 * upsert. If a page disappears, delete (caller decides whether to issue a
 * tombstone — sync code does so; the local-only delete path skips this).
 *
 * @param {object[]} before - previous pages array (from last successful sync push or initial load)
 * @param {object[]} after - current pages array (just-saved state)
 * @returns {ChangeSet}
 */
export function diffPages (before, after) {
  if (!Array.isArray(before)) before = []
  if (!Array.isArray(after)) after = []

  const beforeMap = new Map(before.map(p => [p.id, p]))
  const afterMap = new Map(after.map(p => [p.id, p]))

  const notesUpserted = new Map()
  const notesDeleted = new Set()
  const foldersUpserted = new Map()
  const foldersDeleted = new Set()
  let manifestChanged = false

  // Iterate "after" — find new / changed items.
  for (const [id, current] of afterMap) {
    const prev = beforeMap.get(id)
    if (current.type === 'folder') {
      if (!prev || !pagesShallowEqual(prev, current)) {
        foldersUpserted.set(id, current)
        manifestChanged = true
      }
      continue
    }
    // Note (non-folder)
    if (!prev) {
      notesUpserted.set(id, current)
    } else if (!pagesShallowEqual(prev, current)) {
      notesUpserted.set(id, current)
    }
  }

  // Iterate "before" — find deletions.
  for (const [id, prev] of beforeMap) {
    if (!afterMap.has(id)) {
      if (prev.type === 'folder') {
        foldersDeleted.add(id)
        manifestChanged = true
      } else {
        notesDeleted.add(id)
      }
    }
  }

  // Sort-order or root-list reordering also counts as manifestChanged.
  // Detect: same set of IDs but different order at the root level.
  if (!manifestChanged) {
    const beforeRootOrder = before
      .filter(p => !p.folderId)
      .map(p => p.id)
      .join(',')
    const afterRootOrder = after
      .filter(p => !p.folderId)
      .map(p => p.id)
      .join(',')
    if (beforeRootOrder !== afterRootOrder) manifestChanged = true
  }

  return { notesUpserted, notesDeleted, foldersUpserted, foldersDeleted, manifestChanged }
}

/**
 * Compare two pages for sync-relevant equality. Two pages are "equal" iff
 * their persisted state matches. Excludes purely transient/derived fields.
 *
 * Compared fields:
 *   - title
 *   - content / encryptedContent / appLockEncrypted (whichever path)
 *   - tagNames
 *   - folderId
 *   - selfDestructAt
 *   - password (presence + hash)
 *   - emoji (folders)
 *   - pages[] (folders — the membership list)
 *
 * Excluded:
 *   - createdAt (immutable)
 *   - lastEdited (transient)
 *   - id (already matched)
 *   - any private React refs
 */
function pagesShallowEqual (a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.type !== b.type) return false

  if (a.type === 'folder') {
    if (a.title !== b.title) return false
    if (a.emoji !== b.emoji) return false
    return arrayShallowEqual(a.pages || [], b.pages || [])
  }

  // Note path
  if (a.title !== b.title) return false
  if (a.folderId !== b.folderId) return false
  if (a.selfDestructAt !== b.selfDestructAt) return false
  if (Boolean(a.password?.hash) !== Boolean(b.password?.hash)) return false
  if ((a.password?.hash || null) !== (b.password?.hash || null)) return false
  if (Boolean(a.appLockEncrypted) !== Boolean(b.appLockEncrypted)) return false
  if (!arrayShallowEqual(a.tagNames || [], b.tagNames || [])) return false
  // Phase 2.5: soft-delete flag changes count as a sync-relevant edit so
  // trashing/restoring propagates to other devices via the normal upsert path.
  if (Boolean(a.trashed) !== Boolean(b.trashed)) return false
  if ((a.trashedAt || null) !== (b.trashedAt || null)) return false

  // Content path: either content (plaintext) OR encryptedContent
  const aHasEncrypted = a.encryptedContent && typeof a.encryptedContent === 'object' && a.encryptedContent.data
  const bHasEncrypted = b.encryptedContent && typeof b.encryptedContent === 'object' && b.encryptedContent.data
  if (aHasEncrypted !== bHasEncrypted) return false

  if (aHasEncrypted) {
    // Compare encryptedContent's IV + data fingerprint. If any byte differs, changed.
    return shallowJsonEqual(a.encryptedContent, b.encryptedContent)
  }

  return shallowJsonEqual(a.content, b.content)
}

function arrayShallowEqual (a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function shallowJsonEqual (a, b) {
  if (a === b) return true
  if (!a || !b) return a === b
  // Cheap: stringify with stable key ordering. Pages content is small (usually
  // <50KB) so stringify cost is negligible compared to network IO downstream.
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Snapshot a pages array for later diffing. Currently just JSON.stringify
 * round-trip for deep clone; could be optimized to per-page hashes.
 *
 * @param {object[]} pages
 * @returns {object[]} deep-cloned snapshot
 */
export function snapshotPages (pages) {
  if (!Array.isArray(pages)) return []
  return JSON.parse(JSON.stringify(pages))
}

/**
 * Build a manifest envelope summarizing folder structure, sort order, and
 * tag-rename map. Pushed when manifestChanged=true.
 *
 * @param {object[]} pages
 * @param {object[]} tags - global tags array
 * @returns {object} manifest envelope payload
 */
export function buildManifestPayload (pages, tags) {
  if (!Array.isArray(pages)) pages = []
  if (!Array.isArray(tags)) tags = []
  const folders = pages
    .filter(p => p.type === 'folder')
    .map(f => ({
      id: f.id,
      title: f.title,
      emoji: f.emoji || null,
      pages: Array.isArray(f.pages) ? [...f.pages] : []
    }))
  const rootOrder = pages
    .filter(p => !p.folderId)
    .map(p => p.id)
  const tagMap = tags.map(t => ({
    name: t.name,
    color: t.color || null
  }))
  return { folders, rootOrder, tagMap, generatedAt: Date.now() }
}
