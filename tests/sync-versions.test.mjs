/**
 * Synced version history (lib/syncVersions) tests.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.CryptoKey) globalThis.CryptoKey = webcrypto.CryptoKey

const syncVersions = await import('../lib/syncVersions.js')
const syncCrypto = await import('../lib/syncCrypto.js')
const syncQueue = await import('../lib/syncQueue.js')

const { fetchVersionList, fetchVersion } = syncVersions
const { generateVaultKey, importVaultKey, encryptEnvelope } = syncCrypto
const { base64Encode } = syncQueue

async function setupCreds () {
  const vaultKeyBytes = generateVaultKey()
  const vaultCryptoKey = await importVaultKey(vaultKeyBytes)
  return {
    vaultKeyBytes, vaultCryptoKey,
    vaultId: 'vault-versions-test',
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

describe('syncVersions — fetchVersionList', () => {
  it('returns parsed version list', async () => {
    const creds = await setupCreds()
    const versions = [
      { version: 5, uploadedAt: 1000, authorDeviceId: 'dev-A', size: 100 },
      { version: 3, uploadedAt: 900, authorDeviceId: 'dev-B', size: 80 }
    ]
    const m = mkFetch({ body: { versions } })
    const result = await fetchVersionList({ noteId: 'note-1', credentials: creds, fetch: m.fn })
    assert.equal(result.ok, true)
    assert.equal(result.versions.length, 2)
    assert.match(m.requests[0].url, /\/sync\/note\/note-1\/versions$/)
  })

  it('builds auth headers and converts wss→https', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: { versions: [] } })
    await fetchVersionList({ noteId: 'note-1', credentials: creds, fetch: m.fn })
    const h = m.requests[0].init.headers
    assert.equal(h['X-Vault-Id'], creds.vaultId)
    assert.equal(h['X-Device-Id'], creds.deviceId)
    assert.match(h['X-Auth'], /^[0-9a-f]{64}$/)
    assert.match(m.requests[0].url, /^https:\/\//)
  })

  it('handles 404 cleanly', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ ok: false, status: 404, body: { error: 'not-found' } })
    const result = await fetchVersionList({ noteId: 'unknown', credentials: creds, fetch: m.fn })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'not-found')
  })

  it('handles network error', async () => {
    const creds = await setupCreds()
    const fn = async () => { throw new Error('socket reset') }
    const result = await fetchVersionList({ noteId: 'n1', credentials: creds, fetch: fn })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'network')
  })

  it('rejects bad inputs', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: { versions: [] } })
    await assert.rejects(() => fetchVersionList({ noteId: '', credentials: creds, fetch: m.fn }), /noteId/)
    await assert.rejects(() => fetchVersionList({ noteId: 'n', credentials: null, fetch: m.fn }), /credentials/)
  })

  it('returns empty array when server returns no versions field', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: {} })
    const result = await fetchVersionList({ noteId: 'n', credentials: creds, fetch: m.fn })
    assert.equal(result.ok, true)
    assert.deepEqual(result.versions, [])
  })
})

describe('syncVersions — fetchVersion', () => {
  it('GETs and decrypts a specific version', async () => {
    const creds = await setupCreds()
    // Build a server-shaped envelope (matches Phase 2.4 wire format)
    const innerPlaintext = {
      schemaVersion: 1,
      envelopeType: 'note',
      resourceId: 'n1',
      payload: { id: 'n1', title: 'Old version', content: { blocks: [{ type: 'paragraph', data: { text: 'old' } }] } },
      timestamp: 5000,
      authorDeviceId: 'remote',
      parentVersion: null
    }
    const enc = await encryptEnvelope(innerPlaintext, creds.vaultCryptoKey)
    const wireBytes = new TextEncoder().encode(JSON.stringify(enc))
    const ciphertextB64 = base64Encode(wireBytes)
    const m = mkFetch({ body: { ciphertext: ciphertextB64, uploadedAt: 5000, authorDeviceId: 'remote' } })

    const result = await fetchVersion({
      noteId: 'n1',
      version: 3,
      credentials: creds,
      fetch: m.fn
    })
    assert.equal(result.ok, true)
    assert.equal(result.payload.title, 'Old version')
    assert.equal(result.payload.content.blocks[0].data.text, 'old')
    assert.equal(result.uploadedAt, 5000)
    assert.equal(result.authorDeviceId, 'remote')
    assert.match(m.requests[0].url, /\/sync\/note\/n1\/version\/3$/)
  })

  it('returns decrypt-failed on wrong-key envelope', async () => {
    const creds = await setupCreds()
    const otherKey = await importVaultKey(generateVaultKey())
    const inner = {
      schemaVersion: 1, envelopeType: 'note', resourceId: 'n1',
      payload: { id: 'n1' }, timestamp: 1, authorDeviceId: 'r', parentVersion: null
    }
    const enc = await encryptEnvelope(inner, otherKey)
    const wireBytes = new TextEncoder().encode(JSON.stringify(enc))
    const ciphertextB64 = base64Encode(wireBytes)
    const m = mkFetch({ body: { ciphertext: ciphertextB64 } })
    const result = await fetchVersion({
      noteId: 'n1', version: 1, credentials: creds, fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'decrypt-failed')
  })

  it('handles 404 (version doesn\'t exist)', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ ok: false, status: 404, body: { error: 'not-found' } })
    const result = await fetchVersion({
      noteId: 'n1', version: 99, credentials: creds, fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'not-found')
  })

  it('returns invalid-response on missing ciphertext', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: { uploadedAt: 1000 } })
    const result = await fetchVersion({
      noteId: 'n1', version: 1, credentials: creds, fetch: m.fn
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'invalid-response')
  })

  it('rejects bad inputs', async () => {
    const creds = await setupCreds()
    const m = mkFetch({ body: { ciphertext: 'x' } })
    await assert.rejects(() => fetchVersion({ noteId: '', version: 1, credentials: creds, fetch: m.fn }), /noteId/)
    await assert.rejects(() => fetchVersion({ noteId: 'n', version: 0, credentials: creds, fetch: m.fn }), /version/)
    await assert.rejects(() => fetchVersion({ noteId: 'n', version: 1.5, credentials: creds, fetch: m.fn }), /version/)
    await assert.rejects(() => fetchVersion({ noteId: 'n', version: 1, credentials: null, fetch: m.fn }), /credentials/)
  })
})
