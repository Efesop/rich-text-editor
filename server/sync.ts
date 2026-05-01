/**
 * Dash Multi-Device Sync — Server Endpoints
 *
 * Phase 2.1 of the multi-device sync feature.
 * E2E encrypted: server stores opaque ciphertext blobs only, indexed by
 * (vaultId, resourceType, resourceId, version).
 *
 * Endpoints (all under /sync/*):
 *   POST   /sync/vault/register
 *   POST   /sync/push
 *   GET    /sync/pull?since=N&limit=K
 *   GET    /sync/note/:noteId/versions
 *   GET    /sync/note/:noteId/version/:version
 *   DELETE /sync/note/:noteId
 *   POST   /sync/attachment/:attachmentId
 *   GET    /sync/attachment/:attachmentId
 *   WS     /sync/ws/:vaultId
 *   POST   /sync/vault/purge
 *   GET    /sync/vault/purge-token
 *   DELETE /sync/vault/devices/:deviceId
 *   GET    /sync/vault/index
 *
 * Auth: HMAC-style session token via headers
 *   X-Vault-Id, X-Device-Id, X-Timestamp, X-Auth
 * Server cannot verify HMAC (no vault key) — uses possession of valid
 * timestamp+device+nonce as the auth proof.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type ResourceType =
  | 'note'
  | 'folder'
  | 'tag'
  | 'attachment'
  | 'meta'
  | 'tombstone'

export type SyncBlob = {
  v: 1
  ciphertext: Uint8Array
  size: number
  uploadedAt: number
  authorDeviceId: string
  parentVersion: number | null
  permanent?: boolean
}

export type VaultIndex = {
  lastVersion: number
  totalBytes: number
}

export type DeviceInfo = {
  addedAt: number
  lastSeenAt: number
  deviceName?: string
}

export type DevicesMap = Record<string, DeviceInfo>

export type PurgeToken = {
  token: string
  issuedAt: number
  used: boolean
}

export type EnvelopeIn = {
  resourceType: ResourceType
  resourceId: string
  ciphertext: string // base64
  parentVersion: number | null
  size?: number
}

// ── Constants ──────────────────────────────────────────────────────────

export const MAX_DEVICES_PER_VAULT = 10
export const MAX_VAULT_BYTES = 500 * 1024 * 1024 // 500 MB
export const MAX_ENVELOPE_BYTES = 50 * 1024
export const MAX_BATCH_BYTES = 200 * 1024
export const MAX_BATCH_COUNT = 50
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_NOTE_VERSIONS = 30
export const MAX_PULL_LIMIT = 100
export const TIMESTAMP_SKEW_MS = 5 * 60 * 1000 // 5 min
export const NONCE_TTL_MS = 5 * 60 * 1000 // 5 min
export const PURGE_TOKEN_TTL_MS = 60 * 1000 // 60s
export const TOMBSTONE_PERMANENT_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const STALE_VAULT_INACTIVE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
export const STALE_VAULT_PURGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days grace

// Rate limit windows (sliding 60s)
const RATE_WINDOW_MS = 60 * 1000
type RateLimitConfig = { perVault: number; perDevice: number }
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'push': { perVault: 60, perDevice: 30 },
  'pull': { perVault: 120, perDevice: 60 },
  'attachment': { perVault: 10, perDevice: 5 },
  'other': { perVault: 30, perDevice: 30 },
}

// CORS headers (matches relay.ts but adds sync auth headers)
export const syncCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Vault-Id, X-Device-Id, X-Timestamp, X-Auth',
}

// ── In-memory state ────────────────────────────────────────────────────

// WebSocket "doorbell" connections: vaultId → Map<deviceId, WebSocket>
const wsConnections = new Map<string, Map<string, WebSocket>>()

// Sliding-window rate limit counters: key → array of timestamps (ms)
// key shape: 'v:{vaultId}:{bucket}' or 'd:{vaultId}:{deviceId}:{bucket}'
const rateLimitCounters = new Map<string, number[]>()

// ── Utilities ──────────────────────────────────────────────────────────

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...syncCorsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

export function errorResponse(
  code: string,
  status: number,
  details: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: code, ...details }, status, extraHeaders)
}

export function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function base64Encode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

// Validate UUID-ish identifiers (vaultId, deviceId, resourceIds)
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/
export function isValidId(s: unknown): s is string {
  return typeof s === 'string' && ID_RE.test(s)
}

// Allow client clock injection for tests
let clockNow: () => number = () => Date.now()
export function setClock(fn: () => number): void {
  clockNow = fn
}
export function resetClock(): void {
  clockNow = () => Date.now()
}
export function now(): number {
  return clockNow()
}

// ── Auth ───────────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true; vaultId: string; deviceId: string }
  | { ok: false; response: Response }

/**
 * Validate sync request auth headers.
 *
 * - Reject if X-Timestamp more than 5 minutes off server clock.
 * - Reject if X-Auth matches stored nonce (replay).
 * - Store new nonce.
 * - Reject 401 if device not registered in vault (skipRegistrationCheck=true
 *   for /sync/vault/register).
 * - Update lastSeenAt on success.
 */
