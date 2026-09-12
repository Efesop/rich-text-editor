/**
 * Which notes a list in the app shows.
 *
 * A note in Trash keeps its place in its folder (the folder's `pages` and the
 * note's `folderId`), so Restore puts it back where it was. Until then it
 * belongs only in the Trash modal, and every list that shows or opens notes
 * leaves it out.
 *
 * DOM-free, so it runs under `node --test`.
 */

/** Whether a note is in Trash. */
export function isInTrash (page) {
  return page?.trashed === true
}

/** The notes outside Trash, folders left out, in their current order. */
export function notesOutsideTrash (pages) {
  return (Array.isArray(pages) ? pages : []).filter(page => page && page.type !== 'folder' && !isInTrash(page))
}

/**
 * The ids of the notes a folder lists, in the folder's order: notes that
 * exist and aren't in Trash.
 */
export function folderNoteIds (pages, folderId) {
  const list = Array.isArray(pages) ? pages : []
  const folder = list.find(page => page?.id === folderId && page.type === 'folder')
  if (!folder || !Array.isArray(folder.pages)) return []
  const shown = new Set(notesOutsideTrash(list).map(page => page.id))
  return folder.pages.filter(id => shown.has(id))
}
