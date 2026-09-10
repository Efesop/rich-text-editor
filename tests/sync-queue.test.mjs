/**
 * Sync queue + vault storage test suite.
 *
 * Run with: npm test
 *
 * Covers:
 *   - lib/vaultStorage.js: createVaultStore, vault create/load/save/unlock,
 *     two-phase commit re-key (rollback semantics), validation
 *   - lib/syncQueue.js: enqueue/flush/coalesce/persist/restore, retry/backoff,
 *     rate-limit pause, batch sizing, duress clear
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.CryptoKey) globalThis.CryptoKey = webcrypto.CryptoKey

const vaultStorage = await import('../lib/vaultStorage.js')
const syncQueue = await import('../lib/syncQueue.js')
const syncCrypto = await import('../lib/syncCrypto.js')
const cryptoUtils = await import('../utils/cryptoUtils.js')

const {
  createVaultStore,
  createMemoryBackend,
  validateMetadata,
  VAULT_METADATA_VERSION
} = vaultStorage

const {
  createSyncQueue,
  base64Encode,
  base64Decode,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_BATCH_COUNT,
  DEFAULT_BATCH_BYTES,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  RATE_LIMIT_PAUSE_MS,
  MAX_QUEUE_LENGTH
} = syncQueue

const { generateVaultKey, importVaultKey } = syncCrypto
const { deriveKeyFromPassphrase } = cryptoUtils

// =============================================================================
// vaultStorage — pure logic tests
// =============================================================================

describe('vaultStorage — validateMetadata', () => {
  it('accepts a fresh empty metadata object (syncEnabled=false)', () => {
    const m = {
      version: VAULT_METADATA_VERSION,
      vaultId: null,
      deviceId: null,
      deviceName: null,
      syncEnabled: false,
      relayUrl: null,
      createdAt: null,
      lastPairedAt: null,
      pairedDevices: [],
      lastSyncedVersion: {},
      cursorVersion: 0,
      wrappedVaultKey: null,
      keyWrapMethod: null
    }
    assert.doesNotThrow(() => validateMetadata(m))
  })

  it('rejects wrong schema version', () => {
    assert.throws(() => validateMetadata({ version: 99, syncEnabled: false, pairedDevices: [], lastSyncedVersion: {}, cursorVersion: 0 }), /unsupported version/)
  })

  it('rejects null', () => {
    assert.throws(() => validateMetadata(null), /must be an object/)
  })

  it('rejects syncEnabled=true without vaultId', () => {
    assert.throws(() => validateMetadata({
      version: VAULT_METADATA_VERSION,
      syncEnabled: true,
      vaultId: null,
      deviceId: 'd',
      relayUrl: 'wss://x',
      wrappedVaultKey: {},
      keyWrapMethod: 'app-lock',
      pairedDevices: [],
      lastSyncedVersion: {},
      cursorVersion: 0
    }), /vaultId missing/)
  })

  it('rejects syncEnabled=true without wrappedVaultKey', () => {
    assert.throws(() => validateMetadata({
      version: VAULT_METADATA_VERSION,
      syncEnabled: true,
      vaultId: 'v',
      deviceId: 'd',
      relayUrl: 'wss://x',
      wrappedVaultKey: null,
      keyWrapMethod: 'app-lock',
      pairedDevices: [],
      lastSyncedVersion: {},
      cursorVersion: 0
    }), /wrappedVaultKey missing/)
  })

  it('rejects invalid relay URL', () => {
    assert.throws(() => validateMetadata({
      version: VAULT_METADATA_VERSION,
      syncEnabled: true,
      vaultId: 'v',
      deviceId: 'd',
      relayUrl: 'http://insecure.example.com',
      wrappedVaultKey: {},
      keyWrapMethod: 'app-lock',
      pairedDevices: [],
      lastSyncedVersion: {},
      cursorVersion: 0
    }), /relayUrl/)
  })

  it('rejects invalid keyWrapMethod', () => {
    assert.throws(() => validateMetadata({
      version: VAULT_METADATA_VERSION,
      syncEnabled: true,
      vaultId: 'v',
      deviceId: 'd',
      relayUrl: 'wss://x',
      wrappedVaultKey: {},
      keyWrapMethod: 'rot13',
      pairedDevices: [],
      lastSyncedVersion: {},
      cursorVersion: 0
    }), /invalid keyWrapMethod/)
  })
})

describe('vaultStorage — createVaultStore (memory backend)', () => {
  it('load returns empty metadata when backend empty', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    const m = await store.load()
    assert.equal(m.syncEnabled, false)
    assert.equal(m.vaultId, null)
    assert.equal(m.version, VAULT_METADATA_VERSION)
  })

  it('createVault with passphrase mode produces valid metadata', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    const { metadata, vaultKey } = await store.createVault({
      deviceName: 'TestMac',
      relayUrl: 'wss://relay.test',
      wrapMethod: 'passphrase',
      passphrase: 'unit-test-pw-with-enough-entropy'
    })
    assert.equal(metadata.syncEnabled, true)
    assert.equal(metadata.deviceName, 'TestMac')
    assert.equal(metadata.relayUrl, 'wss://relay.test')
    assert.equal(metadata.keyWrapMethod, 'passphrase')
    assert.ok(metadata.vaultId)
    assert.ok(metadata.deviceId)
    assert.equal(vaultKey.length, 32)
    // Validation passes
    validateMetadata(metadata)
  })

  it('save persists metadata and load returns it', async () => {
    const backend = createMemoryBackend(null)
    const store = createVaultStore(backend)
    const { metadata } = await store.createVault({
      deviceName: 'Mac',
      relayUrl: 'wss://r.test',
      wrapMethod: 'passphrase',
      passphrase: 'pw-12345'
    })
    await store.save(metadata)
    const reloaded = await store.load()
    assert.equal(reloaded.vaultId, metadata.vaultId)
    assert.equal(reloaded.deviceId, metadata.deviceId)
    assert.equal(reloaded.syncEnabled, true)
  })

  it('unlock with correct passphrase recovers vault key', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    const { metadata, vaultKey } = await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'pw'
    })
    store.lock()
    assert.equal(store.isUnlocked(), false)
    const recovered = await store.unlock(metadata, { passphrase: 'pw' })
    assert.equal(store.isUnlocked(), true)
    assert.deepEqual(Array.from(recovered), Array.from(vaultKey))
    assert.ok(store.getVaultCryptoKey() instanceof CryptoKey)
  })

  it('unlock with wrong passphrase throws', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    const { metadata } = await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'correct'
    })
    store.lock()
    await assert.rejects(() => store.unlock(metadata, { passphrase: 'wrong' }))
    assert.equal(store.isUnlocked(), false)
  })

  it('lock clears in-memory key', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'pw'
    })
    assert.equal(store.isUnlocked(), true)
    store.lock()
    assert.equal(store.isUnlocked(), false)
    assert.equal(store.getVaultKey(), null)
    assert.equal(store.getVaultCryptoKey(), null)
  })

  it('disableSync clears backend', async () => {
    const backend = createMemoryBackend(null)
    const store = createVaultStore(backend)
    const { metadata } = await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'pw'
    })
    await store.save(metadata)
    assert.notEqual(await backend.read(), null)
    await store.disableSync()
    assert.equal(await backend.read(), null)
    assert.equal(store.isUnlocked(), false)
  })

  it('createVault rejects bogus inputs', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    await assert.rejects(() => store.createVault({ deviceName: '', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'pw' }), /deviceName/)
    await assert.rejects(() => store.createVault({ deviceName: 'X', relayUrl: 'http://insecure', wrapMethod: 'passphrase', passphrase: 'pw' }), /relayUrl/)
    await assert.rejects(() => store.createVault({ deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: '' }), /passphrase/)
    await assert.rejects(() => store.createVault({ deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'invalid' }), /unknown wrapMethod/)
  })

  it('createVault with safe-storage mode delegates raw-key storage', async () => {
    let stored = null
    const store = createVaultStore(createMemoryBackend(null))
    const { metadata, vaultKey } = await store.createVault({
      deviceName: 'X',
      relayUrl: 'wss://r',
      wrapMethod: 'safe-storage',
      safeStorageStore: async (raw) => { stored = raw }
    })
    assert.equal(metadata.keyWrapMethod, 'safe-storage')
    assert.equal(metadata.wrappedVaultKey.method, 'safe-storage')
    assert.equal(metadata.wrappedVaultKey.ref, 'vault-key')
    assert.deepEqual(Array.from(stored), Array.from(vaultKey))
  })
})

describe('vaultStorage — rekey (two-phase commit)', () => {
  async function deriveAppLockKey (passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKeyFromPassphrase(passphrase, salt)
    return { key, salt }
  }

  it('rekey from passphrase to passphrase succeeds and verifies', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    const { metadata, vaultKey } = await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'old-pw'
    })
    store.lock()
    const updated = await store.rekey(
      metadata,
      { passphrase: 'old-pw' },
      { wrapMethod: 'passphrase', passphrase: 'new-pw' }
    )
    assert.equal(updated.keyWrapMethod, 'passphrase')
    // Verify new wrapping decrypts to the same key
    store.lock()
    const recovered = await store.unlock(updated, { passphrase: 'new-pw' })
    assert.deepEqual(Array.from(recovered), Array.from(vaultKey))
  })

  it('rekey from app-lock to app-lock succeeds', async () => {
    const oldAppLock = await deriveAppLockKey('old-app-pw')
    const newAppLock = await deriveAppLockKey('new-app-pw')

    const store = createVaultStore(createMemoryBackend(null))
    const { metadata, vaultKey } = await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'app-lock', appLockKey: oldAppLock
    })
    const updated = await store.rekey(
      metadata,
      { appLockKey: oldAppLock },
      { wrapMethod: 'app-lock', appLockKey: newAppLock }
    )
    store.lock()
    const recovered = await store.unlock(updated, { appLockKey: newAppLock })
    assert.deepEqual(Array.from(recovered), Array.from(vaultKey))
  })

  it('rekey leaves original metadata untouched if verify fails', async () => {
    const store = createVaultStore(createMemoryBackend(null))
    const { metadata } = await store.createVault({
      deviceName: 'X', relayUrl: 'wss://r', wrapMethod: 'passphrase', passphrase: 'old-pw'
    })
    const originalWrapped = metadata.wrappedVaultKey
    // Force a failure: provide bogus old credential
    await assert.rejects(() => store.rekey(
      metadata,
      { passphrase: 'WRONG-old-pw' },
      { wrapMethod: 'passphrase', passphrase: 'new-pw' }
    ))
    // Original metadata.wrappedVaultKey is unchanged (we returned new metadata
    // separately; caller writes only on success)
    assert.deepEqual(metadata.wrappedVaultKey, originalWrapped)
  })
})

// =============================================================================
// syncQueue — base64 helpers
// =============================================================================

describe('syncQueue — base64Encode / base64Decode', () => {
  it('round-trips arbitrary bytes', () => {
    const orig = new Uint8Array([0x00, 0xFF, 0x42, 0xAB, 0xCD, 0xEF])
    const enc = base64Encode(orig)
    const dec = base64Decode(enc)
    assert.deepEqual(Array.from(dec), Array.from(orig))
  })

  it('produces standard base64 padding', () => {
    assert.equal(base64Encode(new Uint8Array([0x66, 0x6F, 0x6F])), 'Zm9v')
    assert.equal(base64Encode(new Uint8Array([0x66, 0x6F])), 'Zm8=')
  })

  it('rejects non-Uint8Array', () => {
    assert.throws(() => base64Encode([1, 2, 3]), /Uint8Array/)
  })
})

// =============================================================================
// syncQueue — full lifecycle
// =============================================================================

/**
 * Test helper: build a working credentials provider + mock fetch that records
 * all requests and returns success by default. Tests can override the mock to
 * simulate failures.
 */
