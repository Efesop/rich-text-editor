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
 *   POST   /sync/attachments/exists
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

import { hasEntitlement, hasVaultEntitlement, linkEntitlementToVault, linkIosEntitlementToEmail } from './entitlements.ts'
import { verifyAuthRequest } from './auth.ts'

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
  // Set when the ciphertext is stored in chunk entries; `ciphertext` is then
  // empty and `size` is the full length. See writeChunks.
  chunks?: ChunkRef
}

export type ChunkRef = { uploadId: string; count: number }

export type VaultIndex = {
  lastVersion: number
  totalBytes: number
  // Unix ms of last push/pull from this vault. Cron uses it to identify
  // inactive vaults for auto-purge after INACTIVE_VAULT_TTL_MS.
  lastActivityAt?: number
  // Hashed IP of the device that created this vault. Stored at register
  // time so we can decrement that IP's lifetime quota counter when the
  // vault gets purged (auto on last-device-leave, or manual purge).
  // Without this, IP quota is cumulative and never recovers — users hit
  // the lifetime limit (10 prod) after a few sync resets and get stuck.
  creatorIpHash?: string
}

export type DeviceInfo = {
  addedAt: number
  lastSeenAt: number
  deviceName?: string
  // App version the device last registered with, e.g. "1.6.8".
  appVersion?: string
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

// Per-IP register hardening (free-tier abuse prevention).
// IPs are SHA-256 hashed with IP_HASH_SALT before storage so we don't
// keep raw addresses in KV.
// Anti-spam: how many fresh vaults a single IP can register in a window.
// Tight production defaults; relaxed locally so dev iteration doesn't lock
// us out of our own relay during pair-flow testing.
const IS_LOCAL_RELAY = !Deno.env.get('DENO_DEPLOYMENT_ID')
export const REGISTER_PER_IP_PER_HOUR = IS_LOCAL_RELAY ? 200 : 20
// Lifetime cap (production). Counter is now refunded on auto-purge + manual
// purge so it tracks ACTIVE vaults per IP, not cumulative registers ever.
// 50 gives a generous ceiling for normal users while still bounding abuse.
export const REGISTER_PER_IP_LIFETIME = IS_LOCAL_RELAY ? 10000 : 50
// Soft KV ceiling. Above it the relay refuses new vaults and attachment
// uploads, so existing vaults keep syncing notes. Free Deno Deploy plan =
// 1 GiB; 80% leaves headroom.
export const KV_SOFT_CEILING_BYTES = 800 * 1024 * 1024
// Inactive vault TTL — auto-purged by cron after 90 days no activity.
export const INACTIVE_VAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000
// Deno KV caps a value at 64 KiB and an atomic operation at 800 KiB of
// mutations. Ciphertext up to INLINE_BLOB_BYTES lives inside its SyncBlob,
// as it always has; anything larger is split into CHUNK_BYTES entries that
// the SyncBlob points at (see writeChunks).
export const MAX_ENVELOPE_BYTES = 2 * 1024 * 1024
export const MAX_BATCH_BYTES = 4 * 1024 * 1024
export const MAX_BATCH_COUNT = 50
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_NOTE_VERSIONS = 30
export const MAX_PULL_LIMIT = 100
// A pull response stops adding envelopes before its ciphertext passes this
// (always returning at least one) and reports hasMore instead.
export const MAX_PULL_BYTES = 4 * 1024 * 1024
export const INLINE_BLOB_BYTES = 60 * 1024
export const CHUNK_BYTES = 60 * 1024
// Inline ciphertext allowed in one push commit — well under KV's 800 KiB.
const ATOMIC_INLINE_BUDGET = 512 * 1024
// Chunks per atomic write: 10 × 60 KiB stays under the same limit.
const CHUNK_WRITE_GROUP = 10
// Deno KV's getMany reads at most 10 keys at a time.
const GET_MANY_LIMIT = 10
// Chunks from an upload that never committed are swept after this long.
export const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000
export const MAX_EXISTS_IDS = 200
// Pulls refresh a vault's lastActivityAt at most this often.
const ACTIVITY_REFRESH_MS = 24 * 60 * 60 * 1000
// App versions a device may report, e.g. "1.6.8" or "1.7.0-beta.2".
const APP_VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9A-Za-z.-]{1,32})?$/
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
  // /sync/vault/index gets polled aggressively while the pair modal AND
  // the sync settings panel are both open (host showing pair code +
  // checking for guests joining). 60/min per device leaves headroom
  // without being unbounded.
  'other': { perVault: 120, perDevice: 60 },
}

// CORS headers (matches relay.ts but adds sync auth headers).
// MUST include every header lib/syncAuth.js sends: the iOS app adds
// X-RC-AppUserId (RC entitlement lookup) and optionally Authorization
// (magic-link bearer) — a header missing here fails the WebView's CORS
// preflight and surfaces as "Load failed" on device.
export const syncCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Vault-Id, X-Device-Id, X-Timestamp, X-Auth, X-RC-AppUserId',
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

// Runtimes with the TC39 base64 methods decode and encode natively, which is
// far cheaper for multi-megabyte attachments. The fallbacks give identical
// output.
export function base64Decode(b64: string): Uint8Array {
  const native = Uint8Array as unknown as { fromBase64?: (b64: string) => Uint8Array }
  if (typeof native.fromBase64 === 'function') return native.fromBase64(b64)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function base64Encode(bytes: Uint8Array): string {
  const native = bytes as unknown as { toBase64?: () => string }
  if (typeof native.toBase64 === 'function') return native.toBase64()
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[])
  }
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

// ── Blob storage ───────────────────────────────────────────────────────
//
// Ciphertext larger than INLINE_BLOB_BYTES is stored as chunk entries under
// ['v', vaultId, 'chunk', uploadId, i]. Chunks are written first; the
// SyncBlob naming them is committed last, in the same atomic operation as
// the vault index, so a half-finished upload is never visible. A pending
// marker written before the chunks lets sweepAbandonedUploads remove them if
// the request dies, and the commit deletes it.

type PendingUpload = { vaultId: string; count: number; createdAt: number }

function chunkKey(vaultId: string, uploadId: string, index: number): Deno.KvKey {
  return ['v', vaultId, 'chunk', uploadId, index]
}

