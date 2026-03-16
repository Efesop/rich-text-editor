/**
 * Auto-Sync — Encrypted blob push/pull for async note sharing
 *
 * Host: encrypts note content → pushes to relay blob store
 * Guest: polls for updates → decrypts → updates local read-only copy
 *
 * All data is E2E encrypted with AES-256-GCM. The relay only stores opaque bytes.
 */

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || 'https://dash-relay.efesop.deno.net'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Import a base64url key string as a CryptoKey
 * @param {string} keyStr - base64url-encoded 32 bytes
 * @returns {Promise<CryptoKey>}
 */
async function importKey (keyStr) {
  const b64 = keyStr.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
  const raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt note content for blob storage
 * @param {object} content - Editor.js content object
 * @param {string} title - Note title
 * @param {CryptoKey} key
 * @returns {Promise<Uint8Array>} encrypted bytes (iv + ciphertext)
 */
async function encryptBlob (content, title, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const payload = JSON.stringify({ title, content, updatedAt: Date.now() })
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(payload)
  )
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), 12)
  return result
}

/**
 * Decrypt blob from storage
 * @param {ArrayBuffer} data - encrypted bytes
 * @param {CryptoKey} key
 * @returns {Promise<{ title: string, content: object, updatedAt: number }>}
 */
async function decryptBlob (data, key) {
  const bytes = new Uint8Array(data)
  const iv = bytes.slice(0, 12)
  const ciphertext = bytes.slice(12)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(textDecoder.decode(plaintext))
}

/**
 * Push encrypted note snapshot to the relay
 * Called by host whenever the note is saved locally
 *
 * @param {string} docId - Document identifier (random UUID)
 * @param {object} content - Editor.js content
 * @param {string} title - Note title
 * @param {string} keyStr - base64url encryption key
 * @returns {Promise<boolean>} success
 */
export async function pushSnapshot (docId, content, title, keyStr) {
  try {
    const key = await importKey(keyStr)
    const encrypted = await encryptBlob(content, title, key)

    const res = await fetch(`${RELAY_URL}/blob/${docId}`, {
      method: 'PUT',
      body: encrypted,
      headers: { 'Content-Type': 'application/octet-stream' },
    })

    return res.ok
  } catch (err) {
    console.error('[AutoSync] Push failed:', err)
    return false
  }
}

/**
 * Pull latest encrypted note snapshot from the relay
 * Called by guest to check for updates
 *
 * @param {string} docId - Document identifier
 * @param {string} keyStr - base64url encryption key
 * @returns {Promise<{ title: string, content: object, updatedAt: number } | null>}
 */
export async function pullSnapshot (docId, keyStr) {
  try {
    const res = await fetch(`${RELAY_URL}/blob/${docId}`)
    if (!res.ok) return null

    const data = await res.arrayBuffer()
    const key = await importKey(keyStr)
    return await decryptBlob(data, key)
  } catch (err) {
    console.error('[AutoSync] Pull failed:', err)
    return null
  }
}

/**
 * Submit an edit request (guest → host)
 * The payload is encrypted so the server can't read it
 *
 * @param {string} docId - Document identifier
 * @param {string} keyStr - encryption key
 * @param {string} guestAlias - random alias of the requesting guest
 * @returns {Promise<string | null>} request ID if successful
 */
export async function submitEditRequest (docId, keyStr, guestAlias) {
  try {
    const key = await importKey(keyStr)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const payload = JSON.stringify({
      type: 'edit-request',
      alias: guestAlias,
      timestamp: Date.now(),
    })
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      textEncoder.encode(payload)
    )
    // Encode as base64 for JSON transport
    const ivB64 = btoa(String.fromCharCode(...iv))
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))

    const res = await fetch(`${RELAY_URL}/request/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedPayload: { iv: ivB64, data: ctB64 },
      }),
    })

    if (!res.ok) return null
    const result = await res.json()
    return result.requestId
  } catch (err) {
    console.error('[AutoSync] Edit request failed:', err)
    return null
  }
}

/**
 * Poll for pending edit requests (host polls)
 *
 * @param {string} docId - Document identifier
 * @param {string} keyStr - encryption key
 * @returns {Promise<Array<{ id: string, alias: string, timestamp: number }>>}
 */
export async function pollEditRequests (docId, keyStr) {
  try {
    const res = await fetch(`${RELAY_URL}/request/${docId}`)
    if (!res.ok) return []

    const { requests } = await res.json()
    const key = await importKey(keyStr)
    const decrypted = []

    for (const req of requests) {
      try {
        const { iv: ivB64, data: ctB64 } = req.encryptedPayload
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0))
        const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0))
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          ct
        )
        const payload = JSON.parse(textDecoder.decode(plaintext))
        decrypted.push({ id: req.id, ...payload })
      } catch {
        // Skip requests that can't be decrypted (wrong key or corrupted)
      }
    }

    return decrypted
  } catch (err) {
    console.error('[AutoSync] Poll failed:', err)
    return []
  }
}

/**
 * Dismiss an edit request
 * @param {string} docId
 * @param {string} requestId
 * @returns {Promise<boolean>}
 */
export async function dismissEditRequest (docId, requestId) {
  try {
    const res = await fetch(`${RELAY_URL}/request/${docId}/${requestId}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Create an auto-sync poller for a subscribed note
 * Checks for updates at a regular interval
 *
 * @param {object} options
 * @param {string} options.docId
 * @param {string} options.keyStr
 * @param {number} [options.intervalMs=30000] - Poll interval (default 30s)
 * @param {(snapshot: { title: string, content: object, updatedAt: number }) => void} options.onUpdate
 * @returns {{ stop: () => void, checkNow: () => Promise<void> }}
 */
export function createSyncPoller ({ docId, keyStr, intervalMs = 30000, onUpdate }) {
  let timer = null
  let lastUpdatedAt = 0
  let stopped = false

  async function check () {
    if (stopped) return
    const snapshot = await pullSnapshot(docId, keyStr)
    if (snapshot && snapshot.updatedAt > lastUpdatedAt) {
      lastUpdatedAt = snapshot.updatedAt
      onUpdate(snapshot)
    }
  }

  function start () {
    check()
    timer = setInterval(check, intervalMs)
  }

  function stop () {
    stopped = true
    if (timer) clearInterval(timer)
  }

  start()

  return { stop, checkNow: check }
}
