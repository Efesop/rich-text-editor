/**
 * Dash Sync — Crypto Surface
 *
 * E2E encryption helpers specific to the multi-device sync feature. The vault
 * key is the user's master sync secret: 256 bits of CSPRNG output, generated on
 * the first device that opts into sync, and shared with subsequent devices via
 * QR pair. The server NEVER sees the vault key.
 *
 * All envelopes pushed to the server are encrypted with the vault key under
 * AES-GCM-256. Sub-keys (tag-name hash, version-list integrity) are derived
 * via HKDF-SHA256 from the vault key — never re-derived from a passphrase
 * (we have no passphrase in the sync flow; pairing is QR-based).
 *
 * See plan: /Users/ollie/.claude/plans/q1-one-vault-q2-crispy-book.md ("Crypto" section)
 */

import {
  hkdfDeriveBytes,
  hmacSha256,
  bytesToHex,
  DecryptionError,
  deriveKeyFromPassphrase,
  encryptJsonWithKey,
  decryptJsonWithKey
} from '../utils/cryptoUtils.js'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// HKDF info-strings. Distinct strings → distinct derived keys (domain separation).
const INFO_TAG_HASH = 'dash-sync:tag-hash:v1'
const INFO_VERSION_KEY = 'dash-sync:version-key:v1'
const INFO_AUTH_KEY = 'dash-sync:auth:v1'

// =============================================================================
// Vault key generation + import
// =============================================================================

/**
 * Generate a new 256-bit vault key. Called once per vault on the first device
 * that opts into sync. Caller is responsible for storing it securely (encrypted
 * at rest under app-lock-derived key when app lock is enabled).
 *
 * @returns {Uint8Array} 32-byte random key
 */
export function generateVaultKey () {
  return crypto.getRandomValues(new Uint8Array(32))
}

/**
 * Import raw 32-byte vault key as a CryptoKey usable with AES-GCM. The CryptoKey
 * is non-extractable — once imported, the raw bytes can be cleared from memory
 * but the key remains usable for encrypt/decrypt.
 *
 * @param {Uint8Array} rawBytes - 32 bytes
 * @returns {Promise<CryptoKey>} CryptoKey for AES-GCM encrypt/decrypt
 */
export async function importVaultKey (rawBytes) {
  if (!(rawBytes instanceof Uint8Array) || rawBytes.length !== 32) {
    throw new Error('importVaultKey: must be 32-byte Uint8Array')
  }
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    false, // non-extractable — defense in depth
    ['encrypt', 'decrypt']
  )
}

// =============================================================================
// Envelope encryption
// =============================================================================

/**
 * Encrypt a sync envelope (JSON object) under the vault key.
 *
 * The vault key is already 32 bytes of pure CSPRNG output, so we DON'T do
 * PBKDF2 derivation here (unlike app-lock or share-link encryption, which
 * derive from passphrases). We use the vault key directly as the AES-GCM key.
 *
 * Output schema is a slimmed-down variant of the codebase-standard
 * `{ v, kdf, cipher, salt, iv, data }` — we omit `kdf` and `salt` because
 * there's no derivation step.
 *
 * @param {object} envelope - any JSON-serializable object
 * @param {CryptoKey} vaultKeyCrypto - imported vault key (from importVaultKey)
 * @returns {Promise<{v:1, cipher:string, iv:number[], data:number[]}>}
 */
export async function encryptEnvelope (envelope, vaultKeyCrypto) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('encryptEnvelope: envelope must be an object')
  }
  if (!(vaultKeyCrypto instanceof CryptoKey)) {
    throw new Error('encryptEnvelope: vaultKeyCrypto must be a CryptoKey')
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = textEncoder.encode(JSON.stringify(envelope))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKeyCrypto, plaintext)
  )
  return {
    v: 1,
    cipher: 'AES-GCM-256',
    iv: Array.from(iv),
    data: Array.from(ciphertext)
  }
}

