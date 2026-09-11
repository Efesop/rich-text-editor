/**
 * Sync attachments + binary encryption tests.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.CryptoKey) globalThis.CryptoKey = webcrypto.CryptoKey

const syncCrypto = await import('../lib/syncCrypto.js')
const syncAttachments = await import('../lib/syncAttachments.js')
const cryptoUtils = await import('../utils/cryptoUtils.js')

const { generateVaultKey, importVaultKey, encryptBytes, decryptBytes } = syncCrypto
const { pushAttachment, pullAttachment, extractAttachmentIds, newAttachmentIds } = syncAttachments
const { DecryptionError } = cryptoUtils

// =============================================================================
// encryptBytes / decryptBytes
// =============================================================================

describe('syncCrypto — encryptBytes / decryptBytes', () => {
  it('round-trips arbitrary bytes', async () => {
    const key = await importVaultKey(generateVaultKey())
    const orig = new Uint8Array([0, 1, 2, 3, 255, 254, 100])
    const enc = await encryptBytes(orig, key)
    const dec = await decryptBytes(enc, key)
    assert.deepEqual(Array.from(dec), Array.from(orig))
  })

  it('output is 12 + N + 16 bytes (IV + ciphertext + GCM tag)', async () => {
    const key = await importVaultKey(generateVaultKey())
    const orig = new Uint8Array(100)
    const enc = await encryptBytes(orig, key)
    assert.equal(enc.length, 12 + 100 + 16) // IV + ct + auth tag
  })

  it('IV is random per call', async () => {
    const key = await importVaultKey(generateVaultKey())
    const data = new Uint8Array(50)
    const a = await encryptBytes(data, key)
    const b = await encryptBytes(data, key)
    assert.notDeepEqual(Array.from(a.slice(0, 12)), Array.from(b.slice(0, 12)))
    assert.notDeepEqual(Array.from(a.slice(12)), Array.from(b.slice(12)))
  })

  it('throws DecryptionError with wrong key', async () => {
    const k1 = await importVaultKey(generateVaultKey())
    const k2 = await importVaultKey(generateVaultKey())
    const enc = await encryptBytes(new Uint8Array([1, 2, 3]), k1)
    await assert.rejects(
      () => decryptBytes(enc, k2),
      err => err instanceof DecryptionError && /wrong vault key/.test(err.message)
    )
  })

  it('throws DecryptionError on corruption', async () => {
    const key = await importVaultKey(generateVaultKey())
    const enc = await encryptBytes(new Uint8Array([1, 2, 3, 4, 5]), key)
    enc[15] ^= 0xFF // flip a byte in ciphertext
    await assert.rejects(
      () => decryptBytes(enc, key),
      err => err instanceof DecryptionError
    )
  })

  it('throws on too-short blob', async () => {
    const key = await importVaultKey(generateVaultKey())
    await assert.rejects(
      () => decryptBytes(new Uint8Array(10), key),
      err => err instanceof DecryptionError && /length/.test(err.message)
    )
  })

  it('rejects non-Uint8Array', async () => {
    const key = await importVaultKey(generateVaultKey())
    await assert.rejects(() => encryptBytes('hello', key), /Uint8Array/)
    await assert.rejects(() => decryptBytes('hello', key), /Uint8Array/)
  })

  it('handles empty bytes', async () => {
    const key = await importVaultKey(generateVaultKey())
    const enc = await encryptBytes(new Uint8Array(0), key)
    const dec = await decryptBytes(enc, key)
    assert.equal(dec.length, 0)
  })

  it('handles 100 KB blob', async () => {
    const key = await importVaultKey(generateVaultKey())
    // Node's webcrypto polyfill caps getRandomValues at 64 KB per call,
    // so build the test buffer in two chunks. Pseudo-random content is
    // sufficient — we're testing encrypt/decrypt correctness, not
    // randomness.
    const orig = new Uint8Array(100 * 1024)
    crypto.getRandomValues(orig.subarray(0, 50 * 1024))
    crypto.getRandomValues(orig.subarray(50 * 1024))
    const enc = await encryptBytes(orig, key)
    const dec = await decryptBytes(enc, key)
    assert.deepEqual(Array.from(dec.slice(0, 100)), Array.from(orig.slice(0, 100)))
    assert.equal(dec.length, orig.length)
  })
})

// =============================================================================
// extractAttachmentIds / newAttachmentIds
// =============================================================================

// Attachment ids are UUID-shaped; anything else is not an attachment.
const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'
const IDA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const IDB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const IDC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const { imageStubUrl } = await import('../lib/attachmentRefs.js')

describe('syncAttachments — extractAttachmentIds', () => {
  it('returns empty for null/empty', () => {
    assert.deepEqual(extractAttachmentIds(null), [])
    assert.deepEqual(extractAttachmentIds(undefined), [])
    assert.deepEqual(extractAttachmentIds({ content: { blocks: [] } }), [])
  })

  it('extracts attachment IDs from blocks', () => {
    const page = {
      content: {
        blocks: [
          { type: 'paragraph', data: { text: 'hi' } },
          { type: 'attachment', data: { attachmentId: ID1, filename: 'a.png' } },
          { type: 'attachment', data: { attachmentId: ID2, filename: 'b.pdf' } }
        ]
      }
    }
    assert.deepEqual(extractAttachmentIds(page).sort(), [ID1, ID2])
  })

  it('deduplicates', () => {
    const page = {
      content: {
        blocks: [
          { type: 'attachment', data: { attachmentId: ID1 } },
          { type: 'attachment', data: { attachmentId: ID1 } }
        ]
      }
    }
    assert.deepEqual(extractAttachmentIds(page), [ID1])
  })

  it('skips blocks with missing attachmentId', () => {
    const page = {
      content: {
        blocks: [
          { type: 'attachment', data: {} },
          { type: 'attachment' },
          { type: 'attachment', data: { attachmentId: ID3 } }
        ]
      }
    }
    assert.deepEqual(extractAttachmentIds(page), [ID3])
  })

  it('includes photos stored as attachments, from attachmentId or the stub an older app kept', () => {
    const page = {
      content: {
        blocks: [
          { type: 'image', data: { attachmentId: ID1, file: { url: imageStubUrl(ID1) } } },
          { type: 'image', data: { file: { url: imageStubUrl(ID2) } } },
          { type: 'image', data: { file: { url: 'https://example.com/a.png' } } },
          { type: 'attachment', data: { attachmentId: 'not-an-id' } }
        ]
      }
    }
    assert.deepEqual(extractAttachmentIds(page), [ID1, ID2])
  })
})

describe('syncAttachments — newAttachmentIds', () => {
  it('returns IDs added between prev and next', () => {
    const prev = { content: { blocks: [{ type: 'attachment', data: { attachmentId: IDA } }] } }
    const next = {
      content: {
        blocks: [
          { type: 'attachment', data: { attachmentId: IDA } },
          { type: 'attachment', data: { attachmentId: IDB } },
          { type: 'attachment', data: { attachmentId: IDC } }
        ]
      }
    }
    assert.deepEqual(newAttachmentIds(prev, next).sort(), [IDB, IDC])
  })

  it('null prev → all next IDs', () => {
    const next = { content: { blocks: [{ type: 'attachment', data: { attachmentId: IDA } }] } }
    assert.deepEqual(newAttachmentIds(null, next), [IDA])
  })

  it('removed IDs not returned (only ADDED)', () => {
    const prev = {
      content: { blocks: [
        { type: 'attachment', data: { attachmentId: IDA } },
        { type: 'attachment', data: { attachmentId: IDB } }
      ] }
    }
    const next = { content: { blocks: [{ type: 'attachment', data: { attachmentId: IDA } }] } }
    assert.deepEqual(newAttachmentIds(prev, next), [])
  })
})

// =============================================================================
// pushAttachment / pullAttachment — with mocked fetch
// =============================================================================

async function setupCreds () {
  const vaultKeyBytes = generateVaultKey()
  const vaultCryptoKey = await importVaultKey(vaultKeyBytes)
  return {
    vaultKeyBytes, vaultCryptoKey,
    vaultId: 'vault-att-test',
    deviceId: 'dev-1',
    relayUrl: 'wss://relay.test'
  }
}

function mkFetch (response) {
  const requests = []
  const fn = async (url, init) => {
    requests.push({ url, init })
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: { get: () => null },
      json: async () => response.body || {}
    }
  }
  return { fn, requests }
}

describe('syncAttachments — pushAttachment', () => {
  it('encrypts and POSTs to /sync/attachment/:id', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: { ok: true, dedupKey: null } })
    const result = await pushAttachment({
      attachmentId: 'att-uuid-1',
      bytes: new TextEncoder().encode('PDF binary content here'),
      mimeTypeHint: 'application/pdf',
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, true)
    assert.equal(m.requests.length, 1)
    assert.match(m.requests[0].url, /\/sync\/attachment\/att-uuid-1$/)
    assert.match(m.requests[0].url, /^https:\/\//)
    assert.equal(m.requests[0].init.method, 'POST')
    const body = JSON.parse(m.requests[0].init.body)
    assert.equal(typeof body.ciphertext, 'string')
    assert.equal(body.originalSize, 23) // length of "PDF binary content here"
    assert.equal(body.mimeTypeHint, 'application/pdf')
    // No plaintext leaks
    assert.equal(body.ciphertext.includes('PDF binary'), false)
  })

  it('returns dedupKey on already-uploaded attachment', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: { ok: true, dedupKey: 'existing' } })
    const result = await pushAttachment({
      attachmentId: 'att-1',
      bytes: new Uint8Array([1, 2, 3]),
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, true)
    assert.equal(result.dedupKey, 'existing')
  })

  it('handles 413 too-large', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ ok: false, status: 413, body: { error: 'payload-too-large' } })
    const result = await pushAttachment({
      attachmentId: 'att-1',
      bytes: new Uint8Array(100),
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'payload-too-large')
  })

  it('handles network error', async () => {
    const creds = await setupCreds()
    const fn = async () => { throw new Error('network down') }
    const result = await pushAttachment({
      attachmentId: 'att-1',
      bytes: new Uint8Array(10),
      credentials: creds,
      fetch: fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'network')
  })

  it('rejects bad inputs', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: {} })
    await assert.rejects(() => pushAttachment({ attachmentId: '', bytes: new Uint8Array(0), credentials: creds, fetch: m.fn }))
    await assert.rejects(() => pushAttachment({ attachmentId: 'a', bytes: 'not bytes', credentials: creds, fetch: m.fn }))
    await assert.rejects(() => pushAttachment({ attachmentId: 'a', bytes: new Uint8Array(0), credentials: null, fetch: m.fn }))
  })
})

describe('syncAttachments — pullAttachment', () => {
  it('GETs and decrypts attachment', async () => {
    const creds = await setupCreds()
    const orig = new TextEncoder().encode('image bytes')
    const enc = await encryptBytes(orig, creds.vaultCryptoKey)
    const ciphertextB64 = (await import('../lib/syncQueue.js')).base64Encode(enc)

    const m = mkFetch({ body: { ciphertext: ciphertextB64 } })
    const result = await pullAttachment({
      attachmentId: 'att-1',
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, true)
    assert.deepEqual(Array.from(result.bytes), Array.from(orig))
  })

  it('returns 404 cleanly', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ ok: false, status: 404, body: { error: 'not-found' } })
    const result = await pullAttachment({
      attachmentId: 'att-missing',
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'not-found')
  })

  it('returns decrypt-failed when ciphertext is wrong-key encrypted', async () => {
    const creds = await setupCreds()
    const otherKey = await importVaultKey(generateVaultKey())
    const enc = await encryptBytes(new Uint8Array([1, 2, 3]), otherKey)
    const ciphertextB64 = (await import('../lib/syncQueue.js')).base64Encode(enc)
    const m = mkFetch({ body: { ciphertext: ciphertextB64 } })
    const result = await pullAttachment({
      attachmentId: 'att-1',
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'decrypt-failed')
  })

  it('returns invalid-response on missing ciphertext', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: {} })
    const result = await pullAttachment({
      attachmentId: 'att-1',
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'invalid-response')
  })
})

// =============================================================================
// Exists check and relay pacing signals (attachment transfer queue support)
// =============================================================================

async function transferCredentials () {
  const vaultKeyBytes = generateVaultKey()
  return { vaultKeyBytes, vaultCryptoKey: await importVaultKey(vaultKeyBytes), vaultId: 'vault-1', deviceId: 'device-1', relayUrl: 'wss://relay.test' }
}

const jsonResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body
})

describe('syncAttachments — attachmentsExist', () => {
  const { attachmentsExist, MAX_EXISTS_IDS } = syncAttachments

  it('asks the relay which ids it already holds', async () => {
    const requests = []
    const fetch = async (url, init) => { requests.push({ url, init }); return jsonResponse(200, { present: ['a'], missing: ['b'] }) }
    const result = await attachmentsExist({ ids: ['a', 'b'], credentials: await transferCredentials(), fetch })
    assert.deepEqual(result, { ok: true, present: ['a'], missing: ['b'] })
    assert.equal(requests[0].url, 'https://relay.test/sync/attachments/exists')
    assert.equal(requests[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(requests[0].init.body), { ids: ['a', 'b'] })
  })

  it('reports a relay that predates the check as not-found', async () => {
    const fetch = async () => jsonResponse(404, { error: 'not-found' })
    const result = await attachmentsExist({ ids: ['a'], credentials: await transferCredentials(), fetch })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'not-found')
  })

  it('refuses more ids than the relay answers for in one request', async () => {
    const ids = Array.from({ length: MAX_EXISTS_IDS + 1 }, (_, i) => `id-${i}`)
    await assert.rejects(() => attachmentsExist({ ids, credentials: {}, fetch: async () => jsonResponse(200, {}) }))
  })
})

describe('syncAttachments — relay pacing signals', () => {
  it('surfaces Retry-After when an upload is rate-limited', async () => {
    const fetch = async () => jsonResponse(429, { error: 'rate-limited' }, { 'retry-after': '42' })
    const result = await pushAttachment({ attachmentId: 'a', bytes: new Uint8Array([1]), credentials: await transferCredentials(), fetch })
    assert.equal(result.errorCode, 'rate-limited')
    assert.equal(result.retryAfterMs, 42000)
  })

  it('surfaces the relay running out of attachment space', async () => {
    const fetch = async () => jsonResponse(503, { error: 'capacity' }, { 'retry-after': '3600' })
    const result = await pushAttachment({ attachmentId: 'a', bytes: new Uint8Array([1]), credentials: await transferCredentials(), fetch })
    assert.equal(result.errorCode, 'capacity')
    assert.equal(result.retryAfterMs, 3600000)
  })

  it('surfaces Retry-After when a download is rate-limited', async () => {
    const fetch = async () => jsonResponse(429, { error: 'rate-limited' }, { 'retry-after': '7' })
    const result = await pullAttachment({ attachmentId: 'a', credentials: await transferCredentials(), fetch })
    assert.equal(result.retryAfterMs, 7000)
  })
})
