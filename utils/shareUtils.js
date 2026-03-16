/**
 * Encrypted note sharing utilities.
 * Generates share links with encrypted payload in URL fragment.
 * Uses PBKDF2 password-based encryption — password is embedded in the link.
 * The URL fragment (#) never leaves the browser — zero-knowledge hosting.
 */

const textEncoder = new TextEncoder()

/** Compress a Uint8Array using deflate (CompressionStream API). */
async function compressBytes (bytes) {
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const chunks = []
  const reader = cs.readable.getReader()
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

/** Convert a Uint8Array to a base64 string (loop-based, safe for large arrays). */
function bytesToBase64 (bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Convert base64 to base64url (URL-safe, no padding). */
function toBase64Url (b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Word list for generating memorable passphrases. */
const WORDS = [
  'apple', 'arrow', 'beach', 'berry', 'blade', 'bloom', 'blaze', 'brave',
  'brick', 'brook', 'cabin', 'candy', 'cedar', 'chain', 'chalk', 'charm',
  'chase', 'cliff', 'cloud', 'coral', 'crane', 'creek', 'crown', 'crystal',
  'dance', 'delta', 'diver', 'dream', 'drift', 'eagle', 'ember', 'fable',
  'flame', 'flash', 'flint', 'frost', 'ghost', 'glade', 'globe', 'grace',
  'grain', 'grove', 'haven', 'hawk', 'hazel', 'honey', 'ivory', 'jewel',
  'karma', 'lake', 'lemon', 'light', 'lily', 'lunar', 'maple', 'marsh',
  'melon', 'mist', 'moose', 'noble', 'north', 'oasis', 'ocean', 'olive',
  'orbit', 'otter', 'palm', 'pearl', 'penny', 'petal', 'piano', 'pine',
  'plume', 'polar', 'prism', 'pulse', 'quail', 'raven', 'ridge', 'river',
  'robin', 'royal', 'sage', 'shore', 'silk', 'slate', 'smoke', 'solar',
  'spark', 'spire', 'star', 'steel', 'stone', 'storm', 'sugar', 'swift',
  'thorn', 'tiger', 'trail', 'tulip', 'umbra', 'vapor', 'velvet', 'vine',
  'vivid', 'waltz', 'whale', 'wheat', 'willow', 'wolf', 'wren', 'zenith'
]

function generatePassphrase () {
  const randomValues = crypto.getRandomValues(new Uint32Array(3))
  const word1 = WORDS[randomValues[0] % WORDS.length]
  const word2 = WORDS[randomValues[1] % WORDS.length]
  const num = (randomValues[2] % 90) + 10
  return `${word1}-${word2}-${num}`
}

/** Base URL of the hosted share/decryptor page. */
const SHARE_BASE_URL = 'https://dash-share.vercel.app'

/** Relay server URL for storing encrypted share payloads (always HTTPS, not WSS). */
const RELAY_URL = (() => {
  const env = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_RELAY_URL) || ''
  const url = env || 'https://dash-relay.efesop.deno.net'
  return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
})()

/** Maximum URL fragment size (bytes). Safari ~80KB, Firefox ~65KB. Use 50KB to be safe. */
const MAX_FRAGMENT_SIZE = 50000

/**
 * Encrypt note content with a passphrase using PBKDF2 + AES-256-GCM.
 * @returns {Promise<{ encryptedBytes: Uint8Array, encryptedBase64Url: string, passphrase: string }>}
 */
export async function generateEncryptedPayload (content, title) {
  const passphrase = generatePassphrase()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const baseKey = await crypto.subtle.importKey(
    'raw', textEncoder.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const payload = JSON.stringify({ title, content, exportedAt: new Date().toISOString() })

  // Compress payload with deflate before encrypting (text compresses ~60-80%)
  const payloadBytes = textEncoder.encode(payload)
  const compressed = await compressBytes(payloadBytes)

  // Prepend version byte: 0x01 = compressed payload
  const versioned = new Uint8Array(1 + compressed.length)
  versioned[0] = 0x01
  versioned.set(compressed, 1)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    versioned
  )

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  const encryptedBase64Url = toBase64Url(bytesToBase64(combined))
  return { encryptedBytes: combined, encryptedBase64Url, passphrase }
}

/**
 * Upload encrypted bytes to the relay server for short link generation.
 * @returns {Promise<string|null>} Short ID or null on failure
 */
async function uploadSharePayload (encryptedBytes) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${RELAY_URL}/share`, {
      method: 'POST',
      body: encryptedBytes,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const json = await res.json()
    return json.id || null
  } catch {
    clearTimeout(timeout)
    return null
  }
}

/**
 * Generate a share link for a note.
 * Tries server storage first (short link), falls back to inline (long link).
 * @returns {Promise<{ link: string|null, linkProtected: string|null, passphrase: string, tooLarge: boolean, serverStored: boolean }>}
 */
export async function generateShareLink (content, title) {
  if (typeof window !== 'undefined' && window.__DASH_DEBUG) {
    console.log('[share] generateShareLink called — title:', title, 'blocks:', content?.blocks?.length, 'contentSize:', JSON.stringify(content || {}).length, 'chars')
  }
  const { encryptedBytes, encryptedBase64Url, passphrase } = await generateEncryptedPayload(content, title)

  // Try server storage first — produces short links
  const shareId = await uploadSharePayload(encryptedBytes)
  if (shareId) {
    const fragment = `s:${shareId}.${encodeURIComponent(passphrase)}`
    const link = `${SHARE_BASE_URL}/share.html#${fragment}`
    const linkProtected = `${SHARE_BASE_URL}/share.html#s:${shareId}`
    if (typeof window !== 'undefined' && window.__DASH_DEBUG) {
      console.log('[share] server-stored — id:', shareId, 'link length:', link.length)
    }
    return { link, linkProtected, passphrase, tooLarge: false, serverStored: true }
  }

  // Fallback: inline link (original behavior)
  const fragment = `${encodeURIComponent(passphrase)}.${encryptedBase64Url}`
  if (fragment.length > MAX_FRAGMENT_SIZE) {
    return { link: null, linkProtected: null, passphrase, tooLarge: true, serverStored: false }
  }

  const link = `${SHARE_BASE_URL}/share.html#${fragment}`
  const linkProtected = `${SHARE_BASE_URL}/share.html#${encryptedBase64Url}`
  return { link, linkProtected, passphrase, tooLarge: false, serverStored: false }
}

/**
 * Generate QR code containing the share link.
 * @param {string} link - The full share link
 * @returns {Promise<string>} QR code as data URL
 */
export async function generateShareQR (link) {
  const QRCode = (await import('qrcode')).default
  return await QRCode.toDataURL(link, {
    width: 300,
    margin: 2,
    color: { dark: '#e5e5e5', light: '#0a0a0a' }
  })
}
