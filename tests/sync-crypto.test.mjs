/**
 * Sync crypto test suite.
 *
 * Run with: npm test (alongside existing security.test.mjs).
 *
 * Covers:
 *   - utils/cryptoUtils.js HKDF + HMAC + hex helpers
 *   - lib/syncCrypto.js vault key gen, envelope round-trip, tag hashing,
 *     pair packet encrypt/decrypt, vault key wrap/unwrap
 *   - lib/syncAuth.js HMAC auth proof generation + binding
 *
 * Phase 2.0a deliverable per /Users/ollie/.claude/plans/q1-one-vault-q2-crispy-book.md
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

// Polyfill crypto.subtle for Node 18+ (matches existing security.test.mjs)
if (!globalThis.crypto) globalThis.crypto = webcrypto
// CryptoKey isn't a globalThis class in Node — alias for instanceof checks.
if (!globalThis.CryptoKey) globalThis.CryptoKey = webcrypto.CryptoKey

// Direct imports — lib/syncCrypto.js and lib/syncAuth.js use relative paths
// (no @/... aliases) so Node's test runner can resolve them natively.
const cryptoUtils = await import('../utils/cryptoUtils.js')
const syncCrypto = await import('../lib/syncCrypto.js')
const syncAuth = await import('../lib/syncAuth.js')

const {
  hkdfDeriveBytes,
  hmacSha256,
  bytesToHex,
  hexToBytes,
  constantTimeEqual,
  DecryptionError
} = cryptoUtils

const {
  generateVaultKey,
  importVaultKey,
  encryptEnvelope,
  decryptEnvelope,
  hashTagName,
  deriveVersionKey,
  deriveAuthKey,
  generatePairCode,
  encryptPairPacket,
  decryptPairPacket,
  wrapVaultKey,
  unwrapVaultKey,
  wrapVaultKeyWithPassphrase,
  unwrapVaultKeyWithPassphrase
} = syncCrypto

const { generateAuthProof, buildSyncHeaders, MAX_TIMESTAMP_DRIFT_MS } = syncAuth

// =============================================================================
// utils/cryptoUtils.js — new helpers
// =============================================================================

describe('cryptoUtils — hkdfDeriveBytes', () => {
  it('produces deterministic output for same input', async () => {
    const master = new Uint8Array(32).fill(0x42)
    const a = await hkdfDeriveBytes(master, 'test-info', 32)
    const b = await hkdfDeriveBytes(master, 'test-info', 32)
    assert.deepEqual(Array.from(a), Array.from(b))
    assert.equal(a.length, 32)
  })

  it('different info strings produce different outputs', async () => {
    const master = new Uint8Array(32).fill(0x42)
    const a = await hkdfDeriveBytes(master, 'info-a', 32)
    const b = await hkdfDeriveBytes(master, 'info-b', 32)
    assert.notDeepEqual(Array.from(a), Array.from(b))
  })

  it('different master keys produce different outputs', async () => {
    const a = await hkdfDeriveBytes(new Uint8Array(32).fill(0x01), 'info', 32)
    const b = await hkdfDeriveBytes(new Uint8Array(32).fill(0x02), 'info', 32)
    assert.notDeepEqual(Array.from(a), Array.from(b))
  })

  it('respects requested output length', async () => {
    const master = new Uint8Array(32).fill(0x42)
    assert.equal((await hkdfDeriveBytes(master, 'info', 16)).length, 16)
    assert.equal((await hkdfDeriveBytes(master, 'info', 64)).length, 64)
  })

  it('rejects invalid inputs', async () => {
    await assert.rejects(() => hkdfDeriveBytes('not bytes', 'info', 32), /must be Uint8Array/)
    await assert.rejects(() => hkdfDeriveBytes(new Uint8Array(32), '', 32), /non-empty/)
    await assert.rejects(() => hkdfDeriveBytes(new Uint8Array(32), 'info', 0), /lengthBytes/)
    await assert.rejects(() => hkdfDeriveBytes(new Uint8Array(32), 'info', -1), /lengthBytes/)
  })
})

describe('cryptoUtils — hmacSha256', () => {
  it('produces deterministic 32-byte output', async () => {
    const key = new Uint8Array(32).fill(0x55)
    const a = await hmacSha256(key, 'message')
    const b = await hmacSha256(key, 'message')
    assert.equal(a.length, 32)
    assert.deepEqual(Array.from(a), Array.from(b))
  })

  it('different keys produce different outputs', async () => {
    const a = await hmacSha256(new Uint8Array(32).fill(0x01), 'hi')
    const b = await hmacSha256(new Uint8Array(32).fill(0x02), 'hi')
    assert.notDeepEqual(Array.from(a), Array.from(b))
  })

  it('different messages produce different outputs', async () => {
    const key = new Uint8Array(32).fill(0x55)
    const a = await hmacSha256(key, 'hi')
    const b = await hmacSha256(key, 'bye')
    assert.notDeepEqual(Array.from(a), Array.from(b))
  })

  it('accepts both string and Uint8Array messages', async () => {
    const key = new Uint8Array(32).fill(0x55)
    const fromStr = await hmacSha256(key, 'hello')
    const fromBytes = await hmacSha256(key, new TextEncoder().encode('hello'))
    assert.deepEqual(Array.from(fromStr), Array.from(fromBytes))
  })

  it('rejects non-Uint8Array key', async () => {
    await assert.rejects(() => hmacSha256('not bytes', 'hi'), /Uint8Array/)
  })
})

describe('cryptoUtils — bytesToHex / hexToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const orig = new Uint8Array([0x00, 0x01, 0xFF, 0xDE, 0xAD, 0xBE, 0xEF])
    const hex = bytesToHex(orig)
    assert.equal(hex, '0001ffdeadbeef')
    assert.deepEqual(Array.from(hexToBytes(hex)), Array.from(orig))
  })

  it('rejects odd-length hex', () => {
    assert.throws(() => hexToBytes('abc'), /even-length/)
  })
})

describe('cryptoUtils — constantTimeEqual', () => {
  it('returns true for equal arrays', () => {
    assert.equal(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true)
  })
  it('returns false for different arrays', () => {
    assert.equal(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false)
  })
  it('returns false for different lengths', () => {
    assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false)
  })
  it('returns false for non-Uint8Array inputs', () => {
    assert.equal(constantTimeEqual([1, 2, 3], new Uint8Array([1, 2, 3])), false)
  })
})

// =============================================================================
// lib/syncCrypto.js — vault key + envelope
// =============================================================================

describe('syncCrypto — generateVaultKey', () => {
  it('returns 32 random bytes', () => {
    const k = generateVaultKey()
    assert.ok(k instanceof Uint8Array)
    assert.equal(k.length, 32)
  })

  it('produces uniformly random output (sample 100 keys, no duplicates)', () => {
    const keys = new Set()
    for (let i = 0; i < 100; i++) {
      keys.add(bytesToHex(generateVaultKey()))
    }
    assert.equal(keys.size, 100)
  })

  it('produces output with reasonable entropy (no all-zero key)', () => {
    for (let i = 0; i < 20; i++) {
      const k = generateVaultKey()
      const allZero = Array.from(k).every(b => b === 0)
      assert.equal(allZero, false)
    }
  })
})

describe('syncCrypto — importVaultKey', () => {
  it('imports 32-byte key as non-extractable CryptoKey', async () => {
    const key = await importVaultKey(generateVaultKey())
    assert.ok(key instanceof CryptoKey)
    assert.equal(key.extractable, false)
    assert.equal(key.type, 'secret')
  })

  it('rejects wrong-size keys', async () => {
    await assert.rejects(() => importVaultKey(new Uint8Array(16)), /32-byte/)
    await assert.rejects(() => importVaultKey(new Uint8Array(64)), /32-byte/)
  })

  it('rejects non-Uint8Array', async () => {
    await assert.rejects(() => importVaultKey([1, 2, 3]), /Uint8Array/)
  })
})

describe('syncCrypto — encryptEnvelope / decryptEnvelope', () => {
  it('round-trips a JSON envelope', async () => {
    const raw = generateVaultKey()
    const key = await importVaultKey(raw)
    const envelope = {
      schemaVersion: 1,
      envelopeType: 'note',
      resourceId: 'note-uuid-123',
      payload: { id: 'p1', title: 'Test', content: { blocks: [] } },
      timestamp: 1700000000000,
      authorDeviceId: 'd1',
      parentVersion: null
    }
    const encrypted = await encryptEnvelope(envelope, key)
    assert.equal(encrypted.v, 1)
    assert.equal(encrypted.cipher, 'AES-GCM-256')
    assert.ok(Array.isArray(encrypted.iv))
    assert.equal(encrypted.iv.length, 12)
    assert.ok(Array.isArray(encrypted.data))
    const decrypted = await decryptEnvelope(encrypted, key)
    assert.deepEqual(decrypted, envelope)
  })

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const key = await importVaultKey(generateVaultKey())
    const env = { hello: 'world' }
    const a = await encryptEnvelope(env, key)
    const b = await encryptEnvelope(env, key)
    assert.notDeepEqual(a.iv, b.iv)
    assert.notDeepEqual(a.data, b.data)
  })

  it('throws DecryptionError with wrong key', async () => {
    const env = { hello: 'world' }
    const k1 = await importVaultKey(generateVaultKey())
    const k2 = await importVaultKey(generateVaultKey())
    const encrypted = await encryptEnvelope(env, k1)
    await assert.rejects(
      () => decryptEnvelope(encrypted, k2),
      err => err instanceof DecryptionError && /wrong vault key/.test(err.message)
    )
  })

  it('throws DecryptionError on corrupt ciphertext', async () => {
    const key = await importVaultKey(generateVaultKey())
    const encrypted = await encryptEnvelope({ x: 1 }, key)
    // Flip a byte in the ciphertext
    encrypted.data[5] ^= 0xFF
    await assert.rejects(
      () => decryptEnvelope(encrypted, key),
      err => err instanceof DecryptionError
    )
  })

  it('throws DecryptionError on schema version mismatch', async () => {
    const key = await importVaultKey(generateVaultKey())
    const encrypted = await encryptEnvelope({ x: 1 }, key)
    encrypted.v = 99
    await assert.rejects(
      () => decryptEnvelope(encrypted, key),
      err => err instanceof DecryptionError && /schema version/.test(err.message)
    )
  })

  it('throws DecryptionError on cipher mismatch', async () => {
    const key = await importVaultKey(generateVaultKey())
    const encrypted = await encryptEnvelope({ x: 1 }, key)
    encrypted.cipher = 'DES-CBC'
    await assert.rejects(
      () => decryptEnvelope(encrypted, key),
      err => err instanceof DecryptionError && /cipher/.test(err.message)
    )
  })

  it('throws DecryptionError on missing iv/data', async () => {
    const key = await importVaultKey(generateVaultKey())
    await assert.rejects(
      () => decryptEnvelope({ v: 1, cipher: 'AES-GCM-256' }, key),
      err => err instanceof DecryptionError && /iv\/data/.test(err.message)
    )
  })

  it('rejects non-CryptoKey', async () => {
    await assert.rejects(() => encryptEnvelope({ x: 1 }, 'not a key'), /CryptoKey/)
    await assert.rejects(() => decryptEnvelope({ v: 1, cipher: 'AES-GCM-256', iv: [], data: [] }, 'not a key'), /CryptoKey/)
  })
})

describe('syncCrypto — hashTagName', () => {
  it('produces 32-char hex output', async () => {
    const vk = generateVaultKey()
    const hash = await hashTagName(vk, 'work')
    assert.equal(hash.length, 32)
    assert.match(hash, /^[0-9a-f]+$/)
  })

  it('same vault + same tag = same hash (deterministic)', async () => {
    const vk = generateVaultKey()
    const a = await hashTagName(vk, 'work')
    const b = await hashTagName(vk, 'work')
    assert.equal(a, b)
  })

  it('different tags = different hashes', async () => {
    const vk = generateVaultKey()
    const a = await hashTagName(vk, 'work')
    const b = await hashTagName(vk, 'personal')
    assert.notEqual(a, b)
  })

  it('different vault keys + same tag = different hashes (per-vault privacy)', async () => {
    const a = await hashTagName(generateVaultKey(), 'work')
    const b = await hashTagName(generateVaultKey(), 'work')
    assert.notEqual(a, b)
  })

  it('case-sensitive', async () => {
    const vk = generateVaultKey()
    const a = await hashTagName(vk, 'Work')
    const b = await hashTagName(vk, 'work')
    assert.notEqual(a, b)
  })

  it('rejects empty tag name', async () => {
    await assert.rejects(() => hashTagName(generateVaultKey(), ''), /non-empty/)
  })

  it('rejects wrong-size vault key', async () => {
    await assert.rejects(() => hashTagName(new Uint8Array(16), 'tag'), /32-byte/)
  })
})

describe('syncCrypto — derived sub-keys', () => {
  it('deriveVersionKey returns 32 bytes deterministically', async () => {
    const vk = generateVaultKey()
    const a = await deriveVersionKey(vk)
    const b = await deriveVersionKey(vk)
    assert.equal(a.length, 32)
    assert.deepEqual(Array.from(a), Array.from(b))
  })

  it('deriveAuthKey returns 32 bytes deterministically', async () => {
    const vk = generateVaultKey()
    const a = await deriveAuthKey(vk)
    const b = await deriveAuthKey(vk)
    assert.equal(a.length, 32)
    assert.deepEqual(Array.from(a), Array.from(b))
  })

  it('version key !== auth key (domain separation)', async () => {
    const vk = generateVaultKey()
    const v = await deriveVersionKey(vk)
    const a = await deriveAuthKey(vk)
    assert.notDeepEqual(Array.from(v), Array.from(a))
  })

  it('different vaults produce different sub-keys', async () => {
    const a = await deriveAuthKey(generateVaultKey())
    const b = await deriveAuthKey(generateVaultKey())
    assert.notDeepEqual(Array.from(a), Array.from(b))
  })
})

describe('syncCrypto — pair packet', () => {
  it('generatePairCode returns 6-digit zero-padded code', () => {
    for (let i = 0; i < 30; i++) {
      const code = generatePairCode()
      assert.match(code, /^\d{6}$/)
    }
  })

  it('generatePairCode produces different codes (CSPRNG)', () => {
    const codes = new Set()
    for (let i = 0; i < 30; i++) codes.add(generatePairCode())
    // 6-digit space = 1M; 30 samples should be all unique with high prob
    assert.ok(codes.size >= 28, `expected nearly 30 unique codes, got ${codes.size}`)
  })

  it('round-trips a pair packet', async () => {
    const code = generatePairCode()
    const packet = {
      vaultId: 'vault-uuid-456',
      vaultKey: Array.from(generateVaultKey()),
      relayUrl: 'wss://dash-relay.efesop.deno.net',
      pairedDevices: [{ deviceId: 'd1', deviceName: 'MacBook' }]
    }
    const encrypted = await encryptPairPacket(packet, code)
    assert.equal(encrypted.v, 1)
    assert.equal(encrypted.cipher, 'AES-GCM-256')
    assert.equal(encrypted.kdf, 'PBKDF2-SHA256')
    assert.equal(encrypted.iterations, 100000)
    const decrypted = await decryptPairPacket(encrypted, code)
    assert.deepEqual(decrypted, packet)
  })

  it('throws DecryptionError with wrong pair code', async () => {
    const correct = '123456'
    const wrong = '654321'
    const packet = { vaultId: 'v1', vaultKey: Array.from(generateVaultKey()) }
    const encrypted = await encryptPairPacket(packet, correct)
    await assert.rejects(
      () => decryptPairPacket(encrypted, wrong),
      err => err instanceof DecryptionError && /wrong pair code/.test(err.message)
    )
  })

  it('rejects non-6-digit pair codes', async () => {
    await assert.rejects(() => encryptPairPacket({}, '12345'), /6 digits/)
    await assert.rejects(() => encryptPairPacket({}, '1234567'), /6 digits/)
    await assert.rejects(() => encryptPairPacket({}, 'abcdef'), /6 digits/)
  })
})

describe('syncCrypto — vault key wrap/unwrap (passphrase)', () => {
  it('round-trips with correct passphrase', async () => {
    const vk = generateVaultKey()
    const wrapped = await wrapVaultKeyWithPassphrase(vk, 'my-app-lock-password')
    const unwrapped = await unwrapVaultKeyWithPassphrase(wrapped, 'my-app-lock-password')
    assert.deepEqual(Array.from(unwrapped), Array.from(vk))
  })

  it('throws on wrong passphrase', async () => {
    const vk = generateVaultKey()
    const wrapped = await wrapVaultKeyWithPassphrase(vk, 'correct')
    await assert.rejects(
      () => unwrapVaultKeyWithPassphrase(wrapped, 'wrong'),
      err => err instanceof DecryptionError
    )
  })
})

describe('syncCrypto — vault key wrap/unwrap (CryptoKey)', () => {
  it('round-trips with same CryptoKey', async () => {
    // Build an AES-GCM CryptoKey to simulate the app-lock-derived key
    const salt = new Uint8Array(16).fill(0xAB)
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('app-lock-pw'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )
    const appLockKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
    const vk = generateVaultKey()
    const wrapped = await wrapVaultKey(vk, appLockKey, salt)
    const unwrapped = await unwrapVaultKey(wrapped, appLockKey)
    assert.deepEqual(Array.from(unwrapped), Array.from(vk))
  })
})

// =============================================================================
// lib/syncAuth.js — auth proofs
// =============================================================================

describe('syncAuth — generateAuthProof', () => {
  const baseArgs = {
    vaultId: 'vault-1',
    deviceId: 'device-A',
    timestamp: 1700000000000,
    method: 'POST',
    path: '/sync/push'
  }

  it('produces 64-char hex output (32-byte HMAC)', async () => {
    const vk = generateVaultKey()
    const proof = await generateAuthProof(vk, baseArgs)
    assert.equal(proof.length, 64)
    assert.match(proof, /^[0-9a-f]+$/)
  })

  it('is deterministic for same inputs', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, baseArgs)
    const b = await generateAuthProof(vk, baseArgs)
    assert.equal(a, b)
  })

  it('different vault keys produce different proofs', async () => {
    const a = await generateAuthProof(generateVaultKey(), baseArgs)
    const b = await generateAuthProof(generateVaultKey(), baseArgs)
    assert.notEqual(a, b)
  })

  it('different paths produce different proofs (binding)', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, { ...baseArgs, path: '/sync/push' })
    const b = await generateAuthProof(vk, { ...baseArgs, path: '/sync/pull' })
    assert.notEqual(a, b)
  })

  it('different methods produce different proofs', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, { ...baseArgs, method: 'POST' })
    const b = await generateAuthProof(vk, { ...baseArgs, method: 'GET' })
    assert.notEqual(a, b)
  })

  it('different timestamps produce different proofs (replay protection)', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, { ...baseArgs, timestamp: 1700000000000 })
    const b = await generateAuthProof(vk, { ...baseArgs, timestamp: 1700000001000 })
    assert.notEqual(a, b)
  })

  it('different device IDs produce different proofs', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, { ...baseArgs, deviceId: 'd1' })
    const b = await generateAuthProof(vk, { ...baseArgs, deviceId: 'd2' })
    assert.notEqual(a, b)
  })

  it('different vault IDs produce different proofs', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, { ...baseArgs, vaultId: 'v1' })
    const b = await generateAuthProof(vk, { ...baseArgs, vaultId: 'v2' })
    assert.notEqual(a, b)
  })

  it('method is normalized to uppercase', async () => {
    const vk = generateVaultKey()
    const a = await generateAuthProof(vk, { ...baseArgs, method: 'post' })
    const b = await generateAuthProof(vk, { ...baseArgs, method: 'POST' })
    assert.equal(a, b)
  })

  it('rejects invalid inputs', async () => {
    const vk = generateVaultKey()
    await assert.rejects(() => generateAuthProof(vk, { ...baseArgs, vaultId: '' }), /vaultId/)
    await assert.rejects(() => generateAuthProof(vk, { ...baseArgs, deviceId: '' }), /deviceId/)
    await assert.rejects(() => generateAuthProof(vk, { ...baseArgs, timestamp: 0 }), /timestamp/)
    await assert.rejects(() => generateAuthProof(vk, { ...baseArgs, method: '' }), /method/)
    await assert.rejects(() => generateAuthProof(vk, { ...baseArgs, path: 'no-leading-slash' }), /\//)
    await assert.rejects(() => generateAuthProof(new Uint8Array(16), baseArgs), /32-byte/)
  })
})

describe('syncAuth — buildSyncHeaders', () => {
  it('builds standard headers object', async () => {
    const vk = generateVaultKey()
    const headers = await buildSyncHeaders(vk, {
      vaultId: 'v1',
      deviceId: 'd1',
      timestamp: 1700000000000,
      method: 'POST',
      path: '/sync/push',
      contentType: 'application/json'
    })
    assert.equal(headers['X-Vault-Id'], 'v1')
    assert.equal(headers['X-Device-Id'], 'd1')
    assert.equal(headers['X-Timestamp'], '1700000000000')
    assert.match(headers['X-Auth'], /^[0-9a-f]{64}$/)
    assert.equal(headers['Content-Type'], 'application/json')
  })

  it('omits Content-Type when not provided', async () => {
    const vk = generateVaultKey()
    const headers = await buildSyncHeaders(vk, {
      vaultId: 'v1',
      deviceId: 'd1',
      timestamp: 1700000000000,
      method: 'GET',
      path: '/sync/pull'
    })
    assert.equal('Content-Type' in headers, false)
  })
})

describe('syncAuth — MAX_TIMESTAMP_DRIFT_MS', () => {
  it('exports 5 minutes', () => {
    assert.equal(MAX_TIMESTAMP_DRIFT_MS, 5 * 60 * 1000)
  })
})