export async function authenticate(
  kv: Deno.Kv,
  req: Request,
  opts: { skipRegistrationCheck?: boolean } = {},
): Promise<AuthResult> {
  const vaultId = req.headers.get('x-vault-id')
  const deviceId = req.headers.get('x-device-id')
  const timestampStr = req.headers.get('x-timestamp')
  const auth = req.headers.get('x-auth')

  if (!vaultId || !deviceId || !timestampStr || !auth) {
    return {
      ok: false,
      response: errorResponse('unauthorized', 401, {
        message: 'Missing required auth headers',
      }),
    }
  }

  if (!isValidId(vaultId) || !isValidId(deviceId)) {
    return {
      ok: false,
      response: errorResponse('invalid-request', 400, {
        message: 'Invalid vaultId or deviceId format',
      }),
    }
  }

  const timestamp = Number(timestampStr)
  if (!Number.isFinite(timestamp)) {
    return {
      ok: false,
      response: errorResponse('invalid-request', 400, {
        message: 'Invalid X-Timestamp',
      }),
    }
  }

  const skew = Math.abs(now() - timestamp)
  if (skew > TIMESTAMP_SKEW_MS) {
    return {
      ok: false,
      response: errorResponse('unauthorized', 401, {
        message: 'Timestamp skew too large',
      }),
    }
  }

  // Replay protection — check stored nonce
  const nonceKey = ['vault', vaultId, 'auth-nonce', deviceId]
  const nonceEntry = await kv.get<string>(nonceKey)
  if (nonceEntry.value === auth) {
    return {
      ok: false,
      response: errorResponse('unauthorized', 401, {
        message: 'Replayed auth token',
      }),
    }
  }

  // Persist new nonce
  await kv.set(nonceKey, auth, { expireIn: NONCE_TTL_MS })

  // Device registration check
  if (!opts.skipRegistrationCheck) {
    const devicesEntry = await kv.get<DevicesMap>(['vault', vaultId, 'devices'])
    const devices = devicesEntry.value
    if (!devices || !devices[deviceId]) {
      return {
        ok: false,
        response: errorResponse('unauthorized', 401, {
          message: 'Device not registered in vault',
        }),
      }
    }
    // Stale-vault eviction (lazy): if vault marked gone, return 410
    if ((devices as DevicesMap & { __gone?: boolean }).__gone) {
      return {
        ok: false,
        response: errorResponse('gone', 410, {
          message: 'Vault evicted due to inactivity',
        }),
      }
    }
    // Update lastSeenAt
    devices[deviceId].lastSeenAt = now()
    await kv.set(['vault', vaultId, 'devices'], devices)
  }

  return { ok: true, vaultId, deviceId }
}

// ── Rate limiting ──────────────────────────────────────────────────────

export type RateBucket = 'push' | 'pull' | 'attachment' | 'other'

/**
 * Check sliding-window rate limit for a given bucket.
 * Returns { ok: true } or { ok: false, retryAfter: seconds }.
 */
export function checkRateLimit(
  vaultId: string,
  deviceId: string,
  bucket: RateBucket,
): { ok: true } | { ok: false; retryAfter: number } {
  const cfg = RATE_LIMITS[bucket]
  const ts = now()
  const cutoff = ts - RATE_WINDOW_MS

  const vaultKey = `v:${vaultId}:${bucket}`
  const deviceKey = `d:${vaultId}:${deviceId}:${bucket}`

  // Prune + count vault bucket
  const vaultArr = (rateLimitCounters.get(vaultKey) ?? []).filter(
    (t) => t > cutoff,
  )
  if (vaultArr.length >= cfg.perVault) {
    rateLimitCounters.set(vaultKey, vaultArr)
    const oldest = vaultArr[0]
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - ts) / 1000))
    return { ok: false, retryAfter }
  }

  // Prune + count device bucket
  const deviceArr = (rateLimitCounters.get(deviceKey) ?? []).filter(
    (t) => t > cutoff,
  )
  if (deviceArr.length >= cfg.perDevice) {
    rateLimitCounters.set(deviceKey, deviceArr)
    const oldest = deviceArr[0]
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - ts) / 1000))
    return { ok: false, retryAfter }
  }

  vaultArr.push(ts)
  deviceArr.push(ts)
  rateLimitCounters.set(vaultKey, vaultArr)
  rateLimitCounters.set(deviceKey, deviceArr)
  return { ok: true }
}

export function rateLimitedResponse(retryAfter: number): Response {
  return errorResponse(
    'rate-limited',
    429,
    { retryAfter },
    { 'Retry-After': String(retryAfter) },
  )
}

// Test helper
export function clearRateLimits(): void {
  rateLimitCounters.clear()
}

// ── WebSocket fan-out ──────────────────────────────────────────────────

export type DoorbellMessage = {
  type: 'new-version'
  resourceType: ResourceType
  resourceId: string
  version: number
}

export function broadcastNewVersion(
  vaultId: string,
  msg: DoorbellMessage,
  excludeDeviceId?: string,
): void {
  const conns = wsConnections.get(vaultId)
  if (!conns) return
  const json = JSON.stringify(msg)
  for (const [deviceId, sock] of conns) {
    if (deviceId === excludeDeviceId) continue
    if (sock.readyState === WebSocket.OPEN) {
      try {
        sock.send(json)
      } catch {
        // Ignore send errors; cleanup handled by close listener
      }
    }
  }
}

