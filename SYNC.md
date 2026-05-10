# Dash — Multi-Device Sync

End-to-end encrypted sync between a user's own devices. Server stores
ciphertext only — Dash can never read your notes.

> **Status:** v1 implementation complete and gated behind
> `SYNC_ENABLED = false` in `components/RichTextEditor.js`. All code paths
> (push, pull, attachments, version history, Trash, backup) are wired
> end-to-end. Default builds ship with sync OFF — flip the flag to true
> to expose the UI for alpha testing.

## TL;DR

- **One vault per user.** Generated on the first device that opts into
  sync, shared with subsequent devices via QR code + 6-digit pair code.
- **Latest-wins** conflict resolution per page. Loser version preserved
  in synced version history (Phase 2.8) — no conflict modals, no
  merging, just "newest edit wins, all old versions browsable later".
- **Trash, not delete.** Deleting moves to Trash for 30 days. Permanent
  delete pushes a tombstone envelope; tombstones cross-propagate.
- **Server is dumb pipe.** Stores opaque ciphertext blobs in Deno KV.
  Can't read titles, content, tags, or filenames. HMAC auth proofs the
  server can't verify (it's E2E — possession of vault key = access).
- **Independent backups.** Auto-export `.dashpack` to local folder on
  schedule. Decoupled from sync — works whether sync is on or off, and
  serves as the safety net if you lose all paired devices.

## Architecture

```
┌──────────────────┐                       ┌──────────────────┐
│   Desktop App    │                       │   Mobile PWA     │
│                  │                       │                  │
│  Editor.js       │                       │  Editor.js       │
│       │          │                       │       │          │
│  pagesRef ──────┐│                       │┌────── pagesRef  │
│       │         ▼│                       │▼         │       │
│  syncQueue ─push─►──────────┐        ┌──◄─push─ syncQueue   │
│       ▲         ││          │        │ ││         ▲         │
│       │   pull  ││          │        │ ││  pull   │         │
│       │   ◄─────┘│          ▼        ▼ │└──◄─────┐│         │
│  vault key       │      ┌─────────────────────┐  │vault key │
│  (in OS keychain │      │  Deno Deploy Relay  │  │(passphrase│
│   via safeStorage│      │  ciphertext only    │  │ -wrapped  │
│  )               │      └─────────────────────┘  │ in IDB)   │
└──────────────────┘                                └─────────┘
                              │      │
                              ▼      ▼
                      Deno KV blobs    WebSocket "doorbell"
                      ['v', vaultId,   notifying other devices
                       res, id, vN]    of new versions
```

## Components

### Pure-logic libs (`lib/sync*.js`)

| File | Lines | Purpose |
|---|---|---|
| `lib/syncCrypto.js` | ~470 | Vault key gen, AES-GCM envelope encrypt/decrypt, HKDF sub-keys, HMAC tag hashing, QR pair packet, vault key wrap, binary-blob encryption (attachments) |
| `lib/syncAuth.js` | ~85 | HMAC auth proof generator, headers builder |
| `lib/syncQueue.js` | ~390 | Push queue with debounce, retry/backoff, persistence, coalescing, rate-limit handling |
| `lib/syncDiff.js` | ~150 | Compute upserts/tombstones/manifest changes between two pages snapshots |
| `lib/syncPull.js` | ~270 | Pull from server, decrypt, apply with latest-wins + version-history fallback + quarantine |
| `lib/syncAttachments.js` | ~180 | Attachment push/pull, content-addressed dedup, attachment-ID extraction |
| `lib/syncVersions.js` | ~150 | Server-side version history fetch + decrypt |
| `lib/vaultStorage.js` | ~520 | Vault metadata storage with pluggable backend (Electron IPC / IndexedDB / memory). Two-phase commit re-key flow. adoptVault for QR-pair adoption. |
| `lib/backupSchedule.js` | ~140 | Backup schedule logic (off/daily/weekly/monthly), retention math, due check |
| `lib/backupPassphrase.js` | ~150 | Backup passphrase storage (Electron safeStorage / PWA localStorage XOR-obfuscated) |

