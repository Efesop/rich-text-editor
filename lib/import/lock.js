/**
 * One import at a time, and nothing that rewrites the note list while one
 * runs: sync pulls, photo migration and locking the app wait for it to end.
 *
 * DOM-free so it runs under `node --test`.
 */

let active = null
const waiting = new Set()

/** Starts an import. Returns the function that ends it. */
export function beginImport (label = 'import') {
  if (active) throw new Error('Another import is already running')
  const token = { label, since: Date.now() }
  active = token
  return () => {
    if (active !== token) return
    active = null
    for (const callback of [...waiting]) {
      waiting.delete(callback)
      try {
        callback()
      } catch (error) {
        console.error('An action waiting for an import to end failed', error)
      }
    }
  }
}

export function importInProgress () {
  return active !== null
}

/**
 * Runs a callback now, or once the running import ends. The same callback
 * waiting twice runs once.
 */
export function whenImportEnds (callback) {
  if (!active) {
    callback()
    return
  }
  waiting.add(callback)
}
