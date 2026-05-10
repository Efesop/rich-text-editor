# Sync edge cases — verified behavior + open questions

Notes on how Dash sync handles disable / delete / re-pair flows. Verified against
[`hooks/useSyncQueue.js`](../hooks/useSyncQueue.js), [`lib/syncPull.js`](../lib/syncPull.js),
and [`lib/vaultStorage.js`](../lib/vaultStorage.js) — May 2026.

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
([`useSyncQueue.js:297-303`](../hooks/useSyncQueue.js#L297)). The peer's pull
applies the tombstone via [`syncPull.js:275-298`](../lib/syncPull.js#L275),
marking the page `trashed: true` with `trashedAt` and `trashedBy` set. Both
devices end up with the page in Trash. Either side can restore within 30 days.
Version history is captured before the tombstone is applied so prior content
isn't lost.

## Q4 — Stop sync, delete locally, then re-pair. Does the deleted file come back?

**Depends on timestamps — there is a guard but the outcome is not always what
the user expects.**

- After local disable, the server vault still holds the alive copy of the page
  (no tombstone was ever pushed because the user disabled first).
- Re-pair → `adoptVault` → initial pull. Server sends the alive payload.
- The pull logic at [`syncPull.js:324-337`](../lib/syncPull.js#L324) has an
  explicit guard:

  > **Resurrect-on-edit ONLY when the incoming payload is genuinely newer than
  > the local trash action.**

  - If `existing.trashedAt > env.payloadTimestamp` → keep the tombstone, drop
    the pull. ✅ User's delete intent honored.
  - If `env.payloadTimestamp > existing.trashedAt` (the other device kept
    editing post-disable) → resurrect the page in Trash → out of Trash. ⚠ UX
    is defensible (their newer edits beat your old delete) but may surprise
    users who don't have that mental model.

- If `mergeLocalPages: true` was passed at adopt time, the locally-trashed
  page ALSO gets pushed up (as a regular note envelope with `trashed: true`),
  which then gets cleaned up by the next tombstone round-trip. Worth a manual
  test to confirm convergence.

## Q5 — Both devices disable. Does the server vault stick around?

Server-side purge is implemented (phase 2.10b, `/sync/vault/purge` endpoint).
A `disableSync` call best-effort-revokes only THIS device on the relay
([`useSyncQueue.js:794-804`](../hooks/useSyncQueue.js#L794)). It does NOT
purge the vault. Vault stays alive on the relay until either:

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
4. **Stale-resurrect guard (Q4 case).** Pair, sync, disable on device 1.
   On device 1, delete page D (now in local Trash, no tombstone published).
   On device 2, edit page D → save (newer payload). Re-pair (device 1
   adopts via packet from device 2). Inspect device 1's Trash: page D
   should be RESURRECTED (incoming newer than trash). Document this as
   intended behavior.
5. **Server vault persistence.** Both disable. Wait. Re-pair just one device.
   Confirm vault state is recoverable (or, if vacuumed, that fresh-vault
   path works cleanly).

## Pre-ship desktop checklist (sync-related)

- [ ] `.github/workflows/build-and-release.yml` — add
      `NEXT_PUBLIC_RELAY_URL=wss://dash-relay.efesop.deno.net` to the
      Electron build env block.
- [ ] `.github/workflows/deploy-pwa.yml` — same env var.
- [ ] Decide whether `SYNC_ENABLED` stays hardcoded `true` or moves behind
      an env flag for staged rollout.
- [ ] Run all five manual tests above.

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
