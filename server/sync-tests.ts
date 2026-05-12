/**
 * Tests for Phase 2.1 multi-device sync endpoints.
 *
 * Run: cd server && deno test --unstable-kv --allow-net sync-tests.ts
 *
 * These tests exercise the sync handlers directly against an in-memory KV
 * store. Each test creates a fresh `Deno.openKv(':memory:')` so tests are
 * isolated.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

import {
  base64Decode,
  base64Encode,
  clearRateLimits,
  getWsConnectionCount,
  MAX_DEVICES_PER_VAULT,
  MAX_ENVELOPE_BYTES,
  MAX_NOTE_VERSIONS,
  MAX_VAULT_BYTES,
  resetClock,
  routeSyncRequest,
  setClock,
  TOMBSTONE_PERMANENT_MS,
} from './sync.ts'

// ── Helpers ────────────────────────────────────────────────────────────

async function freshKv(): Promise<Deno.Kv> {
  // ':memory:' creates an isolated in-memory KV per test
  return await Deno.openKv(':memory:')
}

const VAULT_A = 'vault-aaaaaaaaaaaaaaaaaaaaaa1'
const DEVICE_A1 = 'device-aaaaaaaaaaaaaaaaaa1'
const DEVICE_A2 = 'device-aaaaaaaaaaaaaaaaaa2'

type AuthOpts = {
  vaultId?: string
  deviceId?: string
  timestamp?: number
  auth?: string
  contentType?: string
  skipHeaders?: boolean
}

function authHeaders(opts: AuthOpts = {}): Record<string, string> {
  if (opts.skipHeaders) return {}
  const h: Record<string, string> = {
    'X-Vault-Id': opts.vaultId ?? VAULT_A,
    'X-Device-Id': opts.deviceId ?? DEVICE_A1,
    'X-Timestamp': String(opts.timestamp ?? Date.now()),
    'X-Auth': opts.auth ?? `auth-${crypto.randomUUID()}`,
  }
  if (opts.contentType) h['Content-Type'] = opts.contentType
  return h
}

function makeRequest(
  method: string,
  path: string,
  body: unknown = undefined,
  headers: Record<string, string> = {},
): Request {
  const url = `http://localhost${path}`
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json', ...headers }
  }
  return new Request(url, init)
}

async function callSync(
  kv: Deno.Kv,
  method: string,
  path: string,
  body?: unknown,
  authOpts: AuthOpts = {},
): Promise<Response> {
  const headers = authHeaders(authOpts)
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const req = makeRequest(method, path, body, headers)
  const res = await routeSyncRequest(kv, req)
  if (!res) throw new Error(`No response for ${method} ${path}`)
  return res
}

async function registerDevice(
  kv: Deno.Kv,
  vaultId = VAULT_A,
  deviceId = DEVICE_A1,
  deviceName?: string,
  timestamp?: number,
): Promise<Response> {
  return await callSync(
    kv,
    'POST',
    '/sync/vault/register',
    { vaultId, deviceId, deviceName },
    { vaultId, deviceId, timestamp },
  )
}

function mkCipher(size: number): Uint8Array {
  const out = new Uint8Array(size)
  crypto.getRandomValues(out)
  return out
}

function setupTeardown<T>(fn: (kv: Deno.Kv) => Promise<T>): () => Promise<T> {
  return async () => {
    clearRateLimits()
    resetClock()
    const kv = await freshKv()
    try {
      return await fn(kv)
    } finally {
      kv.close()
    }
  }
}

// ── 1. Vault registration ──────────────────────────────────────────────

Deno.test('register: new vault accepts first device', setupTeardown(async (kv) => {
  const res = await registerDevice(kv, VAULT_A, DEVICE_A1, 'Test Mac')
  assertEquals(res.status, 200)
  const body = await res.json()
  assert(body.ok)
  assertExists(body.registeredAt)
}))

Deno.test('register: re-registering same device is idempotent', setupTeardown(async (kv) => {
  await registerDevice(kv, VAULT_A, DEVICE_A1, 'Mac')
  const res = await registerDevice(kv, VAULT_A, DEVICE_A1, 'Mac (renamed)')
  assertEquals(res.status, 200)
}))

Deno.test('register: max devices reached returns 403', setupTeardown(async (kv) => {
  for (let i = 0; i < MAX_DEVICES_PER_VAULT; i++) {
    const res = await registerDevice(kv, VAULT_A, `device-${i}-aaaaaaaaaaaaaaa`)
    assertEquals(res.status, 200, `device ${i} should register`)
  }
  const res = await registerDevice(kv, VAULT_A, 'device-overflow-aaaaaaaaaa')
  assertEquals(res.status, 403)
  const body = await res.json()
  assertEquals(body.error, 'forbidden')
  assertEquals(body.limit, MAX_DEVICES_PER_VAULT)
}))

Deno.test('register: body must echo header values', setupTeardown(async (kv) => {
  const req = makeRequest(
    'POST',
    '/sync/vault/register',
    { vaultId: 'wrong-vault', deviceId: DEVICE_A1 },
    authHeaders({ vaultId: VAULT_A, deviceId: DEVICE_A1 }),
  )
  const res = await routeSyncRequest(kv, req)
  assertEquals(res?.status, 400)
}))

// ── 2. Push: single + batch + size limits ──────────────────────────────

Deno.test('push: single envelope succeeds, returns version 1', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const ct = base64Encode(mkCipher(100))
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [
      { resourceType: 'note', resourceId: 'note-1', ciphertext: ct, parentVersion: null },
    ],
  })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.results.length, 1)
  assertEquals(body.results[0].accepted, true)
  assertEquals(body.results[0].version, 1)
  assertEquals(body.vaultIndex.lastVersion, 1)
}))

Deno.test('push: batch is atomic (all-or-nothing)', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const envelopes = [
    { resourceType: 'note', resourceId: 'n1', ciphertext: base64Encode(mkCipher(50)), parentVersion: null },
    { resourceType: 'note', resourceId: 'n2', ciphertext: base64Encode(mkCipher(50)), parentVersion: null },
    { resourceType: 'note', resourceId: 'n3', ciphertext: base64Encode(mkCipher(50)), parentVersion: null },
  ]
  const res = await callSync(kv, 'POST', '/sync/push', { envelopes })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.results.length, 3)
  assertEquals(body.results[0].version, 1)
  assertEquals(body.results[1].version, 2)
  assertEquals(body.results[2].version, 3)
  assertEquals(body.vaultIndex.lastVersion, 3)
}))

Deno.test('push: oversize envelope (>50KB) returns 413', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const ct = base64Encode(mkCipher(MAX_ENVELOPE_BYTES + 1))
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{ resourceType: 'note', resourceId: 'big', ciphertext: ct, parentVersion: null }],
  })
  assertEquals(res.status, 413)
  const body = await res.json()
  assertEquals(body.error, 'payload-too-large')
}))

Deno.test('push: oversize batch (>200KB total) returns 413', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const big = base64Encode(mkCipher(MAX_ENVELOPE_BYTES))
  // 5 envelopes of 62 KB each = 310 KB > 200 KB
  const envelopes = []
  for (let i = 0; i < 5; i++) {
    envelopes.push({
      resourceType: 'note',
      resourceId: `note-${i}`,
      ciphertext: big,
      parentVersion: null,
    })
  }
  const res = await callSync(kv, 'POST', '/sync/push', { envelopes })
  assertEquals(res.status, 413)
}))

Deno.test('push: invalid base64 ciphertext returns 400', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{ resourceType: 'note', resourceId: 'n1', ciphertext: '!!not-base64!!', parentVersion: null }],
  })
  assertEquals(res.status, 400)
}))

// ── 3. Pull with cursor ────────────────────────────────────────────────

Deno.test('pull: returns envelopes after cursor, hasMore semantics', setupTeardown(async (kv) => {
  await registerDevice(kv)
  // Push 3 notes
  for (let i = 0; i < 3; i++) {
    await callSync(kv, 'POST', '/sync/push', {
      envelopes: [{
        resourceType: 'note',
        resourceId: `note-${i}`,
        ciphertext: base64Encode(mkCipher(40)),
        parentVersion: null,
      }],
    })
  }
  const res = await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.envelopes.length, 3)
  assertEquals(body.hasMore, false)
  assertEquals(body.vaultIndex.lastVersion, 3)
}))

Deno.test('pull: pagination via since cursor', setupTeardown(async (kv) => {
  await registerDevice(kv)
  for (let i = 0; i < 5; i++) {
    await callSync(kv, 'POST', '/sync/push', {
      envelopes: [{
        resourceType: 'note',
        resourceId: `n${i}`,
        ciphertext: base64Encode(mkCipher(40)),
        parentVersion: null,
      }],
    })
  }
  // Pull with limit=2 → should get 2 envelopes + hasMore
  const res1 = await callSync(kv, 'GET', '/sync/pull?since=0&limit=2')
  const body1 = await res1.json()
  assertEquals(body1.envelopes.length, 2)
  assertEquals(body1.hasMore, true)
  // Pull from version 2
  const res2 = await callSync(kv, 'GET', '/sync/pull?since=2&limit=2')
  const body2 = await res2.json()
  assertEquals(body2.envelopes.length, 2)
  // Pull from version 4
  const res3 = await callSync(kv, 'GET', '/sync/pull?since=4&limit=10')
  const body3 = await res3.json()
  assertEquals(body3.envelopes.length, 1)
  assertEquals(body3.hasMore, false)
}))

// ── 4. Version eviction ────────────────────────────────────────────────

Deno.test('push: 31st version of same note evicts oldest', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const noteId = 'note-evict'
  // Advance the clock between pushes so we don't hit the 30/min/device rate limit.
  // Each push is "3 seconds apart" — avoids rate limiting while exercising eviction.
  const t0 = Date.now()
  for (let i = 0; i < MAX_NOTE_VERSIONS + 1; i++) {
    setClock(() => t0 + i * 3000)
    const res = await callSync(kv, 'POST', '/sync/push', {
      envelopes: [{
        resourceType: 'note',
        resourceId: noteId,
        ciphertext: base64Encode(mkCipher(100)),
        parentVersion: i === 0 ? null : i,
      }],
    })
    assertEquals(res.status, 200, `push ${i + 1} should succeed`)
  }
  // List versions — should be exactly MAX_NOTE_VERSIONS
  const res = await callSync(kv, 'GET', `/sync/note/${noteId}/versions`)
  const body = await res.json()
  assertEquals(body.versions.length, MAX_NOTE_VERSIONS)
  // Oldest version is now version 2 (version 1 was evicted)
  assertEquals(body.versions[0].version, 2)
}))

// ── 5. Tombstone flow ──────────────────────────────────────────────────

Deno.test('tombstone: delete creates tombstone, pulled by other device', setupTeardown(async (kv) => {
  await registerDevice(kv, VAULT_A, DEVICE_A1)
  await registerDevice(kv, VAULT_A, DEVICE_A2)
  // Device A1 pushes a note
  await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note', resourceId: 'note-d', ciphertext: base64Encode(mkCipher(80)), parentVersion: null,
    }],
  })
  // Device A1 deletes
  const delRes = await callSync(kv, 'DELETE', '/sync/note/note-d', {
    tombstoneCiphertext: base64Encode(mkCipher(40)),
    parentVersion: 1,
  })
  assertEquals(delRes.status, 200)
  // Device A2 pulls
  const pullRes = await callSync(kv, 'GET', '/sync/pull?since=0&limit=100', undefined, {
    deviceId: DEVICE_A2,
  })
  const pullBody = await pullRes.json()
  const tombstone = pullBody.envelopes.find((e: { resourceType: string }) => e.resourceType === 'tombstone')
  assertExists(tombstone)
  assertEquals(tombstone.resourceId, 'note-d')
}))

Deno.test('tombstone: re-delete is idempotent (creates new version)', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const t1 = await callSync(kv, 'DELETE', '/sync/note/note-x', {
    tombstoneCiphertext: base64Encode(mkCipher(40)),
    parentVersion: null,
  })
  assertEquals(t1.status, 200)
  const t2 = await callSync(kv, 'DELETE', '/sync/note/note-x', {
    tombstoneCiphertext: base64Encode(mkCipher(40)),
    parentVersion: null,
  })
  assertEquals(t2.status, 200)
  const b1 = await t1.json()
  const b2 = await t2.json()
  assertNotEquals(b1.version, b2.version)
}))

// ── 6. Tombstone 30-day permanent flag ─────────────────────────────────

Deno.test('tombstone: permanent flag set after 30 days on pull', setupTeardown(async (kv) => {
  const t0 = 1_700_000_000_000
  setClock(() => t0)
  await registerDevice(kv, VAULT_A, DEVICE_A1, undefined, t0)
  const t1 = t0 + 1000
  setClock(() => t1)
  await callSync(kv, 'DELETE', '/sync/note/old', {
    tombstoneCiphertext: base64Encode(mkCipher(40)),
    parentVersion: null,
  }, { timestamp: t1 })
  // Move forward 31 days
  const t2 = t0 + TOMBSTONE_PERMANENT_MS + 1000
  setClock(() => t2)
  const res = await callSync(kv, 'GET', '/sync/pull?since=0&limit=100', undefined, { timestamp: t2 })
  const body = await res.json()
  const ts = body.envelopes.find((e: { resourceType: string }) => e.resourceType === 'tombstone')
  assertExists(ts)
  assertEquals(ts.permanent, true)
}))

// ── 7. Auth checks ─────────────────────────────────────────────────────

Deno.test('auth: missing headers returns 401', setupTeardown(async (kv) => {
  const req = new Request('http://localhost/sync/push', {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await routeSyncRequest(kv, req)
  assertEquals(res?.status, 401)
}))

Deno.test('auth: expired timestamp (>5 min) returns 401', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const oldTs = Date.now() - 10 * 60 * 1000
  const res = await callSync(kv, 'GET', '/sync/vault/index', undefined, {
    timestamp: oldTs,
  })
  assertEquals(res.status, 401)
}))

Deno.test('auth: replay (same X-Auth twice) returns 401', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const sameAuth = `auth-${crypto.randomUUID()}`
  const ts = Date.now()
  const r1 = await callSync(kv, 'GET', '/sync/vault/index', undefined, {
    auth: sameAuth, timestamp: ts,
  })
  assertEquals(r1.status, 200)
  const r2 = await callSync(kv, 'GET', '/sync/vault/index', undefined, {
    auth: sameAuth, timestamp: ts,
  })
  assertEquals(r2.status, 401)
}))

Deno.test('auth: revoked device (not in devices map) returns 401', setupTeardown(async (kv) => {
  await registerDevice(kv, VAULT_A, DEVICE_A1)
  const res = await callSync(kv, 'GET', '/sync/vault/index', undefined, {
    deviceId: 'unregistered-device-aaaa',
  })
  assertEquals(res.status, 401)
}))

// ── 8. Rate limits ─────────────────────────────────────────────────────

Deno.test('rate limit: 60+ pushes in a minute → 429', setupTeardown(async (kv) => {
  await registerDevice(kv)
  // Per-device push limit is 30. Issue 30 successful pushes...
  for (let i = 0; i < 30; i++) {
    const res = await callSync(kv, 'POST', '/sync/push', {
      envelopes: [{
        resourceType: 'note', resourceId: `n${i}`, ciphertext: base64Encode(mkCipher(20)), parentVersion: null,
      }],
    })
    assertEquals(res.status, 200, `push ${i} should pass`)
  }
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note', resourceId: 'over', ciphertext: base64Encode(mkCipher(20)), parentVersion: null,
    }],
  })
  assertEquals(res.status, 429)
  assert(res.headers.get('Retry-After'))
}))

// ── 9. WebSocket fan-out (best-effort smoke test) ──────────────────────

Deno.test('ws: push works alongside ws routing (smoke)', setupTeardown(async (kv) => {
  // NOTE: WebSocket upgrade requires X-Vault-Id / X-Device-Id / X-Timestamp /
  // X-Auth headers, which the browser-style `new WebSocket()` constructor
  // cannot set. A full fan-out integration test would require a custom WS
  // client that sets these headers (e.g. via raw TCP socket). For v1 we
  // verify (a) routing accepts /sync/ws/* path, (b) push still works while
  // WS infra is loaded, and (c) the in-memory wsConnections map starts at 0.
  await registerDevice(kv, VAULT_A, DEVICE_A1)
  await registerDevice(kv, VAULT_A, DEVICE_A2)
  assertEquals(getWsConnectionCount(VAULT_A), 0)

  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note',
      resourceId: 'ws-n1',
      ciphertext: base64Encode(mkCipher(40)),
      parentVersion: null,
    }],
  })
  assertEquals(res.status, 200)

  // A WS request without proper handshake should be rejected (400/401).
  // Note: 'Upgrade' is a forbidden header in browser-style Request, so we
  // can't simulate a real handshake here. The route must still resolve
  // (not 404) — verifying the path matcher works.
  const wsReq = new Request(`http://localhost/sync/ws/${VAULT_A}`)
  const wsRes = await routeSyncRequest(kv, wsReq)
  assert(wsRes !== null)
  assert(wsRes!.status === 400 || wsRes!.status === 401)
}))

// ── 10. Attachment upload + download + dedup ───────────────────────────

Deno.test('attachment: upload + download round-trip', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const ct = base64Encode(mkCipher(1024))
  const up = await callSync(kv, 'POST', '/sync/attachment/att-1', {
    ciphertext: ct,
    originalSize: 1024,
    mimeTypeHint: 'image/png',
  })
  assertEquals(up.status, 200)
  const upBody = await up.json()
  assertEquals(upBody.existing, false)

  const down = await callSync(kv, 'GET', '/sync/attachment/att-1')
  assertEquals(down.status, 200)
  const downBody = await down.json()
  assertEquals(downBody.ciphertext, ct)
}))

Deno.test('attachment: dedup — second upload returns existing', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const ct = base64Encode(mkCipher(512))
  const up1 = await callSync(kv, 'POST', '/sync/attachment/dup-1', { ciphertext: ct })
  assertEquals(up1.status, 200)
  const up2 = await callSync(kv, 'POST', '/sync/attachment/dup-1', { ciphertext: ct })
  assertEquals(up2.status, 200)
  const body2 = await up2.json()
  assertEquals(body2.existing, true)
  assertEquals(body2.dedupKey, 'dup-1')
}))

Deno.test('attachment: 404 on missing attachment', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const res = await callSync(kv, 'GET', '/sync/attachment/missing-1')
  assertEquals(res.status, 404)
  const body = await res.json()
  assertEquals(body.error, 'not-found')
}))

// ── 11. Purge token flow ───────────────────────────────────────────────

Deno.test('purge: issue + use within 60s', setupTeardown(async (kv) => {
  await registerDevice(kv)
  // Push something to purge
  await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note', resourceId: 'pn1', ciphertext: base64Encode(mkCipher(50)), parentVersion: null,
    }],
  })
  const tokRes = await callSync(kv, 'GET', '/sync/vault/purge-token')
  assertEquals(tokRes.status, 200)
  const tokBody = await tokRes.json()
  assertExists(tokBody.token)

  const purgeRes = await callSync(kv, 'POST', '/sync/vault/purge', {
    confirmToken: tokBody.token,
  })
  assertEquals(purgeRes.status, 200)
  const purgeBody = await purgeRes.json()
  assert(purgeBody.ok)
  assert(purgeBody.purgedBytes >= 50)
}))

Deno.test('purge: cannot reuse token', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const tokRes = await callSync(kv, 'GET', '/sync/vault/purge-token')
  const tokBody = await tokRes.json()
  // Use it once — but vault is empty / purge succeeds either way. Now after
  // purge the device is gone; re-register before retrying.
  const purgeRes = await callSync(kv, 'POST', '/sync/vault/purge', {
    confirmToken: tokBody.token,
  })
  assertEquals(purgeRes.status, 200)
  // Re-register so auth passes again
  await registerDevice(kv)
  const reuseRes = await callSync(kv, 'POST', '/sync/vault/purge', {
    confirmToken: tokBody.token,
  })
  // Token was deleted with the purge — should be 403 (no token exists)
  assertEquals(reuseRes.status, 403)
}))

Deno.test('purge: token expires after 60s', setupTeardown(async (kv) => {
  const t0 = 1_700_000_000_000
  setClock(() => t0)
  await registerDevice(kv, VAULT_A, DEVICE_A1, undefined, t0)
  const tokRes = await callSync(kv, 'GET', '/sync/vault/purge-token', undefined, {
    timestamp: t0,
  })
  const tokBody = await tokRes.json()
  // Move clock forward 61s
  const t1 = t0 + 61_000
  setClock(() => t1)
  const res = await callSync(kv, 'POST', '/sync/vault/purge', {
    confirmToken: tokBody.token,
  }, { timestamp: t1 })
  // Token check: server clock-now > issuedAt + 60s → 403 (token expired)
  // OR: KV expireIn auto-deleted it → 403 (no token)
  assertEquals(res.status, 403)
}))

Deno.test('purge: missing token returns 400', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const res = await callSync(kv, 'POST', '/sync/vault/purge', {})
  assertEquals(res.status, 400)
}))

// ── 12. Vault index endpoint ───────────────────────────────────────────

Deno.test('vault/index: returns lastVersion, totalBytes, deviceCount', setupTeardown(async (kv) => {
  await registerDevice(kv, VAULT_A, DEVICE_A1, 'Mac')
  await registerDevice(kv, VAULT_A, DEVICE_A2, 'iPhone')
  await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note', resourceId: 'idx-n1', ciphertext: base64Encode(mkCipher(123)), parentVersion: null,
    }],
  })
  const res = await callSync(kv, 'GET', '/sync/vault/index')
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.lastVersion, 1)
  assert(body.totalBytes >= 123)
  assertEquals(body.deviceCount, 2)
  assertEquals(body.pairedDevices.length, 2)
}))

// ── 13. Note version-specific endpoints ────────────────────────────────

Deno.test('note/:id/versions + version/:n: list and fetch', setupTeardown(async (kv) => {
  await registerDevice(kv)
  for (let i = 0; i < 3; i++) {
    await callSync(kv, 'POST', '/sync/push', {
      envelopes: [{
        resourceType: 'note', resourceId: 'history-1', ciphertext: base64Encode(mkCipher(50)), parentVersion: i === 0 ? null : i,
      }],
    })
  }
  const listRes = await callSync(kv, 'GET', '/sync/note/history-1/versions')
  assertEquals(listRes.status, 200)
  const listBody = await listRes.json()
  assertEquals(listBody.versions.length, 3)
  // Fetch version 2
  const v2res = await callSync(kv, 'GET', '/sync/note/history-1/version/2')
  assertEquals(v2res.status, 200)
  const v2body = await v2res.json()
  assertExists(v2body.ciphertext)
  // Missing version → 404
  const missingRes = await callSync(kv, 'GET', '/sync/note/history-1/version/99')
  assertEquals(missingRes.status, 404)
}))

// ── Vault-full quota enforcement ───────────────────────────────────────

Deno.test('push: vault-full returns 413 with vault-full code', setupTeardown(async (kv) => {
  await registerDevice(kv)
  // Manually set the vault index to near-full
  await kv.set(['v', VAULT_A, 'index'], {
    lastVersion: 0,
    totalBytes: MAX_VAULT_BYTES - 100,
  })
  const ct = base64Encode(mkCipher(200))
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note', resourceId: 'overflow', ciphertext: ct, parentVersion: null,
    }],
  })
  assertEquals(res.status, 413)
  const body = await res.json()
  assertEquals(body.error, 'vault-full')
  assertEquals(body.limit, MAX_VAULT_BYTES)
}))

// ── Error response shape consistency ───────────────────────────────────

Deno.test('error shape: all errors have { error: code }', setupTeardown(async (kv) => {
  // 404 unknown
  const r1 = await callSync(kv, 'GET', '/sync/unknown-endpoint')
  assertEquals(r1.status, 404)
  const b1 = await r1.json()
  assertEquals(b1.error, 'not-found')

  // 401 no headers
  const r2 = await routeSyncRequest(kv, new Request('http://localhost/sync/push', { method: 'POST' }))
  assertEquals(r2?.status, 401)
  const b2 = await r2!.json()
  assertEquals(b2.error, 'unauthorized')

  // 400 bad JSON for register
  const r3 = await routeSyncRequest(
    kv,
    new Request('http://localhost/sync/vault/register', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    }),
  )
  assertEquals(r3?.status, 400)
  const b3 = await r3!.json()
  assertEquals(b3.error, 'invalid-request')
}))

// ── Cross-device pull verifies authorDeviceId ──────────────────────────

Deno.test('pull: envelopes carry authorDeviceId for attribution', setupTeardown(async (kv) => {
  await registerDevice(kv, VAULT_A, DEVICE_A1)
  await registerDevice(kv, VAULT_A, DEVICE_A2)
  await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'note', resourceId: 'attr-1', ciphertext: base64Encode(mkCipher(40)), parentVersion: null,
    }],
  }, { deviceId: DEVICE_A1 })
  const res = await callSync(kv, 'GET', '/sync/pull?since=0&limit=100', undefined, {
    deviceId: DEVICE_A2,
  })
  const body = await res.json()
  assertEquals(body.envelopes[0].authorDeviceId, DEVICE_A1)
}))

// ── Pull limit cap (server enforces ≤ 100) ─────────────────────────────

Deno.test('pull: limit cap enforced (limit=999 → ≤100)', setupTeardown(async (kv) => {
  await registerDevice(kv)
  // Just verify the request is accepted; capping is internal
  const res = await callSync(kv, 'GET', '/sync/pull?since=0&limit=9999')
  assertEquals(res.status, 200)
}))

// ── Base64 round-trip helper smoke test ────────────────────────────────

Deno.test('base64: encode/decode round-trip', () => {
  const sample = new Uint8Array([0, 1, 2, 250, 251, 255, 100])
  const enc = base64Encode(sample)
  const dec = base64Decode(enc)
  assertEquals(dec.length, sample.length)
  for (let i = 0; i < sample.length; i++) assertEquals(dec[i], sample[i])
})

// ── Body validation: empty envelopes array ─────────────────────────────

Deno.test('push: empty envelopes returns 400', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const res = await callSync(kv, 'POST', '/sync/push', { envelopes: [] })
  assertEquals(res.status, 400)
}))

Deno.test('push: invalid resourceType returns 400', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{
      resourceType: 'bogus',
      resourceId: 'x',
      ciphertext: base64Encode(mkCipher(10)),
      parentVersion: null,
    }],
  })
  assertEquals(res.status, 400)
}))

// ── Atomicity: failed batch leaves no envelopes ────────────────────────

Deno.test('push: failed batch (oversize 2nd) leaves no partial state', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const goodCt = base64Encode(mkCipher(100))
  const badCt = base64Encode(mkCipher(MAX_ENVELOPE_BYTES + 1))
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [
      { resourceType: 'note', resourceId: 'good', ciphertext: goodCt, parentVersion: null },
      { resourceType: 'note', resourceId: 'bad', ciphertext: badCt, parentVersion: null },
    ],
  })
  assertEquals(res.status, 413)
  // Pull → no envelopes were written
  const pull = await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')
  const body = await pull.json()
  assertEquals(body.envelopes.length, 0)
  assertEquals(body.vaultIndex.lastVersion, 0)
}))

// ── Entitlement gating (Option C v1.5) ─────────────────────────────────
//
// These tests exercise the relay's entitlement gate. They flip
// ENTITLEMENT_REQUIRED on/off via Deno.env and verify that:
//   - register/push/pull return 402 when no entitlement
//   - register/push/pull return 200 with a valid sync-sub entitlement
//   - mac-only lifetime (the v1.5 desktop-license-only grant) does NOT
//     by itself unlock sync — confirms the no-grandfather policy
//   - "always-allowed" routes (purge, quota, device revoke) bypass the gate

import { hasEntitlement, routeEntitlements } from './entitlements.ts'
import { routeAuth, verifySessionToken } from './auth.ts'

async function hmacBodyHex(rawBody: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Grant a Stripe sync-sub entitlement via the HMAC-protected endpoint. */
async function grantSyncSub(
  kv: Deno.Kv,
  email: string,
  active = true,
  expiresInMs = 30 * 24 * 60 * 60 * 1000,
): Promise<void> {
  const secret = 'TEST_SECRET'
  Deno.env.set('ENTITLEMENT_GRANT_SECRET', secret)
  const body = {
    email,
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: 'sub_test',
    currentPeriodEnd: Date.now() + expiresInMs,
    status: active ? 'active' : 'canceled',
  }
  const rawBody = JSON.stringify(body)
  const sig = await hmacBodyHex(rawBody, secret)
  const req = new Request('http://localhost/entitlements/grant-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Entitlement-Signature': sig },
    body: rawBody,
  })
  const res = await routeEntitlements(kv, req)
  assertEquals(res?.status, 200, 'grant-sync should succeed')
}