### React hooks (`hooks/use*.js`)

| File | Purpose |
|---|---|
| `hooks/useSyncQueue.js` | Composes vaultStorage + syncQueue + syncDiff + syncPull + syncAttachments + syncVersions. Single hook used by RichTextEditor. |
| `hooks/useAutoBackup.js` | Schedule sweep, encrypts + writes `.dashpack` files via Electron IPC or browser download |

### UI components (`components/*.js`)

| File | Purpose |
|---|---|
| `components/SyncSettingsPanel.js` | Master sync settings — toggle, devices list, status, advanced (lock, purge, disable) |
| `components/PairDeviceModal.js` | Host: QR code + 6-digit pair code + 60s countdown |
| `components/AcceptPairModal.js` | Guest: paste pair link + type code |
| `components/SyncPassphraseModal.js` | Reusable passphrase prompt (setup / unlock modes) |
| `components/SyncStatusIndicator.js` | Footer chip showing sync status |
| `components/TrashModal.js` | 30-day Trash with restore + permanently delete + empty all |
| `components/BackupSettingsModal.js` | Backup schedule + folder + retention + Export now |
| `components/VersionHistoryModal.js` | Existing modal extended with "On this device" / "All devices" tab |

### Server (`server/sync.ts`, `server/relay.ts`)

Deno Deploy relay extended from existing share-link / live-session
infrastructure. 13 endpoints under `/sync/*`:

```
POST   /sync/vault/register
POST   /sync/push
GET    /sync/pull?since=N&limit=K
GET    /sync/note/:noteId/versions
GET    /sync/note/:noteId/version/:version
DELETE /sync/note/:noteId
POST   /sync/attachment/:attachmentId
GET    /sync/attachment/:attachmentId
WS     /sync/ws/:vaultId
POST   /sync/vault/purge
GET    /sync/vault/purge-token
DELETE /sync/vault/devices/:deviceId
GET    /sync/vault/index
```

Server tests: `cd server && deno test --allow-net --allow-read --allow-env --unstable-kv sync-tests.ts` → 38 tests, 0 fail.

## Crypto

### Vault key

256-bit CSPRNG-generated value. Lives only in memory at runtime; on disk
it's wrapped under one of three methods:

| Method | Where | When |
|---|---|---|
| `safe-storage` | OS keychain (Electron `safeStorage` IPC) | Default on desktop |
| `passphrase` | PBKDF2-600k-derived AES key, base64 in localStorage / IDB | PWA / browser |
| `app-lock` | Wrapped under app-lock-derived AES key | Desktop with app lock enabled |

Two-phase commit re-key: on app-lock password change, vault key is
decrypted with old key, re-encrypted under new key into a temp slot,
verified, then atomically swapped. Failure leaves original wrapping
untouched.

### Envelope encryption

Every push to the relay is an envelope:

```js
{
  schemaVersion: 1,
  envelopeType: "note" | "tombstone" | "folder" | "tag" | "meta" | "attachment",
  resourceId: string,
  payload: <type-specific>,
  timestamp: number,        // client clock
  authorDeviceId: string,
  parentVersion: number | null
}
```

Compressed with **gzip** (`CompressionStream`) before encryption — Editor.js
block JSON is highly redundant (repeated keys, whitespace, span markers)
and compresses 5–10×. Required to fit large notes under Deno KV's hard
**64 KB per-value cap**: each envelope is one KV entry, so larger notes
would otherwise be rejected with 413. Compression-then-encryption is the
correct order; encrypted bytes are high-entropy and don't compress.

Encrypted with `AES-GCM-256` directly under the vault key (no PBKDF2 —
the key is already random). Wire format: `{ v: 2, cipher: 'AES-GCM-256',
iv: [12 bytes], data: [ciphertext + GCM tag] }` JSON-serialized then
base64'd into the HTTP body. `v: 1` envelopes (no gzip layer) are still
decryptable for backwards compatibility — the decrypt path branches on
`payload.v`.