// Test helper
export function getWsConnectionCount(vaultId: string): number {
  return wsConnections.get(vaultId)?.size ?? 0
}

// ── Endpoint handlers ──────────────────────────────────────────────────

/** POST /sync/vault/register */
export async function handleVaultRegister(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  // Auth: skip registration check (chicken-and-egg for first-device); still
  // validate timestamp + nonce.
  const auth = await authenticate(kv, req, { skipRegistrationCheck: true })
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  let body: { vaultId?: string; deviceId?: string; deviceName?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid-request', 400, { message: 'Invalid JSON' })
  }

  // Body must echo header values (defense-in-depth)
  if (body.vaultId !== auth.vaultId || body.deviceId !== auth.deviceId) {
    return errorResponse('invalid-request', 400, {
      message: 'Body vaultId/deviceId must match headers',
    })
  }

  if (typeof body.deviceName !== 'undefined' && typeof body.deviceName !== 'string') {
    return errorResponse('invalid-request', 400, {
      message: 'deviceName must be string',
    })
  }
  if (body.deviceName && body.deviceName.length > 100) {
    return errorResponse('invalid-request', 400, {
      message: 'deviceName too long (max 100)',
    })
  }

  const devicesKey = ['vault', auth.vaultId, 'devices']
  const ts = now()

  // Atomic add-device transaction with retry loop
  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await kv.get<DevicesMap>(devicesKey)
    const devices: DevicesMap = entry.value ?? {}

    // Idempotent: re-registering an existing device is allowed
    if (devices[auth.deviceId]) {
      devices[auth.deviceId].lastSeenAt = ts
      if (body.deviceName) devices[auth.deviceId].deviceName = body.deviceName
      const tx = await kv.atomic()
        .check(entry)
        .set(devicesKey, devices)
        .commit()
      if (!tx.ok) continue
      return jsonResponse({ ok: true, registeredAt: devices[auth.deviceId].addedAt })
    }

    if (Object.keys(devices).length >= MAX_DEVICES_PER_VAULT) {
      return errorResponse('forbidden', 403, {
        message: 'Vault has reached max devices',
        limit: MAX_DEVICES_PER_VAULT,
      })
    }

    devices[auth.deviceId] = {
      addedAt: ts,
      lastSeenAt: ts,
      deviceName: body.deviceName,
    }

    const tx = await kv.atomic()
      .check(entry)
      .set(devicesKey, devices)
      .commit()

    if (tx.ok) {
      return jsonResponse({ ok: true, registeredAt: ts })
    }
  }

  return errorResponse('invalid-request', 500, {
    message: 'Could not register device after retries',
  })
}

/** DELETE /sync/vault/devices/:deviceId — revoke device (Phase 2.10b) */
export async function handleRevokeDevice(
  kv: Deno.Kv,
  req: Request,
  pathDeviceId: string,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response
  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  if (typeof pathDeviceId !== 'string' || !pathDeviceId) {
    return errorResponse('invalid-request', 400, { message: 'deviceId required' })
  }

  // Disallow self-revocation via this endpoint — must use disable-sync
  // locally (which clears the device's own state) to avoid lockout where
  // the only paired device removes itself accidentally.
  if (pathDeviceId === auth.deviceId) {
    return errorResponse('invalid-request', 400, {
      message: 'Use disableSync locally to remove this device from its own vault',
    })
  }

  const devicesKey = ['vault', auth.vaultId, 'devices']
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await kv.get<DevicesMap>(devicesKey)
    const devices: DevicesMap = cur.value || {}
    if (!devices[pathDeviceId]) {
      // Idempotent — already gone
      return jsonResponse({ ok: true, alreadyRevoked: true })
    }
    const next: DevicesMap = { ...devices }
    delete next[pathDeviceId]
    const result = await kv.atomic()
      .check(cur)
      .set(devicesKey, next)
      .commit()
    if (result.ok) {
      return jsonResponse({ ok: true, revokedDeviceId: pathDeviceId })
    }
  }
  return errorResponse('invalid-request', 500, {
    message: 'Could not revoke device after retries',
  })
}

