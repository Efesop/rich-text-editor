/**
 * Which note to open when the open note goes away: moved to Trash, deleted,
 * self-destructed, removed by a sync pull or by undoing an import, or when
 * decoy notes stand in for the real ones.
 *
 * setCurrentPage(null) does nothing, so a caller that gets null clears the
 * open note instead. Notes with a password are passed over unless they were
 * unlocked this session: setCurrentPage asks for the password and, until it
 * is given, leaves the note that went away open, where edits go nowhere.
 *
 * DOM-free so it runs under `node --test`.
 */

/**
 * The first note in `items` that opens without asking for a password, or null.
 *
 * @param {object[]} items - notes and folders, in stored order
 * @param {object} [options]
 * @param {string|null} [options.excludeId] - the note going away, when `items` still holds it
 * @param {Set<string>} [options.unlockedIds] - notes with a password that are unlocked this session
 * @returns {object|null}
 */
export function nextNoteToOpen (items, { excludeId = null, unlockedIds = new Set() } = {}) {
  if (!Array.isArray(items)) return null
  return items.find(item =>
    Boolean(item?.id) &&
    item.type !== 'folder' &&
    !item.trashed &&
    item.id !== excludeId &&
    (!item.password || unlockedIds.has(item.id))
  ) || null
}