async function setupQueueFixture (extraOpts = {}) {
  const vaultKeyBytes = generateVaultKey()
  const vaultCryptoKey = await importVaultKey(vaultKeyBytes)

  const credentials = {
    vaultKeyBytes,
    vaultCryptoKey,
    vaultId: 'vault-test-1',
    deviceId: 'device-test-A',
    relayUrl: 'wss://relay.test'
  }

  const requests = []
  let nextResponse = {
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({ results: [], vaultIndex: { lastVersion: 1, totalBytes: 0 } })
  }

  const mockFetch = async (url, init) => {
    requests.push({ url, init })
    return {
      ok: nextResponse.ok,
      status: nextResponse.status,
      headers: { get: (k) => nextResponse.headers.get(k.toLowerCase()) || null },
      json: nextResponse.json
    }
  }

  function setNextResponse (resp) {
    nextResponse = resp
  }

  const persisted = []
  const persistBackend = {
    async read () { return persisted.length === 0 ? null : persisted[persisted.length - 1] },
    async write (data) { persisted.push(JSON.parse(JSON.stringify(data))) },
    async clear () { persisted.length = 0 }
  }

  const stateLog = []
  const queue = createSyncQueue({
    getCredentials: async () => credentials,
    fetch: mockFetch,
    persistBackend,
    onStateChange: (s) => stateLog.push({ status: s.status, count: s.pendingCount }),
    tunables: { debounceMs: 50 }, // fast for tests
    ...extraOpts
  })

  return { queue, credentials, requests, setNextResponse, persisted, stateLog }
}

