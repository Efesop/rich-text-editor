/**
 * Pinned notes: which notes are pinned, and in what order.
 *
 * A pinned note carries `pinnedAt`, the time it was pinned. Unpinning removes
 * the field. The note pinned most recently comes first.
 *
 * DOM-free so it runs under `node --test`.
 */

/** Whether a note is pinned. Folders and notes in Trash never are. */
export function isPinned (page) {
  return Boolean(page && page.type !== 'folder' && !page.trashed && Number.isFinite(page.pinnedAt))
}

/** The pinned notes, most recently pinned first. */
export function pinnedNotes (pages) {
  return (Array.isArray(pages) ? pages : []).filter(isPinned).sort((a, b) => b.pinnedAt - a.pinnedAt)
}

/** The list with its pinned notes first, in pin order; the rest keep their order. */
export function withPinnedFirst (pages) {
  const list = Array.isArray(pages) ? pages : []
  return [...pinnedNotes(list), ...list.filter(page => !isPinned(page))]
}

/** A copy of the note, pinned at `now` or unpinned. */
export function setPinned (page, pinned, now = Date.now()) {
  if (!page) return page
  if (pinned) return { ...page, pinnedAt: now }
  const rest = { ...page }
  delete rest.pinnedAt
  return rest
}
