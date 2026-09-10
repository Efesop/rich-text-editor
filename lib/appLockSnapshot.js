/**
 * Encrypt the pages for app lock without losing a change made while the
 * encryption runs.
 *
 * Encrypting awaits once per page. Anything that replaces the page list in
 * the meantime — a sync pull, an import — would be overwritten by a result
 * built from the older list. So: save the list, encrypt it, check it is still
 * the current list, and start again if it isn't.
 *
 * @param {object} args
 * @param {() => Array} args.read - returns the current page list
 * @param {(pages: Array) => Promise<void>} args.save - persists a plaintext list
 * @param {(page: object) => Promise<object>} args.encryptPage
 * @param {number} [args.maxAttempts]
 * @returns {Promise<{ stable: boolean, pages: Array|null, attempts: number }>}
 *   `pages` is null when the list kept changing; leave memory untouched then.
 */
export async function encryptPagesUntilStable ({ read, save, encryptPage, maxAttempts = 5 }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const snapshot = read()
    await save(snapshot)
    const encrypted = []
    for (const page of snapshot) {
      encrypted.push(await encryptPage(page))
    }
    if (read() === snapshot) {
      return { stable: true, pages: encrypted, attempts: attempt }
    }
  }
  return { stable: false, pages: null, attempts: maxAttempts }
}