describe('syncQueue — basic lifecycle', () => {
  it('enqueue + flushNow pushes to the relay', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({
      resourceType: 'note',
      resourceId: 'note-1',
      payload: { id: 'note-1', title: 'Hello', content: { blocks: [] } },
      parentVersion: null
    })
    await fx.queue.flushNow()
    assert.equal(fx.requests.length, 1)
    assert.equal(fx.requests[0].init.method, 'POST')
    assert.match(fx.requests[0].url, /\/sync\/push$/)
    assert.match(fx.requests[0].url, /^https:\/\//) // wss:// → https://
    assert.equal(fx.queue.pendingCount(), 0)
    assert.equal(fx.queue.state().status, 'idle')
  })

  it('debounced flush fires after debounceMs', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    assert.equal(fx.requests.length, 0) // debounced — not yet
    await new Promise(r => setTimeout(r, 100))
    assert.equal(fx.requests.length, 1)
    assert.equal(fx.queue.pendingCount(), 0)
  })

  it('coalesces multiple enqueues for same resource (latest-wins)', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { v: 1 } })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { v: 2 } })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { v: 3 } })
    assert.equal(fx.queue.pendingCount(), 1) // coalesced
    await fx.queue.flushNow()
    assert.equal(fx.requests.length, 1)
    const body = JSON.parse(fx.requests[0].init.body)
    assert.equal(body.envelopes.length, 1)
  })

  it('does NOT coalesce different resources', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n2', payload: { x: 2 } })
    fx.queue.enqueue({ resourceType: 'folder', resourceId: 'n1', payload: { x: 3 } })
    assert.equal(fx.queue.pendingCount(), 3)
    await fx.queue.flushNow()
    const body = JSON.parse(fx.requests[0].init.body)
    assert.equal(body.envelopes.length, 3)
  })

  it('clear() drops all pending envelopes', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n2', payload: { x: 2 } })
    assert.equal(fx.queue.pendingCount(), 2)
    const dropped = fx.queue.clear()
    assert.equal(dropped, 2)
    assert.equal(fx.queue.pendingCount(), 0)
    await new Promise(r => setTimeout(r, 100))
    assert.equal(fx.requests.length, 0) // never pushed
  })

  it('pause + resume', async () => {
    const fx = await setupQueueFixture()
    fx.queue.pause()
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await new Promise(r => setTimeout(r, 100))
    assert.equal(fx.requests.length, 0) // paused
    assert.equal(fx.queue.pendingCount(), 1)
    fx.queue.resume()
    await new Promise(r => setTimeout(r, 100))
    assert.equal(fx.requests.length, 1)
  })
})