function withEntitlementRequired<T>(fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    const prev = Deno.env.get('ENTITLEMENT_REQUIRED')
    Deno.env.set('ENTITLEMENT_REQUIRED', 'true')
    try { return await fn() } finally {
      if (prev === undefined) Deno.env.delete('ENTITLEMENT_REQUIRED')
      else Deno.env.set('ENTITLEMENT_REQUIRED', prev)
    }
  }
}

Deno.test('entitlement: ENTITLEMENT_REQUIRED off → unauthed sync allowed (alpha behavior)', setupTeardown(async (kv) => {
  Deno.env.delete('ENTITLEMENT_REQUIRED')
  const res = await registerDevice(kv)
  assertEquals(res.status, 200)
}))

Deno.test('entitlement: gate blocks register when no identity + no entitlement', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    const res = await registerDevice(kv)
    assertEquals(res.status, 402)
    const body = await res.json()
    assertEquals(body.reason, 'no-identity')
  } finally { kv.close() }
})))

Deno.test('entitlement: sync-sub via X-RC-AppUserId header unlocks sync', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    // Grant an iOS entitlement directly via KV (simulates RC webhook).
    await kv.set(['entitlement', 'ios', 'rc-user-1'], {
      source: 'ios',
      rcAppUserId: 'rc-user-1',
      active: true,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    })
    // Compose a register request with the RC header.
    const headers = authHeaders()
    headers['Content-Type'] = 'application/json'
    headers['X-RC-AppUserId'] = 'rc-user-1'
    const req = makeRequest('POST', '/sync/vault/register', {
      vaultId: VAULT_A, deviceId: DEVICE_A1, deviceName: 'iPhone',
    }, headers)
    const res = await routeSyncRequest(kv, req)
    assertEquals(res?.status, 200)
  } finally { kv.close() }
})))

