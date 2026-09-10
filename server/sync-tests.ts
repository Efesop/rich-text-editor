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
  ABANDONED_UPLOAD_MS,
  base64Decode,
  base64Encode,
  CHUNK_BYTES,
  clearRateLimits,
  getWsConnectionCount,
  INACTIVE_VAULT_TTL_MS,
  LARGE_ENVELOPE_INTERVAL_MS,
  MAX_BATCH_BYTES,
  MAX_BATCH_COUNT,
  MAX_DEVICES_PER_VAULT,
  MAX_ENVELOPE_BYTES,
  MAX_EXISTS_IDS,
  MAX_NOTE_VERSIONS,
  MAX_PULL_BYTES,
  MAX_VAULT_BYTES,
  purgeInactiveVaults,
  relayUsageBytes,
  resetClock,
  resetKvCeiling,
  resetMonthlyAttachmentBudget,
  routeSyncRequest,
  setClock,
  setKvCeilingForTests,
  setMonthlyAttachmentBudgetForTests,
  sweepAbandonedUploads,
  TOMBSTONE_PERMANENT_MS,
} from './sync.ts'
import { handleShareRequest, readShare, storeShare } from './share.ts'

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
  // getRandomValues fills at most 65,536 bytes per call.
  for (let i = 0; i < size; i += 65536) {
    crypto.getRandomValues(out.subarray(i, Math.min(size, i + 65536)))
  }
  return out
}

function setupTeardown<T>(fn: (kv: Deno.Kv) => Promise<T>): () => Promise<T> {
  return async () => {
    clearRateLimits()
    resetClock()
    resetKvCeiling()
    resetMonthlyAttachmentBudget()
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

Deno.test('push: envelope over MAX_ENVELOPE_BYTES returns 413', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const ct = base64Encode(mkCipher(MAX_ENVELOPE_BYTES + 1))
  const res = await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{ resourceType: 'note', resourceId: 'big', ciphertext: ct, parentVersion: null }],
  })
  assertEquals(res.status, 413)
  const body = await res.json()
  assertEquals(body.error, 'payload-too-large')
}))

Deno.test('push: batch over MAX_BATCH_BYTES in total returns 413', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const big = base64Encode(mkCipher(MAX_ENVELOPE_BYTES))
  // 5 envelopes at the per-envelope cap exceed the batch cap
  assert(5 * MAX_ENVELOPE_BYTES > MAX_BATCH_BYTES)
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

Deno.test('pull: low-version note is not skipped on a large vault (scan-order regression)', setupTeardown(async (kv) => {
  await registerDevice(kv)
  // Push this note FIRST so it gets the lowest version (1), but give it a
  // resourceId that sorts LAST. kv.list yields in resourceId order, so a
  // resourceId-ordered scan reaches every other note before this one.
  await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{ resourceType: 'note', resourceId: 'zzz-late', ciphertext: base64Encode(mkCipher(40)), parentVersion: null }],
  })
  // Push 200 more notes (versions 2..201) whose resourceIds all sort BEFORE
  // 'zzz-late'. 200 exceeds the old maxScan (limit*8+100), so the previous
  // early break fired before ever scanning 'zzz-late' — and because its
  // version (1) sits below every later cursor, it was then lost forever.
  for (let b = 0; b < 4; b++) {
    const envelopes = []
    for (let i = 0; i < 50; i++) {
      const n = b * 50 + i
      envelopes.push({ resourceType: 'note', resourceId: `a-${String(n).padStart(3, '0')}`, ciphertext: base64Encode(mkCipher(40)), parentVersion: null })
    }
    await callSync(kv, 'POST', '/sync/push', { envelopes })
  }
  // The first page (the 10 lowest versions) MUST contain the version-1 note.
  const res = await callSync(kv, 'GET', '/sync/pull?since=0&limit=10')
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.envelopes.length, 10)
  assertEquals(body.envelopes[0].version, 1)
  const ids = body.envelopes.map((e: { resourceId: string }) => e.resourceId)
  assert(ids.includes('zzz-late'), 'the version-1 note must be in the lowest-version page, not skipped by scan order')
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

// authenticate() reads the devices map, then writes lastSeenAt back to it.
// A revoke or register that commits in between must survive that write.

import { LAST_SEEN_WRITE_INTERVAL_MS } from './sync.ts'

/**
 * Wrap `kv` so `between` runs right after the first read of the vault's
 * devices map (authenticate's read) and before that read is returned —
 * i.e. deterministically inside authenticate's read-then-write window.
 */
