/**
 * Encrypted note sharing utilities.
 * Generates share links with encrypted payload in URL fragment.
 * Uses PBKDF2 password-based encryption — password is embedded in the link.
 * The URL fragment (#) never leaves the browser — zero-knowledge hosting.
 */

const textEncoder = new TextEncoder()

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

/** Maximum URL fragment size (bytes). Safari ~80KB, Firefox ~65KB. Use 50KB to be safe. */
const MAX_FRAGMENT_SIZE = 50000

/**
 * Encrypt note content with a passphrase using PBKDF2 + AES-256-GCM.
 * @returns {Promise<{ encryptedBase64Url: string, passphrase: string }>}
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
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(payload)
  )

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  const encryptedBase64Url = toBase64Url(bytesToBase64(combined))
  return { encryptedBase64Url, passphrase }
}

/**
 * Generate a share link for a note.
 * Link format: https://host/share#password.base64url-encrypted-data
 * @returns {Promise<{ link: string|null, passphrase: string, tooLarge: boolean }>}
 */
export async function generateShareLink (content, title) {
  if (typeof window !== 'undefined' && window.__DASH_DEBUG) {
    console.log('[share] generateShareLink called — title:', title, 'blocks:', content?.blocks?.length, 'contentSize:', JSON.stringify(content || {}).length, 'chars')
  }
  const { encryptedBase64Url, passphrase } = await generateEncryptedPayload(content, title)
  const fragment = `${encodeURIComponent(passphrase)}.${encryptedBase64Url}`

  if (fragment.length > MAX_FRAGMENT_SIZE) {
    return { link: null, linkProtected: null, passphrase, tooLarge: true }
  }

  const link = `${SHARE_BASE_URL}/share.html#${fragment}`
  const linkProtected = `${SHARE_BASE_URL}/share.html#${encryptedBase64Url}`
  return { link, linkProtected, passphrase, tooLarge: false }
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
