/**
 * Dash Sync — Pull Pipeline
 *
 * Counterpart to lib/syncQueue.js (push). Fetches new envelopes from the
 * relay since the last cursor, decrypts them under the vault key, and
 * returns the decrypted changes ready for client-side apply.
 *
 * Apply phase is split out so callers can:
 *   1. Capture the loser version into local version history BEFORE the
 *      pulled version overwrites local state (Layer 3 of data-loss
 *      defense in the plan).
 *   2. Skip applying to pages that have in-flight local edits (Rule 4 of
 *      Save-pipeline race-condition guarantees).
 *
 * Decryption failures route to a quarantine list — the local plaintext
 * is NEVER overwritten on a decrypt failure (Layer 5 of data-loss defense).
 */

import { decryptEnvelope } from './syncCrypto.js'
import { buildSyncHeaders } from './syncAuth.js'
import { base64Decode } from './syncQueue.js'
import { DecryptionError } from '../utils/cryptoUtils.js'

// =============================================================================
// Types
// =============================================================================

/**
 * @typedef {Object} PullCredentials
 * @property {Uint8Array} vaultKeyBytes
 * @property {CryptoKey} vaultCryptoKey
 * @property {string} vaultId
 * @property {string} deviceId
 * @property {string} relayUrl
 */

/**
 * @typedef {Object} DecryptedEnvelope
 * @property {string} resourceType
 * @property {string} resourceId
 * @property {object} payload   - the original plaintext (note/folder/manifest/tombstone)
 * @property {number} version   - server-assigned version number
 * @property {number} uploadedAt - server timestamp (ms)
 * @property {string} authorDeviceId
 * @property {number|null} parentVersion
 */

/**
 * @typedef {Object} QuarantinedEnvelope
 * @property {string} resourceType
 * @property {string} resourceId
 * @property {number} version
 * @property {string} reason - human-readable error
 * @property {string} ciphertextB64 - opaque blob for forensic / replay
 */

/**
 * @typedef {Object} PullResult
 * @property {DecryptedEnvelope[]} envelopes - successfully decrypted, ordered by version
 * @property {QuarantinedEnvelope[]} quarantined - decrypt failures, NOT applied locally
 * @property {number} cursorAfter - new cursor (highest version pulled)
 * @property {boolean} hasMore - true if server indicates more remain
 * @property {{lastVersion: number, totalBytes: number}} vaultIndex
 */

// =============================================================================
// Pull from server
// =============================================================================

/**
 * Pull new envelopes from the server since the given cursor.
 *
 * @param {Object} opts
 * @param {PullCredentials} opts.credentials
 * @param {number} opts.cursor - last successfully pulled version (0 for initial sync)
 * @param {number} [opts.limit=100] - max envelopes per request (server caps at 100)
 * @param {(url:string, init:RequestInit) => Promise<Response>} [opts.fetch]
 * @returns {Promise<PullResult>}
 */