describe('syncQueue — retry + backoff', () => {
  it('retries on 5xx with exp backoff (network-like failure)', async () => {
    const fx = await setupQueueFixture()
    let callCount = 0
    fx.setNextResponse({
      ok: false,
      status: 500,
      headers: new Map(),
      json: async () => ({ error: 'server-error' })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await fx.queue.flushNow()
    assert.equal(fx.requests.length, 1)
    assert.equal(fx.queue.pendingCount(), 1) // still in queue
    assert.equal(fx.queue.state().status, 'retry-backoff')
    // Now make next response succeed
    fx.setNextResponse({
      ok: true, status: 200, headers: new Map(),
      json: async () => ({ results: [], vaultIndex: { lastVersion: 1, totalBytes: 0 } })
    })
    await fx.queue.flushNow()
    assert.equal(fx.queue.pendingCount(), 0)
    assert.equal(fx.queue.state().status, 'idle')
  })

  it('pauses queue on 401 unauthorized (permanent failure)', async () => {
    const fx = await setupQueueFixture()
    fx.setNextResponse({
      ok: false, status: 401, headers: new Map(),
      json: async () => ({ error: 'unauthorized' })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await fx.queue.flushNow()
    assert.equal(fx.queue.state().status, 'error')
    assert.equal(fx.queue.pendingCount(), 1) // not dropped
    // Subsequent enqueues do NOT auto-flush
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n2', payload: { x: 2 } })
    await new Promise(r => setTimeout(r, 100))
    assert.equal(fx.requests.length, 1) // only the original
  })

  it('drops single oversize envelope (413 with batch=1)', async () => {
    const fx = await setupQueueFixture()
    fx.setNextResponse({
      ok: false, status: 413, headers: new Map(),
      json: async () => ({ error: 'payload-too-large' })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'huge-1', payload: { x: 'big' } })
    await fx.queue.flushNow()
    // Should drop the oversize envelope
    assert.equal(fx.queue.pendingCount(), 0)
    assert.match(fx.queue.state().lastError, /size limit/)
  })

  it('handles rate-limit (429) by pausing for retry-after', async () => {
    const fx = await setupQueueFixture()
    const headers = new Map()
    headers.set('retry-after', '60') // 60s pause — won't auto-retry within test window
    fx.setNextResponse({
      ok: false, status: 429, headers,
      json: async () => ({ error: 'rate-limited' })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await fx.queue.flushNow()
    assert.equal(fx.queue.state().status, 'rate-limited')
    assert.equal(fx.queue.pendingCount(), 1) // still queued
    fx.queue.dispose() // release timer
  })

  it('retry-backoff state set after 5xx (timer cleanup)', async () => {
    const fx = await setupQueueFixture()
    fx.setNextResponse({
      ok: false, status: 503, headers: new Map(),
      json: async () => ({ error: 'service-unavailable' })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await fx.queue.flushNow()
    assert.equal(fx.queue.state().status, 'retry-backoff')
    fx.queue.dispose()
  })
})

describe('syncQueue — credential gating', () => {
  it('pauses (does not push) when getCredentials throws', async () => {
    const fx = await setupQueueFixture()
    // Override credentials provider to throw
    const queue = createSyncQueue({
      getCredentials: async () => { throw new Error('vault locked') },
      fetch: async () => { throw new Error('should not be called') },
      tunables: { debounceMs: 10 }
    })
    queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await queue.flushNow()
    assert.equal(queue.state().status, 'paused')
    assert.equal(queue.pendingCount(), 1)
    assert.match(queue.state().lastError, /credentials unavailable/)
  })

  it('respects canPush gate (e.g. app locked)', async () => {
    const cred = {
      vaultKeyBytes: generateVaultKey(),
      vaultCryptoKey: await importVaultKey(generateVaultKey()),
      vaultId: 'v', deviceId: 'd', relayUrl: 'wss://r'
    }
    let canPushFlag = false
    let fetchCalled = 0
    const queue = createSyncQueue({
      getCredentials: async () => cred,
      fetch: async () => { fetchCalled++; throw new Error('blocked') },
      canPush: () => canPushFlag,
      tunables: { debounceMs: 10 }
    })
    queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await queue.flushNow()
    assert.equal(fetchCalled, 0) // gated off
    assert.equal(queue.state().status, 'paused')
  })
})

describe('syncQueue — persistence', () => {
  it('persists queue across restart (simulated)', async () => {
    const persisted = []
    const persistBackend = {
      async read () { return persisted[persisted.length - 1] || null },
      async write (data) { persisted.push(JSON.parse(JSON.stringify(data))) },
      async clear () { persisted.length = 0 }
    }
    const cred = {
      vaultKeyBytes: generateVaultKey(),
      vaultCryptoKey: await importVaultKey(generateVaultKey()),
      vaultId: 'v', deviceId: 'd', relayUrl: 'wss://r'
    }

    // First "session": enqueue but don't flush
    const q1 = createSyncQueue({
      getCredentials: async () => cred,
      fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }) }),
      persistBackend,
      tunables: { debounceMs: 99999 } // never flush
    })
    q1.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    q1.enqueue({ resourceType: 'note', resourceId: 'n2', payload: { x: 2 } })
    await new Promise(r => setTimeout(r, 50)) // let persist complete
    assert.ok(persisted.length > 0)
    assert.equal(persisted[persisted.length - 1].length, 2)
    q1.dispose() // release timer

    // Second "session": create fresh queue, restore
    const q2 = createSyncQueue({
      getCredentials: async () => cred,
      fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }) }),
      persistBackend,
      tunables: { debounceMs: 99999 }
    })
    await q2.restore()
    assert.equal(q2.pendingCount(), 2)
    const state = q2.state()
    assert.equal(state.entries[0].resourceId, 'n1')
    assert.equal(state.entries[1].resourceId, 'n2')
    q2.dispose() // release timer
  })
})