### Auth proofs

```
X-Vault-Id:  <opaque UUID>
X-Device-Id: <opaque UUID>
X-Timestamp: <unix-ms>
X-Auth:      HMAC-SHA256(deriveAuthKey(vaultKey), "${vaultId}\n${deviceId}\n${timestamp}\n${method}\n${path}")
```

Server cannot verify the HMAC (no vault key) — that's by design. The
proof binds {vault, device, timestamp, method, path}; server uses it as
a session-token-shaped value for replay protection (5-minute nonce TTL,
±5-minute timestamp window).

### Tag-name privacy

Tag names are sensitive (might contain "diary", "therapy", "health"
names). HMAC-SHA256 the tag name under an HKDF-derived sub-key,
truncate to 16 bytes hex → opaque server-side resource ID. Different
vaults with the same tag name produce different hashes; server can't
correlate.

## Pair flow

### Existing device (host)

1. Settings → Sync → "Add device" → opens `PairDeviceModal`.
2. Modal generates a fresh 6-digit pair code via CSPRNG.
3. Modal builds a packet: `{ vaultId, vaultKey: number[], relayUrl, pairedDevices }`.
4. Encrypts the packet under the pair code (PBKDF2-100k, matching
   share-link strength — pair window is short, single-use).
5. QR-encodes the encrypted packet as `dash-pair:<base64url>`.
6. Displays QR + code + 60s countdown.

### New device (guest)

1. Settings → Sync → "I have another device" → opens `AcceptPairModal`.
2. User pastes the pair link or scans the QR (camera scanning future).
3. User types the 6-digit code.
4. `decryptPairPacket` → recovers `{ vaultId, vaultKey, relayUrl }`.
5. `useSyncQueue.adoptVault` runs:
   - Mints fresh deviceId for this device.
   - Wraps vault key under chosen method (safe-storage on Electron,
     passphrase on PWA via `SyncPassphraseModal`).
   - Persists vault metadata to disk.
   - `POST /sync/vault/register` to relay.
   - Initial pull to fetch all existing notes from the vault.

Pair window expires in 60s. New code on demand. Wrong code → friendly
"That code didn't work" error; no leak.

## Save → push pipeline

```
[user types]
   ↓ Editor.js debounces 300ms
onChangeRef.current(content, pageId)
   ↓
usePagesManager.savePage(content, pageId)
   ↓ (validates, sanitizes, sets pagesRef.current)
savePagesToStorage(newPages)        ← debounced 150ms
   ↓
processSaveQueue → executeSave(pagesToSave, version)
   ↓
preparePagesForStorage (encrypts under app-lock key if engaged)
   ↓
electron-main.js save-pages IPC → atomic disk write
   ↓
[NEW: Phase 2.4] window.__syncEnqueueChangedPages(prev, next)
   ↓ (only when SYNC_ENABLED + vault unlocked + canPush)
useSyncQueue.enqueueChangedPages
   ↓ diffPages
   ├─ for each upserted note    → syncQueue.enqueue(note envelope)
   ├─ for each new attachmentId → pushAttachmentInBackground (fire-and-forget)
   ├─ for each tombstone        → syncQueue.enqueue(tombstone envelope)
   ├─ for each upserted folder  → syncQueue.enqueue(folder envelope)
   └─ if manifestChanged        → syncQueue.enqueue(meta/manifest envelope)
   ↓ (debounced 2s)
syncQueue.flush
   ↓ encryptEnvelope per entry
POST /sync/push (batch up to 50 envelopes / 200 KB)
   ↓
server stores immutable versions in Deno KV
   ↓
WebSocket broadcast to other devices in this vault: {type:'new-version', resourceType, resourceId, version}
```

## Pull pipeline

