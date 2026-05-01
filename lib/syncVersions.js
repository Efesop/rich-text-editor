/**
 * Dash Sync — Server-side version history (Phase 2.8)
 *
 * Each push of a note to the relay creates a new immutable version
 * (latest 30 retained per note — older auto-evicted). Clients can list
 * + fetch these for cross-device version history.
 *
 * Server already exposes:
 *   GET /sync/note/:noteId/versions          → list of { version, uploadedAt, authorDeviceId, size }
 *   GET /sync/note/:noteId/version/:version  → ciphertext blob to decrypt
 *
 * This module is the client wrapper: builds auth headers, decrypts the
 * fetched ciphertext, returns plaintext payload + metadata.
 *
 * UX: VersionHistoryModal shows local versions (existing) PLUS server
 * versions (new). Restore from server fetches the version + creates a
 * new local edit (latest-wins propagation, same as restore-from-local).
 */

import { decryptEnvelope } from './syncCrypto.js'
import { buildSyncHeaders } from './syncAuth.js'
import { base64Decode } from './syncQueue.js'
import { DecryptionError } from '../utils/cryptoUtils.js'

// =============================================================================
// fetchVersionList — list all server-stored versions of a note
// =============================================================================

/**
 * @param {Object} args
 * @param {string} args.noteId
 * @param {Object} args.credentials - { vaultKeyBytes, vaultCryptoKey, vaultId, deviceId, relayUrl }
 * @param {(url:string, init:RequestInit) => Promise<Response>} [args.fetch]
 * @returns {Promise<{ok: boolean, versions?: Array<{version:number, uploadedAt:number, authorDeviceId:string, size:number}>, errorCode?: string}>}
 */
export async function fetchVersionList ({
  noteId,
  credentials,
  fetch: fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : null)
}) {
  if (typeof noteId !== 'string' || !noteId) {
    throw new Error('fetchVersionList: noteId required')
  }
  if (!credentials) throw new Error('fetchVersionList: credentials required')
  if (typeof fetchFn !== 'function') throw new Error('fetchVersionList: fetch unavailable')

  const { vaultKeyBytes, vaultId, deviceId, relayUrl } = credentials
  const httpUrl = relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
  const path = `/sync/note/${encodeURIComponent(noteId)}/versions`
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
  return { ok: true, versions: Array.isArray(body.versions) ? body.versions : [] }
}

// =============================================================================
// fetchVersion — fetch a specific historical version
// =============================================================================

/**
 * Fetch the ciphertext for a specific server version + decrypt + return
 * the plaintext payload (the page object as it was at that version).
 *
 * @param {Object} args
 * @param {string} args.noteId
 * @param {number} args.version
 * @param {Object} args.credentials
 * @param {(url:string, init:RequestInit) => Promise<Response>} [args.fetch]
 * @returns {Promise<{ok: boolean, payload?: object, uploadedAt?: number, authorDeviceId?: string, errorCode?: string}>}
 */
export async function fetchVersion ({
  noteId,
  version,
  credentials,
  fetch: fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : null)
}) {
  if (typeof noteId !== 'string' || !noteId) {
    throw new Error('fetchVersion: noteId required')
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('fetchVersion: version must be a positive integer')
  }
  if (!credentials) throw new Error('fetchVersion: credentials required')
  if (typeof fetchFn !== 'function') throw new Error('fetchVersion: fetch unavailable')

  const { vaultKeyBytes, vaultCryptoKey, vaultId, deviceId, relayUrl } = credentials
  if (!vaultCryptoKey) throw new Error('fetchVersion: vaultCryptoKey required')

  const httpUrl = relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
  const path = `/sync/note/${encodeURIComponent(noteId)}/version/${encodeURIComponent(String(version))}`
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

  try {
    const wireBytes = base64Decode(body.ciphertext)
    const wireStr = new TextDecoder().decode(wireBytes)
    const encryptedEnvelope = JSON.parse(wireStr)
    const inner = await decryptEnvelope(encryptedEnvelope, vaultCryptoKey)
    if (!inner || typeof inner !== 'object' || !('payload' in inner)) {
      throw new DecryptionError('fetchVersion: decrypted plaintext malformed')
    }
    return {
      ok: true,
      payload: inner.payload,
      uploadedAt: body.uploadedAt,
      authorDeviceId: body.authorDeviceId,
      payloadTimestamp: inner.timestamp
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: err instanceof DecryptionError ? 'decrypt-failed' : 'unexpected',
      message: err.message
    }
  }
}

function classifyHttpStatus (status) {
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not-found'
  if (status === 410) return 'gone'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server-error'
  return 'unknown'
}