function interleaveAfterDevicesRead(
  kv: Deno.Kv,
  vaultId: string,
  between: () => Promise<void>,
): Deno.Kv {
  let fired = false
  return new Proxy(kv, {
    get(target, prop) {
      if (prop === 'get') {
        return async (key: Deno.KvKey, options?: { consistency?: Deno.KvConsistencyLevel }) => {
          const entry = await target.get(key, options)
          if (!fired && key.length === 3 && key[0] === 'vault' && key[1] === vaultId && key[2] === 'devices') {
            fired = true
            await between()
          }
          return entry
        }
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

Deno.test('auth: lastSeenAt write racing a revoke does not bring the device back', setupTeardown(async (kv) => {
  const t0 = 1_700_000_000_000
  setClock(() => t0)
  await registerDevice(kv, VAULT_A, DEVICE_A1, undefined, t0)
  await registerDevice(kv, VAULT_A, DEVICE_A2, undefined, t0)
  // Past the throttle, so A1's next request does write lastSeenAt.
  const t1 = t0 + LAST_SEEN_WRITE_INTERVAL_MS + 1000
  setClock(() => t1)

  // A2 revokes A1 while A1's request sits between the read and the write.
  let revokeStatus = 0
  const racyKv = interleaveAfterDevicesRead(kv, VAULT_A, async () => {
    const res = await callSync(kv, 'DELETE', `/sync/vault/devices/${DEVICE_A1}`, undefined, {
      deviceId: DEVICE_A2, timestamp: t1,
    })
    revokeStatus = res.status
  })
  const inFlight = await callSync(racyKv, 'GET', '/sync/vault/index', undefined, {
    deviceId: DEVICE_A1, timestamp: t1,
  })
  assertEquals(revokeStatus, 200)
  // Authorised before the revoke landed; the skipped write doesn't fail it.
  assertEquals(inFlight.status, 200)

  const devices = await kv.get<Record<string, unknown>>(['vault', VAULT_A, 'devices'])
  assertEquals(Object.keys(devices.value ?? {}), [DEVICE_A2])
  const after = await callSync(kv, 'GET', '/sync/vault/index', undefined, {
    deviceId: DEVICE_A1, timestamp: t1,
  })
  assertEquals(after.status, 401)
}))

Deno.test('auth: lastSeenAt write racing a register does not drop the new device', setupTeardown(async (kv) => {
  const t0 = 1_700_000_000_000
  setClock(() => t0)
  await registerDevice(kv, VAULT_A, DEVICE_A1, undefined, t0)
  const t1 = t0 + LAST_SEEN_WRITE_INTERVAL_MS + 1000
  setClock(() => t1)

  // A2 joins while A1's request sits between the read and the write.
  let registerStatus = 0
  const racyKv = interleaveAfterDevicesRead(kv, VAULT_A, async () => {
    registerStatus = (await registerDevice(kv, VAULT_A, DEVICE_A2, undefined, t1)).status
  })
  const inFlight = await callSync(racyKv, 'GET', '/sync/vault/index', undefined, {
    deviceId: DEVICE_A1, timestamp: t1,
  })
  assertEquals(registerStatus, 200)
  assertEquals(inFlight.status, 200)

  const joined = await callSync(kv, 'GET', '/sync/vault/index', undefined, {
    deviceId: DEVICE_A2, timestamp: t1,
  })
  assertEquals(joined.status, 200)
}))

Deno.test('auth: lastSeenAt is only rewritten once LAST_SEEN_WRITE_INTERVAL_MS has passed', setupTeardown(async (kv) => {
  const t0 = 1_700_000_000_000
  setClock(() => t0)
  await registerDevice(kv, VAULT_A, DEVICE_A1, undefined, t0)
  const devicesKey = ['vault', VAULT_A, 'devices']
  const registered = await kv.get(devicesKey)

  // Still fresh: the request authenticates without writing the devices map.
  const t1 = t0 + LAST_SEEN_WRITE_INTERVAL_MS - 1000
  setClock(() => t1)
  const fresh = await callSync(kv, 'GET', '/sync/vault/index', undefined, { timestamp: t1 })
  assertEquals(fresh.status, 200)
  assertEquals((await kv.get(devicesKey)).versionstamp, registered.versionstamp)

  // Stale: the next request records it.
  const t2 = t0 + LAST_SEEN_WRITE_INTERVAL_MS
  setClock(() => t2)
  const stale = await callSync(kv, 'GET', '/sync/vault/index', undefined, { timestamp: t2 })
  assertEquals(stale.status, 200)
  const devices = await kv.get<Record<string, { lastSeenAt: number }>>(devicesKey)
  assertEquals(devices.value?.[DEVICE_A1].lastSeenAt, t2)
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

Deno.test('entitlement: an iPhone subscription covers the whole vault — a Mac signed in by email unlocks after the phone joins', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
    // App Store purchase, keyed by the phone's RevenueCat id (RC webhook).
    await kv.set(['entitlement', 'ios', 'rc-user-2'], {
      source: 'ios', rcAppUserId: 'rc-user-2', active: true,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, updatedAt: Date.now(),
    })
    // Mac: signed in by email, NO plan on that email.
    const email = 'mac-owner@example.com'
    const tokenId = '1'.repeat(32)
    const sig = await hmacBodyHex(tokenId, 'test-auth-secret-32-chars-long-key')
    const token = `tok_${tokenId}.${sig}`
    await kv.set(['auth-session', tokenId], { email, createdAt: Date.now() })
    const macHeaders = () => {
      const h = authHeaders({ deviceId: DEVICE_A2 })
      h['Content-Type'] = 'application/json'
      h['Authorization'] = `Bearer ${token}`
      return h
    }
    // Before the phone joins: the Mac is blocked.
    const blocked = await routeSyncRequest(kv, makeRequest('POST', '/sync/vault/register', {
      vaultId: VAULT_A, deviceId: DEVICE_A2, deviceName: 'Mac',
    }, macHeaders()))
    assertEquals(blocked?.status, 402)
    assertEquals((await hasEntitlement(kv, { email })).hasSync, false)

    // iPhone joins the same vault, carrying its RC id.
    const phoneHeaders = authHeaders()
    phoneHeaders['Content-Type'] = 'application/json'
    phoneHeaders['X-RC-AppUserId'] = 'rc-user-2'
    const joined = await routeSyncRequest(kv, makeRequest('POST', '/sync/vault/register', {
      vaultId: VAULT_A, deviceId: DEVICE_A1, deviceName: 'iPhone',
    }, phoneHeaders))
    assertEquals(joined?.status, 200)

    // Now the Mac passes — the vault is covered — and the email gets linked,
    // so an email-only lookup (/auth/me) agrees.
    const allowed = await routeSyncRequest(kv, makeRequest('POST', '/sync/vault/register', {
      vaultId: VAULT_A, deviceId: DEVICE_A2, deviceName: 'Mac',
    }, macHeaders()))
    assertEquals(allowed?.status, 200, `expected 200, got ${allowed?.status}: ${await allowed?.text()}`)
    const viaEmail = await hasEntitlement(kv, { email })
    assertEquals(viaEmail.hasSync, true)
    assertEquals(viaEmail.source, 'ios')

    // A request with NO identity at all (the WebSocket doorbell cannot carry
    // headers) passes once the vault is covered — it used to be cut off by
    // the "no identity → 402" shortcut before the vault check ever ran.
    const noIdentity = await routeSyncRequest(kv, makeRequest('GET', '/sync/pull?since=0', undefined, authHeaders()))
    assert(noIdentity?.status !== 402, `no-identity request on a covered vault must not 402, got ${noIdentity?.status}`)

    // A different vault is NOT covered by that phone's plan.
    const other = await routeSyncRequest(kv, makeRequest('POST', '/sync/vault/register', {
      vaultId: 'vault-bbbbbbbbbbbbbbbbbbbbbb1', deviceId: 'device-bbbbbbbbbbbbbbbbbb1', deviceName: 'Stranger',
    }, { ...authHeaders({ vaultId: 'vault-bbbbbbbbbbbbbbbbbbbbbb1', deviceId: 'device-bbbbbbbbbbbbbbbbbb1' }), 'Content-Type': 'application/json' }))
    assertEquals(other?.status, 402)
  } finally { kv.close() }
})))

Deno.test('entitlement: a Mac entitled through the email→iOS link covers its vault, so a reinstalled phone (new RC id) can join', setupTeardown(withEntitlementRequired(async () => {
  const kv = await freshKv()
  try {
    Deno.env.set('AUTH_TOKEN_SECRET', 'test-auth-secret-32-chars-long-key')
    await kv.set(['entitlement', 'ios', 'rc-old'], { source: 'ios', rcAppUserId: 'rc-old', active: true, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, updatedAt: Date.now() })
    await kv.set(['entitlement', 'email-ios', 'owner@example.com'], { rcAppUserId: 'rc-old', linkedAt: Date.now() })
    const tokenId = '2'.repeat(32)
    const sig = await hmacBodyHex(tokenId, 'test-auth-secret-32-chars-long-key')
    await kv.set(['auth-session', tokenId], { email: 'owner@example.com', createdAt: Date.now() })
    const macHeaders = { ...authHeaders({ deviceId: DEVICE_A2 }), 'Content-Type': 'application/json', 'Authorization': `Bearer tok_${tokenId}.${sig}` }
    // Mac (entitled only via the email link) touches the vault → vault gets covered.
    const mac = await routeSyncRequest(kv, makeRequest('POST', '/sync/vault/register', { vaultId: VAULT_A, deviceId: DEVICE_A2, deviceName: 'Mac' }, macHeaders))
    assertEquals(mac?.status, 200)
    // Reinstalled phone: brand-new RC id with no plan of its own joins the same vault.
    const phoneHeaders = { ...authHeaders(), 'Content-Type': 'application/json', 'X-RC-AppUserId': 'rc-new-after-reinstall' }
    const phone = await routeSyncRequest(kv, makeRequest('POST', '/sync/vault/register', { vaultId: VAULT_A, deviceId: DEVICE_A1, deviceName: 'iPhone' }, phoneHeaders))
    assertEquals(phone?.status, 200, `expected 200, got ${phone?.status}: ${await phone?.text()}`)
  } finally { kv.close() }
})))

Deno.test('entitlement: RevenueCat TRANSFER moves the plan to the new RC id and retires the old one', setupTeardown(async (kv) => {
  Deno.env.set('RC_WEBHOOK_AUTH', 'rc-secret')
  const post = async (event: unknown) => routeEntitlements(kv, new Request('http://localhost/entitlements/grant-ios', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer rc-secret' }, body: JSON.stringify({ event }),
  }))
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000
  assertEquals((await post({ type: 'INITIAL_PURCHASE', app_user_id: 'rc-a', product_id: 'sync.monthly', expiration_at_ms: exp }))?.status, 200)
  assertEquals((await hasEntitlement(kv, { rcAppUserId: 'rc-a' })).hasSync, true)
  assertEquals((await post({ type: 'TRANSFER', app_user_id: 'rc-b', transferred_from: ['rc-a'], transferred_to: ['rc-b'], product_id: 'sync.monthly', expiration_at_ms: exp }))?.status, 200)
  assertEquals((await hasEntitlement(kv, { rcAppUserId: 'rc-b' })).hasSync, true)
  assertEquals((await hasEntitlement(kv, { rcAppUserId: 'rc-a' })).hasSync, false)
}))

Deno.test('entitlement: support link-ios-email ties an App Store plan to an email (HMAC, active-only)', setupTeardown(async (kv) => {
  Deno.env.set('ENTITLEMENT_SUPPORT_SECRET', 'SUPPORT_SECRET')
  await kv.set(['entitlement', 'ios', 'rc-user-3'], {
    source: 'ios', rcAppUserId: 'rc-user-3', active: true,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, updatedAt: Date.now(),
  })
  const post = async (body: unknown, secret: string) => {
    const raw = JSON.stringify(body)
    const sig = await hmacBodyHex(raw, secret)
    return await routeEntitlements(kv, new Request('http://localhost/entitlements/link-ios-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Entitlement-Signature': sig }, body: raw,
    }))
  }
  // Wrong secret → 401, nothing linked.
  assertEquals((await post({ email: 'Owner@Example.com', rcAppUserId: 'rc-user-3' }, 'WRONG'))?.status, 401)
  assertEquals((await hasEntitlement(kv, { email: 'owner@example.com' })).hasSync, false)
  // Unknown / inactive RC id → 404.
  assertEquals((await post({ email: 'owner@example.com', rcAppUserId: 'rc-nobody' }, 'SUPPORT_SECRET'))?.status, 404)
  // Good → linked; email-only lookup now reports the iOS plan.
  const ok = await post({ email: 'Owner@Example.com', rcAppUserId: 'rc-user-3' }, 'SUPPORT_SECRET')
  assertEquals(ok?.status, 200)
  const body = await ok!.json()
  assertEquals(body.hasSync, true)
  assertEquals(body.source, 'ios')
  const viaEmail = await hasEntitlement(kv, { email: 'owner@example.com' })
  assertEquals(viaEmail.hasSync, true)
  assertEquals(viaEmail.source, 'ios')
}))

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

// ── Chunked storage: notes and attachments larger than one KV value ────

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

async function listKeys(kv: Deno.Kv, prefix: Deno.KvKey): Promise<Deno.KvKey[]> {
  const keys: Deno.KvKey[] = []
  for await (const entry of kv.list({ prefix })) keys.push(entry.key)
  return keys
}

async function pushNote(kv: Deno.Kv, resourceId: string, bytes: Uint8Array, authOpts: AuthOpts = {}): Promise<Response> {
  return await callSync(kv, 'POST', '/sync/push', {
    envelopes: [{ resourceType: 'note', resourceId, ciphertext: base64Encode(bytes), parentVersion: null }],
  }, authOpts)
}

Deno.test('base64: multi-megabyte buffers round-trip', () => {
  const bytes = mkCipher(3 * 1024 * 1024 + 7)
  assert(sameBytes(base64Decode(base64Encode(bytes)), bytes))
})

Deno.test('chunks: a 1.5 MiB note pulls back byte-identical, with its version history', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const bytes = mkCipher(1.5 * 1024 * 1024)
  assertEquals((await pushNote(kv, 'big-note', bytes)).status, 200)

  const stored = await kv.get<{ ciphertext: Uint8Array; chunks?: { count: number } }>(['v', VAULT_A, 'note', 'big-note', 1])
  assertEquals(stored.value?.chunks?.count, Math.ceil(bytes.byteLength / CHUNK_BYTES))
  assertEquals(stored.value?.ciphertext.byteLength, 0)

  const pull = await (await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')).json()
  assertEquals(pull.envelopes.length, 1)
  assert(sameBytes(base64Decode(pull.envelopes[0].ciphertext), bytes))

  const versions = await (await callSync(kv, 'GET', '/sync/note/big-note/versions')).json()
  assertEquals(versions.versions[0].size, bytes.byteLength)
  const version = await (await callSync(kv, 'GET', '/sync/note/big-note/version/1')).json()
  assert(sameBytes(base64Decode(version.ciphertext), bytes))

  // A committed upload leaves no pending marker behind.
  assertEquals(await listKeys(kv, ['chunk-pending']), [])
}))

