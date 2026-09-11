/**
 * Object URLs for attachment-backed photos.
 *
 * A photo shown in several places shares one object URL, counted per use.
 * Once nothing shows it the URL stays cached, until unused photos add up to
 * more than `maxBytes`; then the least recently used are revoked first.
 */

export class AttachmentNotOnDeviceError extends Error {
  constructor (attachmentId) {
    super('This photo is not on this device yet')
    this.name = 'AttachmentNotOnDeviceError'
    this.attachmentId = attachmentId
  }
}

/**
 * @param {object} deps
 * @param {(id: string) => Promise<ArrayBuffer|Uint8Array|null>} deps.load
 * @param {(bytes: Uint8Array, mimeType: string) => string} deps.createUrl
 * @param {(url: string) => void} deps.revokeUrl
 * @param {number} [deps.maxBytes] - unused photos kept before the oldest are revoked
 */
export function createObjectUrlCache ({ load, createUrl, revokeUrl, maxBytes = 64 * 1024 * 1024 }) {
  // id -> { url, bytes, refs, lastUsed, pending }
  const entries = new Map()
  let clock = 0

  function trim () {
    const unused = [...entries.entries()]
      .filter(([, entry]) => entry.refs === 0 && entry.url)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    let unusedBytes = unused.reduce((sum, [, entry]) => sum + entry.bytes, 0)
    for (const [id, entry] of unused) {
      if (unusedBytes <= maxBytes) break
      revokeUrl(entry.url)
      entries.delete(id)
      unusedBytes -= entry.bytes
    }
  }

  /** An object URL for the photo. Call release(id) once for every acquire, even one that fails. */
  function acquire (id, mimeType = 'application/octet-stream') {
    let entry = entries.get(id)
    if (entry) {
      entry.refs++
      entry.lastUsed = ++clock
      return entry.url ? Promise.resolve(entry.url) : entry.pending
    }
    entry = { url: null, bytes: 0, refs: 1, lastUsed: ++clock, pending: null }
    entries.set(id, entry)
    entry.pending = (async () => {
      let data
      try {
        data = await load(id)
      } catch (err) {
        if (entries.get(id) === entry) entries.delete(id)
        throw err
      }
      if (entries.get(id) !== entry || !data) {
        if (entries.get(id) === entry) entries.delete(id)
        throw new AttachmentNotOnDeviceError(id)
      }
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      entry.url = createUrl(bytes, mimeType)
      entry.bytes = bytes.byteLength
      entry.pending = null
      if (entry.refs === 0) trim()
      return entry.url
    })()
    return entry.pending
  }

  function release (id) {
    const entry = entries.get(id)
    if (!entry || entry.refs === 0) return
    entry.refs--
    if (entry.refs === 0) trim()
  }

  /** Drop a photo from the cache now, in use or not. */
  function forget (id) {
    const entry = entries.get(id)
    if (!entry) return
    if (entry.url) revokeUrl(entry.url)
    entries.delete(id)
  }

  /** Revoke everything, for when the app locks. */
  function clear () {
    for (const id of [...entries.keys()]) forget(id)
  }

  function stats () {
    let cachedBytes = 0
    let inUse = 0
    for (const entry of entries.values()) {
      cachedBytes += entry.bytes
      if (entry.refs > 0) inUse++
    }
    return { entries: entries.size, inUse, cachedBytes }
  }

  return { acquire, release, forget, clear, stats }
}