/** POST /sync/push */
export async function handlePush(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'push')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  let body: { envelopes?: EnvelopeIn[] }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid-request', 400, { message: 'Invalid JSON' })
  }

  if (!Array.isArray(body.envelopes) || body.envelopes.length === 0) {
    return errorResponse('invalid-request', 400, {
      message: 'envelopes must be non-empty array',
    })
  }

  if (body.envelopes.length > MAX_BATCH_COUNT) {
    return errorResponse('invalid-request', 400, {
      message: `Batch exceeds ${MAX_BATCH_COUNT} envelopes`,
    })
  }

  // Decode + validate each envelope
  type Decoded = {
    e: EnvelopeIn
    bytes: Uint8Array
    size: number
  }
  const decoded: Decoded[] = []
  let totalBatchBytes = 0
  for (const e of body.envelopes) {
    if (
      !e ||
      typeof e !== 'object' ||
      typeof e.resourceType !== 'string' ||
      typeof e.resourceId !== 'string' ||
      typeof e.ciphertext !== 'string'
    ) {
      return errorResponse('invalid-request', 400, {
        message: 'Malformed envelope',
      })
    }
    if (
      e.resourceType !== 'note' &&
      e.resourceType !== 'folder' &&
      e.resourceType !== 'tag' &&
      e.resourceType !== 'meta' &&
      e.resourceType !== 'tombstone'
    ) {
      // Note: attachments are pushed via dedicated endpoint
      return errorResponse('invalid-request', 400, {
        message: `Invalid resourceType: ${e.resourceType}`,
      })
    }
    if (!isValidId(e.resourceId)) {
      return errorResponse('invalid-request', 400, {
        message: 'Invalid resourceId',
      })
    }
    let bytes: Uint8Array
    try {
      bytes = base64Decode(e.ciphertext)
    } catch {
      return errorResponse('invalid-request', 400, {
        message: 'Invalid base64 ciphertext',
      })
    }
    const size = bytes.byteLength
    if (size > MAX_ENVELOPE_BYTES) {
      return errorResponse('payload-too-large', 413, {
        message: `Envelope exceeds ${MAX_ENVELOPE_BYTES} bytes`,
        resourceId: e.resourceId,
      })
    }
    totalBatchBytes += size
    if (totalBatchBytes > MAX_BATCH_BYTES) {
      return errorResponse('payload-too-large', 413, {
        message: `Batch exceeds ${MAX_BATCH_BYTES} bytes total`,
      })
    }
    decoded.push({ e, bytes, size })
  }

  // Atomic batch write — refetch index and lastVersion, plan all writes,
  // commit. If conflicts, retry whole batch.
  const indexKey = ['v', auth.vaultId, 'index']
  for (let attempt = 0; attempt < 5; attempt++) {
    const indexEntry = await kv.get<VaultIndex>(indexKey)
    const idx: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

    // Quota check
    if (idx.totalBytes + totalBatchBytes > MAX_VAULT_BYTES) {
      return errorResponse('vault-full', 413, {
        usage: idx.totalBytes,
        limit: MAX_VAULT_BYTES,
      })
    }

    // Permanent-tombstone check — if any envelope targets a permanent
    // tombstone, mark its result as stale-parent / quarantine. We do not
    // block the whole batch — but we still enforce.
    // We treat permanent tombstones as advisory: the spec says "mark
    // permanent on pull"; for push, we let the push through with new version
    // (latest-wins) but client is expected to quarantine if the tombstone is
    // permanent. Here we still write — eviction happens on the client.

    const newLast = idx.lastVersion + decoded.length
    const txStart = idx.lastVersion
    const ts = now()

    const writes: Array<{ resourceType: ResourceType; resourceId: string; version: number }> = []
    let tx = kv.atomic().check(indexEntry)

    let nextVersion = txStart + 1
    for (const d of decoded) {
      const blob: SyncBlob = {
        v: 1,
        ciphertext: d.bytes,
        size: d.size,
        uploadedAt: ts,
        authorDeviceId: auth.deviceId,
        parentVersion: typeof d.e.parentVersion === 'number' ? d.e.parentVersion : null,
      }
      const key = ['v', auth.vaultId, d.e.resourceType, d.e.resourceId, nextVersion]
      tx = tx.set(key, blob)
      writes.push({
        resourceType: d.e.resourceType,
        resourceId: d.e.resourceId,
        version: nextVersion,
      })
      nextVersion++
    }

    const newIndex: VaultIndex = {
      lastVersion: newLast,
      totalBytes: idx.totalBytes + totalBatchBytes,
    }
    tx = tx.set(indexKey, newIndex)

    const result = await tx.commit()
    if (!result.ok) continue

    // Post-write: version eviction for note resources only (per spec)
    let totalBytesAfterEviction = newIndex.totalBytes
    for (const w of writes) {
      if (w.resourceType !== 'note') continue
      const evicted = await evictOldNoteVersions(kv, auth.vaultId, w.resourceId)
      totalBytesAfterEviction -= evicted
    }
    if (totalBytesAfterEviction !== newIndex.totalBytes) {
      // Update index totalBytes after eviction (best-effort, non-atomic with
      // eviction — eviction loop is its own atomic ops)
      const cur = await kv.get<VaultIndex>(indexKey)
      if (cur.value) {
        await kv.set(indexKey, {
          lastVersion: cur.value.lastVersion,
          totalBytes: Math.max(0, cur.value.totalBytes - (newIndex.totalBytes - totalBytesAfterEviction)),
        })
      }
    }

    // Build results
    const results = writes.map((w) => ({
      resourceType: w.resourceType,
      resourceId: w.resourceId,
      accepted: true,
      version: w.version,
    }))

    // Fan-out via WS (non-blocking)
    for (const w of writes) {
      broadcastNewVersion(auth.vaultId, {
        type: 'new-version',
        resourceType: w.resourceType,
        resourceId: w.resourceId,
        version: w.version,
      }, auth.deviceId)
    }

    const finalIdx = (await kv.get<VaultIndex>(indexKey)).value ?? newIndex

    return jsonResponse({
      results,
      vaultIndex: finalIdx,
    })
  }

  return errorResponse('invalid-request', 500, {
    message: 'Push failed after retries (concurrent writes)',
  })
}