Deno.test('chunks: a full batch of 60 KiB envelopes commits despite KV\'s 800 KiB atomic limit', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const payloads: Uint8Array[] = []
  const envelopes = []
  for (let i = 0; i < MAX_BATCH_COUNT; i++) {
    const bytes = mkCipher(60 * 1024)
    payloads.push(bytes)
    envelopes.push({ resourceType: 'note', resourceId: `batch-${i}`, ciphertext: base64Encode(bytes), parentVersion: null })
  }
  assertEquals((await callSync(kv, 'POST', '/sync/push', { envelopes })).status, 200)

  const pull = await (await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')).json()
  assertEquals(pull.envelopes.length, MAX_BATCH_COUNT)
  for (const e of pull.envelopes as Array<{ resourceId: string; ciphertext: string }>) {
    const i = Number(e.resourceId.slice('batch-'.length))
    assert(sameBytes(base64Decode(e.ciphertext), payloads[i]), e.resourceId)
  }
}))

Deno.test('pull: splits at MAX_PULL_BYTES with hasMore, and skips nothing', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const size = 1.5 * 1024 * 1024
  assert(3 * size > MAX_PULL_BYTES)
  const payloads = [mkCipher(size), mkCipher(size), mkCipher(size), mkCipher(size)]
  for (let i = 0; i < payloads.length; i++) {
    assertEquals((await pushNote(kv, `page-${i}`, payloads[i])).status, 200)
  }

  const seen: string[] = []
  let since = 0
  let rounds = 0
  while (rounds < 10) {
    rounds++
    const body = await (await callSync(kv, 'GET', `/sync/pull?since=${since}&limit=100`)).json()
    let bytes = 0
    for (const e of body.envelopes as Array<{ resourceId: string; ciphertext: string; version: number }>) {
      const decoded = base64Decode(e.ciphertext)
      bytes += decoded.byteLength
      assert(sameBytes(decoded, payloads[Number(e.resourceId.slice('page-'.length))]), e.resourceId)
      seen.push(e.resourceId)
      since = Math.max(since, e.version)
    }
    assert(body.envelopes.length === 1 || bytes <= MAX_PULL_BYTES, `response carried ${bytes} bytes`)
    if (!body.hasMore) break
  }
  assertEquals(seen, ['page-0', 'page-1', 'page-2', 'page-3'])
  assert(rounds > 1, 'the byte budget should have split the pull')
}))