function pendingUploadKey(uploadId: string): Deno.KvKey {
  return ['chunk-pending', uploadId]
}

async function writeChunks(kv: Deno.Kv, vaultId: string, bytes: Uint8Array): Promise<ChunkRef> {
  const uploadId = crypto.randomUUID()
  const count = Math.ceil(bytes.byteLength / CHUNK_BYTES)
  const pending: PendingUpload = { vaultId, count, createdAt: now() }
  await kv.set(pendingUploadKey(uploadId), pending)
  for (let start = 0; start < count; start += CHUNK_WRITE_GROUP) {
    let tx = kv.atomic()
    for (let i = start; i < Math.min(count, start + CHUNK_WRITE_GROUP); i++) {
      tx = tx.set(chunkKey(vaultId, uploadId, i), bytes.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES))
    }
    await tx.commit()
  }
  return { uploadId, count }
}

/** Delete an upload's chunks and its pending marker. */
async function deleteChunks(kv: Deno.Kv, vaultId: string, ref: ChunkRef): Promise<void> {
  const keys = Array.from({ length: ref.count }, (_, i) => chunkKey(vaultId, ref.uploadId, i))
  keys.push(pendingUploadKey(ref.uploadId))
  for (let i = 0; i < keys.length; i += 500) {
    let tx = kv.atomic()
    for (const key of keys.slice(i, i + 500)) tx = tx.delete(key)
    await tx.commit()
  }
}

/**
 * Throw away uploads a request wrote but never committed. Best-effort: if
 * this fails as well, sweepAbandonedUploads removes them later.
 */
async function discardUploads(kv: Deno.Kv, vaultId: string, refs: Array<ChunkRef | null>): Promise<void> {
  for (const ref of refs) {
    if (!ref) continue
    try {
      await deleteChunks(kv, vaultId, ref)
    } catch (err) {
      console.error('[sync] discarding an uncommitted upload failed', err)
    }
  }
}

/** Chunk keys a stored blob points at — none for an inline blob. */
function chunkKeysOf(vaultId: string, blob: SyncBlob): Deno.KvKey[] {
  if (!blob.chunks) return []
  const { uploadId, count } = blob.chunks
  return Array.from({ length: count }, (_, i) => chunkKey(vaultId, uploadId, i))
}

/** A blob's ciphertext, reassembled when chunked. Null if a chunk is missing. */
async function readBlobCiphertext(kv: Deno.Kv, vaultId: string, blob: SyncBlob): Promise<Uint8Array | null> {
  if (!blob.chunks) return blob.ciphertext
  const keys = chunkKeysOf(vaultId, blob)
  const out = new Uint8Array(blob.size)
  let offset = 0
  for (let i = 0; i < keys.length; i += GET_MANY_LIMIT) {
    for (const entry of await kv.getMany<Uint8Array[]>(keys.slice(i, i + GET_MANY_LIMIT))) {
      const part = entry.value
      if (!(part instanceof Uint8Array) || offset + part.byteLength > blob.size) return null
      out.set(part, offset)
      offset += part.byteLength
    }
  }
  return offset === blob.size ? out : null
}

/** Stored ciphertext bytes behind a KV value, for purge accounting. */
function storedSize(value: unknown): number {
  const size = (value as { size?: unknown } | null)?.size
  return typeof size === 'number' ? size : 0
}

/**
 * Remove chunks from uploads that never committed. Runs from the daily cron;
 * the age gate keeps it clear of uploads still in flight.
 */
export async function sweepAbandonedUploads(kv: Deno.Kv): Promise<number> {
  const cutoff = now() - ABANDONED_UPLOAD_MS
  let swept = 0
  for await (const entry of kv.list<PendingUpload>({ prefix: ['chunk-pending'] })) {
    const pending = entry.value
    if (!pending || pending.createdAt > cutoff) continue
    await deleteChunks(kv, pending.vaultId, { uploadId: entry.key[1] as string, count: pending.count })
    swept++
  }
  return swept
}

// ── Relay-wide usage ───────────────────────────────────────────────────
//
// Bytes stored across every vault = baseline + added − freed. The added and
// freed counters only grow, through atomic sum(), so vaults never contend on
// them. The baseline is taken once from the vault indexes, the first time
// usage is needed; bytes pushed at that moment may be counted twice, which
// errs toward refusing early.

const USAGE_BASELINE_KEY: Deno.KvKey = ['kv-meta', 'usage-baseline']
const USAGE_ADDED_KEY: Deno.KvKey = ['kv-meta', 'usage-added']
const USAGE_FREED_KEY: Deno.KvKey = ['kv-meta', 'usage-freed']

let kvCeilingBytes = KV_SOFT_CEILING_BYTES
/** Tests only: lower the relay's capacity ceiling. */
export function setKvCeilingForTests(bytes: number): void {
  kvCeilingBytes = bytes
}
export function resetKvCeiling(): void {
  kvCeilingBytes = KV_SOFT_CEILING_BYTES
}

function counterValue(entry: Deno.KvEntryMaybe<Deno.KvU64>): bigint {
  return entry.value instanceof Deno.KvU64 ? entry.value.value : 0n
}

export async function relayUsageBytes(kv: Deno.Kv): Promise<number> {
  const [baselineEntry, added, freed] = await kv.getMany<[Deno.KvU64, Deno.KvU64, Deno.KvU64]>([
    USAGE_BASELINE_KEY,
    USAGE_ADDED_KEY,
    USAGE_FREED_KEY,
  ])
  let baseline = counterValue(baselineEntry)
  if (baselineEntry.value === null) {
    let scanned = 0
    for await (const entry of kv.list<VaultIndex>({ prefix: ['v'] })) {
      if (entry.key.length !== 3 || entry.key[2] !== 'index') continue
      if (typeof entry.value?.totalBytes === 'number') scanned += entry.value.totalBytes
    }
    // Another request may have seeded it meanwhile; the first one wins.
    await kv.atomic()
      .check(baselineEntry)
      .set(USAGE_BASELINE_KEY, new Deno.KvU64(BigInt(scanned)))
      .commit()
    baseline = counterValue(await kv.get<Deno.KvU64>(USAGE_BASELINE_KEY))
  }
  const total = baseline + counterValue(added) - counterValue(freed)
  return total > 0n ? Number(total) : 0
}