/**
 * Delete oldest note versions if count > MAX_NOTE_VERSIONS. Returns number
 * of bytes evicted.
 */
async function evictOldNoteVersions(
  kv: Deno.Kv,
  vaultId: string,
  noteId: string,
): Promise<number> {
  const prefix = ['v', vaultId, 'note', noteId]
  const versions: Array<{ version: number; size: number; key: Deno.KvKey }> = []
  for await (const entry of kv.list<SyncBlob>({ prefix })) {
    const v = entry.key[entry.key.length - 1] as number
    versions.push({ version: v, size: entry.value.size, key: entry.key })
  }
  if (versions.length <= MAX_NOTE_VERSIONS) return 0

  versions.sort((a, b) => a.version - b.version)
  const toEvict = versions.slice(0, versions.length - MAX_NOTE_VERSIONS)
  let evictedBytes = 0
  for (const v of toEvict) {
    await kv.delete(v.key)
    evictedBytes += v.size
  }
  return evictedBytes
}

/** GET /sync/pull?since=N&limit=K */
export async function handlePull(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'pull')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  const url = new URL(req.url)
  const sinceStr = url.searchParams.get('since') ?? '0'
  const limitStr = url.searchParams.get('limit') ?? String(MAX_PULL_LIMIT)
  const since = Number(sinceStr)
  let limit = Number(limitStr)
  if (!Number.isFinite(since) || since < 0) {
    return errorResponse('invalid-request', 400, { message: 'Invalid since' })
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    return errorResponse('invalid-request', 400, { message: 'Invalid limit' })
  }
  if (limit > MAX_PULL_LIMIT) limit = MAX_PULL_LIMIT

  // Iterate all envelope-bearing resourceTypes for this vault. We collect
  // envelopes whose version > since, sort by version, slice to `limit`.
  // Since Deno KV doesn't give us cross-resourceType sorting on the version
  // suffix, we collect all then sort. Acceptable for v1; can optimize later
  // by also writing to a flat ['v', vaultId, '__log', version] index.
  const types: ResourceType[] = ['note', 'folder', 'tag', 'meta', 'tombstone']
  type PulledEnvelope = {
    resourceType: ResourceType
    resourceId: string
    ciphertext: string
    version: number
    uploadedAt: number
    authorDeviceId: string
    parentVersion: number | null
    permanent?: boolean
  }
  const collected: PulledEnvelope[] = []

  // Hard cap to avoid runaway: at most limit*4 records examined
  const maxScan = limit * 8 + 100

  for (const t of types) {
    let scanned = 0
    for await (const entry of kv.list<SyncBlob>({ prefix: ['v', auth.vaultId, t] })) {
      scanned++
      if (scanned > maxScan && collected.length > limit) break
      const key = entry.key
      const version = key[key.length - 1] as number
      const resourceId = key[key.length - 2] as string
      if (typeof version !== 'number' || version <= since) continue
      const blob = entry.value

      // Tombstone permanent flag (lazy)
      let permanent = blob.permanent
      if (t === 'tombstone' && !permanent && now() - blob.uploadedAt >= TOMBSTONE_PERMANENT_MS) {
        permanent = true
        await kv.set(key, { ...blob, permanent: true }).catch(() => {})
      }

      collected.push({
        resourceType: t,
        resourceId,
        ciphertext: base64Encode(blob.ciphertext),
        version,
        uploadedAt: blob.uploadedAt,
        authorDeviceId: blob.authorDeviceId,
        parentVersion: blob.parentVersion,
        permanent,
      })
    }
  }

  collected.sort((a, b) => a.version - b.version)
  const sliced = collected.slice(0, limit)
  const hasMore = collected.length > limit

  const indexEntry = await kv.get<VaultIndex>(['v', auth.vaultId, 'index'])
  const vaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

  return jsonResponse({
    envelopes: sliced,
    hasMore,
    vaultIndex,
  })
}

/** GET /sync/note/:noteId/versions */
export async function handleNoteVersions(
  kv: Deno.Kv,
  req: Request,
  noteId: string,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  if (!isValidId(noteId)) {
    return errorResponse('invalid-request', 400, { message: 'Invalid noteId' })
  }

  const versions: Array<{
    version: number
    uploadedAt: number
    authorDeviceId: string
    size: number
  }> = []

  for await (
    const entry of kv.list<SyncBlob>({ prefix: ['v', auth.vaultId, 'note', noteId] })
  ) {
    const version = entry.key[entry.key.length - 1] as number
    versions.push({
      version,
      uploadedAt: entry.value.uploadedAt,
      authorDeviceId: entry.value.authorDeviceId,
      size: entry.value.size,
    })
  }
  versions.sort((a, b) => a.version - b.version)

  return jsonResponse({ versions })
}