Triggers (in priority order):
1. **App focus / `visibilitychange`** — `useSyncQueue` listens on
   `window.focus` and `document.visibilitychange` and pulls when the tab
   comes back to foreground.
2. **10s poll while sync is unlocked** — interval timer in `useSyncQueue`
   fires `pull()` every 10 seconds. Skipped if vault is locked or sync
   disabled.
3. **App unlock** — pull is also re-triggered after unlock, since the
   vault key only becomes available then.
4. **Manual "Sync now"** — user tap from settings panel.
5. *(planned)* **WebSocket "new-version" doorbell** — instant push from
   server when peers commit new versions. Implementation deferred —
   `/sync/ws/:vaultId` endpoint exists server-side but the client
   subscriber isn't wired yet. The 10s poll is the current substitute.

```
GET /sync/pull?since=cursorVersion&limit=100
   ↓ for each envelope:
     ↓ base64-decode → JSON-parse encrypted-envelope → decryptEnvelope
     ↓ decryption-failed → quarantine list (NEVER overwrites local plaintext)
applyPulledChanges(currentPages, decrypted, options):
   ↓ for note envelope:
     - existing && incoming.timestamp > existing.lastEdited → captureVersion(existing.blocks); replace
     - existing && incoming.timestamp <= existing.lastEdited → drop (cursor still bumps)
     - !existing                                              → insert
     - existing.trashed && !incoming.trashed                  → resurrect-on-edit
   ↓ for tombstone envelope:
     - mark { trashed: true, trashedAt, trashedBy }
   ↓ for meta (manifest) envelope:
     - return separately for caller to apply (folder structure / sort order / tag map)
applyRemoteChanges(newPages, manifest)
   ↓ pullMissingAttachments(appliedPages):
     - for each attachment ID not in local store, GET /sync/attachment/:id, decrypt, save
```

## Data-loss prevention layers

The hard constraint from project requirements: "absolutely no chance of
data loss." Ten independent defenses:

1. **Local atomic writes (existing)** — backup → temp → rename. Never
   touched by sync; sync runs after local save succeeds.
2. **Server stores immutable versions** — every push = new KV entry.
   Last 30 versions per note retained; never overwrites.
3. **Synced version history** — when pull replaces a local edit, the
   loser is captured into local version history first via
   `lib/versionStorage.captureVersion`.
4. **Tombstones, not hard deletes** — soft-delete via Trash, 30-day
   retention, then permanent + tombstone envelope.
5. **Decryption failure → quarantine** — never overwrites local
   plaintext on a decrypt failure.
6. **Network/server failure → retry queue** — persistent queue, exp
   backoff (1s, 2s, 4s, 8s, max 60s).
7. **Auto `.dashpack` backup** — independent of sync, weekly default,
   keep last 12. Survives total device loss as long as user keeps
   backup file or has it in iCloud Drive / Dropbox / similar.
8. **Self-destruct propagation** — `selfDestructAt` field syncs as part
   of normal note upsert. Each device's local timer fires at expiry.
9. **Quota errors don't stop local save** — 413 vault-full surfaces a
   banner; local save still succeeds.
10. **Versioned schema** — `schemaVersion: 1` in every envelope. Future
    versions surface "Update Dash to read this note" instead of crashing
    or corrupting.

## Free-tier limits

| Resource | Free | Why |
|---|---|---|
| Vault storage | 500 MB | Generous for ~50k text notes + moderate attachments |
| Notes per vault | unlimited | Just storage cap |
| Server-side versions per note | 30 | Generous restore window |
| Attachment max | 10 MB each | Existing app limit |
| Devices per vault | 10 | Plenty for personal use |
| Trash retention | 30 days fixed | Plan-confirmed |
| Push rate | 60/min/vault, 30/min/device | Soft caps |

## Duress mode interaction

When duress password is entered (existing decoy-vault flow):

