/**
 * Rebase a sync pull onto the pages as they are now.
 *
 * applyPulledChanges (lib/syncPull.js) works on a snapshot of the pages taken
 * when the pull started, and awaits version-history writes along the way.
 * Anything that changed locally in the meantime — a keystroke, a new page, an
 * import — is missing from its `newPages`, so writing `newPages` back would
 * silently drop it. This takes only what the pull decided about the
 * resources it touched, and applies that to the latest pages instead.
 */

/**
 * @param {object} args
 * @param {Array} args.base - the snapshot applyPulledChanges was given
 * @param {Array} args.pulled - its `newPages`
 * @param {string[]} args.changedIds - its `applied` and `deleted` ids
 * @param {Array} args.latest - the pages right now
 * @returns {{ pages: Array, keptLocal: string[] }} `keptLocal` lists pages
 *   whose local change during the pull was kept over the pulled version
 */
export function rebasePulledPages ({ base = [], pulled = [], changedIds = [], latest = [] } = {}) {
  const baseById = new Map(base.filter(Boolean).map(p => [p.id, p]))
  const pulledById = new Map(pulled.filter(Boolean).map(p => [p.id, p]))
  const changed = new Set(changedIds)
  const keptLocal = []

  const pages = latest.map(page => {
    if (!page || !changed.has(page.id)) return page
    const incoming = pulledById.get(page.id)
    if (!incoming) return page
    // Untouched locally since the pull started: the pull's decision stands.
    if (page === baseById.get(page.id)) return incoming
    const merged = mergeConcurrent(page, incoming)
    if (merged !== incoming) keptLocal.push(page.id)
    return merged
  })

  // Pages the pull created. One that was in the snapshot but is gone now was
  // deleted locally during the pull, and stays deleted.
  const present = new Set(latest.filter(Boolean).map(p => p.id))
  for (const id of changed) {
    if (present.has(id) || baseById.has(id)) continue
    const incoming = pulledById.get(id)
    if (incoming) pages.push(incoming)
  }

  return { pages, keptLocal }
}

/**
 * A page changed both locally (during the pull) and by the pull. Mirrors the
 * rules applyPulledChanges uses, but nothing local is thrown away.
 */
function mergeConcurrent (local, incoming) {
  if (local.type === 'folder' && incoming.type === 'folder') {
    const incomingPages = Array.isArray(incoming.pages) ? incoming.pages : []
    const incomingSet = new Set(incomingPages)
    const localOnly = (Array.isArray(local.pages) ? local.pages : []).filter(id => !incomingSet.has(id))
    return localOnly.length > 0 ? { ...incoming, pages: [...incomingPages, ...localOnly] } : incoming
  }

  // A peer's delete still applies, and the local content survives inside the
  // trashed page, where Restore brings it back.
  if (incoming.trashed && !local.trashed) {
    return { ...local, trashed: true, trashedAt: incoming.trashedAt, trashedBy: incoming.trashedBy ?? null }
  }

  // Trash is sticky unless the writer explicitly restored the page.
  if (local.trashed && !incoming.trashed) {
    const trashedAt = typeof local.trashedAt === 'number' ? local.trashedAt : 0
    const restoredAt = typeof incoming.restoredAt === 'number' ? incoming.restoredAt : 0
    return restoredAt > trashedAt ? incoming : local
  }

  const localTs = typeof local.lastEdited === 'number' ? local.lastEdited : 0
  const incomingTs = typeof incoming.lastEdited === 'number' ? incoming.lastEdited : 0
  return localTs >= incomingTs ? local : incoming
}