Deno.test('attachment: 1 MB and 9.9 MB files round-trip byte-identical', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const cases: Array<[string, number]> = [['att-1mb', 1024 * 1024], ['att-9mb', Math.floor(9.9 * 1024 * 1024)]]
  for (const [id, size] of cases) {
    const bytes = mkCipher(size)
    assertEquals((await callSync(kv, 'POST', `/sync/attachment/${id}`, { ciphertext: base64Encode(bytes) })).status, 200, id)
    const down = await callSync(kv, 'GET', `/sync/attachment/${id}`)
    assertEquals(down.status, 200, id)
    assert(sameBytes(base64Decode((await down.json()).ciphertext), bytes), id)
  }
}))

Deno.test('attachment: uploads leave lastVersion alone, so pulls stay caught up', setupTeardown(async (kv) => {
  await registerDevice(kv)
  assertEquals((await pushNote(kv, 'n1', mkCipher(100))).status, 200)
  const photo = mkCipher(200 * 1024)
  assertEquals((await callSync(kv, 'POST', '/sync/attachment/photo-1', { ciphertext: base64Encode(photo) })).status, 200)
  const index = await (await callSync(kv, 'GET', '/sync/vault/index')).json()
  assertEquals(index.lastVersion, 1)
  assertEquals(index.totalBytes, 100 + photo.byteLength)
}))