```javascript
// Existing duress flow — unchanged
savesBlockedRef.current = true
appLockKeyRef.current = null
encryptionKeysRef.current.clear()

// NEW: silent sync disconnect (Phase 2.4)
vaultKeyRef.current = null      // No sync key → no outgoing pushes
syncQueue.clear()                // Drop pending push queue
syncWebSocket?.close()           // Close any active sync socket
```

Coercer experience: sees decoy vault, can edit decoy notes, no sync UI
activity, no devices visible. Other paired devices unaware — they
continue normal sync; their pushes accumulate at server until real
unlock.

## Bugs found during implementation

10 bugs caught + fixed during the 14 commits. Full record in plan file
(`/Users/ollie/.claude/plans/q1-one-vault-q2-crispy-book.md`,
"Bugs found during implementation" section). All pre-existing or
test-harness related; zero production regressions; existing tests still
100% pass.

## Testing locally

### Node tests (client-side logic)

```bash
npm test
# → 71 suites / 336 subtests / 0 fail
```

### Deno tests (server-side endpoints)

```bash
cd server
deno test --allow-net --allow-read --allow-env --unstable-kv sync-tests.ts
# → 38 tests / 0 fail
```

### Live integration test

1. Flip `SYNC_ENABLED = true` in `components/RichTextEditor.js`.
2. Start local relay: `cd server && deno run --allow-net --allow-env --unstable-kv relay.ts`
3. Set `NEXT_PUBLIC_RELAY_URL=ws://localhost:8000` in `.env.local`.
4. `npm run dev` (PWA) or `npm run electron-dev` (desktop).
5. Settings → Sync → set up vault.
6. Open another browser profile / device, paste the pair link, enter code.
7. Edit on one device, watch the other update within ~5s.

## Phase 2.11 — open items

Nice-to-haves not blocking alpha:

- Toast notifications for failed purge/revoke (currently `console.warn`).
- Re-key vault after device revoke (Phase 2.5+ enhancement per plan).
- App-lock keyWrapMethod unlock flow (joint test with app-lock).
- **iOS Keychain + biometric for vault key**, replacing the passphrase
  wrap method on iPhone. Today the user retypes their passphrase on
  every cold launch; ideal UX is Keychain-backed unwrap gated by Face
  ID / Touch ID, mirroring the Electron `safeStorage` flow. Needs a
  Capacitor Keychain plugin (e.g. `capacitor-secure-storage-plugin`).
- **WebSocket doorbell** to replace the 10s polling pull — instant
  cross-device updates. Server endpoint exists; client subscriber
  deferred.

## Phase 2.13 — pair-flow regressions caught in second test session

Hunted under live Mac↔iPhone Simulator iteration. All fixed:

- **iOS adoption now works end-to-end.** Required `keyWrapMethod: 'ios-keychain'`
  to be added to `validateMetadata`'s allowlist (was rejecting saves
  with `"vault metadata: invalid keyWrapMethod ios-keychain"` after
  `store.adoptVault` succeeded).
- **Static ESM imports for Capacitor plugins** — `await import(...)`
  chunks 404 on Capacitor iOS where the WebView serves from
  `http://localhost`. `import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'`
  at the top of `lib/vaultStorage.js` puts the binding in the main bundle.
- **`pagesRef.current` typo** in RichTextEditor's `onPaired` (correct
  name is `syncPagesRef.current`) — silently threw a ReferenceError
  inside the async handler, so the merge prompt and `adoptVault` never
  ran. Merge prompt now opens and `[adoptVault] start` reaches the relay
  log.
- **ConfirmModal hidden behind SyncSettingsPanel** — both sat at `z-50`,
  ConfirmModal earlier in JSX so source order put it under. Bumped to
  `z-[200]`. User now sees the "Add your local notes to this vault?"
  prompt instead of being snapped back to disabled state.
- **Initial-pull / initial-push race**: parallel `setTimeout(0)` for
  pull and merge-push meant the push's manifest envelope went out with
  ONLY the guest's 2 local pages (pull hadn't returned yet). Host's
  next pull obeyed that manifest and silently truncated 28 pages to 2.
  Fix: a single async `setTimeout` that `await`s the initial pull
  before kicking off the merge push.