export async function pullSince ({
  credentials,
  cursor = 0,
  limit = 100,
  fetch: fetchFn = (typeof globalThis !== 'undefined' ? globalThis.fetch : null)
}) {
  if (!credentials) throw new Error('pullSince: credentials required')
  if (typeof fetchFn !== 'function') throw new Error('pullSince: fetch unavailable')
  const { vaultKeyBytes, vaultCryptoKey, vaultId, deviceId, relayUrl } = credentials
  if (!(vaultKeyBytes instanceof Uint8Array)) throw new Error('pullSince: vaultKeyBytes required')
  if (!(vaultCryptoKey instanceof CryptoKey)) throw new Error('pullSince: vaultCryptoKey required')
  if (!Number.isFinite(cursor) || cursor < 0) throw new Error('pullSince: cursor must be non-negative')
  if (!Number.isFinite(limit) || limit < 1) throw new Error('pullSince: limit must be positive')

  const httpUrl = relayUrl.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')
  const path = `/sync/pull?since=${encodeURIComponent(cursor)}&limit=${encodeURIComponent(limit)}`
  const headers = await buildSyncHeaders(vaultKeyBytes, {
    vaultId, deviceId, timestamp: Date.now(), method: 'GET', path
  })

  let response
  try {
    response = await fetchFn(httpUrl + path, { method: 'GET', headers })
  } catch (err) {
    throw new PullError('network', `network failure: ${err.message}`, { cause: err })
  }

  if (!response.ok) {
    let body = null
    try { body = await response.json() } catch { /* not JSON */ }
    throw new PullError(
      classifyHttpStatus(response.status),
      `server returned ${response.status}`,
      { status: response.status, body }
    )
  }

  let body
  try { body = await response.json() } catch (err) {
    throw new PullError('invalid-response', `pull body not JSON: ${err.message}`)
  }

  const serverEnvs = Array.isArray(body.envelopes) ? body.envelopes : []
  const decrypted = []
  const quarantined = []
  let highestVersion = cursor

  for (const env of serverEnvs) {
    if (typeof env.version === 'number' && env.version > highestVersion) {
      highestVersion = env.version
    }
    let decryptedPayload
    try {
      decryptedPayload = await decryptOne(env, vaultCryptoKey)
    } catch (err) {
      quarantined.push({
        resourceType: env.resourceType,
        resourceId: env.resourceId,
        version: env.version,
        reason: err instanceof DecryptionError ? err.message : `unexpected: ${err.message}`,
        ciphertextB64: typeof env.ciphertext === 'string' ? env.ciphertext : null
      })
      continue
    }
    decrypted.push({
      resourceType: env.resourceType,
      resourceId: env.resourceId,
      payload: decryptedPayload.payload,
      schemaVersion: decryptedPayload.schemaVersion,
      envelopeType: decryptedPayload.envelopeType,
      payloadTimestamp: decryptedPayload.timestamp,
      version: env.version,
      uploadedAt: env.uploadedAt,
      authorDeviceId: env.authorDeviceId,
      parentVersion: typeof env.parentVersion === 'number' ? env.parentVersion : null
    })
  }

  // Sort by server version ascending — apply order matters for monotonic state
  decrypted.sort((a, b) => a.version - b.version)

  return {
    envelopes: decrypted,
    quarantined,
    cursorAfter: highestVersion,
    hasMore: Boolean(body.hasMore),
    vaultIndex: body.vaultIndex || null
  }
}

/**
 * Decrypt a single server envelope. Server payload shape:
 *   { resourceType, resourceId, ciphertext (b64), version, uploadedAt, authorDeviceId, parentVersion? }
 *
 * The ciphertext is the JSON-encoded encryptedEnvelope object (matching
 * lib/syncCrypto.encryptEnvelope output: {v:1, cipher:'AES-GCM-256', iv:[],
 * data:[]}). We base64-decode the wire bytes, JSON-parse to recover the
 * encrypted-envelope object, then decrypt to get the inner plaintext payload.
 *
 * @param {object} env
 * @param {CryptoKey} vaultCryptoKey
 * @returns {Promise<object>} the inner plaintext envelope
 */
async function decryptOne (env, vaultCryptoKey) {
  if (typeof env.ciphertext !== 'string') {
    throw new DecryptionError('decryptOne: ciphertext missing')
  }
  let encryptedEnvelope
  try {
    const wireBytes = base64Decode(env.ciphertext)
    const wireStr = new TextDecoder().decode(wireBytes)
    encryptedEnvelope = JSON.parse(wireStr)
  } catch (err) {
    throw new DecryptionError(`decryptOne: ciphertext not valid base64+JSON: ${err.message}`)
  }
  const inner = await decryptEnvelope(encryptedEnvelope, vaultCryptoKey)
  // Inner shape (from encryptEnvelope wrap): { schemaVersion, envelopeType, resourceId, payload, timestamp, authorDeviceId, parentVersion }
  if (!inner || typeof inner !== 'object') {
    throw new DecryptionError('decryptOne: decrypted plaintext is not an object')
  }
  if (typeof inner.schemaVersion !== 'number') {
    throw new DecryptionError(`decryptOne: missing schemaVersion in plaintext`)
  }
  if (inner.schemaVersion !== 1) {
    throw new DecryptionError(`decryptOne: unsupported envelope schemaVersion ${inner.schemaVersion} — update the app to read this note`)
  }
  if (!('payload' in inner)) {
    throw new DecryptionError('decryptOne: missing payload in plaintext')
  }
  return inner
}