async function recordFreedBytes(kv: Deno.Kv, bytes: number): Promise<void> {
  if (bytes > 0) await kv.atomic().sum(USAGE_FREED_KEY, BigInt(bytes)).commit()
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
  // Prefer headers for auth proof, but fall back to URL query params for
  // WebSocket clients — browser WS API can't set arbitrary headers, so
  // the WS handshake passes auth via ?v=...&d=...&t=...&a=... .
  const url = new URL(req.url)
  const vaultId = req.headers.get('x-vault-id') ?? url.searchParams.get('v')
  const deviceId = req.headers.get('x-device-id') ?? url.searchParams.get('d')
  const timestampStr = req.headers.get('x-timestamp') ?? url.searchParams.get('t')
  const auth = req.headers.get('x-auth') ?? url.searchParams.get('a')

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

/**
 * Purge vaults inactive for >= INACTIVE_VAULT_TTL_MS. Called from a Deno
 * cron job in relay.ts. Iterates ['v'] prefix, finds index entries with
 * `lastActivityAt` older than the cutoff, deletes the whole vault subtree.
 *
 * Returns count of vaults purged. Logged but not fatal on errors —
 * cron retries next tick.
 */
export async function purgeInactiveVaults(kv: Deno.Kv): Promise<number> {
  const cutoff = Date.now() - INACTIVE_VAULT_TTL_MS
  const vaultsToPurge: string[] = []

  // Identify candidates first
  const idxIter = kv.list<VaultIndex>({ prefix: ['v'] })
  for await (const entry of idxIter) {
    if (entry.key.length !== 3 || entry.key[2] !== 'index') continue
    const lastAt = entry.value?.lastActivityAt
    // Treat missing lastActivityAt as inactive only if vault has been
    // around for long enough (otherwise we'd nuke fresh vaults that
    // haven't pushed yet). Skip — wait for first push to record activity.
    if (typeof lastAt !== 'number') continue
    if (lastAt < cutoff) {
      const vaultId = entry.key[1] as string
      vaultsToPurge.push(vaultId)
    }
  }

  // Delete each vault subtree. Use existing purge logic if available, or
  // walk the prefix and delete in batches.
  for (const vaultId of vaultsToPurge) {
    const subIter = kv.list({ prefix: ['v', vaultId] })
    let batch = kv.atomic()
    let count = 0
    let freedBytes = 0
    for await (const e of subIter) {
      batch = batch.delete(e.key)
      freedBytes += storedSize(e.value)
      count++
      if (count % 100 === 0) {
        await batch.commit()
        batch = kv.atomic()
      }
    }
    if (count % 100 !== 0) await batch.commit()
    await recordFreedBytes(kv, freedBytes)
    // Also clean up the device map at ['vault', vaultId, 'devices']
    await kv.delete(['vault', vaultId, 'devices'])
    console.log(`[purgeInactiveVaults] purged vault ${vaultId} (${count} entries)`)
  }

  return vaultsToPurge.length
}

// ── Per-IP register hardening ─────────────────────────────────────────

const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? 'dash-relay-default-salt-rotate-me'

/**
 * Extract client IP from standard proxy headers. Deno Deploy sets
 * x-forwarded-for; fall back to a no-op string so dev/local doesn't crash.
 */
function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  return req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    'unknown'
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + ':' + IP_HASH_SALT)
  const hash = await crypto.subtle.digest('SHA-256', data)
  // First 16 bytes hex = 32 chars — plenty for collision avoidance, half
  // the storage of full SHA-256.
  return Array.from(new Uint8Array(hash).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Check + record per-IP register quota. Returns { ok, reason } where
 * reason is one of 'rate' | 'lifetime' | 'kv-full'. KV is the source of
 * truth (so quota survives instance restart).
 */
async function checkRegisterIpQuota(
  kv: Deno.Kv,
  ipHash: string,
): Promise<{ ok: true } | { ok: false; reason: 'rate' | 'lifetime' }> {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const hourKey = ['ip-rate', ipHash, hourBucket]
  const lifetimeKey = ['ip-lifetime', ipHash]

  const [hourEntry, lifeEntry] = await kv.getMany<[number, number]>([
    hourKey,
    lifetimeKey,
  ])
  const hourCount = (hourEntry.value ?? 0)
  const lifeCount = (lifeEntry.value ?? 0)

  if (hourCount >= REGISTER_PER_IP_PER_HOUR) {
    return { ok: false, reason: 'rate' }
  }
  if (lifeCount >= REGISTER_PER_IP_LIFETIME) {
    return { ok: false, reason: 'lifetime' }
  }

  // Bump counters (best-effort; not atomic with vault create — small
  // overcount is fine, undercount is the tolerated risk).
  await kv.set(hourKey, hourCount + 1, { expireIn: 60 * 60 * 1000 })
  await kv.set(lifetimeKey, lifeCount + 1)
  return { ok: true }
}

/**
 * True when relay-wide stored bytes, plus what a request is about to add,
 * reach the soft ceiling. Callers refuse new vaults and attachment uploads.
 */
async function isKvFull(kv: Deno.Kv, incomingBytes = 0): Promise<boolean> {
  return (await relayUsageBytes(kv)) + incomingBytes >= kvCeilingBytes
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

  // Per-IP register hardening — prevents a script from filling KV with
  // garbage vaults. Only check on FIRST device of a vault (creating the
  // vault); existing-vault re-registers (paired devices) bypass.
  const devicesProbe = await kv.get<DevicesMap>(['vault', auth.vaultId, 'devices'])
  const isNewVault = !devicesProbe.value || Object.keys(devicesProbe.value).length === 0
  let creatorIpHash: string | null = null
  if (isNewVault) {
    creatorIpHash = await hashIp(getClientIp(req))
    const quota = await checkRegisterIpQuota(kv, creatorIpHash)
    if (!quota.ok) {
      return errorResponse('forbidden', 429, {
        message: quota.reason === 'rate'
          ? 'Too many vaults created from this network recently — try again later'
          : 'Maximum vaults reached for this network',
        reason: quota.reason,
      })
    }
    if (await isKvFull(kv)) {
      return errorResponse('forbidden', 503, {
        message: 'Sync server at capacity — try again later or self-host',
        reason: 'capacity',
      })
    }
    // Stamp the creator IP onto the vault index so we can refund the
    // lifetime quota when the vault gets purged. Best-effort: any race
    // here just means we miss a refund (worst case = current behavior).
    const indexKey = ['v', auth.vaultId, 'index']
    const indexEntry = await kv.get<VaultIndex>(indexKey)
    const existingIndex: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }
    if (!existingIndex.creatorIpHash) {
      await kv.set(indexKey, { ...existingIndex, creatorIpHash })
    }
  }

  let body: { vaultId?: string; deviceId?: string; deviceName?: string; appVersion?: string; entitlementEmail?: string; rcAppUserId?: string }
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

  // (Entitlement enforcement is now centralized in `requireSyncEntitlement`
  // at the route layer — see end of file. handleVaultRegister no longer
  // does its own gate; the route-level gate covers new-vault + every
  // other sync write/read. Kept here as a marker so the code path is
  // obvious during code review.)

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
  if (typeof body.appVersion !== 'undefined' && !(typeof body.appVersion === 'string' && APP_VERSION_RE.test(body.appVersion))) {
    return errorResponse('invalid-request', 400, {
      message: 'appVersion must be a version like 1.6.8',
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
      if (body.appVersion) devices[auth.deviceId].appVersion = body.appVersion
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
      appVersion: body.appVersion,
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

  // Self-revocation IS allowed — that's how a device "leaves" the vault.
  // If the leaving device is the last paired device, we purge the entire
  // vault (frees the per-IP lifetime quota). For multi-device vaults, just
  // remove this device from the map; remaining devices keep syncing.

  const devicesKey = ['vault', auth.vaultId, 'devices']
  const isSelfRevoke = pathDeviceId === auth.deviceId
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await kv.get<DevicesMap>(devicesKey)
    const devices: DevicesMap = cur.value || {}
    if (!devices[pathDeviceId]) {
      // Idempotent — already gone
      return jsonResponse({ ok: true, alreadyRevoked: true })
    }
    const next: DevicesMap = { ...devices }
    delete next[pathDeviceId]
    const remaining = Object.keys(next).length

    if (remaining === 0 && isSelfRevoke) {
      // Last device leaving — purge the whole vault so the IP quota
      // bookkeeping reflects reality (no orphan vault occupying a slot).
      // Atomic check on the devices key ensures no concurrent device joined.
      const purgeResult = await kv.atomic()
        .check(cur)
        .delete(devicesKey)
        .commit()
      if (!purgeResult.ok) continue // retry — race with concurrent register

      // Read the vault index BEFORE we delete it, so we can refund the
      // creator's lifetime quota counter.
      const indexEntry = await kv.get<VaultIndex>(['v', auth.vaultId, 'index'])
      const creatorIpHash = indexEntry.value?.creatorIpHash

      // Sweep the data + index keys outside the atomic (they're partitioned
      // under different prefixes; can't all be in one atomic op anyway).
      let purgedBytes = 0
      for await (const entry of kv.list({ prefix: ['v', auth.vaultId] })) {
        await kv.delete(entry.key)
        purgedBytes += storedSize(entry.value)
      }
      for await (const entry of kv.list({ prefix: ['vault', auth.vaultId] })) {
        await kv.delete(entry.key)
      }
      await recordFreedBytes(kv, purgedBytes)

      // Refund the creator's lifetime quota slot — vault is gone, so a
      // future register from the same IP shouldn't count this one against
      // them. Hour-bucket counter is intentionally NOT refunded (rate limit
      // is meant to slow down churn, not be exact).
      if (creatorIpHash) {
        const lifetimeKey = ['ip-lifetime', creatorIpHash]
        const lifeEntry = await kv.get<number>(lifetimeKey)
        const lifeCur = lifeEntry.value ?? 0
        if (lifeCur > 0) {
          await kv.set(lifetimeKey, lifeCur - 1)
        }
      }

      return jsonResponse({
        ok: true,
        revokedDeviceId: pathDeviceId,
        vaultPurged: true,
        purgedBytes,
      })
    }

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

function vaultFullResponse(usage: number): Response {
  return errorResponse('vault-full', 413, { usage, limit: MAX_VAULT_BYTES })
}

/** The index fields clients use — never the creator's IP hash. */
function publicIndex(idx: VaultIndex): { lastVersion: number; totalBytes: number; lastActivityAt?: number } {
  return {
    lastVersion: idx.lastVersion,
    totalBytes: idx.totalBytes,
    ...(typeof idx.lastActivityAt === 'number' ? { lastActivityAt: idx.lastActivityAt } : {}),
  }
}

/**
 * Take freed bytes off a vault's usage. A checked write with retries, so it
 * can never roll back a concurrent push's lastVersion.
 */
async function releaseIndexBytes(kv: Deno.Kv, indexKey: Deno.KvKey, bytes: number): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await kv.get<VaultIndex>(indexKey)
    if (!cur.value) break
    const next: VaultIndex = { ...cur.value, totalBytes: Math.max(0, cur.value.totalBytes - bytes) }
    const res = await kv.atomic().check(cur).set(indexKey, next).sum(USAGE_FREED_KEY, BigInt(bytes)).commit()
    if (res.ok) return
  }
  await recordFreedBytes(kv, bytes)
}

/**
 * Pulls count as activity, so a vault that is only being read is never
 * purged as inactive. Written at most once per ACTIVITY_REFRESH_MS, and
 * skipped on conflict — a concurrent write is itself activity.
 */
async function touchVaultActivity(kv: Deno.Kv, indexEntry: Deno.KvEntryMaybe<VaultIndex>): Promise<void> {
  const idx = indexEntry.value
  if (!idx) return
  const ts = now()
  if (typeof idx.lastActivityAt === 'number' && ts - idx.lastActivityAt < ACTIVITY_REFRESH_MS) return
  await kv.atomic().check(indexEntry).set(indexEntry.key, { ...idx, lastActivityAt: ts }).commit()
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

  const indexKey = ['v', auth.vaultId, 'index']

  // Refuse up front when the vault can't take the batch, before storing any
  // chunks.
  const usageBefore = (await kv.get<VaultIndex>(indexKey)).value?.totalBytes ?? 0
  if (usageBefore + totalBatchBytes > MAX_VAULT_BYTES) {
    return vaultFullResponse(usageBefore)
  }

  // Large envelopes go to chunk storage now. Small ones ride inline in the
  // commit, up to a budget that keeps the atomic operation under KV's limit.
  const uploads: Array<ChunkRef | null> = []
  let inlineBytes = 0
  try {
    for (const d of decoded) {
      if (d.size <= INLINE_BLOB_BYTES && inlineBytes + d.size <= ATOMIC_INLINE_BUDGET) {
        inlineBytes += d.size
        uploads.push(null)
      } else {
        uploads.push(await writeChunks(kv, auth.vaultId, d.bytes))
      }
    }
  } catch (err) {
    await discardUploads(kv, auth.vaultId, uploads)
    throw err
  }

  // Atomic batch write — refetch index and lastVersion, plan all writes,
  // commit. If conflicts, retry whole batch.
  for (let attempt = 0; attempt < 5; attempt++) {
    const indexEntry = await kv.get<VaultIndex>(indexKey)
    const idx: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

    // Quota check
    if (idx.totalBytes + totalBatchBytes > MAX_VAULT_BYTES) {
      await discardUploads(kv, auth.vaultId, uploads)
      return vaultFullResponse(idx.totalBytes)
    }

    // Permanent-tombstone check — if any envelope targets a permanent
    // tombstone, mark its result as stale-parent / quarantine. We do not
    // block the whole batch — but we still enforce.
    // We treat permanent tombstones as advisory: the spec says "mark
    // permanent on pull"; for push, we let the push through with new version
    // (latest-wins) but client is expected to quarantine if the tombstone is
    // permanent. Here we still write — eviction happens on the client.

    const ts = now()
    const writes: Array<{ resourceType: ResourceType; resourceId: string; version: number }> = []
    let tx = kv.atomic().check(indexEntry)

    let nextVersion = idx.lastVersion + 1
    for (let i = 0; i < decoded.length; i++) {
      const d = decoded[i]
      const chunks = uploads[i]
      const blob: SyncBlob = {
        v: 1,
        ciphertext: chunks ? new Uint8Array(0) : d.bytes,
        size: d.size,
        uploadedAt: ts,
        authorDeviceId: auth.deviceId,
        parentVersion: typeof d.e.parentVersion === 'number' ? d.e.parentVersion : null,
        ...(chunks ? { chunks } : {}),
      }
      tx = tx.set(['v', auth.vaultId, d.e.resourceType, d.e.resourceId, nextVersion], blob)
      if (chunks) tx = tx.delete(pendingUploadKey(chunks.uploadId))
      writes.push({
        resourceType: d.e.resourceType,
        resourceId: d.e.resourceId,
        version: nextVersion,
      })
      nextVersion++
    }

    const newIndex: VaultIndex = {
      ...idx,
      lastVersion: idx.lastVersion + decoded.length,
      totalBytes: idx.totalBytes + totalBatchBytes,
      lastActivityAt: ts,
    }
    tx = tx.set(indexKey, newIndex).sum(USAGE_ADDED_KEY, BigInt(totalBatchBytes))

    const result = await tx.commit()
    if (!result.ok) continue

    // Post-write: version eviction for note resources only (per spec)
    let evictedBytes = 0
    for (const w of writes) {
      if (w.resourceType !== 'note') continue
      evictedBytes += await evictOldNoteVersions(kv, auth.vaultId, w.resourceId)
    }
    if (evictedBytes > 0) await releaseIndexBytes(kv, indexKey, evictedBytes)

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
      vaultIndex: publicIndex(finalIdx),
    })
  }

  await discardUploads(kv, auth.vaultId, uploads)
  return errorResponse('invalid-request', 500, {
    message: 'Push failed after retries (concurrent writes)',
  })
}