describe('syncQueue — encryption + auth headers', () => {
  it('includes vault, device, timestamp, auth headers on push', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    await fx.queue.flushNow()
    const h = fx.requests[0].init.headers
    assert.equal(h['X-Vault-Id'], fx.credentials.vaultId)
    assert.equal(h['X-Device-Id'], fx.credentials.deviceId)
    assert.match(h['X-Timestamp'], /^\d+$/)
    assert.match(h['X-Auth'], /^[0-9a-f]{64}$/)
    assert.equal(h['Content-Type'], 'application/json')
  })

  it('encrypts payload — server sees only ciphertext', async () => {
    const fx = await setupQueueFixture()
    fx.queue.enqueue({
      resourceType: 'note',
      resourceId: 'n1',
      payload: { id: 'n1', title: 'SECRET TITLE', content: { blocks: [{ type: 'paragraph', data: { text: 'SECRET CONTENT' } }] } }
    })
    await fx.queue.flushNow()
    const body = JSON.parse(fx.requests[0].init.body)
    const wireStr = JSON.stringify(body)
    // Ensure NO plaintext leak
    assert.equal(wireStr.includes('SECRET TITLE'), false)
    assert.equal(wireStr.includes('SECRET CONTENT'), false)
    // ciphertext is base64
    assert.equal(typeof body.envelopes[0].ciphertext, 'string')
    assert.match(body.envelopes[0].ciphertext, /^[A-Za-z0-9+/=]+$/)
  })
})