- **Biometric Face ID gate reverted** — `@aparajita/capacitor-biometric-auth`
  introduced pair-flow stalls on Simulator. Plugin install + Podfile
  changes left in (deferred feature), but the runtime path no longer
  prompts. Reintroduce after sync is stable across devices.

## Phase 2.12 — fixes that landed during first end-to-end test

Surfaced while running Mac (Electron) ↔ iPhone Simulator (Capacitor)
against the local Deno relay:

- **Capacitor `iosScheme: 'http'`**: WKWebView serves the bundle from
  `capacitor://localhost` by default — a secure origin that blocks
  `ws://localhost:8000` as mixed content. Switching iOS to the `http`
  scheme makes the WebSocket same-scheme. (`capacitor.config.ts`.)
- **Auto-unlock on init for `safe-storage` wrap**: vault key is in OS
  keychain on Electron, so we unwrap silently at hook init instead of
  prompting. Without this, the queue's `enqueueChangedPages` early-
  exited on `unlocked: false` after every restart / Fast Refresh.
- **Stable queue effect**: gate callbacks (`isAppLocked`,
  `duressActive`) are now read through refs so the queue useEffect
  doesn't tear down + rebuild on every parent render — the rebuild
  cleared the 2 s flush debounce timer before it could fire.
- **Initial-push on enable / adopt**: `enableSync` and `adoptVault` now
  enqueue `pagesRef.current` against an empty baseline so existing
  notes flow to the new vault immediately, without requiring the user
  to type a character to trigger a save.
- **Periodic pull**: 10 s interval + focus listener in `useSyncQueue` —
  the docs already promised this; now actually wired.
- **Diff baseline reset on enable / adopt / disable**: clears
  `lastSyncedSnapshotRef` AND `window.__syncLastSnapshot`. Stale
  baseline from a prior vault was making subsequent enables see "no
  changes" and silently skip the push.
- **Persist write serialization**: 21 concurrent enqueues raced into
  the Electron `save-sync-queue` IPC's atomic `.tmp → .json` rename;
  second rename failed with ENOENT. Now writes chain through a single
  promise with coalesced "pending" flag.
- **gzip envelope payloads**: see Crypto section. Required for notes
  bigger than ~50 KB plaintext.
- **`detectDeviceName()` helper**: deviceName was hardcoded to "This
  device" on PWA / Capacitor — peers showed the literal string instead
  of "iPhone" / "iPad". Now detects via `Capacitor.getPlatform()` →
  Electron platform flags → user-agent.
- **PairDeviceModal stability**: `vaultPacket` was recreated on every
  parent render (the accessor returns a fresh object); useEffect dep
  on it was regenerating the pair code many times per second. Captured
  once at modal open.
- **PairDeviceModal pair-completion state**: when the guest registers,
  the host modal now polls `/sync/vault/index` every 2 s and flips to
  a "[deviceName] paired ✓" state instead of silently expiring.
- **Editor.js popover bottom-sheet on mobile**: `.ce-popover--opened`
  + `.ce-inline-toolbar--showed` styled as ActionSheet-shaped sheets
  with backdrop rendered via `box-shadow: 0 0 0 100vmax …` (lives in
  the popover's own stacking context, immune to ancestor transforms
  that broke the prior `body::after` backdrop pattern).
- **Folder expand on iOS**: `toggleExpand` now guards
  `e?.stopPropagation?.()` — `useLongPress` invokes its onClick
  callback without an event argument on touch end, which crashed the
  prior `e.stopPropagation()` call and silently swallowed every tap.

## Future phases (not in scope)

- **Phase 4:** Multi-user shared vaults ("share folder with my partner").
- **Phase 5:** Re-enable live-collab (existing `LIVE_SESSIONS_ENABLED`-gated code).
- **Phase 6:** True CRDT character-level merge.