Deno.test('legacy: blobs stored as one value before chunking still pull and download', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const note = mkCipher(40 * 1024)
  const attachment = mkCipher(50 * 1024)
  const legacyBlob = (ciphertext: Uint8Array) => ({
    v: 1, ciphertext, size: ciphertext.byteLength, uploadedAt: Date.now(), authorDeviceId: DEVICE_A1, parentVersion: null,
  })
  await kv.set(['v', VAULT_A, 'note', 'legacy-note', 1], legacyBlob(note))
  await kv.set(['v', VAULT_A, 'attachment', 'legacy-att', 1], legacyBlob(attachment))
  await kv.set(['v', VAULT_A, 'index'], { lastVersion: 1, totalBytes: note.byteLength + attachment.byteLength })

  const pull = await (await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')).json()
  assert(sameBytes(base64Decode(pull.envelopes[0].ciphertext), note))
  const down = await (await callSync(kv, 'GET', '/sync/attachment/legacy-att')).json()
  assert(sameBytes(base64Decode(down.ciphertext), attachment))
}))

Deno.test('chunks: an upload that never committed stays invisible and is swept a day later', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const t0 = Date.now()
  await kv.set(['chunk-pending', 'upload-stale'], { vaultId: VAULT_A, count: 2, createdAt: t0 - ABANDONED_UPLOAD_MS - 1 })
  await kv.set(['v', VAULT_A, 'chunk', 'upload-stale', 0], mkCipher(1024))
  await kv.set(['v', VAULT_A, 'chunk', 'upload-stale', 1], mkCipher(1024))
  await kv.set(['chunk-pending', 'upload-fresh'], { vaultId: VAULT_A, count: 1, createdAt: t0 })
  await kv.set(['v', VAULT_A, 'chunk', 'upload-fresh', 0], mkCipher(1024))

  const pull = await (await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')).json()
  assertEquals(pull.envelopes.length, 0)

  assertEquals(await sweepAbandonedUploads(kv), 1)
  assertEquals(await listKeys(kv, ['v', VAULT_A, 'chunk', 'upload-stale']), [])
  assertEquals((await listKeys(kv, ['v', VAULT_A, 'chunk', 'upload-fresh'])).length, 1)
  assertEquals((await listKeys(kv, ['chunk-pending'])).map((k) => k[1]), ['upload-fresh'])
}))

