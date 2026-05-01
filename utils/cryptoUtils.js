// Minimal E2E encryption helpers using WebCrypto (AES-GCM + PBKDF2)

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function deriveKeyFromPassphrase (passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000, // NIST 2024 recommendation for security
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptJsonWithPassphrase (jsonObject, passphrase) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const plaintext = textEncoder.encode(JSON.stringify(jsonObject))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    cipher: 'AES-GCM-256',
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(ciphertext)
  }
}

// Custom error class for decryption failures
export class DecryptionError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'DecryptionError'
    this.cause = cause
  }
}

// Encrypt with a pre-derived CryptoKey (skips PBKDF2 — fast for auto-save)
export async function encryptJsonWithKey (jsonObject, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = textEncoder.encode(JSON.stringify(jsonObject))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    cipher: 'AES-GCM-256',
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(ciphertext)
  }
}

// Decrypt with a pre-derived CryptoKey (skips PBKDF2 — fast)
export async function decryptJsonWithKey (payload, key) {
  if (!payload || !payload.iv || !payload.data) {
    throw new DecryptionError('Invalid encrypted content. The data may be corrupted.')
  }
  try {
    const iv = new Uint8Array(payload.iv)
    const data = new Uint8Array(payload.data)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return JSON.parse(textDecoder.decode(new Uint8Array(plaintext)))
  } catch (error) {
    if (error.name === 'OperationError') {
      throw new DecryptionError('Decryption failed. The encryption key may be invalid.')
    }
    if (error instanceof SyntaxError) {
      throw new DecryptionError('Decrypted data is corrupted.')
    }
    throw new DecryptionError(`Failed to decrypt: ${error.message}`, error)
  }
}

export async function decryptJsonWithPassphrase (payload, passphrase) {
  // Validate payload structure
  if (!payload || !payload.salt || !payload.iv || !payload.data) {
    throw new DecryptionError('Invalid file format. The file may be corrupted or not a valid encrypted bundle.')
  }

  try {
    const salt = new Uint8Array(payload.salt)
    const iv = new Uint8Array(payload.iv)
    const data = new Uint8Array(payload.data)
    const key = await deriveKeyFromPassphrase(passphrase, salt)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    const json = JSON.parse(textDecoder.decode(new Uint8Array(plaintext)))
    return json
  } catch (error) {
    // AES-GCM decryption fails with OperationError when passphrase is wrong
    if (error.name === 'OperationError') {
      throw new DecryptionError('Incorrect passphrase. Please check your passphrase and try again.')
    }
    // JSON parse error means decryption succeeded but data is malformed
    if (error instanceof SyntaxError) {
      throw new DecryptionError('The file appears to be corrupted. Decryption succeeded but the data is invalid.')
    }
    // Re-throw other errors with context
    throw new DecryptionError(`Failed to decrypt: ${error.message}`, error)
  }
}

// =============================================================================
// HKDF + HMAC helpers — used by sync system (lib/syncCrypto.js, lib/syncAuth.js)
// =============================================================================

/**
 * HKDF-SHA256 sub-key derivation. Deterministic — same inputs always produce
 * the same output. Used to derive sub-keys (e.g. tag-hash key, version-list key)
 * from the master vault key without weakening the master key.
 *
 * @param {Uint8Array} masterBytes - the input keying material (e.g. vault key, 32 bytes)
 * @param {string} info - context/label string ("tag-hash-v1", "version-key-v1", etc.)
 * @param {number} lengthBytes - desired output length in bytes
 * @returns {Promise<Uint8Array>} - derived bytes
 */
export async function hkdfDeriveBytes (masterBytes, info, lengthBytes) {
  if (!(masterBytes instanceof Uint8Array)) {
    throw new Error('hkdfDeriveBytes: masterBytes must be Uint8Array')
  }
  if (typeof info !== 'string' || info.length === 0) {
    throw new Error('hkdfDeriveBytes: info must be a non-empty string')
  }
  if (!Number.isInteger(lengthBytes) || lengthBytes < 1 || lengthBytes > 255 * 32) {
    throw new Error('hkdfDeriveBytes: lengthBytes must be 1..8160')
  }
  const baseKey = await crypto.subtle.importKey(
    'raw',
    masterBytes,
    'HKDF',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0), // empty salt — vault key is already random
      info: textEncoder.encode(info)
    },
    baseKey,
    lengthBytes * 8
  )
  return new Uint8Array(bits)
}

/**
 * HMAC-SHA256 — used for auth proofs (lib/syncAuth.js) and tag-name hashing.
 *
 * @param {Uint8Array} keyBytes - HMAC key (any length, 32 bytes recommended)
 * @param {string|Uint8Array} message - data to authenticate
 * @returns {Promise<Uint8Array>} - 32-byte HMAC tag
 */
export async function hmacSha256 (keyBytes, message) {
  if (!(keyBytes instanceof Uint8Array)) {
    throw new Error('hmacSha256: keyBytes must be Uint8Array')
  }
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const data = typeof message === 'string' ? textEncoder.encode(message) : message
  const sig = await crypto.subtle.sign('HMAC', key, data)
  return new Uint8Array(sig)
}

/**
 * Convert Uint8Array to lowercase hex string. Used for ID encoding (tag hashes,
 * auth proofs) on the wire.
 */
export function bytesToHex (bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('bytesToHex: input must be Uint8Array')
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Convert hex string back to Uint8Array.
 */
export function hexToBytes (hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('hexToBytes: input must be even-length hex string')
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Constant-time byte-array comparison. Returns true iff a and b have the same
 * length and bytes. Avoids timing side channels in HMAC verification.
 */
export function constantTimeEqual (a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}