/** GET /sync/note/:noteId/version/:version */
export async function handleNoteVersionGet(
  kv: Deno.Kv,
  req: Request,
  noteId: string,
  versionStr: string,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  if (!isValidId(noteId)) {
    return errorResponse('invalid-request', 400, { message: 'Invalid noteId' })
  }
  const version = Number(versionStr)
  if (!Number.isFinite(version) || version <= 0) {
    return errorResponse('invalid-request', 400, { message: 'Invalid version' })
  }

  const entry = await kv.get<SyncBlob>(['v', auth.vaultId, 'note', noteId, version])
  if (!entry.value) {
    return errorResponse('not-found', 404, { message: 'Version not found' })
  }
  return jsonResponse({
    ciphertext: base64Encode(entry.value.ciphertext),
    uploadedAt: entry.value.uploadedAt,
    authorDeviceId: entry.value.authorDeviceId,
    parentVersion: entry.value.parentVersion,
  })
}

/** DELETE /sync/note/:noteId — submit tombstone */
export async function handleNoteDelete(
  kv: Deno.Kv,
  req: Request,
  noteId: string,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'push')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  if (!isValidId(noteId)) {
    return errorResponse('invalid-request', 400, { message: 'Invalid noteId' })
  }

  let body: { tombstoneCiphertext?: string; parentVersion?: number | null }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid-request', 400, { message: 'Invalid JSON' })
  }

  if (typeof body.tombstoneCiphertext !== 'string') {
    return errorResponse('invalid-request', 400, {
      message: 'tombstoneCiphertext required',
    })
  }
  let bytes: Uint8Array
  try {
    bytes = base64Decode(body.tombstoneCiphertext)
  } catch {
    return errorResponse('invalid-request', 400, {
      message: 'Invalid base64 tombstone',
    })
  }
  if (bytes.byteLength > MAX_ENVELOPE_BYTES) {
    return errorResponse('payload-too-large', 413, {
      message: `Tombstone exceeds ${MAX_ENVELOPE_BYTES} bytes`,
    })
  }

  const indexKey = ['v', auth.vaultId, 'index']
  for (let attempt = 0; attempt < 5; attempt++) {
    const indexEntry = await kv.get<VaultIndex>(indexKey)
    const idx: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

    if (idx.totalBytes + bytes.byteLength > MAX_VAULT_BYTES) {
      return errorResponse('vault-full', 413, {
        usage: idx.totalBytes,
        limit: MAX_VAULT_BYTES,
      })
    }

    const newVersion = idx.lastVersion + 1
    const ts = now()
    const blob: SyncBlob = {
      v: 1,
      ciphertext: bytes,
      size: bytes.byteLength,
      uploadedAt: ts,
      authorDeviceId: auth.deviceId,
      parentVersion: typeof body.parentVersion === 'number' ? body.parentVersion : null,
    }

    const tx = await kv.atomic()
      .check(indexEntry)
      .set(['v', auth.vaultId, 'tombstone', noteId, newVersion], blob)
      .set(indexKey, {
        lastVersion: newVersion,
        totalBytes: idx.totalBytes + bytes.byteLength,
      })
      .commit()

    if (!tx.ok) continue

    broadcastNewVersion(auth.vaultId, {
      type: 'new-version',
      resourceType: 'tombstone',
      resourceId: noteId,
      version: newVersion,
    }, auth.deviceId)

    return jsonResponse({ ok: true, version: newVersion })
  }

  return errorResponse('invalid-request', 500, {
    message: 'Tombstone push failed after retries',
  })
}