describe('syncQueue — batch sizing', () => {
  it('respects batchCount', async () => {
    const fx = await setupQueueFixture()
    const queue = createSyncQueue({
      getCredentials: async () => fx.credentials,
      fetch: fx.requests.length === 0 ? undefined : null, // we'll inject below
      tunables: { debounceMs: 99999, batchCount: 3 }
    })
    // Use the fixture's credentials but a fresh queue with small batch
    const localFetch = async (url, init) => {
      fx.requests.push({ url, init })
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [], vaultIndex: { lastVersion: 5, totalBytes: 0 } }) }
    }
    const q = createSyncQueue({
      getCredentials: async () => fx.credentials,
      fetch: localFetch,
      tunables: { debounceMs: 99999, batchCount: 3 }
    })
    for (let i = 0; i < 7; i++) {
      q.enqueue({ resourceType: 'note', resourceId: `n${i}`, payload: { x: i } })
    }
    await q.flushNow()
    // First batch: 3 envelopes
    const body1 = JSON.parse(fx.requests[fx.requests.length - 1].init.body)
    assert.equal(body1.envelopes.length, 3)
    // Continue until empty
    await q.flushNow()
    await q.flushNow()
    await q.flushNow()
    assert.equal(q.pendingCount(), 0)
  })
})

// =============================================================================
// syncQueue — never lose an envelope: space, oversize, vault-full, in flight
// =============================================================================