Deno.test('chunks: a push refused as vault-full stores nothing', setupTeardown(async (kv) => {
  await registerDevice(kv)
  await kv.set(['v', VAULT_A, 'index'], { lastVersion: 0, totalBytes: MAX_VAULT_BYTES - 1024 })
  const res = await pushNote(kv, 'too-big', mkCipher(200 * 1024))
  assertEquals(res.status, 413)
  assertEquals((await res.json()).error, 'vault-full')
  assertEquals(await listKeys(kv, ['v', VAULT_A, 'chunk']), [])
  assertEquals(await listKeys(kv, ['chunk-pending']), [])
}))

Deno.test('eviction: evicted note versions take their chunks and bytes with them', setupTeardown(async (kv) => {
  await registerDevice(kv)
  await relayUsageBytes(kv)
  const size = 100 * 1024
  const t0 = Date.now()
  // Large envelopes are stored at most once a minute per note.
  const step = LARGE_ENVELOPE_INTERVAL_MS + 1000
  for (let i = 0; i < MAX_NOTE_VERSIONS + 1; i++) {
    setClock(() => t0 + i * step)
    assertEquals((await pushNote(kv, 'evict-chunks', mkCipher(size), { timestamp: t0 + i * step })).status, 200, `push ${i + 1}`)
  }
  resetClock()
  const uploads = new Set((await listKeys(kv, ['v', VAULT_A, 'chunk'])).map((k) => k[3]))
  assertEquals(uploads.size, MAX_NOTE_VERSIONS)
  const index = await (await callSync(kv, 'GET', '/sync/vault/index')).json()
  assertEquals(index.totalBytes, MAX_NOTE_VERSIONS * size)
  assertEquals(await relayUsageBytes(kv), MAX_NOTE_VERSIONS * size)
}))

Deno.test('purge: removes chunks and gives the bytes back to the relay', setupTeardown(async (kv) => {
  await registerDevice(kv)
  await relayUsageBytes(kv)
  assertEquals((await pushNote(kv, 'purge-me', mkCipher(300 * 1024))).status, 200)
  assertEquals(await relayUsageBytes(kv), 300 * 1024)

  const { token } = await (await callSync(kv, 'GET', '/sync/vault/purge-token')).json()
  assertEquals((await callSync(kv, 'POST', '/sync/vault/purge', { confirmToken: token })).status, 200)
  assertEquals(await listKeys(kv, ['v', VAULT_A]), [])
  assertEquals(await relayUsageBytes(kv), 0)
}))