/** POST /sync/attachment/:attachmentId */
export async function handleAttachmentUpload(
  kv: Deno.Kv,
  req: Request,
  attachmentId: string,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'attachment')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  if (!isValidId(attachmentId)) {
    return errorResponse('invalid-request', 400, {
      message: 'Invalid attachmentId',
    })
  }

  let body: { ciphertext?: string; originalSize?: number; mimeTypeHint?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid-request', 400, { message: 'Invalid JSON' })
  }

  if (typeof body.ciphertext !== 'string') {
    return errorResponse('invalid-request', 400, {
      message: 'ciphertext required',
    })
  }
  let bytes: Uint8Array
  try {
    bytes = base64Decode(body.ciphertext)
  } catch {
    return errorResponse('invalid-request', 400, {
      message: 'Invalid base64 ciphertext',
    })
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return errorResponse('payload-too-large', 413, {
      message: `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
    })
  }

  // Dedup: if attachmentId already exists, return existing without rewriting.
  const key = ['v', auth.vaultId, 'attachment', attachmentId, 1]
  const existing = await kv.get<SyncBlob>(key)
  if (existing.value) {
    return jsonResponse({ ok: true, dedupKey: attachmentId, existing: true })
  }

  const indexKey = ['v', auth.vaultId, 'index']
  for (let attempt = 0; attempt < 5; attempt++) {
    const indexEntry = await kv.get<VaultIndex>(indexKey)
    const idx: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

    if (idx.totalBytes + bytes.byteLength > MAX_VAULT_BYTES) {
      return errorResponse('vault-full', 413, {
        usage: idx.totalBytes,
        limit: MAX_VAULT_BYTES,
      })
    }

    const newVersion = idx.lastVersion + 1
    const blob: SyncBlob = {
      v: 1,
      ciphertext: bytes,
      size: bytes.byteLength,
      uploadedAt: now(),
      authorDeviceId: auth.deviceId,
      parentVersion: null,
    }

    const tx = await kv.atomic()
      .check(indexEntry)
      .check(existing) // Re-check existence to avoid race
      .set(key, blob)
      .set(indexKey, {
        lastVersion: newVersion,
        totalBytes: idx.totalBytes + bytes.byteLength,
      })
      .commit()

    if (!tx.ok) continue

    broadcastNewVersion(auth.vaultId, {
      type: 'new-version',
      resourceType: 'attachment',
      resourceId: attachmentId,
      version: newVersion,
    }, auth.deviceId)

    return jsonResponse({ ok: true, dedupKey: attachmentId, existing: false })
  }

  return errorResponse('invalid-request', 500, {
    message: 'Attachment upload failed after retries',
  })
}

/** GET /sync/attachment/:attachmentId */
export async function handleAttachmentGet(
  kv: Deno.Kv,
  req: Request,
  attachmentId: string,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'attachment')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  if (!isValidId(attachmentId)) {
    return errorResponse('invalid-request', 400, {
      message: 'Invalid attachmentId',
    })
  }
  const entry = await kv.get<SyncBlob>([
    'v', auth.vaultId, 'attachment', attachmentId, 1,
  ])
  if (!entry.value) {
    return errorResponse('not-found', 404, { message: 'Attachment not found' })
  }
  return jsonResponse({
    ciphertext: base64Encode(entry.value.ciphertext),
    uploadedAt: entry.value.uploadedAt,
    authorDeviceId: entry.value.authorDeviceId,
  })
}

/** WS /sync/ws/:vaultId */
export async function handleSyncWebSocket(
  kv: Deno.Kv,
  req: Request,
  vaultId: string,
): Promise<Response> {
  // Auth: WS upgrade carries headers, including X-Vault-Id etc. We require
  // the same auth checks as HTTP.
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return errorResponse('invalid-request', 400, { message: 'Expected WebSocket upgrade' })
  }
  if (!isValidId(vaultId)) {
    return errorResponse('invalid-request', 400, { message: 'Invalid vaultId' })
  }
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response
  if (auth.vaultId !== vaultId) {
    return errorResponse('forbidden', 403, {
      message: 'X-Vault-Id does not match path',
    })
  }

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  let socket: WebSocket
  let response: Response
  try {
    const upgrade = Deno.upgradeWebSocket(req)
    socket = upgrade.socket
    response = upgrade.response
  } catch {
    return errorResponse('invalid-request', 400, {
      message: 'Invalid WebSocket handshake',
    })
  }

  socket.addEventListener('open', () => {
    let conns = wsConnections.get(vaultId)
    if (!conns) {
      conns = new Map()
      wsConnections.set(vaultId, conns)
    }
    // Enforce: 1 active connection per device. Close prior if any.
    const prior = conns.get(auth.deviceId)
    if (prior && prior !== socket) {
      try {
        prior.close(1000, 'Replaced by new connection')
      } catch { /* ignore */ }
    }
    conns.set(auth.deviceId, socket)
  })

  const cleanup = () => {
    const conns = wsConnections.get(vaultId)
    if (!conns) return
    if (conns.get(auth.deviceId) === socket) {
      conns.delete(auth.deviceId)
    }
    if (conns.size === 0) wsConnections.delete(vaultId)
  }

  socket.addEventListener('close', cleanup)
  socket.addEventListener('error', cleanup)

  return response
}

/** GET /sync/vault/purge-token */
export async function handlePurgeTokenIssue(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  const token = crypto.randomUUID()
  const tokenObj: PurgeToken = { token, issuedAt: now(), used: false }
  await kv.set(['vault', auth.vaultId, 'purge-token'], tokenObj, {
    expireIn: PURGE_TOKEN_TTL_MS,
  })
  return jsonResponse({ token, expiresIn: Math.floor(PURGE_TOKEN_TTL_MS / 1000) })
}

/** POST /sync/vault/purge */
export async function handleVaultPurge(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  let body: { confirmToken?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid-request', 400, { message: 'Invalid JSON' })
  }

  if (typeof body.confirmToken !== 'string') {
    return errorResponse('invalid-request', 400, {
      message: 'confirmToken required',
    })
  }

  const tokenKey = ['vault', auth.vaultId, 'purge-token']
  const tokenEntry = await kv.get<PurgeToken>(tokenKey)
  if (!tokenEntry.value) {
    return errorResponse('forbidden', 403, {
      message: 'No purge token issued or expired',
    })
  }
  if (tokenEntry.value.token !== body.confirmToken) {
    return errorResponse('forbidden', 403, { message: 'Token mismatch' })
  }
  if (tokenEntry.value.used) {
    return errorResponse('forbidden', 403, { message: 'Token already used' })
  }
  if (now() - tokenEntry.value.issuedAt > PURGE_TOKEN_TTL_MS) {
    return errorResponse('forbidden', 403, { message: 'Token expired' })
  }

  // Mark token used (atomic)
  const markTx = await kv.atomic()
    .check(tokenEntry)
    .set(tokenKey, { ...tokenEntry.value, used: true }, { expireIn: PURGE_TOKEN_TTL_MS })
    .commit()
  if (!markTx.ok) {
    return errorResponse('forbidden', 403, { message: 'Token state changed' })
  }

  // Purge: iterate all ['v', vaultId, ...] and ['vault', vaultId, ...] and delete.
  let purgedBytes = 0
  const toDelete: Deno.KvKey[] = []
  for await (const entry of kv.list({ prefix: ['v', auth.vaultId] })) {
    const v = entry.value as { size?: number } | null
    if (v && typeof v.size === 'number') purgedBytes += v.size
    toDelete.push(entry.key)
  }
  for await (const entry of kv.list({ prefix: ['vault', auth.vaultId] })) {
    toDelete.push(entry.key)
  }
  // Batch deletes
  for (let i = 0; i < toDelete.length; i += 100) {
    let tx = kv.atomic()
    for (const k of toDelete.slice(i, i + 100)) tx = tx.delete(k)
    await tx.commit()
  }

  // Close any active WS for this vault
  const conns = wsConnections.get(auth.vaultId)
  if (conns) {
    for (const sock of conns.values()) {
      try { sock.close(1000, 'Vault purged') } catch { /* ignore */ }
    }
    wsConnections.delete(auth.vaultId)
  }

  return jsonResponse({ ok: true, purgedBytes })
}

/** GET /sync/vault/index */
export async function handleVaultIndex(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  const indexEntry = await kv.get<VaultIndex>(['v', auth.vaultId, 'index'])
  const idx = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

  const devicesEntry = await kv.get<DevicesMap>(['vault', auth.vaultId, 'devices'])
  const devices = devicesEntry.value ?? {}
  const pairedDevices = Object.entries(devices).map(([deviceId, info]) => ({
    deviceId,
    addedAt: info.addedAt,
    lastSeenAt: info.lastSeenAt,
    deviceName: info.deviceName,
  }))

  return jsonResponse({
    lastVersion: idx.lastVersion,
    totalBytes: idx.totalBytes,
    deviceCount: pairedDevices.length,
    pairedDevices,
  })
}

// ── Top-level router ──────────────────────────────────────────────────

/**
 * Try to match + handle a /sync/* request. Returns Response if matched,
 * null if not (so caller can fall through to other routes).
 */
export async function routeSyncRequest(
  kv: Deno.Kv,
  req: Request,
): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname

  if (!path.startsWith('/sync/')) return null

  // CORS preflight (sync-specific because we want sync auth headers allowed)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: syncCorsHeaders })
  }

  // Vault management
  if (path === '/sync/vault/register' && req.method === 'POST') {
    return handleVaultRegister(kv, req)
  }
  if (path === '/sync/vault/index' && req.method === 'GET') {
    return handleVaultIndex(kv, req)
  }
  if (path === '/sync/vault/purge-token' && req.method === 'GET') {
    return handlePurgeTokenIssue(kv, req)
  }
  if (path === '/sync/vault/purge' && req.method === 'POST') {
    return handleVaultPurge(kv, req)
  }

  // Device revocation (phase 2.10b) — DELETE /sync/vault/devices/:deviceId
  const revokeMatch = path.match(/^\/sync\/vault\/devices\/([a-zA-Z0-9_-]+)$/)
  if (revokeMatch && req.method === 'DELETE') {
    return handleRevokeDevice(kv, req, revokeMatch[1])
  }

  // Push / pull
  if (path === '/sync/push' && req.method === 'POST') {
    return handlePush(kv, req)
  }
  if (path === '/sync/pull' && req.method === 'GET') {
    return handlePull(kv, req)
  }

  // Note version endpoints
  const noteVersionsMatch = path.match(/^\/sync\/note\/([a-zA-Z0-9_-]+)\/versions$/)
  if (noteVersionsMatch && req.method === 'GET') {
    return handleNoteVersions(kv, req, noteVersionsMatch[1])
  }
  const noteVersionGetMatch = path.match(
    /^\/sync\/note\/([a-zA-Z0-9_-]+)\/version\/(\d+)$/,
  )
  if (noteVersionGetMatch && req.method === 'GET') {
    return handleNoteVersionGet(kv, req, noteVersionGetMatch[1], noteVersionGetMatch[2])
  }
  const noteDeleteMatch = path.match(/^\/sync\/note\/([a-zA-Z0-9_-]+)$/)
  if (noteDeleteMatch && req.method === 'DELETE') {
    return handleNoteDelete(kv, req, noteDeleteMatch[1])
  }

  // Attachment endpoints
  const attachmentMatch = path.match(/^\/sync\/attachment\/([a-zA-Z0-9_-]+)$/)
  if (attachmentMatch) {
    if (req.method === 'POST') {
      return handleAttachmentUpload(kv, req, attachmentMatch[1])
    }
    if (req.method === 'GET') {
      return handleAttachmentGet(kv, req, attachmentMatch[1])
    }
  }

  // WebSocket doorbell
  const wsMatch = path.match(/^\/sync\/ws\/([a-zA-Z0-9_-]+)$/)
  if (wsMatch) {
    return handleSyncWebSocket(kv, req, wsMatch[1])
  }

  // Unmatched /sync/* path → 404 (rather than fall through to legacy routes)
  return errorResponse('not-found', 404, { message: 'Unknown sync endpoint' })
}