/**
 * Delete oldest note versions if count > MAX_NOTE_VERSIONS, together with
 * their chunks. Returns number of bytes evicted.
 */
async function evictOldNoteVersions(
  kv: Deno.Kv,
  vaultId: string,
  noteId: string,
): Promise<number> {
  const prefix = ['v', vaultId, 'note', noteId]
  const versions: Array<{ version: number; key: Deno.KvKey; blob: SyncBlob }> = []
  for await (const entry of kv.list<SyncBlob>({ prefix })) {
    const v = entry.key[entry.key.length - 1] as number
    versions.push({ version: v, key: entry.key, blob: entry.value })
  }
  if (versions.length <= MAX_NOTE_VERSIONS) return 0

  versions.sort((a, b) => a.version - b.version)
  const toEvict = versions.slice(0, versions.length - MAX_NOTE_VERSIONS)
  let evictedBytes = 0
  for (const v of toEvict) {
    let tx = kv.atomic().delete(v.key)
    for (const key of chunkKeysOf(vaultId, v.blob)) tx = tx.delete(key)
    await tx.commit()
    evictedBytes += v.blob.size
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

  // Short-circuit empty pulls — the common case in quiet periods.
  // Without this, every /sync/pull does a `kv.list` over every
  // resourceType (5 prefixes × N entries) just to find that the
  // cursor is already at lastVersion → 50+ KV reads per pull, every
  // 10-60 seconds, per device. Empties the Deno Free tier KV-reads
  // quota fast. Now: read the vault index ONCE up front; if the
  // cursor is already caught up, return immediately with 1 read.
  const indexEntryEarly = await kv.get<VaultIndex>(['v', auth.vaultId, 'index'])
  const vaultIndexEarly = indexEntryEarly.value ?? { lastVersion: 0, totalBytes: 0 }
  await touchVaultActivity(kv, indexEntryEarly)
  if (vaultIndexEarly.lastVersion <= since) {
    return jsonResponse({
      envelopes: [],
      hasMore: false,
      vaultIndex: publicIndex(vaultIndexEarly),
    })
  }

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
  // Two-pass, memory-bounded scan.
  //
  // Pass 1 collects lightweight refs (key + version, NO ciphertext) for EVERY
  // entry newer than `since`, across all resource types, so we can globally sort
  // by version and take the true lowest `limit`. Holding only refs keeps memory
  // bounded even on a large initial sync (`since = 0`); pass 2 fetches blobs for
  // just the returned window.
  //
  // This replaces an earlier `scanned > limit*8+100` early break. kv.list yields
  // in resourceId (random UUID) order, NOT version order, so that break could
  // stop before reaching a low-version note whose UUID happened to sort late.
  // The client then advanced its `since` cursor past that version and never
  // pulled the note again — silent, permanent note loss on exactly the
  // large-vault initial-sync path new multi-device users hit first.
  type ScanRef = { resourceType: ResourceType; key: Deno.KvKey; resourceId: string; version: number }
  const refs: ScanRef[] = []
  for (const t of types) {
    for await (const entry of kv.list<SyncBlob>({ prefix: ['v', auth.vaultId, t] })) {
      const key = entry.key
      const version = key[key.length - 1] as number
      if (typeof version !== 'number' || version <= since) continue
      refs.push({ resourceType: t, key, resourceId: key[key.length - 2] as string, version })
    }
  }

  refs.sort((a, b) => a.version - b.version)
  const windowRefs = refs.slice(0, limit)
  let hasMore = refs.length > limit

  const collected: PulledEnvelope[] = []
  let responseBytes = 0
  for (const ref of windowRefs) {
    const blob = (await kv.get<SyncBlob>(ref.key)).value
    if (!blob) continue

    // Stop before the response grows past MAX_PULL_BYTES. The first envelope
    // always goes out, so the client's cursor can never stall; it pulls the
    // rest from its new cursor because hasMore is set.
    if (collected.length > 0 && responseBytes + blob.size > MAX_PULL_BYTES) {
      hasMore = true
      break
    }

    const ciphertext = await readBlobCiphertext(kv, auth.vaultId, blob)
    if (!ciphertext) {
      console.error(`[sync] pull: ${ref.resourceType} v${ref.version} is missing chunks vault=${auth.vaultId.slice(0, 8)}`)
      continue
    }

    // Tombstone permanent flag (lazy)
    let permanent = blob.permanent
    if (ref.resourceType === 'tombstone' && !permanent && now() - blob.uploadedAt >= TOMBSTONE_PERMANENT_MS) {
      permanent = true
      await kv.set(ref.key, { ...blob, permanent: true }).catch(() => {})
    }

    collected.push({
      resourceType: ref.resourceType,
      resourceId: ref.resourceId,
      ciphertext: base64Encode(ciphertext),
      version: ref.version,
      uploadedAt: blob.uploadedAt,
      authorDeviceId: blob.authorDeviceId,
      parentVersion: blob.parentVersion,
      permanent,
    })
    responseBytes += blob.size
  }

  // windowRefs is already the version-sorted lowest-`limit` slice, so
  // `collected` is in ascending version order — no re-sort needed. The index
  // read from the short-circuit check above is reused.
  return jsonResponse({
    envelopes: collected,
    hasMore,
    vaultIndex: publicIndex(vaultIndexEarly),
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
  const ciphertext = entry.value ? await readBlobCiphertext(kv, auth.vaultId, entry.value) : null
  if (!entry.value || !ciphertext) {
    return errorResponse('not-found', 404, { message: 'Version not found' })
  }
  return jsonResponse({
    ciphertext: base64Encode(ciphertext),
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
  const chunks = bytes.byteLength > INLINE_BLOB_BYTES ? await writeChunks(kv, auth.vaultId, bytes) : null
  for (let attempt = 0; attempt < 5; attempt++) {
    const indexEntry = await kv.get<VaultIndex>(indexKey)
    const idx: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }

    if (idx.totalBytes + bytes.byteLength > MAX_VAULT_BYTES) {
      await discardUploads(kv, auth.vaultId, [chunks])
      return vaultFullResponse(idx.totalBytes)
    }

    const newVersion = idx.lastVersion + 1
    const ts = now()
    const blob: SyncBlob = {
      v: 1,
      ciphertext: chunks ? new Uint8Array(0) : bytes,
      size: bytes.byteLength,
      uploadedAt: ts,
      authorDeviceId: auth.deviceId,
      parentVersion: typeof body.parentVersion === 'number' ? body.parentVersion : null,
      ...(chunks ? { chunks } : {}),
    }

    let tx = kv.atomic()
      .check(indexEntry)
      .set(['v', auth.vaultId, 'tombstone', noteId, newVersion], blob)
      .set(indexKey, {
        ...idx,
        lastVersion: newVersion,
        totalBytes: idx.totalBytes + bytes.byteLength,
        lastActivityAt: ts,
      })
      .sum(USAGE_ADDED_KEY, BigInt(bytes.byteLength))
    if (chunks) tx = tx.delete(pendingUploadKey(chunks.uploadId))

    const committed = await tx.commit()
    if (!committed.ok) continue

    broadcastNewVersion(auth.vaultId, {
      type: 'new-version',
      resourceType: 'tombstone',
      resourceId: noteId,
      version: newVersion,
    }, auth.deviceId)

    return jsonResponse({ ok: true, version: newVersion })
  }

  await discardUploads(kv, auth.vaultId, [chunks])
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
  const indexKey = ['v', auth.vaultId, 'index']
  const [indexBefore, existing] = await kv.getMany<[VaultIndex, SyncBlob]>([indexKey, key])
  if (existing.value) {
    return jsonResponse({ ok: true, dedupKey: attachmentId, existing: true })
  }
  const usageBefore = indexBefore.value?.totalBytes ?? 0
  if (usageBefore + bytes.byteLength > MAX_VAULT_BYTES) {
    return vaultFullResponse(usageBefore)
  }
  // Relay-wide ceiling: attachments stop before storage runs out, so notes
  // keep syncing. The app keeps the file and tries again later.
  if (await isKvFull(kv, bytes.byteLength)) {
    return errorResponse('capacity', 503, {
      message: 'Relay storage is at capacity; attachment uploads are paused',
    }, { 'Retry-After': '3600' })
  }

  const chunks = bytes.byteLength > INLINE_BLOB_BYTES ? await writeChunks(kv, auth.vaultId, bytes) : null

  for (let attempt = 0; attempt < 5; attempt++) {
    const [indexEntry, current] = await kv.getMany<[VaultIndex, SyncBlob]>([indexKey, key])
    if (current.value) {
      // Another upload of the same attachment committed first.
      await discardUploads(kv, auth.vaultId, [chunks])
      return jsonResponse({ ok: true, dedupKey: attachmentId, existing: true })
    }
    const idx: VaultIndex = indexEntry.value ?? { lastVersion: 0, totalBytes: 0 }
    if (idx.totalBytes + bytes.byteLength > MAX_VAULT_BYTES) {
      await discardUploads(kv, auth.vaultId, [chunks])
      return vaultFullResponse(idx.totalBytes)
    }

    const ts = now()
    const blob: SyncBlob = {
      v: 1,
      ciphertext: chunks ? new Uint8Array(0) : bytes,
      size: bytes.byteLength,
      uploadedAt: ts,
      authorDeviceId: auth.deviceId,
      parentVersion: null,
      ...(chunks ? { chunks } : {}),
    }

    // Attachments take no version number and ring no doorbell: pulls never
    // return them (notes reference them by id), and bumping lastVersion would
    // make every device's pull rescan the whole vault while photos upload.
    let tx = kv.atomic()
      .check(indexEntry)
      .check(current)
      .set(key, blob)
      .set(indexKey, {
        ...idx,
        totalBytes: idx.totalBytes + bytes.byteLength,
        lastActivityAt: ts,
      })
      .sum(USAGE_ADDED_KEY, BigInt(bytes.byteLength))
    if (chunks) tx = tx.delete(pendingUploadKey(chunks.uploadId))

    const committed = await tx.commit()
    if (!committed.ok) continue

    return jsonResponse({ ok: true, dedupKey: attachmentId, existing: false })
  }

  await discardUploads(kv, auth.vaultId, [chunks])
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
  const ciphertext = entry.value ? await readBlobCiphertext(kv, auth.vaultId, entry.value) : null
  if (!entry.value || !ciphertext) {
    return errorResponse('not-found', 404, { message: 'Attachment not found' })
  }
  return jsonResponse({
    ciphertext: base64Encode(ciphertext),
    uploadedAt: entry.value.uploadedAt,
    authorDeviceId: entry.value.authorDeviceId,
  })
}

/**
 * POST /sync/attachments/exists — which of up to MAX_EXISTS_IDS attachment
 * ids the relay already holds. Counted in the 'other' bucket, so checking
 * never spends the attachment transfer allowance.
 */
export async function handleAttachmentsExist(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const auth = await authenticate(kv, req)
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(auth.vaultId, auth.deviceId, 'other')
  if (!rl.ok) return rateLimitedResponse(rl.retryAfter)

  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid-request', 400, { message: 'Invalid JSON' })
  }
  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_EXISTS_IDS || !ids.every((id) => isValidId(id))) {
    return errorResponse('invalid-request', 400, {
      message: `ids must be 1 to ${MAX_EXISTS_IDS} attachment ids`,
    })
  }

  const unique = [...new Set(ids as string[])]
  const present: string[] = []
  const missing: string[] = []
  for (let i = 0; i < unique.length; i += GET_MANY_LIMIT) {
    const group = unique.slice(i, i + GET_MANY_LIMIT)
    const keys = group.map((id) => ['v', auth.vaultId, 'attachment', id, 1])
    const entries = await kv.getMany<SyncBlob[]>(keys)
    for (let j = 0; j < group.length; j++) {
      if (entries[j].value) present.push(group[j])
      else missing.push(group[j])
    }
  }
  return jsonResponse({ present, missing })
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

  // Read the index BEFORE deleting so we can refund the IP quota slot.
  const indexEntry = await kv.get<VaultIndex>(['v', auth.vaultId, 'index'])
  const creatorIpHash = indexEntry.value?.creatorIpHash

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
  await recordFreedBytes(kv, purgedBytes)

  // Refund creator's lifetime quota slot (same logic as auto-purge in revoke).
  if (creatorIpHash) {
    const lifetimeKey = ['ip-lifetime', creatorIpHash]
    const lifeEntry = await kv.get<number>(lifetimeKey)
    const lifeCur = lifeEntry.value ?? 0
    if (lifeCur > 0) {
      await kv.set(lifetimeKey, lifeCur - 1)
    }
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
    appVersion: info.appVersion,
  }))

  return jsonResponse({
    lastVersion: idx.lastVersion,
    totalBytes: idx.totalBytes,
    deviceCount: pairedDevices.length,
    pairedDevices,
  })
}

