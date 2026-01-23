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