/**
 * Decrypt a sync envelope under the vault key.
 *
 * Throws DecryptionError on:
 *  - missing/invalid payload fields
 *  - schema mismatch (cipher !== 'AES-GCM-256' or v !== 1)
 *  - wrong key (AES-GCM authentication failure)
 *  - corrupt ciphertext
 *  - non-JSON plaintext after successful decrypt
 *
 * Caller catches DecryptionError and routes to quarantine path (Layer 5 of
 * data-loss prevention) — never overwrites local plaintext.
 *
 * @param {object} payload - { v, cipher, iv, data }
 * @param {CryptoKey} vaultKeyCrypto
 * @returns {Promise<object>} decrypted JSON
 */
export async function decryptEnvelope (payload, vaultKeyCrypto) {
  if (!payload || typeof payload !== 'object') {
    throw new DecryptionError('decryptEnvelope: payload missing')
  }
  if (payload.v !== 1) {
    throw new DecryptionError(`decryptEnvelope: unsupported schema version ${payload.v}`)
  }
  if (payload.cipher !== 'AES-GCM-256') {
    throw new DecryptionError(`decryptEnvelope: unsupported cipher ${payload.cipher}`)
  }
  if (!Array.isArray(payload.iv) || !Array.isArray(payload.data)) {
    throw new DecryptionError('decryptEnvelope: payload missing iv/data')
  }
  if (!(vaultKeyCrypto instanceof CryptoKey)) {
    throw new Error('decryptEnvelope: vaultKeyCrypto must be a CryptoKey')
  }
  try {
    const iv = new Uint8Array(payload.iv)
    const data = new Uint8Array(payload.data)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      vaultKeyCrypto,
      data
    )
    return JSON.parse(textDecoder.decode(new Uint8Array(plaintext)))
  } catch (error) {
    if (error.name === 'OperationError') {
      throw new DecryptionError('decryptEnvelope: wrong vault key (AES-GCM auth failed)')
    }
    if (error instanceof SyntaxError) {
      throw new DecryptionError('decryptEnvelope: decrypted data is not valid JSON')
    }
    throw new DecryptionError(`decryptEnvelope: ${error.message}`, error)
  }
}

// =============================================================================
// Tag-name hashing — server can't see plaintext tag names
// =============================================================================

/**
 * Hash a tag name to an opaque ID for server storage. The server uses this
 * hash as the resource ID for tag envelopes (KV key path), so two devices that
 * push the same tag name end up at the same KV slot.
 *
 * Uses HKDF to derive a per-vault tag-hashing key, then HMAC-SHA256 of the
 * tag name. Truncated to 16 bytes (32 hex chars) — collision-resistant for
 * the vault's tag namespace (a user has dozens of tags, not billions).
 *
 * Different vaults with the same tag name produce different hashes — server
 * can't correlate tags across vaults.
 *
 * @param {Uint8Array} vaultKeyBytes - raw 32 bytes
 * @param {string} tagName - tag name to hash
 * @returns {Promise<string>} 32-char hex string
 */
export async function hashTagName (vaultKeyBytes, tagName) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('hashTagName: vaultKeyBytes must be 32-byte Uint8Array')
  }
  if (typeof tagName !== 'string' || tagName.length === 0) {
    throw new Error('hashTagName: tagName must be non-empty string')
  }
  const tagKey = await hkdfDeriveBytes(vaultKeyBytes, INFO_TAG_HASH, 32)
  const fullHash = await hmacSha256(tagKey, tagName)
  return bytesToHex(fullHash.slice(0, 16))
}

// =============================================================================
// Version-list integrity key — derived sub-key for HMAC-ing server's version
// list responses (Phase 2.8+: use to detect server tampering with version
// history). Exported now so callers don't need to derive it themselves.
// =============================================================================

/**
 * Derive a 32-byte sub-key for signing/verifying version-list HMACs.
 * Distinct from the encryption key (HKDF info string differs).
 *
 * @param {Uint8Array} vaultKeyBytes - raw 32 bytes
 * @returns {Promise<Uint8Array>} 32 bytes
 */