/**
 * GET /sync/vault/quota — caller's IP-bucketed quota, read-only.
 * No auth required — quota is a property of the caller's network, not a
 * specific vault. Lets the client show "X of N vaults used" before the
 * user even has a vault.
 */
export async function handleVaultQuota(
  kv: Deno.Kv,
  req: Request,
): Promise<Response> {
  const ip = getClientIp(req)
  const ipHash = await hashIp(ip)
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const [hourEntry, lifeEntry] = await kv.getMany<[number, number]>([
    ['ip-rate', ipHash, hourBucket],
    ['ip-lifetime', ipHash],
  ])
  return jsonResponse({
    usedThisHour: hourEntry.value ?? 0,
    hourLimit: REGISTER_PER_IP_PER_HOUR,
    lifetimeUsed: lifeEntry.value ?? 0,
    lifetimeLimit: REGISTER_PER_IP_LIFETIME,
  })
}

// ── Top-level router ──────────────────────────────────────────────────

/**
 * Try to match + handle a /sync/* request. Returns Response if matched,
 * null if not (so caller can fall through to other routes).
 */
/**
 * Centralized entitlement gate.
 *
 * Identity sources (in priority order):
 *   1. Magic-link bearer token (Authorization header → server/auth.ts) → email.
 *      This is the cross-platform path: a user signs in once and proves
 *      their email to the server, then the relay can look up their
 *      Stripe sync-sub or Mac-license entitlement.
 *   2. X-RC-AppUserId header → RevenueCat anonymous appUserId. iOS path.
 *
 * `ENTITLEMENT_REQUIRED` env flag must be 'true' for enforcement.
 *
 * Returns a 402 Response when the caller lacks a valid entitlement,
 * or null to let the request proceed. The decoupling means a single
 * helper covers every /sync/* endpoint — handlers no longer need to
 * know about entitlement at all.
 *
 * Mounted UNCONDITIONALLY across all /sync/* routes EXCEPT:
 *   - OPTIONS preflight (CORS)
 *   - DELETE on /sync/vault/devices/:id (let users always revoke their devices)
 *   - GET /sync/vault/purge-token + POST /sync/vault/purge (always allow data deletion)
 *   - GET /sync/vault/quota (read-only, no PII, used to display warnings)
 */
