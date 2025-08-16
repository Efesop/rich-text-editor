// Minimal E2E encryption helpers using WebCrypto (AES-GCM + PBKDF2)

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

async function deriveKeyFromPassphrase (passphrase, salt) {
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
      iterations: 200000,
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

export async function decryptJsonWithPassphrase (payload, passphrase) {
  const salt = new Uint8Array(payload.salt)
  const iv = new Uint8Array(payload.iv)
  const data = new Uint8Array(payload.data)
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  const json = JSON.parse(textDecoder.decode(new Uint8Array(plaintext)))
  return json
}

// Additional crypto functions for local sync
export async function generateKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encodedData = textEncoder.encode(JSON.stringify(data))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  )
  
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  }
}

export async function decrypt(encryptedData, key) {
  const iv = new Uint8Array(encryptedData.iv)
  const data = new Uint8Array(encryptedData.data)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )
  
  return JSON.parse(textDecoder.decode(new Uint8Array(decrypted)))
}