export async function deriveVersionKey (vaultKeyBytes) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('deriveVersionKey: vaultKeyBytes must be 32-byte Uint8Array')
  }
  return hkdfDeriveBytes(vaultKeyBytes, INFO_VERSION_KEY, 32)
}

/**
 * Derive a 32-byte sub-key for HMAC-based auth proofs (consumed by
 * lib/syncAuth.js).
 *
 * @param {Uint8Array} vaultKeyBytes - raw 32 bytes
 * @returns {Promise<Uint8Array>} 32 bytes
 */
export async function deriveAuthKey (vaultKeyBytes) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('deriveAuthKey: vaultKeyBytes must be 32-byte Uint8Array')
  }
  return hkdfDeriveBytes(vaultKeyBytes, INFO_AUTH_KEY, 32)
}

// =============================================================================
// Pair packet — QR-pair onboarding flow
// =============================================================================

/**
 * Generate a 6-digit pair code. User reads it aloud (or the existing device
 * shows it on screen and the new device user types it in). Pair code prevents
 * shoulder-surfing the QR — someone who photographs the QR can't pair without
 * the verbal code.
 *
 * Pair code lifetime: 60 seconds (enforced at the UI layer).
 *
 * @returns {string} 6-digit zero-padded code, e.g. "047321"
 */
export function generatePairCode () {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1000000).padStart(6, '0')
}

/**
 * Encrypt a pair packet with the pair code. PBKDF2-100k iterations matches
 * the existing share-link pattern — we don't need 600k because the pair
 * window is short (60 seconds) and the code is single-use.
 *
 * Output schema matches the codebase-standard
 * `{ v, kdf, cipher, salt, iv, data }`.
 *
 * @param {object} packet - { vaultId, vaultKey: number[], relayUrl, pairedDevices, ... }
 * @param {string} pairCode - 6-digit code
 * @returns {Promise<object>} encrypted payload
 */
export async function encryptPairPacket (packet, pairCode) {
  if (!packet || typeof packet !== 'object') {
    throw new Error('encryptPairPacket: packet must be an object')
  }
  if (typeof pairCode !== 'string' || !/^\d{6}$/.test(pairCode)) {
    throw new Error('encryptPairPacket: pairCode must be 6 digits')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(pairCode),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const plaintext = textEncoder.encode(JSON.stringify(packet))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  )
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: 100000,
    cipher: 'AES-GCM-256',
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(ciphertext)
  }
}

/**
 * Decrypt a pair packet on the new device. Throws DecryptionError if the
 * pair code is wrong (most common path — user typed it in wrong).
 *
 * @param {object} payload - encrypted payload from encryptPairPacket
 * @param {string} pairCode - 6-digit code
 * @returns {Promise<object>} decrypted packet
 */
export async function decryptPairPacket (payload, pairCode) {
  if (!payload || typeof payload !== 'object') {
    throw new DecryptionError('decryptPairPacket: payload missing')
  }
  if (payload.v !== 1) {
    throw new DecryptionError(`decryptPairPacket: unsupported schema version ${payload.v}`)
  }
  if (payload.cipher !== 'AES-GCM-256') {
    throw new DecryptionError(`decryptPairPacket: unsupported cipher ${payload.cipher}`)
  }
  if (!Array.isArray(payload.salt) || !Array.isArray(payload.iv) || !Array.isArray(payload.data)) {
    throw new DecryptionError('decryptPairPacket: payload missing salt/iv/data')
  }
  if (typeof pairCode !== 'string' || !/^\d{6}$/.test(pairCode)) {
    throw new DecryptionError('decryptPairPacket: pairCode must be 6 digits')
  }
  try {
    const salt = new Uint8Array(payload.salt)
    const iv = new Uint8Array(payload.iv)
    const data = new Uint8Array(payload.data)
    const baseKey = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(pairCode),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )
    const iterations = payload.iterations || 100000
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )
    return JSON.parse(textDecoder.decode(new Uint8Array(plaintext)))
  } catch (error) {
    if (error.name === 'OperationError') {
      throw new DecryptionError('decryptPairPacket: wrong pair code')
    }
    if (error instanceof SyntaxError) {
      throw new DecryptionError('decryptPairPacket: decrypted data is not valid JSON')
    }
    throw new DecryptionError(`decryptPairPacket: ${error.message}`, error)
  }
}