async function requireSyncEntitlement(
  kv: Deno.Kv,
  req: Request,
): Promise<Response | null> {
  if (Deno.env.get('ENTITLEMENT_REQUIRED') !== 'true') return null

  // 1) Magic-link bearer → email
  const sess = await verifyAuthRequest(kv, req)
  // 2) RC appUserId header → iOS
  const rcAppUserId = req.headers.get('X-RC-AppUserId') || req.headers.get('x-rc-appuserid') || undefined

  // The vault this request is about (auth header, or ?v= for WebSocket
  // clients). Spoofing it only reaches the entitlement check — the handler's
  // own authenticate() still demands valid device credentials for it.
  const vaultId = req.headers.get('x-vault-id') ?? new URL(req.url).searchParams.get('v') ?? undefined

  if (!sess && !rcAppUserId) {
    // No identity on this request — notably the WebSocket doorbell, which
    // cannot carry headers. It still passes when the vault itself is
    // covered by another device's plan (see hasVaultEntitlement).
    if (vaultId && (await hasVaultEntitlement(kv, vaultId)).hasSync) return null
    return errorResponse('forbidden', 402, {
      message: 'Sync requires sign-in. Open Settings → Sync to sign in or subscribe.',
      reason: 'no-identity',
    })
  }

  const ent = await hasEntitlement(kv, {
    email: sess?.email,
    rcAppUserId,
  })
  if (ent.hasSync) {
    // A subscription covers the whole vault, not just the identity that
    // bought it. Remember the link so the subscriber's OTHER devices — a Mac
    // has no RevenueCat id — pass this gate too, and tie the App Store
    // purchase to the signed-in email when both arrive together.
    if (vaultId) {
      // Link whichever identities this entitled request carried: the RC id
      // when the phone itself is subscribed, and the signed-in email whenever
      // present (its plan may be Stripe, or an App Store plan reached through
      // the email→iOS link — hasVaultEntitlement re-checks it live either way).
      await linkEntitlementToVault(kv, vaultId, {
        rcAppUserId: ent.source === 'ios' && rcAppUserId ? rcAppUserId : undefined,
        email: sess?.email,
      }).catch(() => {})
    }
    if (ent.source === 'ios' && sess?.email && rcAppUserId) {
      await linkIosEntitlementToEmail(kv, sess.email, rcAppUserId).catch(() => {})
    }
    return null
  }

  // This identity has no plan of its own — is the vault covered by another
  // device's plan (e.g. the iPhone that bought it)?
  if (vaultId) {
    const viaVault = await hasVaultEntitlement(kv, vaultId)
    if (viaVault.hasSync) {
      // Propagate to the signed-in email so /auth/me (which only knows the
      // email) agrees with this gate and the client's UI unlocks.
      if (sess?.email && viaVault.rcAppUserId) {
        await linkIosEntitlementToEmail(kv, sess.email, viaVault.rcAppUserId).catch(() => {})
      }
      return null
    }
  }

  return errorResponse('forbidden', 402, {
    message: 'Sync requires an active subscription. Subscribe in the app, or via https://dashnote.io/subscribe.',
    reason: 'no-entitlement',
  })
}