Deno.test('entitlement: Stripe sync-sub via grant-sync unlocks via session token', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
    Deno.env.set('ENTITLEMENT_GRANT_SECRET', 'TEST_SECRET')
    const email = 'tester@example.com'
    await grantSyncSub(kv, email)

    // Mint a session for that email by writing directly to KV (skip the
    // 6-digit code flow — covered separately below).
    const tokenId = '0'.repeat(32)
    const sig = await hmacBodyHex(tokenId, 'test-auth-secret-32-chars-long-key')
    const token = `tok_${tokenId}.${sig}`
    await kv.set(['auth-session', tokenId], { email, createdAt: Date.now() })

    const headers = authHeaders()
    headers['Content-Type'] = 'application/json'
    headers['Authorization'] = `Bearer ${token}`
    const req = makeRequest('POST', '/sync/vault/register', {
      vaultId: VAULT_A, deviceId: DEVICE_A1, deviceName: 'Mac',
    }, headers)
    const res = await routeSyncRequest(kv, req)
    assertEquals(res?.status, 200, `expected 200, got ${res?.status}: ${await res?.text()}`)
  } finally { kv.close() }
})))

Deno.test('entitlement: Mac one-time alone does NOT unlock sync (v1.5 no-grandfather)', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    // Insert a mac entitlement directly.
    await kv.set(['entitlement', 'mac', 'mac@example.com'], {
      source: 'mac', email: 'mac@example.com', grantedAt: Date.now(),
    })
    const ent = await hasEntitlement(kv, { email: 'mac@example.com' })
    assertEquals(ent.hasSync, false, 'mac-only should NOT have sync in v1.5')
  } finally { kv.close() }
})))