// =============================================================================
// At-rest vault key wrapping — used to store the vault key on disk under the
// app-lock-derived key (when app lock is enabled). Two-phase commit re-key
// flow (plan, "App-lock password change") consumes these helpers.
// =============================================================================

/**
 * Wrap raw vault key bytes under an app-lock-derived AES-GCM CryptoKey. Output
 * schema matches existing `{ v, kdf, cipher, salt, iv, data }` so it can be
 * stored alongside other encrypted fields.
 *
 * @param {Uint8Array} vaultKeyBytes - 32 bytes
 * @param {CryptoKey} appLockKey - derived AES-GCM key (existing app-lock flow)
 * @param {Uint8Array} appLockSalt - the salt that produced appLockKey
 * @returns {Promise<object>} encrypted payload
 */
export async function wrapVaultKey (vaultKeyBytes, appLockKey, appLockSalt) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('wrapVaultKey: vaultKeyBytes must be 32-byte Uint8Array')
  }
  if (!(appLockKey instanceof CryptoKey)) {
    throw new Error('wrapVaultKey: appLockKey must be CryptoKey')
  }
  // Wrap as JSON-encoded array — reuse encryptJsonWithKey schema for consistency.
  return encryptJsonWithKey({ vaultKey: Array.from(vaultKeyBytes) }, appLockKey, appLockSalt)
}

/**
 * Unwrap a wrapped vault key. Throws DecryptionError on wrong key or corruption.
 *
 * @param {object} wrapped - output of wrapVaultKey
 * @param {CryptoKey} appLockKey
 * @returns {Promise<Uint8Array>} 32 bytes
 */
export async function unwrapVaultKey (wrapped, appLockKey) {
  const decoded = await decryptJsonWithKey(wrapped, appLockKey)
  if (!decoded || !Array.isArray(decoded.vaultKey) || decoded.vaultKey.length !== 32) {
    throw new DecryptionError('unwrapVaultKey: unwrapped data is not a 32-byte vault key')
  }
  return new Uint8Array(decoded.vaultKey)
}

/**
 * Wrap a vault key under a passphrase-derived key. Used when app lock is NOT
 * enabled — vault key still needs at-rest protection so a stolen disk image
 * doesn't leak the sync vault. Uses 600k PBKDF2 iterations (NIST 2024).
 *
 * @param {Uint8Array} vaultKeyBytes
 * @param {string} passphrase - usually a user-set sync passphrase, OR derived
 *                              from device-bound material if no passphrase
 * @returns {Promise<object>}
 */
export async function wrapVaultKeyWithPassphrase (vaultKeyBytes, passphrase) {
  if (!(vaultKeyBytes instanceof Uint8Array) || vaultKeyBytes.length !== 32) {
    throw new Error('wrapVaultKeyWithPassphrase: vaultKeyBytes must be 32-byte Uint8Array')
  }
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('wrapVaultKeyWithPassphrase: passphrase required')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  return encryptJsonWithKey({ vaultKey: Array.from(vaultKeyBytes) }, key, salt)
}

/**
 * Unwrap a passphrase-wrapped vault key.
 *
 * @param {object} wrapped
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>}
 */
export async function unwrapVaultKeyWithPassphrase (wrapped, passphrase) {
  if (!wrapped || !Array.isArray(wrapped.salt)) {
    throw new DecryptionError('unwrapVaultKeyWithPassphrase: missing salt')
  }
  const salt = new Uint8Array(wrapped.salt)
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const decoded = await decryptJsonWithKey(wrapped, key)
  if (!decoded || !Array.isArray(decoded.vaultKey) || decoded.vaultKey.length !== 32) {
    throw new DecryptionError('unwrapVaultKeyWithPassphrase: unwrapped data is not a 32-byte vault key')
  }
  return new Uint8Array(decoded.vaultKey)
}