// =============================================================================
// Apply pulled changes to local state
// =============================================================================

/**
 * @typedef {Object} ApplyOptions
 * @property {(pageId: string) => boolean} [hasInFlightEdit]
 *   Returns true if there's a local unsaved edit for this page (e.g. user
 *   is currently typing). Caller hooks this into Editor.js's dirty-tracking.
 *   Pages with in-flight edits are still applied — but the local pre-pull
 *   state is captured into version history first (latest-wins rule still
 *   holds, but loser is preserved).
 * @property {(pageId: string, blocks: any[]) => Promise<void>} [captureVersion]
 *   Save the loser version into local version history. Hook into
 *   lib/versionStorage.captureVersion.
 * @property {(notice: { resourceId: string, replacedFrom: string }) => void} [notifyReplaced]
 *   Optional callback for "X was replaced by sync — view changes" toast.
 *   Caller wires to UI.
 */

/**
 * @typedef {Object} ApplyResult
 * @property {object[]} newPages - the merged pages array
 * @property {string[]} applied - pageIds that were updated/inserted
 * @property {string[]} deleted - pageIds that were tombstoned (moved to Trash)
 * @property {string[]} loserCaptured - pageIds whose pre-pull state was
 *                                       saved to version history
 * @property {object|null} manifest - latest manifest payload (if any)
 * @property {Map<string, number>} lastSyncedVersionUpdates -
 *           pageId → highest applied version (caller persists into vault metadata)
 */

/**
 * Apply a list of pulled, decrypted envelopes to a pages array. Pure-ish:
 * the only side effects are via injected callbacks (captureVersion,
 * notifyReplaced). Returns a new pages array; does NOT mutate input.
 *
 * Conflict policy: latest-wins by `payloadTimestamp`. If incoming is older
 * than local's `lastEdited`, incoming is dropped (server resends are
 * harmless). If newer, incoming applies AND the local prior state is
 * captured into version history.
 *
 * @param {object[]} currentPages
 * @param {DecryptedEnvelope[]} envelopes
 * @param {ApplyOptions} [options]
 * @returns {Promise<ApplyResult>}
 */