/**
 * Thin logging wrapper: one line per failed sync request (and every
 * register attempt) so support can see whether a device reached the relay
 * and what it was told. Logs route, status, an 8-char vault-id prefix and
 * whether the request carried an RC id / session — never note data.
 */
export async function routeSyncRequest(
  kv: Deno.Kv,
  req: Request,
): Promise<Response | null> {
  const res = await routeSyncRequestInner(kv, req)
  if (res) {
    const url = new URL(req.url)
    const isRegister = url.pathname === '/sync/vault/register'
    if (isRegister || (res.status >= 400 && res.status !== 404)) {
      const vault = req.headers.get('x-vault-id') ?? url.searchParams.get('v') ?? ''
      const rc = req.headers.has('x-rc-appuserid') ? 'y' : 'n'
      const auth = req.headers.has('authorization') ? 'y' : 'n'
      let why = ''
      if (res.status >= 400) {
        // Error bodies are small JSON ({ error, message }); read a clone so
        // the real response is untouched.
        try {
          const body = await res.clone().json() as { error?: string; message?: string }
          why = ` why=${body?.error ?? '?'}${body?.message ? ` (${String(body.message).slice(0, 60)})` : ''}`
        } catch { /* not JSON */ }
      }
      console.log(`[sync] ${req.method} ${url.pathname} → ${res.status}${why} vault=${vault.slice(0, 8)} rc=${rc} session=${auth} ua=${(req.headers.get('user-agent') || '').slice(0, 40)}`)
    }
  }
  return res
}

async function routeSyncRequestInner(
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

  // Always-allowed paths (data deletion + read-only quota status).
  // These deliberately bypass the entitlement gate so users can always
  // revoke devices / delete their data / see why they got 402'd.
  const isAlwaysAllowed = (
    (path === '/sync/vault/quota' && req.method === 'GET') ||
    (path === '/sync/vault/purge-token' && req.method === 'GET') ||
    (path === '/sync/vault/purge' && req.method === 'POST') ||
    (/^\/sync\/vault\/devices\/[a-zA-Z0-9_-]+$/.test(path) && req.method === 'DELETE')
  )

  if (!isAlwaysAllowed) {
    const blocked = await requireSyncEntitlement(kv, req)
    if (blocked) return blocked
  }

  // Vault management
  if (path === '/sync/vault/register' && req.method === 'POST') {
    return handleVaultRegister(kv, req)
  }
  if (path === '/sync/vault/index' && req.method === 'GET') {
    return handleVaultIndex(kv, req)
  }
  if (path === '/sync/vault/quota' && req.method === 'GET') {
    return handleVaultQuota(kv, req)
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

  if (path === '/sync/attachments/exists' && req.method === 'POST') {
    return handleAttachmentsExist(kv, req)
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