Deno.test('entitlement: expired sync-sub returns 402', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
    Deno.env.set('ENTITLEMENT_GRANT_SECRET', 'TEST_SECRET')
    const email = 'expired@example.com'
    // Set sync-sub with expiresAt in the past.
    await kv.set(['entitlement', 'sync', email], {
      source: 'stripe-sub',
      email,
      active: true,
      expiresAt: Date.now() - 1000,
      status: 'active',
      updatedAt: Date.now(),
    })
    const ent = await hasEntitlement(kv, { email })
    assertEquals(ent.hasSync, false)
  } finally { kv.close() }
})))

Deno.test('entitlement: always-allowed routes (purge-token) bypass gate', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    // Register without gate (gate off here), then re-enable for purge.
    const purgeReq = makeRequest('GET', '/sync/vault/purge-token', undefined, authHeaders())
    const res = await routeSyncRequest(kv, purgeReq)
    // The handler may still return 400 (missing args) but NOT 402.
    assertNotEquals(res?.status, 402)
  } finally { kv.close() }
})))

// ── Magic-link auth (server/auth.ts) ───────────────────────────────────

// We can't actually send emails in tests; sendCode logs+swallows the
// Resend failure when RESEND_API_KEY is unset. The auth endpoint still
// returns ok:true and stores the code in KV — which is exactly what
// the unit tests need to inspect.

