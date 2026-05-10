/**
 * Sync pull + apply test suite.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.CryptoKey) globalThis.CryptoKey = webcrypto.CryptoKey

const syncPull = await import('../lib/syncPull.js')
const syncCrypto = await import('../lib/syncCrypto.js')
const syncQueue = await import('../lib/syncQueue.js')

const { pullSince, applyPulledChanges, PullError } = syncPull
const { generateVaultKey, importVaultKey, encryptEnvelope } = syncCrypto
const { base64Encode } = syncQueue

// =============================================================================
// Helpers — build mock server responses
// =============================================================================

async function mkServerEnvelope ({ resourceType, resourceId, payload, version, uploadedAt, authorDeviceId, parentVersion = null, payloadTimestamp = null, vaultCryptoKey, envelopeType = null }) {
  const innerPlaintext = {
    schemaVersion: 1,
    envelopeType: envelopeType || resourceType,
    resourceId,
    payload,
    timestamp: payloadTimestamp || uploadedAt || Date.now(),
    authorDeviceId,
    parentVersion
  }
  const enc = await encryptEnvelope(innerPlaintext, vaultCryptoKey)
  const wireBytes = new TextEncoder().encode(JSON.stringify(enc))
  const ciphertextB64 = base64Encode(wireBytes)
  return {
    resourceType,
    resourceId,
    ciphertext: ciphertextB64,
    version: version ?? 1,
    uploadedAt: uploadedAt ?? Date.now(),
    authorDeviceId: authorDeviceId ?? 'remote-device',
    parentVersion
  }
}

async function setupCreds () {
  const vaultKeyBytes = generateVaultKey()
  const vaultCryptoKey = await importVaultKey(vaultKeyBytes)
  return {
    vaultKeyBytes, vaultCryptoKey,
    vaultId: 'vault-pull-test',
    deviceId: 'local-device',
    relayUrl: 'wss://relay.test'
  }
}

function mkFetchMock (response) {
  const requests = []
  const fn = async (url, init) => {
    requests.push({ url, init })
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: { get: (k) => null },
      json: async () => response.body || {}
    }
  }
  return { fn, requests }
}

// =============================================================================
// pullSince — happy path
// =============================================================================

describe('pullSince — basic decrypt + cursor', () => {
  it('decrypts envelopes and returns sorted by version', async () => {
    const creds = await setupCreds()
    const env1 = await mkServerEnvelope({
      resourceType: 'note', resourceId: 'p1',
      payload: { id: 'p1', title: 'First' },
      version: 5, uploadedAt: 1000, authorDeviceId: 'remote-A',
      vaultCryptoKey: creds.vaultCryptoKey
    })
    const env2 = await mkServerEnvelope({
      resourceType: 'note', resourceId: 'p2',
      payload: { id: 'p2', title: 'Second' },
      version: 3, uploadedAt: 999, authorDeviceId: 'remote-A',
      vaultCryptoKey: creds.vaultCryptoKey
    })
    const m = mkFetchMock({ body: { envelopes: [env1, env2], hasMore: false, vaultIndex: { lastVersion: 5, totalBytes: 1024 } } })

    const result = await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    assert.equal(result.envelopes.length, 2)
    // Sorted ascending by version
    assert.equal(result.envelopes[0].version, 3)
    assert.equal(result.envelopes[1].version, 5)
    assert.equal(result.envelopes[0].payload.title, 'Second')
    assert.equal(result.envelopes[1].payload.title, 'First')
    assert.equal(result.cursorAfter, 5)
    assert.equal(result.hasMore, false)
    assert.equal(result.quarantined.length, 0)
    assert.equal(result.vaultIndex.totalBytes, 1024)
  })

  it('uses cursor in URL', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [] } })
    await pullSince({ credentials: creds, cursor: 42, limit: 50, fetch: m.fn })
    assert.match(m.requests[0].url, /\/sync\/pull\?since=42&limit=50/)
  })

  it('builds auth headers', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [] } })
    await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    const h = m.requests[0].init.headers
    assert.equal(h['X-Vault-Id'], creds.vaultId)
    assert.equal(h['X-Device-Id'], creds.deviceId)
    assert.match(h['X-Auth'], /^[0-9a-f]{64}$/)
  })

  it('converts wss:// to https:// for HTTP request', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [] } })
    await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    assert.match(m.requests[0].url, /^https:\/\//)
    assert.equal(m.requests[0].url.startsWith('wss://'), false)
  })

  it('empty envelope list → cursorAfter = cursor', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [] } })
    const result = await pullSince({ credentials: creds, cursor: 100, fetch: m.fn })
    assert.equal(result.cursorAfter, 100)
    assert.equal(result.hasMore, false)
  })

  it('hasMore=true propagates', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [], hasMore: true } })
    const result = await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    assert.equal(result.hasMore, true)
  })
})

// =============================================================================
// pullSince — error paths
// =============================================================================

describe('pullSince — error paths', () => {
  it('throws PullError on 401', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ ok: false, status: 401, body: { error: 'unauthorized' } })
    await assert.rejects(
      () => pullSince({ credentials: creds, cursor: 0, fetch: m.fn }),
      err => err instanceof PullError && err.code === 'unauthorized' && err.status === 401
    )
  })

  it('throws PullError on 410 (gone — stale vault)', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ ok: false, status: 410, body: { error: 'gone' } })
    await assert.rejects(
      () => pullSince({ credentials: creds, cursor: 0, fetch: m.fn }),
      err => err instanceof PullError && err.code === 'gone'
    )
  })

  it('throws PullError on 429 (rate-limited)', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ ok: false, status: 429, body: { error: 'rate-limited' } })
    await assert.rejects(
      () => pullSince({ credentials: creds, cursor: 0, fetch: m.fn }),
      err => err instanceof PullError && err.code === 'rate-limited'
    )
  })

  it('throws PullError on network failure', async () => {
    const creds = await setupCreds()
    const fn = async () => { throw new Error('socket reset') }
    await assert.rejects(
      () => pullSince({ credentials: creds, cursor: 0, fetch: fn }),
      err => err instanceof PullError && err.code === 'network'
    )
  })

  it('rejects non-positive limit', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [] } })
    await assert.rejects(
      () => pullSince({ credentials: creds, cursor: 0, limit: 0, fetch: m.fn }),
      /limit/
    )
  })
})

// =============================================================================
// pullSince — quarantine path
// =============================================================================

describe('pullSince — quarantine on decrypt failure', () => {
  it('routes decrypt-failed envelopes to quarantine, NOT to envelopes[]', async () => {
    const creds = await setupCreds()
    const otherKey = await importVaultKey(generateVaultKey())
    // Encrypt with a DIFFERENT key
    const badEnv = await mkServerEnvelope({
      resourceType: 'note', resourceId: 'p-bad',
      payload: { id: 'p-bad', title: 'Encrypted with wrong key' },
      version: 1, uploadedAt: 100, authorDeviceId: 'remote',
      vaultCryptoKey: otherKey
    })
    const goodEnv = await mkServerEnvelope({
      resourceType: 'note', resourceId: 'p-good',
      payload: { id: 'p-good', title: 'Encrypted with our key' },
      version: 2, uploadedAt: 200, authorDeviceId: 'remote',
      vaultCryptoKey: creds.vaultCryptoKey
    })
    const m = mkFetchMock({ body: { envelopes: [badEnv, goodEnv] } })
    const result = await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    assert.equal(result.envelopes.length, 1)
    assert.equal(result.envelopes[0].resourceId, 'p-good')
    assert.equal(result.quarantined.length, 1)
    assert.equal(result.quarantined[0].resourceId, 'p-bad')
    assert.match(result.quarantined[0].reason, /wrong vault key/)
  })

  it('quarantine on schema-version too new', async () => {
    const creds = await setupCreds()
    // Hand-craft an envelope with schemaVersion: 2 — caller should reject.
    const innerPlaintext = {
      schemaVersion: 2, envelopeType: 'note', resourceId: 'p1',
      payload: { id: 'p1' }, timestamp: 1, authorDeviceId: 'r', parentVersion: null
    }
    const enc = await encryptEnvelope(innerPlaintext, creds.vaultCryptoKey)
    const wireBytes = new TextEncoder().encode(JSON.stringify(enc))
    const ciphertextB64 = base64Encode(wireBytes)
    const env = {
      resourceType: 'note', resourceId: 'p1', ciphertext: ciphertextB64,
      version: 1, uploadedAt: 100, authorDeviceId: 'r'
    }
    const m = mkFetchMock({ body: { envelopes: [env] } })
    const result = await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    assert.equal(result.envelopes.length, 0)
    assert.equal(result.quarantined.length, 1)
    assert.match(result.quarantined[0].reason, /schemaVersion 2/)
  })

  it('quarantine on garbage ciphertext (not base64)', async () => {
    const creds = await setupCreds()
    const m = mkFetchMock({ body: { envelopes: [{ resourceType: 'note', resourceId: 'p', ciphertext: '!!!not-base64!!!', version: 1, uploadedAt: 1, authorDeviceId: 'r' }] } })
    const result = await pullSince({ credentials: creds, cursor: 0, fetch: m.fn })
    assert.equal(result.envelopes.length, 0)
    assert.equal(result.quarantined.length, 1)
  })
})

// =============================================================================
// applyPulledChanges
// =============================================================================

describe('applyPulledChanges — note insertion and updates', () => {
  it('inserts new page', async () => {
    const result = await applyPulledChanges([], [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'New', lastEdited: 100 }, version: 1, payloadTimestamp: 100, uploadedAt: 100, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages.length, 1)
    assert.equal(result.newPages[0].id, 'p1')
    assert.deepEqual(result.applied, ['p1'])
    assert.equal(result.lastSyncedVersionUpdates.get('p1'), 1)
  })

  it('updates existing page (latest-wins on newer timestamp)', async () => {
    const before = [{ id: 'p1', title: 'Old', lastEdited: 100 }]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'New', lastEdited: 200 }, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages.length, 1)
    assert.equal(result.newPages[0].title, 'New')
    assert.deepEqual(result.applied, ['p1'])
  })

  it('drops older incoming version (server resend or stale)', async () => {
    const before = [{ id: 'p1', title: 'Local', lastEdited: 200 }]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'StaleRemote', lastEdited: 100 }, version: 3, payloadTimestamp: 100, uploadedAt: 100, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages[0].title, 'Local')
    assert.deepEqual(result.applied, [])
    // Cursor still bumps so we don't re-pull this version
    assert.equal(result.lastSyncedVersionUpdates.get('p1'), 3)
  })

  it('captures loser version into version history before overwriting', async () => {
    const before = [{ id: 'p1', title: 'Local', lastEdited: 100, content: { blocks: [{ type: 'paragraph', data: { text: 'LOCAL CONTENT' } }] } }]
    const captures = []
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Remote', lastEdited: 200, content: { blocks: [{ type: 'paragraph', data: { text: 'REMOTE CONTENT' } }] } }, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ], {
      captureVersion: async (pageId, blocks) => { captures.push({ pageId, blocks }) }
    })
    assert.equal(captures.length, 1)
    assert.equal(captures[0].pageId, 'p1')
    // Captured the LOCAL (loser) blocks, not the incoming remote
    assert.equal(captures[0].blocks[0].data.text, 'LOCAL CONTENT')
    assert.deepEqual(result.loserCaptured, ['p1'])
  })

  it('notifies on replacement when in-flight edit exists', async () => {
    const before = [{ id: 'p1', title: 'Local', lastEdited: 100, content: { blocks: [] } }]
    const notifications = []
    await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Remote', lastEdited: 200, content: { blocks: [] } }, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'remote-X' }
    ], {
      hasInFlightEdit: (pid) => pid === 'p1',
      notifyReplaced: (n) => notifications.push(n)
    })
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].resourceId, 'p1')
    assert.equal(notifications[0].replacedFrom, 'remote-X')
  })

  it('preserves order of unchanged pages', async () => {
    const before = [
      { id: 'p1', title: 'A', lastEdited: 100 },
      { id: 'p2', title: 'B', lastEdited: 100 },
      { id: 'p3', title: 'C', lastEdited: 100 }
    ]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p2', payload: { id: 'p2', title: 'B-NEW', lastEdited: 200 }, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.deepEqual(result.newPages.map(p => p.id), ['p1', 'p2', 'p3'])
    assert.equal(result.newPages[1].title, 'B-NEW')
  })

  it('does not mutate input pages array', async () => {
    const before = [{ id: 'p1', title: 'Original', lastEdited: 100 }]
    const beforeSnapshot = JSON.parse(JSON.stringify(before))
    await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Mutated', lastEdited: 200 }, version: 1, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.deepEqual(before, beforeSnapshot, 'input must not be mutated')
  })
})

describe('applyPulledChanges — tombstones', () => {
  it('marks page as trashed when tombstone arrives', async () => {
    const before = [{ id: 'p1', title: 'ToDelete', lastEdited: 100, content: { blocks: [] } }]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'tombstone', resourceType: 'tombstone', resourceId: 'p1', payload: {}, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages.length, 1)
    assert.equal(result.newPages[0].trashed, true)
    assert.equal(result.newPages[0].trashedAt, 200)
    assert.deepEqual(result.deleted, ['p1'])
  })

  it('idempotent for already-deleted pages', async () => {
    const before = []
    const result = await applyPulledChanges(before, [
      { envelopeType: 'tombstone', resourceType: 'tombstone', resourceId: 'p1', payload: {}, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    // Page wasn't local — no-op
    assert.equal(result.newPages.length, 0)
    assert.equal(result.deleted.length, 0)
  })

  it('captures content to version history before tombstoning', async () => {
    const before = [{ id: 'p1', title: 'X', lastEdited: 100, content: { blocks: [{ type: 'p', data: { text: 'recoverable' } }] } }]
    const captures = []
    await applyPulledChanges(before, [
      { envelopeType: 'tombstone', resourceType: 'tombstone', resourceId: 'p1', payload: {}, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ], {
      captureVersion: async (pid, blocks) => captures.push({ pid, blocks })
    })
    assert.equal(captures.length, 1)
    assert.equal(captures[0].blocks[0].data.text, 'recoverable')
  })

  it('plain edit on locally-trashed page does NOT resurrect (peer\'s stale edit kept dropped)', async () => {
    // Old behavior treated any newer-timestamped live envelope as a
    // restore. That broke the common case: a peer with the page open
    // in their editor autosaves on every keystroke, and each push
    // looked newer than our local trashedAt so the page un-trashed
    // itself on every pull. Now resurrection requires an explicit
    // `restoredAt` field — see syncPull.js:332 + restorePage.
    const before = [{ id: 'p1', trashed: true, trashedAt: 100, title: 'Trashed', lastEdited: 100 }]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Resurrected', lastEdited: 200 }, version: 6, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages[0].title, 'Trashed')
    assert.equal(result.newPages[0].trashed, true)
    assert.deepEqual(result.applied, [])
  })

  it('explicit restore (incoming.restoredAt > local.trashedAt) resurrects', async () => {
    const before = [{ id: 'p1', trashed: true, trashedAt: 100, title: 'Trashed' }]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Restored', restoredAt: 200, lastEdited: 200 }, version: 6, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages[0].title, 'Restored')
    assert.equal(result.newPages[0].trashed, undefined)
    assert.deepEqual(result.applied, ['p1'])
  })

  it('peer trash on locally-alive page always wins (deliberate delete beats stale local edit)', async () => {
    const before = [{ id: 'p1', title: 'Alive', lastEdited: 500, content: { blocks: [{ type: 'paragraph', data: { text: 'local' } }] } }]
    let captured = null
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Trashed by peer', trashed: true, trashedAt: 200, lastEdited: 200 }, version: 6, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ], { captureVersion: async (id, blocks) => { captured = { id, blocks } } })
    assert.equal(result.newPages[0].trashed, true)
    assert.equal(result.newPages[0].title, 'Trashed by peer')
    assert.deepEqual(result.applied, ['p1'])
    // Loser (local content) preserved in version history
    assert.equal(captured?.id, 'p1')
  })
})

describe('applyPulledChanges — manifest envelope', () => {
  it('returns latest manifest separately', async () => {
    const result = await applyPulledChanges([], [
      { envelopeType: 'meta', resourceType: 'meta', resourceId: 'manifest', payload: { folders: [], rootOrder: ['p1'], tagMap: [] }, version: 3, payloadTimestamp: 100, uploadedAt: 100, authorDeviceId: 'r' }
    ])
    assert.ok(result.manifest)
    assert.deepEqual(result.manifest.rootOrder, ['p1'])
    assert.equal(result.applied.length, 0) // manifest doesn't go in applied
  })

  it('multiple manifests → latest wins', async () => {
    const result = await applyPulledChanges([], [
      { envelopeType: 'meta', resourceType: 'meta', resourceId: 'manifest', payload: { rootOrder: ['p1'] }, version: 1, payloadTimestamp: 100, uploadedAt: 100, authorDeviceId: 'r' },
      { envelopeType: 'meta', resourceType: 'meta', resourceId: 'manifest', payload: { rootOrder: ['p2'] }, version: 5, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    assert.deepEqual(result.manifest.rootOrder, ['p2'])
  })
})

describe('applyPulledChanges — edge cases', () => {
  it('empty inputs → no-op', async () => {
    const result = await applyPulledChanges([], [])
    assert.deepEqual(result.newPages, [])
    assert.deepEqual(result.applied, [])
  })

  it('null inputs treated as empty', async () => {
    const result = await applyPulledChanges(null, undefined)
    assert.deepEqual(result.newPages, [])
  })

  it('skips note envelope without payload.id', async () => {
    const result = await applyPulledChanges([], [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { /* no id */ title: 'X' }, version: 1, payloadTimestamp: 100, uploadedAt: 100, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages.length, 0)
  })

  it('handles capture-version failure gracefully (continues apply)', async () => {
    const before = [{ id: 'p1', title: 'Local', lastEdited: 100, content: { blocks: [{}] } }]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'note', resourceType: 'note', resourceId: 'p1', payload: { id: 'p1', title: 'Remote', lastEdited: 200 }, version: 1, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ], {
      captureVersion: async () => { throw new Error('storage full') }
    })
    // Apply still succeeds despite capture failure
    assert.equal(result.newPages[0].title, 'Remote')
    assert.deepEqual(result.applied, ['p1'])
    assert.deepEqual(result.loserCaptured, []) // capture failed, not recorded
  })

  it('processes folder envelopes', async () => {
    const result = await applyPulledChanges([], [
      { envelopeType: 'folder', resourceType: 'folder', resourceId: 'f1', payload: { id: 'f1', type: 'folder', title: 'Work', pages: [] }, version: 1, payloadTimestamp: 100, uploadedAt: 100, authorDeviceId: 'r' }
    ])
    assert.equal(result.newPages.length, 1)
    assert.equal(result.newPages[0].type, 'folder')
    assert.equal(result.newPages[0].title, 'Work')
    assert.deepEqual(result.applied, ['f1'])
  })

  it('folder envelope merges pages[] — local-only ids preserved (build-23 fix)', async () => {
    // Pre-fix: folder envelope blindly overwrote folder.pages[]. If peer
    // renamed folder while local user added a page to it, local addition
    // was silently dropped on pull. Now appended to incoming list.
    const before = [
      { id: 'f1', type: 'folder', title: 'Work', pages: ['peer-page', 'local-only-page'] }
    ]
    const result = await applyPulledChanges(before, [
      { envelopeType: 'folder', resourceType: 'folder', resourceId: 'f1', payload: { id: 'f1', type: 'folder', title: 'Work renamed', pages: ['peer-page'] }, version: 2, payloadTimestamp: 200, uploadedAt: 200, authorDeviceId: 'r' }
    ])
    const merged = result.newPages.find(p => p.id === 'f1')
    assert.equal(merged.title, 'Work renamed')
    assert.ok(merged.pages.includes('peer-page'), 'peer-page kept')
    assert.ok(merged.pages.includes('local-only-page'), 'local-only-page preserved (was the bug)')
  })
})