export async function applyPulledChanges (currentPages, envelopes, options = {}) {
  if (!Array.isArray(currentPages)) currentPages = []
  if (!Array.isArray(envelopes)) envelopes = []
  const {
    hasInFlightEdit = () => false,
    captureVersion = null,
    notifyReplaced = () => {},
    // Set / Map of resource ids that were HARD-deleted locally. Any
    // incoming envelope for one of these ids is dropped — protects
    // against the peer-resurrect race: Mac permanentlyDeletes a page
    // (push tombstone), iPhone autosaves the same page right after
    // (push alive envelope with newer version), Mac pulls iPhone's
    // alive envelope, sees `if (!existing)` → would re-insert and the
    // page comes back. With this set populated by the caller from the
    // local hardDeletedIds store, the re-insert is dropped.
    isHardDeleted = () => false
  } = options

  // Index by id for O(1) lookup
  const pagesById = new Map(currentPages.map(p => [p.id, p]))
  const applied = []
  const deletedSet = new Set()
  const loserCaptured = []
  let manifest = null
  const lastSyncedVersionUpdates = new Map()

  for (const env of envelopes) {
    lastSyncedVersionUpdates.set(env.resourceId, env.version)

    if (env.envelopeType === 'tombstone' || env.resourceType === 'tombstone') {
      // Mark page as trashed (soft delete) — caller's Trash UI handles it.
      const existing = pagesById.get(env.resourceId)
      if (!existing) {
        // Already deleted locally — no-op (idempotent)
        continue
      }
      // Save current state to version history so user can undelete
      if (captureVersion && existing.content && Array.isArray(existing.content.blocks)) {
        try {
          await captureVersion(env.resourceId, existing.content.blocks)
        } catch (err) {
          // Capture failure is non-fatal; log but proceed
          console.error('applyPulledChanges: captureVersion failed for tombstone', err)
        }
      }
      // Replace with a tombstoned marker (caller's Trash code looks at `trashed`)
      pagesById.set(env.resourceId, {
        ...existing,
        trashed: true,
        trashedAt: env.payloadTimestamp || env.uploadedAt,
        trashedBy: env.authorDeviceId || null
      })
      deletedSet.add(env.resourceId)
      continue
    }

    if (env.envelopeType === 'meta' || env.resourceType === 'meta') {
      // Manifest envelope — folder structure, sort order, tag map.
      // Caller applies manifest separately (it's not a per-page operation).
      manifest = env.payload
      continue
    }

    if (env.envelopeType === 'note' || env.resourceType === 'note') {
      const incoming = env.payload
      if (!incoming || !incoming.id) {
        console.warn('applyPulledChanges: note envelope missing payload.id', env)
        continue
      }
      const existing = pagesById.get(incoming.id)

      if (!existing) {
        // New page candidate — but check the local hard-delete tombstone
        // set first. If this id was permanently deleted on this device,
        // dropping the envelope prevents peer-resurrect.
        if (isHardDeleted(incoming.id)) {
          continue
        }
        pagesById.set(incoming.id, incoming)
        applied.push(incoming.id)
        continue
      }

      if (!existing.trashed && incoming.trashed) {
        // Peer explicitly trashed the page. Trash always wins regardless
        // of timestamps: the user made a deliberate delete decision and
        // any local edit would just resurrect the page, which is exactly
        // the bug we're fixing. Local content is preserved in version
        // history via captureVersion below so an explicit Restore can
        // recover it. Apply unconditionally.
        if (captureVersion && existing.content && Array.isArray(existing.content.blocks)) {
          try {
            await captureVersion(incoming.id, existing.content.blocks)
            loserCaptured.push(incoming.id)
          } catch (err) {
            console.error('applyPulledChanges: captureVersion failed for trash-from-peer', err)
          }
        }
        if (hasInFlightEdit(incoming.id)) {
          notifyReplaced({ resourceId: incoming.id, replacedFrom: env.authorDeviceId })
        }
        pagesById.set(incoming.id, incoming)
        applied.push(incoming.id)
        continue
      }

      if (existing.trashed && !incoming.trashed) {
        // Trash is sticky: don't resurrect on a peer's stale edit.
        // Previous behavior was timestamp-based ("incoming newer than
        // trash → restore"), but a peer with the page open in the
        // editor auto-saves on every keystroke. Each save lands at the
        // server with a fresh `payloadTimestamp` newer than our local
        // `trashedAt`, so the page kept un-trashing itself every pull
        // — visible bug: "I keep deleting pages and they come back."
        //
        // Resurrection now requires an EXPLICIT signal from the writer:
        // `incoming.restoredAt` is set by `restorePage` (and ONLY by
        // that path). Anything else — autosave, edit, even a blocks
        // change — is treated as a stale edit on a page the writer
        // doesn't yet know is trashed. We KEEP the local trash and
        // drop the incoming envelope.
        const trashTs = typeof existing.trashedAt === 'number' ? existing.trashedAt : 0
        const restoredAt = typeof incoming.restoredAt === 'number' ? incoming.restoredAt : 0
        if (restoredAt > trashTs) {
          pagesById.set(incoming.id, incoming)
          applied.push(incoming.id)
        }
        // else: stale edit / pre-trash payload — keep local trash.
        continue
      }

      // Latest-wins by payload timestamp (the writing device's clock).
      const existingTs = typeof existing.lastEdited === 'number' ? existing.lastEdited : 0
      const incomingTs = typeof env.payloadTimestamp === 'number' ? env.payloadTimestamp : env.uploadedAt
      if (incomingTs <= existingTs) {
        // Server resent something we already have or older — drop.
        // Still bump cursor (caller persists).
        continue
      }

      // Capture the loser (existing) into version history before we overwrite.
      if (captureVersion && existing.content && Array.isArray(existing.content.blocks)) {
        try {
          await captureVersion(incoming.id, existing.content.blocks)
          loserCaptured.push(incoming.id)
        } catch (err) {
          console.error('applyPulledChanges: captureVersion failed for note', err)
        }
      }

      // If user is mid-edit, still apply (latest-wins rule) — but the loser
      // is in version history so they can restore. Surface the toast.
      if (hasInFlightEdit(incoming.id)) {
        notifyReplaced({ resourceId: incoming.id, replacedFrom: env.authorDeviceId })
      }

      pagesById.set(incoming.id, incoming)
      applied.push(incoming.id)
      continue
    }

    if (env.envelopeType === 'folder' || env.resourceType === 'folder') {
      // Folders are also stored in pagesRef (with type='folder'). Handle
      // similarly to notes but no version-history capture (folders don't
      // have content).
      //
      // CRITICAL: don't blindly overwrite folder.pages[]. Without
      // per-membership timestamps, the safe rule is to APPEND any
      // local-only ids to the incoming pages array. This preserves the
      // "peer renamed folder while local user added page X to it" case —
      // pre-fix the local addition was silently dropped on pull. The
      // tradeoff is that a peer's deliberate "remove page X from folder"
      // gets undone if local also has X in the folder; we accept that
      // (no data loss vs. silent loss). Manifest envelope still carries
      // authoritative folder structure from the writer for the broader
      // case, see RichTextEditor applyRemoteChanges.
      const incoming = env.payload
      if (!incoming || !incoming.id) continue
      const existing = pagesById.get(incoming.id)
      const incomingPages = Array.isArray(incoming.pages) ? incoming.pages : []
      if (existing && existing.type === 'folder' && Array.isArray(existing.pages)) {
        const incomingSet = new Set(incomingPages)
        const localOnly = existing.pages.filter(id => !incomingSet.has(id))
        pagesById.set(incoming.id, { ...incoming, pages: [...incomingPages, ...localOnly] })
      } else {
        pagesById.set(incoming.id, incoming)
      }
      applied.push(incoming.id)
      continue
    }

    // Tag, attachment, and other resource types are handled elsewhere
    // (tag store, attachment store). Skip here — caller dispatches.
  }

  // Convert back to array, preserving original order for unchanged items
  // and appending new items at the end.
  const newPages = []
  const seen = new Set()
  for (const p of currentPages) {
    const updated = pagesById.get(p.id)
    if (updated) {
      newPages.push(updated)
      seen.add(p.id)
    }
  }
  // Add brand-new pages (in pagesById but not in currentPages)
  for (const [id, p] of pagesById) {
    if (!seen.has(id)) {
      newPages.push(p)
    }
  }

  return {
    newPages,
    applied,
    deleted: Array.from(deletedSet),
    loserCaptured,
    manifest,
    lastSyncedVersionUpdates
  }
}

// =============================================================================
// PullError
// =============================================================================

export class PullError extends Error {
  constructor (code, message, extra = {}) {
    super(message)
    this.name = 'PullError'
    this.code = code
    this.status = extra.status
    this.body = extra.body
    if (extra.cause) this.cause = extra.cause
  }
}

function classifyHttpStatus (status) {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 410) return 'gone' // stale vault
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server-error'
  return 'unknown'
}