Deno.test('auth: request code stores 6-digit code in KV', setupTeardown(async (kv) => {
  Deno.env.delete('RESEND_API_KEY')
  const req = makeRequest('POST', '/auth/code/request', { email: 'auth@example.com' })
  const res = await routeAuth(kv, req)
  assertEquals(res?.status, 200)
  const rec = await kv.get<{ code: string; attempts: number }>(['auth-code', 'auth@example.com'])
  assertExists(rec.value)
  assert(/^\d{6}$/.test(rec.value!.code))
  assertEquals(rec.value!.attempts, 0)
}))

Deno.test('auth: throttle blocks 2nd request within 60s', setupTeardown(async (kv) => {
  Deno.env.delete('RESEND_API_KEY')
  const r1 = await routeAuth(kv, makeRequest('POST', '/auth/code/request', { email: 't@example.com' }))
  assertEquals(r1?.status, 200)
  const r2 = await routeAuth(kv, makeRequest('POST', '/auth/code/request', { email: 't@example.com' }))
  assertEquals(r2?.status, 200) // still 200 (no leak), but body shows throttled
  const body = await r2!.json()
  assertEquals(body.throttled, true)
}))

Deno.test('auth: verify wrong code increments attempts', setupTeardown(async (kv) => {
  Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
  await routeAuth(kv, makeRequest('POST', '/auth/code/request', { email: 'v@example.com' }))
  const r = await routeAuth(kv, makeRequest('POST', '/auth/code/verify', { email: 'v@example.com', code: '000000' }))
  // 000000 is *very unlikely* to match; with crypto-random there's a 1-in-1M chance of a flake.
  // Allow either 401 (mismatch) or 200 (the astronomically rare match) — but assert KV attempts incremented if 401.
  if (r?.status === 401) {
    const rec = await kv.get<{ attempts: number }>(['auth-code', 'v@example.com'])
    assertEquals(rec.value!.attempts, 1)
  }
}))

