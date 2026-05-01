/**
 * Dash Sync — Attachment push/pull (Phase 2.6)
 *
 * Attachments (images, PDFs) are stored separately from page JSON via
 * lib/attachmentStorage.js. Each attachment has a unique opaque UUID
 * (no PII). The note's content references attachments by ID.
 *
 * Sync flow:
 *   - Push: when a note is saved that references an attachment we haven't
 *     uploaded yet, encrypt the bytes with the vault key and POST to
 *     /sync/attachment/:id. Server is content-addressed — uploading the
 *     same ID twice is a no-op (server returns 'already-exists' dedup).
 *   - Pull: when applying a note envelope that references an attachment ID
 *     not present locally, GET /sync/attachment/:id, decrypt, write to
 *     local store. Lazy: only fires for attachments referenced by the
 *     pulled note (avoids initial-sync mass download).
 *
 * Module is pure-ish — caller injects the local attachment store
 * (loadAttachment / saveAttachment) so this works for Electron (FS-backed)
 * and PWA (IndexedDB-backed) without coupling.
 */

import { encryptBytes, decryptBytes } from './syncCrypto.js'
import { buildSyncHeaders } from './syncAuth.js'
import { base64Encode, base64Decode } from './syncQueue.js'

// =============================================================================
// Push
// =============================================================================

/**
 * Push a single attachment to the relay.
 *
 * @param {Object} args
 * @param {string} args.attachmentId - UUID
 * @param {Uint8Array} args.bytes - plaintext attachment bytes
 * @param {string} [args.mimeTypeHint] - optional MIME hint (server treats
 *   as opaque; included for forensic/debug attribution only)
 * @param {Object} args.credentials - { vaultKeyBytes, vaultCryptoKey, vaultId, deviceId, relayUrl }
 * @param {(url:string, init:RequestInit) => Promise<Response>} [args.fetch]
 * @returns {Promise<{ok: boolean, dedupKey?: string, errorCode?: string}>}
 */
export async function pushAttachment ({
  attachmentId,
  bytes,
  mimeTypeHint = null,
  credentials,
  fetch: fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : null)
}) {
  if (typeof attachmentId !== 'string' || !attachmentId) {
    throw new Error('pushAttachment: attachmentId required')
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('pushAttachment: bytes must be Uint8Array')
  }
  if (!credentials || !credentials.vaultCryptoKey || !credentials.vaultKeyBytes) {
    throw new Error('pushAttachment: credentials required')
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('pushAttachment: fetch unavailable')
  }

  const { vaultKeyBytes, vaultCryptoKey, vaultId, deviceId, relayUrl } = credentials
  const encrypted = await encryptBytes(bytes, vaultCryptoKey)
  const ciphertextB64 = base64Encode(encrypted)

  const httpUrl = relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
  const path = `/sync/attachment/${encodeURIComponent(attachmentId)}`
  const headers = await buildSyncHeaders(vaultKeyBytes, {
    vaultId, deviceId, timestamp: Date.now(), method: 'POST', path,
    contentType: 'application/json'
  })

  let response
  try {
    response = await fetchFn(httpUrl + path, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ciphertext: ciphertextB64,
        originalSize: bytes.byteLength,
        mimeTypeHint
      })
    })
  } catch (err) {
    return { ok: false, errorCode: 'network', message: err.message }
  }

  if (!response.ok) {
    let body = null
    try { body = await response.json() } catch { /* not JSON */ }
    return {
      ok: false,
      status: response.status,
      errorCode: body?.error || classifyHttpStatus(response.status),
      message: body?.message
    }
  }

  let body
  try { body = await response.json() } catch (err) {
    return { ok: false, errorCode: 'invalid-response', message: err.message }
  }
  return { ok: true, dedupKey: body.dedupKey || null }
}

// =============================================================================
// Pull
// =============================================================================

/**
 * Pull a single attachment from the relay.
 *
 * @param {Object} args
 * @param {string} args.attachmentId - UUID
 * @param {Object} args.credentials
 * @param {(url:string, init:RequestInit) => Promise<Response>} [args.fetch]
 * @returns {Promise<{ok: boolean, bytes?: Uint8Array, errorCode?: string}>}
 */
export async function pullAttachment ({
  attachmentId,
  credentials,
  fetch: fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : null)
}) {
  if (typeof attachmentId !== 'string' || !attachmentId) {
    throw new Error('pullAttachment: attachmentId required')
  }
  if (!credentials || !credentials.vaultCryptoKey || !credentials.vaultKeyBytes) {
    throw new Error('pullAttachment: credentials required')
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('pullAttachment: fetch unavailable')
  }

  const { vaultKeyBytes, vaultCryptoKey, vaultId, deviceId, relayUrl } = credentials
  const httpUrl = relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
  const path = `/sync/attachment/${encodeURIComponent(attachmentId)}`
  const headers = await buildSyncHeaders(vaultKeyBytes, {
    vaultId, deviceId, timestamp: Date.now(), method: 'GET', path
  })

  let response
  try {
    response = await fetchFn(httpUrl + path, { method: 'GET', headers })
  } catch (err) {
    return { ok: false, errorCode: 'network', message: err.message }
  }

  if (!response.ok) {
    let body = null
    try { body = await response.json() } catch { /* not JSON */ }
    return {
      ok: false,
      status: response.status,
      errorCode: body?.error || classifyHttpStatus(response.status)
    }
  }

  let body
  try { body = await response.json() } catch (err) {
    return { ok: false, errorCode: 'invalid-response', message: err.message }
  }
  if (typeof body.ciphertext !== 'string') {
    return { ok: false, errorCode: 'invalid-response', message: 'ciphertext missing' }
  }
  let plaintext
  try {
    const blob = base64Decode(body.ciphertext)
    plaintext = await decryptBytes(blob, vaultCryptoKey)
  } catch (err) {
    return { ok: false, errorCode: 'decrypt-failed', message: err.message }
  }
  return { ok: true, bytes: plaintext }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract attachment IDs from a page's content blocks.
 *
 * @param {object} page - Dash page object
 * @returns {string[]} unique attachment IDs referenced in the content
 */
export function extractAttachmentIds (page) {
  if (!page || !page.content || !Array.isArray(page.content.blocks)) return []
  const ids = new Set()
  for (const block of page.content.blocks) {
    if (block.type === 'attachment' && block.data && typeof block.data.attachmentId === 'string') {
      ids.add(block.data.attachmentId)
    }
  }
  return Array.from(ids)
}

/**
 * Diff: which attachment IDs were ADDED between prev and next versions of
 * a page. Used to decide which attachments need pushing.
 *
 * @param {object|null} prevPage
 * @param {object} nextPage
 * @returns {string[]}
 */
export function newAttachmentIds (prevPage, nextPage) {
  const before = new Set(prevPage ? extractAttachmentIds(prevPage) : [])
  const after = extractAttachmentIds(nextPage)
  return after.filter(id => !before.has(id))
}

function classifyHttpStatus (status) {
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not-found'
  if (status === 410) return 'gone'
  if (status === 413) return 'too-large'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server-error'
  return 'unknown'
}