async function waitFor (predicate, timeoutMs = 10000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function testCredentials () {
  const vaultKeyBytes = generateVaultKey()
  return {
    vaultKeyBytes,
    vaultCryptoKey: await importVaultKey(vaultKeyBytes),
    vaultId: 'vault-test-1',
    deviceId: 'device-test-A',
    relayUrl: 'wss://relay.test'
  }
}

function acceptingFetch (pushes) {
  return async (url, init) => {
    pushes.push(JSON.parse(init.body).envelopes.map(e => e.resourceId))
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }) }
  }
}

describe('syncQueue — never drops an envelope for space', () => {
  it('pushes all 6,000 notes queued at once, resolving the spilled ones at push time', async () => {
    const live = new Map()
    const pushes = []
    let resolved = 0
    const creds = await testCredentials()
    const queue = createSyncQueue({
      getCredentials: async () => creds,
      fetch: acceptingFetch(pushes),
      resolvePayload: (type, id) => { resolved++; return live.get(id) ?? null },
      tunables: { debounceMs: 5 }
    })
    for (let i = 0; i < 6000; i++) {
      const page = { id: `n${i}`, title: `Note ${i}`, content: { blocks: [] } }
      live.set(page.id, page)
      queue.enqueue({ resourceType: 'note', resourceId: page.id, payload: page })
    }
    assert.equal(queue.pendingCount(), 6000)
    assert.equal(queue.state().entries.filter(e => e.spilled).length, 6000 - MAX_QUEUE_LENGTH)

    await queue.flushNow()
    await waitFor(() => queue.pendingCount() === 0, 120000)
    assert.equal(new Set(pushes.flat()).size, 6000)
    assert.equal(resolved, 6000 - MAX_QUEUE_LENGTH)
    queue.dispose()
  })

  it('keeps every entry when there is no resolver, rather than dropping the oldest', () => {
    const queue = createSyncQueue({
      getCredentials: async () => { throw new Error('locked') },
      fetch: async () => { throw new Error('offline') },
      tunables: { debounceMs: 60000 }
    })
    for (let i = 0; i < MAX_QUEUE_LENGTH + 25; i++) {
      queue.enqueue({ resourceType: 'note', resourceId: `n${i}`, payload: { i } })
    }
    assert.equal(queue.pendingCount(), MAX_QUEUE_LENGTH + 25)
    assert.equal(queue.state().entries[0].resourceId, 'n0')
    queue.dispose()
  })

  it('saves a spilled entry without its payload and pushes it after a restart', async () => {
    const persisted = []
    const persistBackend = {
      async read () { return persisted.at(-1) ?? null },
      async write (data) { persisted.push(JSON.parse(JSON.stringify(data))) },
      async clear () { persisted.length = 0 }
    }
    const live = new Map(['a', 'b', 'c'].map(id => [id, { id }]))
    const resolvePayload = (type, id) => live.get(id) ?? null
    const creds = await testCredentials()

    const first = createSyncQueue({
      getCredentials: async () => creds,
      fetch: async () => { throw new Error('offline') },
      persistBackend,
      resolvePayload,
      tunables: { debounceMs: 60000, maxQueueLength: 2 }
    })
    for (const id of ['a', 'b', 'c']) first.enqueue({ resourceType: 'note', resourceId: id, payload: live.get(id) })
    await waitFor(() => persisted.at(-1)?.length === 3)
    assert.deepEqual(persisted.at(-1).map(e => e.spilled), [false, false, true])
    assert.equal(persisted.at(-1)[2].payload, null)
    first.dispose()

    const pushes = []
    const second = createSyncQueue({
      getCredentials: async () => creds,
      fetch: acceptingFetch(pushes),
      persistBackend,
      resolvePayload,
      tunables: { debounceMs: 5, maxQueueLength: 2 }
    })
    await second.restore()
    assert.equal(second.pendingCount(), 3)
    await second.flushNow()
    await waitFor(() => second.pendingCount() === 0)
    assert.deepEqual(pushes.flat().sort(), ['a', 'b', 'c'])
    second.dispose()
  })

  it('skips an entry that cannot be read yet, and removes one whose page is gone', async () => {
    const creds = await testCredentials()
    const pushes = []
    let laterReadable = false
    const queue = createSyncQueue({
      getCredentials: async () => creds,
      fetch: acceptingFetch(pushes),
      resolvePayload: (type, id) => {
        if (id === 'ready') return { id: 'ready' }
        if (id === 'later') return laterReadable ? { id: 'later' } : undefined
        return null
      },
      tunables: { debounceMs: 60000, maxQueueLength: 1 }
    })
    for (const id of ['keep', 'ready', 'later', 'gone']) {
      queue.enqueue({ resourceType: 'note', resourceId: id, payload: { id } })
    }
    await queue.flushNow()
    assert.deepEqual(pushes.flat(), ['keep', 'ready'])
    assert.deepEqual(queue.state().entries.map(e => e.resourceId), ['later'])

    laterReadable = true
    await queue.flushNow()
    assert.deepEqual(pushes.flat(), ['keep', 'ready', 'later'])
    assert.equal(queue.pendingCount(), 0)
    queue.dispose()
  })

  it('restores stored entries without losing what was enqueued before restore finished', async () => {
    const creds = await testCredentials()
    const stored = [
      { entryId: 'e1', resourceType: 'note', resourceId: 'old', payload: { id: 'old' }, enqueuedAt: 1, attempts: 0 },
      { entryId: 'e2', resourceType: 'note', resourceId: 'both', payload: { id: 'both', v: 'stored' }, enqueuedAt: 1, attempts: 0 }
    ]
    const queue = createSyncQueue({
      getCredentials: async () => creds,
      fetch: async () => { throw new Error('offline') },
      persistBackend: { async read () { return stored }, async write () {}, async clear () {} },
      tunables: { debounceMs: 60000 }
    })
    queue.enqueue({ resourceType: 'note', resourceId: 'both', payload: { id: 'both', v: 'new' } })
    queue.enqueue({ resourceType: 'note', resourceId: 'fresh', payload: { id: 'fresh' } })
    await queue.restore()
    const entries = queue.state().entries
    assert.deepEqual(entries.map(e => e.resourceId), ['old', 'both', 'fresh'])
    assert.equal(entries.find(e => e.resourceId === 'both').payload.v, 'new')
    queue.dispose()
  })
})

