/**
 * Dash Sync — Auth Proofs
 *
 * Every sync request to the relay carries an HMAC auth proof:
 *
 *   X-Vault-Id: <vaultId>
 *   X-Device-Id: <deviceId>
 *   X-Timestamp: <unix-ms>
 *   X-Auth: <hex HMAC>
 *
 * The HMAC is computed with a sub-key derived from the vault key (HKDF info
 * "dash-sync:auth:v1"). The server CANNOT verify the HMAC's correctness
 * (it doesn't have the vault key) — that's by design. The HMAC functions as a
 * session token bound to {vault, device, timestamp, method, path}.
 *
 * Server uses the HMAC for replay protection only:
 *   1. Reject if X-Timestamp is more than 5 minutes off server clock.
 *   2. Reject if X-Auth matches a previously seen value for this device
 *      (stored in KV under a 5-minute TTL).
 *   3. Otherwise accept and store the HMAC as nonce.
 *
 * Possession of a valid vault key + device ID = access. There's no separate
 * password or token because the vault key IS the credential. This matches the
 * E2E threat model: the server can never read note content even with full
 * access to KV.
 *
 * See plan: /Users/ollie/.claude/plans/q1-one-vault-q2-crispy-book.md
 *           ("Server Protocol — Auth")
 */

import { hmacSha256, bytesToHex } from '../utils/cryptoUtils.js'
import { deriveAuthKey } from './syncCrypto.js'

/**
 * Generate the auth proof for a single sync request.
 *
 * @param {Uint8Array} vaultKeyBytes - raw 32 bytes
 * @param {object} args
 * @param {string} args.vaultId - vault UUID
 * @param {string} args.deviceId - this device's ID within the vault
 * @param {number} args.timestamp - unix ms (Date.now())
 * @param {string} args.method - HTTP method ("GET", "POST", "DELETE", "WS")
 * @param {string} args.path - URL path (e.g. "/sync/push")
 * @returns {Promise<string>} hex-encoded HMAC tag
 */
export async function generateAuthProof (vaultKeyBytes, { vaultId, deviceId, timestamp, method, path }) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('generateAuthProof: vaultKeyBytes must be 32-byte Uint8Array')
  }
  if (typeof vaultId !== 'string' || vaultId.length === 0) {
    throw new Error('generateAuthProof: vaultId required')
  }
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('generateAuthProof: deviceId required')
  }
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    throw new Error('generateAuthProof: timestamp must be positive integer')
  }
  if (typeof method !== 'string' || method.length === 0) {
    throw new Error('generateAuthProof: method required')
  }
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error('generateAuthProof: path must start with /')
  }
  const authKey = await deriveAuthKey(vaultKeyBytes)
  const message = [vaultId, deviceId, timestamp, method.toUpperCase(), path].join('\n')
  const sig = await hmacSha256(authKey, message)
  return bytesToHex(sig)
}

/**
 * Build the standard headers object for a sync request. Convenience wrapper
 * around generateAuthProof — callers can pass the result directly to fetch().
 *
 * @param {Uint8Array} vaultKeyBytes
 * @param {object} args - same as generateAuthProof
 * @returns {Promise<Record<string, string>>} - headers object
 */
export async function buildSyncHeaders (vaultKeyBytes, { vaultId, deviceId, timestamp, method, path, contentType }) {
  const auth = await generateAuthProof(vaultKeyBytes, { vaultId, deviceId, timestamp, method, path })
  const headers = {
    'X-Vault-Id': vaultId,
    'X-Device-Id': deviceId,
    'X-Timestamp': String(timestamp),
    'X-Auth': auth
  }
  if (contentType) headers['Content-Type'] = contentType

  // Identity layer (Option C v1.5+): attach the magic-link bearer token
  // when present. Server uses it to look up entitlement state.
  // Stacked ON TOP of the HMAC vault auth above — both must pass when
  // ENTITLEMENT_REQUIRED is on.
  try {
    // Dynamic import so this stays optional for tests / non-app contexts.
    const { authHeader } = await import('./identity.js')
    const ah = authHeader()
    if (ah && ah.Authorization) headers.Authorization = ah.Authorization
  } catch { /* identity layer not available in this build */ }

  // iOS-only: pass RC appUserId in a dedicated header so the relay can
  // look up the RC entitlement without parsing the body. lib/identity.js
  // doesn't know RC; we read directly from RC SDK here via dynamic import.
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor')
      const info = await Purchases.getCustomerInfo()
      const id = info?.customerInfo?.originalAppUserId
      if (id) headers['X-RC-AppUserId'] = id
    } catch { /* RC not initialised yet — skip */ }
  }

  return headers
}

/**
 * Maximum allowed timestamp drift between client and server clock. The server
 * uses this constant to reject requests with stale timestamps (replay
 * protection). Clients may surface a "your system clock is wrong" warning if
 * the server returns 401 with this code.
 */
export const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000 // 5 minutes
