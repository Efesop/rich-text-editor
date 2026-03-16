/**
 * Shared decryption utility for encrypted note payloads.
 * Used by both the share page (browser) and the deep link handler (Electron).
 * Mirrors the encryption in shareUtils.js — PBKDF2 + AES-256-GCM.
 *
 * Supports both compressed (v1, version byte 0x01) and uncompressed (legacy) payloads.
 */

function b64UrlToBytes (b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Decompress a deflate-compressed Uint8Array. */
async function decompressBytes (bytes) {
  const ds = new DecompressionStream('deflate')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const chunks = []
  const reader = ds.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/**
 * Decrypt a share payload using a password and base64url-encoded encrypted data.
 * @param {string} password - The passphrase used to encrypt
 * @param {string} b64Data - Base64url-encoded encrypted data (salt + iv + ciphertext)
 * @returns {Promise<{ title: string, content: object, exportedAt: string }>}
 */
export async function decryptSharePayload (password, b64Data) {
  const combined = b64UrlToBytes(b64Data)
  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const ciphertext = combined.slice(28)

  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertext
  )

  const plainBytes = new Uint8Array(plain)

  // Check for version byte: 0x01 = compressed payload
  if (plainBytes[0] === 0x01) {
    const decompressed = await decompressBytes(plainBytes.slice(1))
    return JSON.parse(new TextDecoder().decode(decompressed))
  }

  // Legacy uncompressed payload (starts with '{' = 0x7B)
  return JSON.parse(new TextDecoder().decode(plain))
}