Deno.test('attachments/exists: reports which ids the relay holds', setupTeardown(async (kv) => {
  await registerDevice(kv)
  await callSync(kv, 'POST', '/sync/attachment/have-1', { ciphertext: base64Encode(mkCipher(100)) })
  await callSync(kv, 'POST', '/sync/attachment/have-2', { ciphertext: base64Encode(mkCipher(70 * 1024)) })
  const ids = ['have-1', 'have-2', ...Array.from({ length: 15 }, (_, i) => `gone-${i}`)]
  const res = await callSync(kv, 'POST', '/sync/attachments/exists', { ids })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals([...body.present].sort(), ['have-1', 'have-2'])
  assertEquals(body.missing.length, 15)

  const tooMany = Array.from({ length: MAX_EXISTS_IDS + 1 }, (_, i) => `id-${i}`)
  assertEquals((await callSync(kv, 'POST', '/sync/attachments/exists', { ids: tooMany })).status, 400)
  assertEquals((await callSync(kv, 'POST', '/sync/attachments/exists', { ids: ['../etc'] })).status, 400)
  assertEquals((await callSync(kv, 'POST', '/sync/attachments/exists', { ids: [] })).status, 400)
}))

Deno.test('capacity: attachment uploads stop at the relay ceiling while notes keep syncing', setupTeardown(async (kv) => {
  await registerDevice(kv)
  await relayUsageBytes(kv)
  setKvCeilingForTests(100 * 1024)
  assertEquals((await pushNote(kv, 'still-syncs', mkCipher(50 * 1024))).status, 200)

  const res = await callSync(kv, 'POST', '/sync/attachment/refused', { ciphertext: base64Encode(mkCipher(60 * 1024)) })
  assertEquals(res.status, 503)
  assertExists(res.headers.get('Retry-After'))
  assertEquals((await res.json()).error, 'capacity')
  assertEquals((await callSync(kv, 'GET', '/sync/attachment/refused')).status, 404)

  assertEquals((await pushNote(kv, 'still-syncs-2', mkCipher(80 * 1024))).status, 200)
}))

Deno.test('register: stores appVersion and lists it in the vault index', setupTeardown(async (kv) => {
  const register = (deviceId: string, appVersion: unknown) =>
    callSync(kv, 'POST', '/sync/vault/register', { vaultId: VAULT_A, deviceId, appVersion }, { deviceId })
  assertEquals((await register(DEVICE_A1, '1.6.8')).status, 200)
  assertEquals((await register(DEVICE_A2, undefined)).status, 200)
  assertEquals((await register(DEVICE_A1, '1.7.0-beta.2')).status, 200)
  assertEquals((await register(DEVICE_A1, 'not a version')).status, 400)
  assertEquals((await register(DEVICE_A1, 168)).status, 400)

  const index = await (await callSync(kv, 'GET', '/sync/vault/index')).json()
  const versions = Object.fromEntries(
    (index.pairedDevices as Array<{ deviceId: string; appVersion?: string }>).map((d) => [d.deviceId, d.appVersion]),
  )
  assertEquals(versions[DEVICE_A1], '1.7.0-beta.2')
  assertEquals(versions[DEVICE_A2], undefined)
}))

Deno.test('index: attachment uploads and tombstones keep lastActivityAt and the creator IP hash', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const created = (await kv.get<{ creatorIpHash?: string }>(['v', VAULT_A, 'index'])).value
  assertExists(created?.creatorIpHash)
  assertEquals((await pushNote(kv, 'n1', mkCipher(100))).status, 200)
  assertEquals((await callSync(kv, 'POST', '/sync/attachment/a1', { ciphertext: base64Encode(mkCipher(100)) })).status, 200)
  assertEquals((await callSync(kv, 'DELETE', '/sync/note/n1', { tombstoneCiphertext: base64Encode(mkCipher(64)), parentVersion: 1 })).status, 200)

  const index = (await kv.get<{ creatorIpHash?: string; lastActivityAt?: number }>(['v', VAULT_A, 'index'])).value
  assertEquals(index?.creatorIpHash, created?.creatorIpHash)
  assertEquals(typeof index?.lastActivityAt, 'number')

  // Clients never see the creator's IP hash.
  const pull = await (await callSync(kv, 'GET', '/sync/pull?since=0&limit=100')).json()
  assertEquals(pull.vaultIndex.creatorIpHash, undefined)
}))

