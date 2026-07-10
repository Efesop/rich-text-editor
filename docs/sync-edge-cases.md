# Sync edge cases — verified behavior + open questions

Notes on how Dash sync handles disable / delete / re-pair flows. Verified against
[`hooks/useSyncQueue.js`](../hooks/useSyncQueue.js), [`lib/syncPull.js`](../lib/syncPull.js),
and [`lib/vaultStorage.js`](../lib/vaultStorage.js) — originally May 2026, **Q4 +
citations updated July 2026** (the resurrect guard changed from timestamp-based to
explicit-signal; some file:line citations had drifted).

## Q1 — Both devices stop sync. Do they keep all synced files?

**Yes.** `disableSync()` in [`lib/vaultStorage.js:521`](../lib/vaultStorage.js#L521)
only wipes the in-memory `vaultKeyBytes` + cached metadata via `backend.clear()`.
Page data lives in the platform's regular store (Electron JSON files / IndexedDB
on PWA / iOS) and is untouched. Both devices keep their full local set.

## Q2 — After stopping sync, are deletes local-only?

**Yes.** With metadata cleared, there is no `vaultStoreRef` → no queue → no push.
Deletions go to the local Trash (30-day retention) with no tombstone published.
The other device sees nothing.

## Q3 — While still synced, one device deletes a page. What happens on the other?

**Tombstone propagates.** `enqueuePageChanges` emits
`{ resourceType: 'tombstone', resourceId, payload: { tombstoned: true } }`
([`useSyncQueue.js` ~L318-323](../hooks/useSyncQueue.js#L318)). The peer's pull
applies the tombstone via [`syncPull.js` ~L288-313](../lib/syncPull.js#L288),
marking the page `trashed: true` with `trashedAt` and `trashedBy` set. Both
devices end up with the page in Trash. Either side can restore within 30 days.
Version history is captured before the tombstone is applied so prior content
isn't lost.

## Q4 — Stop sync, delete locally, then re-pair. Does the deleted file come back?

**No — the deleted page stays deleted unless it is EXPLICITLY restored.** (This
changed in v1.5: the old behavior was timestamp-based; it was replaced because
of a real user-reported bug, "I keep deleting pages and they come back.")

- After local disable, the server vault still holds the alive copy of the page
  (no tombstone was ever pushed because the user disabled first).
- Re-pair → `adoptVault` → initial pull. Server sends the alive payload.
- The pull logic at [`syncPull.js` ~L365-388](../lib/syncPull.js#L365) now
  requires an **explicit restore signal** to un-trash a locally-trashed page:

  > Resurrection requires `incoming.restoredAt` (set only by an explicit
  > "restore" action). Anything else — an autosave, an edit, a blocks change,
  > even a newer `payloadTimestamp` — is treated as a stale edit: **the local
  > trash is kept and the incoming envelope is dropped.**

  - Incoming has no `restoredAt` → keep the tombstone. ✅ Delete intent honored,
    even if the other device kept editing post-disable.
  - Incoming has `restoredAt` (peer explicitly restored the page) → un-trash.
    ✅ Explicit restore intent honored.

- Net effect: re-pairing after a local delete does NOT resurrect the page just
  because a peer edited it. (The old timestamp-based guard is gone.)

## Q5 — Both devices disable. Does the server vault stick around?

Server-side purge is implemented (phase 2.10b, `/sync/vault/purge` endpoint).
A `disableSync` call best-effort-revokes only THIS device on the relay
([`useSyncQueue.js` ~L914-935, revoke ~L922-931](../hooks/useSyncQueue.js#L914)).
It does NOT purge the vault. Vault stays alive on the relay until either:

- A user explicitly hits "Delete cloud copy" (purge-token flow), OR
- The server's inactive-vault sweep collects it (`purgeInactiveVaults` in
  [`server/sync.ts`](../server/sync.ts)).

So if both devices disable and one later re-pairs alone, the vault may still
be there with all old state — **last-writer-wins reconciliation applies**.
Worth documenting in user-facing copy ("disable = stop syncing locally; data
stays in the cloud until you purge").

## Manual test plan (recommended before shipping desktop sync)

Run on two devices (Electron-prod + TestFlight build):

1. **Disable parity.** Pair, sync 5 pages, disable on both. Confirm both
   keep all 5 pages locally.
2. **Local-only deletes after disable.** From step 1, delete page A on
   device 1, page B on device 2. Confirm Trash on each device only contains
   what THAT device deleted.
3. **Live tombstone propagation.** Re-pair. On device 1, delete page C.
   Confirm device 2's Trash receives it within ~5s. Restore from device 2,
   confirm device 1 sees it un-trashed.
4. **Explicit-signal resurrect guard (Q4 case).** Pair, sync, disable on
   device 1. On device 1, delete page D (now in local Trash, no tombstone
   published). On device 2, edit page D → save (newer payload, but NOT an
   explicit restore). Re-pair (device 1 adopts via packet from device 2).
   Inspect device 1's Trash: page D must STAY TRASHED (a mere edit does not
   set `restoredAt`, so the local trash is kept). Then, on device 2,
   explicitly Restore page D and re-sync: now device 1 should un-trash it.
5. **Server vault persistence.** Both disable. Wait. Re-pair just one device.
   Confirm vault state is recoverable (or, if vacuumed, that fresh-vault
   path works cleanly).

## Pre-ship desktop checklist (sync-related)

- [x] `.github/workflows/build-and-release.yml` — sets
      `NEXT_PUBLIC_RELAY_URL=wss://dash-relay.efesop.deno.net` in the
      Electron build env block. **Done.**
- [x] `.github/workflows/deploy-pwa.yml` — same env var. **Done.**
- [x] `SYNC_ENABLED` decision: shipped hardcoded `true` (sync is the paid
      headline feature; no env flag).
- [ ] Run all five manual tests above (esp. #4 — the updated explicit-signal
      resurrect guard).

## Stop sync semantics (May 2026 rewrite — supersedes Q1/Q2 above)

The "Stop sync" button in `SyncSettingsPanel` now does ONE thing in ONE tap:

1. Calls `disableSync()` which DELETEs `/sync/vault/devices/{selfDeviceId}`.
2. The server-side handler ([`server/sync.ts:handleRevokeDevice`](../server/sync.ts))
   now allows self-revoke. If the leaving device is the LAST paired device, the
   vault is purged inline (all `['v', vaultId, ...]` and `['vault', vaultId, ...]`
   entries deleted). Frees the per-IP lifetime quota immediately.
3. Local metadata wiped on the calling device.

Implications for prior Q1–Q5 behaviors:

- **Q1 (both stop sync, both keep local)** — still true; only metadata + vault key
  are touched on the calling device. Pages stay.
- **Q4 (stop + delete + re-pair = stale resurrect risk)** — partially mitigated.
  When the LAST device leaves, the cloud vault is purged, so a future re-pair
  starts a fresh vault (no stale state to resurrect from). If only ONE of two
  devices leaves, the cloud copy persists as before.
- **Q5 (vault stays after disable until purge)** — only true for multi-device
  vaults. Single-device disable now purges automatically.

The old "Disable here only" / "Disable everywhere + delete cloud" two-button
flow has been removed. Manual purge while peers are still paired requires
revoking each peer first (or hitting the now-internal `purgeCloud` action,
which is no longer wired to UI).

## Lock vault — removed from UI (May 2026)

The user-facing "Lock vault now" button in Advanced has been removed.
`useSyncQueue.lockVault` still exists and is used internally when app-lock
engages (sync auto-pauses, vault key wiped from memory). Manual lock was
unused dead weight.