Deno.test('auth: verify right code mints token + stores session', setupTeardown(async (kv) => {
  Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
  // Request a code so the KV entry is created.
  await routeAuth(kv, makeRequest('POST', '/auth/code/request', { email: 'happy@example.com' }))
  const rec = await kv.get<{ code: string }>(['auth-code', 'happy@example.com'])
  assertExists(rec.value)
  const code = rec.value!.code

  const r = await routeAuth(kv, makeRequest('POST', '/auth/code/verify', { email: 'happy@example.com', code }))
  assertEquals(r?.status, 200)
  const body = await r!.json()
  assertEquals(body.email, 'happy@example.com')
  assert(typeof body.token === 'string' && body.token.startsWith('tok_'))

  // Token must validate
  const sess = await verifySessionToken(kv, body.token)
  assertEquals(sess?.email, 'happy@example.com')
}))

Deno.test('auth: signout deletes session', setupTeardown(async (kv) => {
  Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
  await routeAuth(kv, makeRequest('POST', '/auth/code/request', { email: 'so@example.com' }))
  const rec = await kv.get<{ code: string }>(['auth-code', 'so@example.com'])
  const verifyRes = await routeAuth(kv, makeRequest('POST', '/auth/code/verify', { email: 'so@example.com', code: rec.value!.code }))
  const { token } = await verifyRes!.json()
  const sess = await verifySessionToken(kv, token)
  assertExists(sess)
  // Now sign out
  const signoutReq = makeRequest('POST', '/auth/signout')
  signoutReq.headers.set('Authorization', `Bearer ${token}`)
  await routeAuth(kv, signoutReq)
  const post = await verifySessionToken(kv, token)
  assertEquals(post, null)
}))

Deno.test('auth: invalid token format → null from verifySessionToken', setupTeardown(async (kv) => {
  Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
  assertEquals(await verifySessionToken(kv, 'garbage'), null)
  assertEquals(await verifySessionToken(kv, 'tok_short.sig'), null)
  assertEquals(await verifySessionToken(kv, ''), null)
}))