describe('syncQueue — relay refusals and in-flight edits', () => {
  it('pauses on 413 vault-full and keeps every envelope', async () => {
    const fx = await setupQueueFixture()
    fx.setNextResponse({
      ok: false, status: 413, headers: new Map(),
      json: async () => ({ error: 'vault-full', usage: 1, limit: 1 })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { x: 1 } })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'n2', payload: { x: 2 } })
    await fx.queue.flushNow()
    assert.equal(fx.queue.pendingCount(), 2)
    assert.equal(fx.queue.state().status, 'error')
    assert.match(fx.queue.state().lastError, /vault-full/)
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(fx.requests.length, 1, 'no retry loop while the vault is full')
    fx.queue.dispose()
  })

  it('reports the one envelope the relay can never accept', async () => {
    const drops = []
    const fx = await setupQueueFixture({ onDrop: (drop) => drops.push(drop) })
    fx.setNextResponse({
      ok: false, status: 413, headers: new Map(),
      json: async () => ({ error: 'payload-too-large' })
    })
    fx.queue.enqueue({ resourceType: 'note', resourceId: 'huge', payload: { x: 1 } })
    await fx.queue.flushNow()
    assert.deepEqual(drops, [{ resourceType: 'note', resourceId: 'huge', reason: 'too-large' }])
    fx.queue.dispose()
  })

  it('still pushes an edit made while the previous version was in flight', async () => {
    const creds = await testCredentials()
    let releaseFirst
    const firstGate = new Promise(resolve => { releaseFirst = resolve })
    let calls = 0
    const pushed = []
    const queue = createSyncQueue({
      getCredentials: async () => creds,
      fetch: async () => {
        calls++
        if (calls === 1) await firstGate
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }) }
      },
      onPushed: (p) => pushed.push(p.resourceId),
      tunables: { debounceMs: 5 }
    })
    queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { text: 'first' } })
    const firstFlush = queue.flushNow()
    await waitFor(() => calls === 1)
    queue.enqueue({ resourceType: 'note', resourceId: 'n1', payload: { text: 'second' } })
    releaseFirst()
    await firstFlush
    await waitFor(() => calls === 2 && queue.pendingCount() === 0)
    assert.deepEqual(pushed, ['n1', 'n1'])
    queue.dispose()
  })
})