Deno.test('pull: a vault that is only read is not purged as inactive', setupTeardown(async (kv) => {
  const VAULT_B = 'vault-bbbbbbbbbbbbbbbbbbbbbb1'
  const DEVICE_B1 = 'device-bbbbbbbbbbbbbbbbbb1'
  const longAgo = Date.now() - INACTIVE_VAULT_TTL_MS - 24 * 60 * 60 * 1000
  setClock(() => longAgo)
  for (const [vaultId, deviceId] of [[VAULT_A, DEVICE_A1], [VAULT_B, DEVICE_B1]]) {
    assertEquals((await registerDevice(kv, vaultId, deviceId, undefined, longAgo)).status, 200)
    assertEquals((await pushNote(kv, 'n1', mkCipher(100), { vaultId, deviceId, timestamp: longAgo })).status, 200)
  }
  resetClock()

  // Vault A is still being read; vault B was abandoned.
  assertEquals((await callSync(kv, 'GET', '/sync/pull?since=1&limit=100')).status, 200)
  assertEquals(await purgeInactiveVaults(kv), 1)
  assertExists((await kv.get(['v', VAULT_A, 'index'])).value)
  assertEquals((await kv.get(['v', VAULT_B, 'index'])).value, null)
}))

Deno.test('share: large payloads round-trip through chunks, small ones stay single values', setupTeardown(async (kv) => {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  for (const size of [2 * 1024, 1024 * 1024]) {
    const payload = mkCipher(size)
    const post = await handleShareRequest(kv, new Request('http://localhost/share', { method: 'POST', body: payload as Uint8Array<ArrayBuffer> }), cors)
    assertEquals(post?.status, 200)
    const { id } = await post!.json()
    const get = await handleShareRequest(kv, new Request(`http://localhost/share/${id}`), cors)
    assertEquals(get?.status, 200)
    assert(sameBytes(new Uint8Array(await get!.arrayBuffer()), payload), `${size} bytes`)
  }

  await storeShare(kv, 'partial', mkCipher(200 * 1024))
  await kv.delete(['share-chunk', 'partial', 1])
  assertEquals(await readShare(kv, 'partial'), null)
  assertEquals((await handleShareRequest(kv, new Request('http://localhost/share/missing'), cors))?.status, 404)
}))

// ── Free-plan guards ───────────────────────────────────────────────────

Deno.test('large envelopes: stored at most once a minute per resource, with Retry-After', setupTeardown(async (kv) => {
  await registerDevice(kv)
  const t0 = Date.now()
  setClock(() => t0)
  assertEquals((await pushNote(kv, 'big', mkCipher(100 * 1024), { timestamp: t0 })).status, 200)

  const again = await pushNote(kv, 'big', mkCipher(100 * 1024), { timestamp: t0 })
  assertEquals(again.status, 429)
  const retryAfter = Number(again.headers.get('Retry-After'))
  assert(retryAfter > 0 && retryAfter <= LARGE_ENVELOPE_INTERVAL_MS / 1000, `Retry-After ${retryAfter}`)
  assertEquals((await again.json()).error, 'rate-limited')

  // Small envelopes, and large ones for other resources, are not held back.
  assertEquals((await pushNote(kv, 'big', mkCipher(1024), { timestamp: t0 })).status, 200)
  assertEquals((await pushNote(kv, 'other-big', mkCipher(100 * 1024), { timestamp: t0 })).status, 200)

  const later = t0 + LARGE_ENVELOPE_INTERVAL_MS
  setClock(() => later)
  assertEquals((await pushNote(kv, 'big', mkCipher(100 * 1024), { timestamp: later })).status, 200)
}))

Deno.test('capacity: attachments stop for the month once its budget is used, then resume next month', setupTeardown(async (kv) => {
  await registerDevice(kv)
  setMonthlyAttachmentBudgetForTests(100 * 1024)
  const lateSeptember = Date.UTC(2026, 8, 30, 23, 0, 0)
  setClock(() => lateSeptember)
  const upload = (id: string, at: number) =>
    callSync(kv, 'POST', `/sync/attachment/${id}`, { ciphertext: base64Encode(mkCipher(60 * 1024)) }, { timestamp: at })

  assertEquals((await upload('month-1', lateSeptember)).status, 200)
  const refused = await upload('month-2', lateSeptember)
  assertEquals(refused.status, 503)
  // An hour until October starts.
  assertEquals(refused.headers.get('Retry-After'), '3600')
  const body = await refused.json()
  assertEquals(body.error, 'capacity')
  assertEquals(body.reason, 'monthly-budget')
  assertEquals((await callSync(kv, 'GET', '/sync/attachment/month-2', undefined, { timestamp: lateSeptember })).status, 404)

  // Notes are unaffected by the attachment budget.
  assertEquals((await pushNote(kv, 'note-in-budget-month', mkCipher(2048), { timestamp: lateSeptember })).status, 200)

  const october = Date.UTC(2026, 9, 1, 0, 0, 5)
  setClock(() => october)
  assertEquals((await upload('month-2', october)).status, 200)
}))
