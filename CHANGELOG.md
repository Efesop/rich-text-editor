# Changelog

All notable changes to Dash will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.4] - 2026-09-06

### Fixed
- **Release pipeline.** electron-builder was importing the signing
  certificate into a second, temporary keychain on top of the one the
  workflow prepares, and that step began failing on GitHub's macOS runners
  (v1.5.2 and v1.5.3 were tagged but never published). The builder now signs
  with the keychain the workflow already set up. 1.5.4 is the first Mac
  build carrying the 1.5.2 and 1.5.3 changes below.


### Fixed
- **iPhone subscribers were steered into paying twice.** The Mac asked for
  the "email on your subscription" (an App Store plan has none) and its
  no-plan card led with "Start 7-day free trial". The sign-in dialog now says
  any email works for phone subscribers and the Mac inherits the phone's plan
  by pairing; the no-plan cards say "Paying on your iPhone already? Don't
  subscribe again" and point at Add device / Enter a sync code. Showing the
  pairing QR is purely local, so it is no longer gated on having a plan.

## [1.5.2] - 2026-09-06

### Fixed
- **A Mac can now join the vault its iPhone paid for.** With the relay
  treating a subscription as covering the whole vault, "Enter a sync code"
  no longer requires a plan on the Mac's own email first — the relay decides,
  and the Mac inherits the phone's plan the moment it joins. Phone-first
  subscribers were previously sent to checkout instead.

## [1.5.1] - 2026-09-06 (Mac DMG; web live)

### Fixed
- **Sync: "pull unknown (HTTP 402)" after signing in.** The relay answers 402
  when the signed-in email has no active Dash Sync plan. The clients now map
  that to `subscription-required`: the queue pauses instead of retrying, the
  panel shows "Sync is paused — No Dash Sync plan on this email yet" with
  Start free trial / Refresh / Sign out, and sync resumes by itself the moment
  the plan is active.
- **Sync kept asking for the email again.** The gate treated "signed in, no
  plan" like "not signed in" and re-opened the sign-in form. It now sends a
  signed-in user to checkout instead.

- **Relay: an App Store subscription now unlocks the Mac (and web).** A plan
  bought on iPhone is stored under the phone's RevenueCat id; the Mac signs in
  by email; nothing connected the two, so iPhone subscribers got 402 on Mac
  forever. The relay now treats a subscription as covering the whole vault
  (any device in it passes the gate) and links the signed-in email to the
  App Store plan the first time both identities arrive together. A signed
  support endpoint (`POST /entitlements/link-ios-email`,
  `ENTITLEMENT_SUPPORT_SECRET`) links an account by hand until the iOS app
  gains a sign-in screen. Server-side only; no app update needed.

### Changed
- **Clearer sync wording.** The sign-in dialog explains why it asks for an
  email (a subscription check only; notes never travel by email and are
  encrypted before they leave the device). "28 pending" reads "28 notes ready
  to upload" with the reason they're waiting; "Add device" is "Add my phone or
  another computer" with a line on how the QR pairing hands the key over;
  "Stop sync" is "Turn off sync" and says it keeps every note on the device.
  Mockups: https://claude.ai/code/artifact/6b177f21-4b09-442c-bb78-6db54ab6ce6e

## [1.5.0] - 2026-05-13 (iOS App Store build 75, live; Mac DMG not yet tag-released)

Sync subscription release. First submitted to Apple on May 13 (build 55);
the iOS binary went through several App Store review cycles (builds 56–70,
May–Jul 2026) resolving the in-app-purchase flow before acceptance — see
"Fixed — App Store review cycle" below. The Mac desktop DMG for 1.5.0 has
not been tag-released yet (`git tag v1.5.0` from the launch sequence is still
pending; the latest git tag is `v1.3.165`).

Sync now requires a $4.99/mo or $47.99/yr
Dash Sync subscription on every platform (7-day free trial). The Mac
desktop $14.99 one-time purchase is unchanged and unaffected — it
covers the desktop app license only. Existing Mac buyers retain their
desktop app forever; sync is a new optional feature with its own
recurring fee that pays for the relay server costs.

### Added
- **Dash Sync subscription** — cross-platform recurring sub that grants
  the `sync` entitlement on every signed-in device. iOS via App Store
  IAP (RevenueCat-orchestrated), Mac/PWA/web via Stripe checkout
  through dashnote.io/subscribe. Either rail honors on every platform
  the user signs into. 7-day free trial on both monthly + yearly.
- **Magic-link sign-in (passwordless)** — email + 6-digit code via
  Resend. Used to bind a sync vault to a billing identity on Mac/PWA
  (where there's no App Store IAP to anchor to). Tokens are HMAC-signed,
  90-day TTL, stored client-side in localStorage. No passwords, no
  third-party OAuth. The relay never sees vault contents, just the
  email-to-entitlement mapping.
- **PaywallModal on iOS** — full RevenueCat paywall with yearly-first
  hierarchy, 20%-off badge on annual plan, Restore Purchases + "I
  already have an account" cross-platform sign-in entry. Anti-steering
  compliant: no mention of web pricing inside iOS UI.
- **SyncSettingsPanel paywall on Mac/PWA** — Subscribe and Sign-In CTAs
  in disabled state. Subscribe opens dashnote.io/subscribe in the
  default browser (via Electron `shell.openExternal` where available).
- **Stripe Customer Portal** for sync subs — cancel, plan switch
  (monthly ↔ yearly), update payment method, view invoices. Routed
  through a Dash-specific portal configuration so it stays isolated
  from other products in the same Stripe account (e.g. LinkJolt).
- **/subscribe page** on dashnote.io — pricing cards for monthly +
  yearly with feature checklist + trust copy (E2E encrypted, cancel
  anytime, server sees only ciphertext).
- **Sync entitlement gate** on the relay — `requireSyncEntitlement`
  middleware on every `/sync/*` endpoint. Verifies Bearer token
  (magic-link session) + the per-vault HMAC. Gated by
  `ENTITLEMENT_REQUIRED` env var (defaults `false` during review,
  flipped to `true` post-launch).

### Changed
- **iOS: Capacitor 6 → 8 upgrade** to restore the RevenueCat native pod
  (its iOS SDK requires Capacitor 8). Native API renames + Info.plist
  key updates handled via `cap migrate ios`. Requires Node 22 to run
  the migration; runtime still works on the bundled Node.
- **iOS: `@capacitor-mlkit/barcode-scanning` removed** to fix
  **ITMS-91061** (GoogleToolboxForMac framework missing a privacy
  manifest). QR pair scan on iOS now goes through the in-WebView
  camera path with `NSCameraUsageDescription` permission, no MLKit
  dependency.
- **iOS build/marketing version** → 1.5.0 / build 70 (initial submission was build 55; builds 56–70 carried App Store review fixes).
- **PaywallModal fallback prices** corrected: `$2.99 / $28.99` → `$4.99
  / $47.99`. "3-day free trial" → "7-day free trial" throughout. Plan
  option buttons always render (even before RC fetches the offering)
  so the layout stays stable on slow networks.
- **Marketing copy on dashnote.io** updated — removed "lifetime, no
  subscriptions" wording. New: "Mac desktop license — one-time $14.99.
  Optional Dash Sync — $4.99/mo for cross-device sync."
- **Privacy policy** (app + landing page) — disclose Resend
  (transactional email for sign-in codes + announcements), Stripe
  (subscription lifecycle), RevenueCat (entitlement state). All three
  receive billing identifiers only — never note content, names, or
  device IDs.
- **`hasEntitlement` on the relay** now checks 3 sources: Stripe sync
  sub, iOS RC entitlement, and Mac one-time (Mac one-time NO LONGER
  grants sync — desktop $14.99 covers the desktop app license only,
  as documented in the announcement copy).

### Fixed
- The Mac DMG download path (Stripe checkout → secure download token →
  GitHub release proxy) was refactored to live under
  `/api/download-recovery` so `/api/customer-portal` can be the real
  Stripe Billing Portal handler.

### Fixed — App Store review cycle (builds 56–70)
- **IAP paywall could load forever** — the purchase flow no longer awaits the
  Capacitor plugin proxy, and RevenueCat offerings/purchases now resolve or
  fall back within a bounded time instead of hanging.
- **Purchase success no longer gated on the entitlement boolean** — a resolved,
  non-cancelled purchase is treated as success; the `sync` entitlement (which
  can lag a few seconds after a fresh trial) is reconciled by the live listener
  and server webhook. `SyncSettingsPanel` also closes the paywall if the
  entitlement resolves after the sheet is dismissed.
- **Paywall shows a spinner in place of the price while a purchase is in flight**
  (anchored inside the tapped plan button).
- **Camera/mic crash on iOS** — added `NSCameraUsageDescription` /
  `NSMicrophoneUsageDescription`; "Take Photo or Video" previously hit a fatal
  TCC kill with no usage string.
- **iPad layout** — bottom-sheet treatment now extends to iPad (touch input,
  ≤1280px) so the slash / block menu isn't cropped above the viewport; fixed an
  iPad camera-popover anchor crash (hidden `<input type=file>` given a real
  off-screen pixel so WKWebView can anchor the picker popover).
- **Opaque bottom-sheet backgrounds** on the share sheet and four other mobile
  modals (were translucent, showing content behind); mobile block menu raised to
  88vh so all items fit; iOS status bar cleared in the Features panel header.
- **Relay CORS preflight** now allows the `X-RC-AppUserId` and `Authorization`
  headers used by the sync entitlement gate.

### Fixed — pre-DMG-release sweep (Sep 2026)
- **Desktop: trashed notes came back after every relaunch.** Electron's
  `save-pages` sanitizer whitelists page fields and was never extended when
  Trash shipped, so `trashed`, `trashedAt`, `restoredAt` and `lastEdited`
  were dropped on every save. Never reached Mac users only because desktop
  is still on 1.3.165 — the 1.5.0 DMG would have shipped it. A test now
  fails if a field the app relies on goes missing from the whitelist.
- **Desktop: a corrupt `pages.json` no longer destroys data.** Reading an
  unparseable file used to fall through to "create a fresh page and save",
  overwriting the file and copying the corrupt copy over the good `.bak`
  within milliseconds of launch. `read-pages` now recovers from `.bak`
  (keeping a `pages.json.corrupt-<timestamp>` copy and healing
  `pages.json`); if that also fails, saving is paused for the session and
  the footer shows "Storage error" instead of writing anything.
- **Desktop: one bad record no longer blocks all saves.** An empty title
  made `save-pages` throw, failing the whole save; it is coerced to
  "Untitled" instead.
- **iOS: disabling sync now wipes the vault key from the Keychain**
  (metadata was cleared, the raw key was not).
- **iOS: RevenueCat listener leak** when the entitlement hook unmounted
  while the SDK subscription was still being set up.
- **Desktop/web: the iPad camera-popover CSS fix** made hidden file inputs
  a keyboard tab stop everywhere; scoped to touch devices.
- Demo-seed tags never seeded (wrong `addTag` call shape).

### Migration notes for existing Mac $14.99 buyers
- Your desktop app keeps working forever.
- Sync is a NEW optional feature (it didn't exist when you bought).
- If you want sync, subscribe at `https://dashnote.io/subscribe`. The
  first 7 days are free.
- If you bought before May 13 2026 and want a refund for any reason,
  reach out via the support email on dashnote.io within the standard
  window.

### Risks + known issues
- Capacitor 8 plugin breakage could affect biometric-auth, keyboard, or
  splash-screen flows in ways not caught by the simulator. Watch
  TestFlight feedback for the first few days.
- Session token in localStorage has a theoretical XSS exposure, mitigated
  by strict CSP + no third-party scripts. Moves to iOS Keychain via
  Capacitor Secure Storage in v1.6.
- France excluded from IAP availability (174/175 countries) pending
  encryption export documentation filing.

## [1.4.0] - 2026-05-08

Major release: multi-device sync, Trash bin, encrypted auto-backup, iOS
native app via Capacitor.

### Added
- **Multi-device sync (opt-in, E2E encrypted)** — pair devices via QR +
  6-digit code, push/pull notes through a relay that only ever sees
  ciphertext. Vault key never leaves your devices. Supports
  attachments, version history, manifest of folders + tag colors.
  Wrap methods: macOS Keychain (Electron `safeStorage`), iOS Keychain
  (Capacitor secure storage), passphrase, app-lock-derived. Toggle in
  footer Sync chip → Sync settings. Stop on this device propagates a
  device revocation to the relay so peers see the dropout.
- **Trash bin** — soft-delete with 30-day recovery. Restore or permanent
  delete from the Trash modal. Independent of sync.
- **Encrypted auto-backup** — schedule `.dashpack` exports (encrypted
  bundle of all notes + attachments + versions) to a chosen folder.
  Passphrase-protected. Independent of sync.
- **iOS native app** — Capacitor 6 wrap, app ID `io.dashnote.app`,
  available via TestFlight. Includes mobile UI: bottom-sheet modals,
  vertical labeled inline toolbar, consolidated `MoreVertical` page
  actions menu, sync status dot, biometric page unlock via Face ID.

### Fixed
- **Manifest application on receive** — folder emojis, root-order, and
  tag colors now propagate cross-device on first pair + every pull.
- **Pull-before-push race on adopt** — guest joining a populated vault
  no longer overwrites the host's manifest with its smaller local
  set. Pull serializes before initial push.
- **Stop sync revocation** — `disableSync` revokes the device on the
  relay before clearing local state, so peers see paired-devices list
  shrink within one poll cycle.

### Security
- **Privacy manifest** (`PrivacyInfo.xcprivacy`) — declares no
  tracking, no collected data types, required-reasons API usage for
  UserDefaults + file timestamp. Required by Apple iOS 17+.
- **Debug endpoints** (`/debug/log`, `/debug/wipe`) gated on
  `!DENO_DEPLOYMENT_ID` — only mount on developer machines, never on
  Deno Deploy.

### TestFlight build 2 fixes
- **Editor `+` / `:::` popover items now register taps** — earlier we
  MutationObserver-portaled the popover to `<body>` to escape any
  transformed ancestor breaking `position: fixed`, but iOS WebKit
  drops click events on elements that get reparented mid-touch. CSS
  alone is sufficient since no popover ancestor has
  transform/filter/perspective.
- **Deleted synced pages stay deleted** — `applyPulledChanges`
  resurrect-on-edit branch now requires `incomingTs > existing.trashedAt`
  before un-trashing. Without the check, the first pull after a local
  delete pulled back the still-alive server copy (push hadn't landed
  yet) and resurrected the page.
- **Password modal won't dismiss on backdrop tap (mobile)** — iOS
  users tap above the keyboard to dismiss it; that landed on the
  modal backdrop and cancelled password entry mid-flow. X button or
  Cancel button still close.
- **Sidebar auto-closes on page select / new-page (mobile)** — was
  staying open, hiding the page user just navigated to.
- **Per-page biometric button hidden** — bypassed password check via
  Face ID/Touch ID but never derived the AES-GCM key from a stored
  password, so encrypted content stayed encrypted and the editor
  rendered blank. Will reintroduce in v1.4.1 backed by per-page
  Keychain storage (`dash-page-pwd-${pageId}`). App-lock biometric
  (whole-app unlock) still works on macOS.
- **App icon set to Dash logo** — was Capacitor placeholder grid.

## [1.3.164] - 2026-04-07

### Security
- **Save pipeline pageId pinning** — Every save now carries a `pageId` from the Editor instance that produced the content. `savePage` looks up the target page via `pagesRef.current.find(p => p.id === forPageId)` and never reads `currentPageRef`. Eliminates an entire class of cross-page save corruption bugs caused by async gaps (debounce, unmount flush, concurrent ops).
- **`pagesRef` useEffect guard** — `pagesRef` only syncs from React state before initialization; after init, all operations set it explicitly. Prevents stale React state from overwriting fresh save data.
- **Test suite** — 116 tests, 19 suites. Covers XSS, encryption schema, import safety, export escaping, URL validation, data-safety invariants, codebase static analysis, and page-switch race-condition prevention.

## [1.3.163] - 2026-04-07

### Security
- **Security audit — 12 medium-severity fixes** — Round 2 of the security audit. Includes hardening across encryption flows, sanitization edges, and import paths.

## [1.3.162] - 2026-04-06

### Security
- **Security audit — 14 critical and high-severity fixes** — Major audit pass. Magic-bytes attachment validation, RTF injection escaping, share image URL validation, brute-force lockout persisted to Electron IPC file, decoy vault key obfuscation, GitHub Actions pinned to commit SHAs, encrypted-content schema validation in `electron-main.js`, `.env` removed from Electron bundle, and more.
- **Async attachment validation** — `validateAttachment()` now reads file headers and verifies magic bytes against the declared MIME type. Callers must `await`.

## [1.3.161] - 2026-04-05

### Fixed
- **Editor toolbar clipping** — Block toolbar (+/⋮⋮ icons) no longer gets clipped behind the sidebar on narrow windows.

## [1.3.160] - 2026-03-20

### Fixed
- **Flush editor before share/export/save** — `window.__editorFlush()` is now called before share, export, and beforeunload to prevent the last ~300ms of typing from being lost.

## [1.3.159] - 2026-03-19

### Added
- **Version history** — Browse and restore previous page versions. Up to 10 versions per page, throttled to 30s minimum between captures, SHA-256 content-hash dedup. "Restore as New Page" creates a non-destructive copy with the old content. Locked pages do not capture versions; existing versions are deleted when a page is locked.

### Fixed
- **`pagesRef` as source of truth** — All ~22 page-modifying operations (delete, rename, duplicate, lock, reorder, etc.) now read from `pagesRef.current` instead of stale `prevPages` from React state. Fixes a silent data-loss bug where edits could be overwritten by structural operations performed without first navigating away.

## [1.3.158] - 2026-03-19

### Fixed
- **Attachment handling for dashpack, duplicate, and share** — Dashpack export bundles attachments as base64 via `collectAttachmentsForExport()`. Page duplicate copies attachment files with new UUIDs. Share replaces attachment blocks with `[Attachment: filename]` placeholders.

## [1.3.157] - 2026-03-19

### Added
- **File attachments (v1)** — Attach images (JPEG, PNG, GIF, WebP) and PDFs to notes via the `+` block menu. Max 10MB per file. Stored separately from page JSON: Electron uses `userData/attachments/`, PWA uses IndexedDB, browser uses localStorage base64. Page blocks store small references (`{ attachmentId, filename, mimeType, size }`).

### Fixed
- **Page unlock after app lock** — Pages no longer show empty content or wrong modal when unlocked after the app has been locked.

## [1.3.156] - 2026-03-18

### Added
- **AI panel enhancements** — Markdown preview, chat mode, keyboard shortcuts, and "Save as Note" for AI responses.

## [1.3.155] - 2026-03-17

### Added
- **Local AI integration** — On-device LLM support for Summarize, Rewrite, Continue, Explain, and Custom prompts. Works with Ollama, LM Studio, LocalAI, and Jan. Settings persisted via `store/aiStore.js`. All data stays on-device; no cloud calls.

### Changed
- **Guides + project docs updated** — Refreshed landing-page guides and project docs.

## [1.3.154] - 2026-03-17

### Added
- **Markdown table and image paste** — Paste markdown tables and image URLs and they convert to native blocks.

### Fixed
- **Share UX** — Various share-flow polish.
- **Offline error silencing** — Suppress noisy errors when offline.

## [1.3.153] - 2026-03-16

### Security
- **CSP — relay server allowed in `connect-src`** — Required for share-blob uploads.

## [1.3.152] - 2026-03-16

### Fixed
- **Relay URL wss→https conversion** — Code that uses `NEXT_PUBLIC_RELAY_URL` for HTTP requests now correctly converts `wss://` to `https://`.
- **Preserve folder emoji on save** — Folder emoji no longer stripped during save.

## [1.3.151] - 2026-03-16

### Fixed
- **Relay URL domain** — Corrected `.deno.dev` → `.deno.net` for share storage.

## [1.3.150] - 2026-03-16

### Added
- **Server-stored share links** — Optional server-stored share blobs with 30-day expiry. Encrypted client-side; the relay only stores opaque ciphertext.

## [1.3.149] - 2026-03-16

### Added
- **Deflate compression for share payloads** — Share links are smaller.

### Fixed
- **List rendering on share page** — List items now group correctly.
- **Real logo on share page**.

## [1.3.148] - 2026-03-16

### Fixed
- **Share page** — Real logo and proper list grouping.

## [1.3.147] - 2026-03-16

### Added
- **Live sessions** — Real-time collaboration via the `dash-relay` WebSocket relay (WSS-only, with `roomId` and `key` validation).
- **Share page redesign**.

### Fixed
- **Editor flush on share** — Share now flushes the editor before encrypting the snapshot.

## [1.3.146] - 2026-03-14

### Added
- **Folder rename modal with emoji picker**.
- **Auto-linkify URLs in tables**.

## [1.3.145] - 2026-03-14

### Added
- **Improved drag-and-drop** — Smoother cross-folder moves and reordering.
- **Auto-linkify table URLs**.
- **Page link icon**.

### Fixed
- **Folder badge counts**.

## [1.3.144] - 2026-03-14

### Fixed
- **Dropdown positioning for folder pages**.
- **Content loss on rapid page switch**.

## [1.3.143] - 2026-03-14

### Added
- **Micro-animations** across UI interactions.
- **Reliable undo/redo** — Replaced buggy `editorjs-undo` plugin with custom snapshot-based system (50-snapshot stack, debounced 500ms, capture-on-first-undo).

### Fixed
- **App lock save flow**.

## [1.3.142] - 2026-03-14

### Added
- **Collapsed sidebar redesign** — 3-letter squircles for pages, bare folder icon, right-side tooltips with 150ms delay.
- **Lock indicator** — Blue/green check icon for locked pages on hover.
- **Hover slide animations** — Negative-margin slide pattern that pulls tags/badges into the three-dot button space when idle and slides them left on hover.

## [1.3.141] - 2026-03-12

### Added
- **Mini-outline (table-of-contents) widget** — Auto-generated from headings.
- **Checklist paste support**.

### Fixed
- **Paragraph paste** — Various paste-handler edge cases.

## [1.3.140] - 2026-03-12

### Fixed
- **Paste queue deferred element refs**.
- **Divider styling and rename**.

## [1.3.139] - 2026-03-12

### Added
- **Cmd+click multi-block selection** — Toggle individual blocks in/out of selection.
- **Paste link preservation** — Inline links survive paste.

### Changed
- **Link styling**.

## [1.3.138] - 2026-03-12

### Fixed
- **Multi-block selection** edge cases.
- **Update error suppression**.
- **Block highlights**.

### Security
- **DOMPurify on share page**.

## [1.3.137] - 2026-03-12

### Added
- **Encrypted share links (v1)** — Generate read-only, encrypted share links. Payload encrypted client-side and embedded in the URL fragment (zero-knowledge — never sent to a server). Optional password protection.
- **EXIF stripping** on image attachments.
- **Decoy app** — Hidden via duress password.
- **Deep linking** — `dash://share#...` protocol handler.
- **Share page** at `dash-share.vercel.app`.

## [1.3.136] - 2026-03-10

### Fixed
- **Terminal (Fallout) theme CSS cleanup**.
- **Quote placeholder bug**.
- **Tag colors**.

## [1.3.135] - 2026-03-09

### Added
- **App lock indicator** — Sidebar lock icon shows when app lock is enabled.

## [1.3.134] - 2026-03-09

### Fixed
- **Save flicker loop**.
- **Self-destruct timer loss**.
- **DarkBlue theme color tweaks**.

## [1.3.133] - 2026-03-09

### Fixed
- **Seed phrase blur toggle**.
- **Quote/table/wiki-link theming**.
- **Save flicker**.

## [1.3.132] - 2026-03-08

### Fixed
- **Duress recovery without restart** — Re-entering the real password restores hidden state without needing to restart the app.
- **Tags clear correctly on duress hide**.
- **Features panel re-ordering**.

## [1.3.131] - 2026-03-08

### Security
- **CRITICAL: Duress password data-loss fix** — Wipe mode disabled in the UI (kept in code as `wipeAllPages` but unreachable from the duress flow). Hide mode now sets `savesBlockedRef = true` BEFORE clearing in-memory state, then cancels pending debounced saves and clears encryption keys. Fixes a March 2026 incident where `setPages([])` triggered a stale `pagesRef` save that destroyed both `pages.json` and `pages.json.bak`.

## [1.3.130] - 2026-03-08

### Added
- **Feature discovery panel** — Slide-over drawer with stagger-animated feature cards and looping CSS illustrations.
- **Page linking (`[[wiki links]]`)** — Type `[[` to trigger autocomplete dropdown of existing pages. Also via inline toolbar.
- **Seed phrase storage** — Editor.js block type for crypto wallet recovery phrases. 12/24-word grid with BIP-39 validation, multi-word paste, 30-second auto-clear copy, Tab/Enter nav.
- **Duress password (initial)** — Secondary password that silently triggers a panic action at the lock screen. (Wipe mode later disabled in 1.3.131.)

### Security
- **Sanitization for new block types** — `bulletListItem`, `numberedListItem`, `checklistItem`, `seedPhrase` get dedicated DOMPurify cases.
- **Page link sanitization** — `data-page-id` and `class` whitelisted on `<a>` tags.
- **Duress password validation** — Must differ from real password; disabled when app lock is off.

## [1.3.129] - 2026-03-07

### Added
- **Block drag-and-drop** within the editor.

### Fixed
- **Header hover behavior**.
- **Keyboard shortcut conflicts**.

## [1.3.128] - 2026-03-07

### Fixed
- **Typewriter scrolling centering**.
- **Focus pill idle behavior**.

## [1.3.127] - 2026-03-07

### Added
- **What's New modal** updated with focus mode features and keyboard shortcuts.

## [1.3.126] - 2026-03-07

### Added
- **Focus mode improvements** — Typewriter scrolling, paragraph dimming, session word count stats.
- **Keyboard shortcuts modal**.
- **Session stats** on focus-mode exit.

## [1.3.125] - 2026-03-06

### Fixed
- **Page lock button doing nothing when app lock was enabled**.

## [1.3.124] - 2026-03-06

### Fixed
- **Preload IPC** — Was only forwarding one argument, breaking `safe-storage-store`.

## [1.3.123] - 2026-03-06

### Fixed
- **Update button on error boundary fallback**.

## [1.3.122] - 2026-03-06

### Fixed
- **WhatsNewModal crash** — `onClose` was undefined.

## [1.3.121] - 2026-03-06

### Fixed
- **Biometric unlock regression**.
- **Modal backdrop close** — Backdrop div now has `onClick={onClose}` directly (was previously only on parent wrapper).
- **Icon tooltips** — `pointer-events-none` on lucide-react SVGs so the parent button's `title` tooltip works.

## [1.3.120] - 2026-03-06

### Security
- **Comprehensive security hardening** — Multiple defensive fixes across save flow, sanitization, and storage.

## [1.3.119] - 2026-03-05

### Added
- **Unified search & tag filter modal** — One overlay for full-text search and tag filtering.

## [1.3.118] - 2026-03-05

### Added
- **Encryption choice modal** — Pick between page-level password and app-level encryption.
- **Biometric toggle UX** improvements.

### Fixed
- **Self-destruct save race**.

## [1.3.117] - 2026-03-05

### Security
- **Real AES-256-GCM encryption for app lock** — Pages encrypted at rest under the app-lock key (PBKDF2 600K iters → AES-GCM-256). Plaintext cleared from memory on lock.

### Added
- **Encryption choice modal**.
- **SEO guides** (`guides/` directory).

## [1.3.116] - 2026-03-04

### Added
- **Self-destruct animations** — Pulse/shake/dissolve sequence on expiring notes.

### Fixed
- **Encryption badge display**.
- **Icon hover behavior**.

## [1.3.115] - 2026-03-04

### Added
- **Lock UI improvements**.
- **Custom self-destruct time** input.
- **Page lock and self-destruct icons**.

## [1.3.114] - 2026-03-04

### Fixed
- **Tag chips z-index** — Wrapped in `isolate` container to prevent leaking above modals/backdrops.

## [1.3.113] - 2026-03-04

### Changed
- **Platforms table** — README/marketing now show macOS + browser only.

## [1.3.112] - 2026-03-04

### Changed
- **README** updated for open-source project page.

## [1.3.111] - 2026-03-04

### Fixed
- **Sidebar tag display** — Compact chips for multi-tag, proper truncation, fixed-position popups (escape `overflow-hidden` ancestors).

## [1.3.110] - 2026-03-04

### Added
- **Individual list item blocks** — Bullet, numbered, and checklist items are each their own `.ce-block` (one item = one block). Custom tools: `BulletListItem`, `NumberedListItem`, `ChecklistItem` with Enter/Backspace/slash-menu support.
- **Multi-block convert menu** — Floating settings icon converts selected blocks to Text, H1, H2, H3, Bullet List, Numbered List, Checklist, Quote, or Code.
- **Block migration** — Legacy `nestedlist`/`checklist` blocks auto-migrated on load via `utils/migrateBlocks.js`.

### Fixed
- **Header toolbar alignment** — Headers use `padding-top` (not `margin-top`) so the toolbar (+/⋮⋮) aligns with header text.
- **Numbered list numbering in exports** — PDF, Markdown, Plain Text, RTF, DOCX exports include sequential numbering that resets after non-list blocks.
- **Word count includes list items**.

## [1.3.109] - 2026-03-04

### Fixed
- **Robust sidebar layout**.
- **DarkBlue +N chip**.
- **Self-destruct timer inside badge**.
- **Tag X colors**.

## [1.3.108] - 2026-03-04

### Fixed
- **Sidebar title truncation**.
- **Tag modal improvements**.
- **Folder "add new page"**.

## [1.3.107] - 2026-03-03

### Fixed
- **3-dot menu visibility**.
- **Hover contrast**.
- **Dark scrollbars**.

## [1.3.106] - 2026-03-03

### Fixed
- **Sidebar 3-dot button visibility**.
- **List conversion preserving items**.

## [1.3.105] - 2026-03-03

### Fixed
- **Sidebar icons**.
- **Lock/self-destruct UX**.
- **Export/theme button sizing**.

## [1.3.104] - 2026-03-03

### Fixed
- **Tag z-index**.
- **Sidebar cramping**.
- **Duplicate pages**.
- **Undo/redo**.
- **Multi-block convert**.
- **Selection preservation**.

## [1.3.103] - 2026-03-02

### Fixed
- **Lock dropdown clipping**.

### Added
- **Page lock and self-destruct icons** in the page header.

## [1.3.102] - 2026-03-02

### Added
- **Lock UI improvements**.
- **Custom self-destruct time**.
- **Page lock icon**.

## [1.3.101] - 2026-03-02

### Added
- **What's New modal** — Shown on first launch after each update.
- **Quick Switcher** — Cmd+P fuzzy search overlay (VS Code-style) with recent pages, arrow-key nav, character highlighting.
- **Self-destructing notes** — Set a page to auto-delete after 1 hour, 1 day, 7 days, or 30 days. Countdown badge with color shift (green → orange → red). Cancel via context menu.
- **Auto-lock with Touch ID** — Lock the app after a configurable idle timeout. Master password unlock or Touch ID on macOS. Cmd+Shift+L for instant lock.

## [1.3.100] - 2026-02-28

### Fixed
- **CI runner** — Reverted to `macos-latest` (`macos-13` deprecated).

## [1.3.99] - 2026-02-28

### Added
- **Focus mode** — Distraction-free writing with sidebar/header/footer hidden. Cmd+Shift+F to toggle.
- **Syntax-highlighted code blocks** — 22 languages.

### Fixed
- **CI build**.

## [1.3.98] - 2026-02-27

### Added
- **Frameless title bar on macOS**.

### Removed
- **Broken toggle block plugin**.

## [1.3.97] - 2026-02-27

### Fixed
- **Sidebar logo** — Use relative path so the image renders in Electron.

### Changed
- **FEATURES.md** added for landing-page reference.

## [1.3.96] - 2026-02-27

### Added
- **Editor.js improvements** — Custom undo/redo, underline, text alignment, toggle blocks (later removed).

## [1.3.95] - 2026-02-27

### Added
- **DarkBlue theme**.

### Fixed
- **Dark theme neutrals**.
- **Editor.js popovers themed correctly**.

## [1.3.94] - 2026-02-27

### Changed
- Version bump after 1.3.93 release.

## [1.3.93] - 2026-02-26

### Security
- **Encrypted locked page content with AES-256-GCM** - Locked pages now have their content encrypted on disk using AES-256-GCM with PBKDF2 key derivation (600K iterations). Previously only the password was hashed.
- **Removed unsecured API endpoint** - Deleted `/api/pages` which allowed unauthenticated read/write access.
- **Removed leaked certificate files from git tracking** - Untracked `certificate.p12` and `encoded-certificate.txt` from the repository index.
- **Tightened Content Security Policy** - Removed `https:` from `img-src` directive since the app is offline-only.
- **Persistent brute-force lockout** - Password attempt tracking now persists across page reloads via localStorage with exponential backoff (30s, 60s, 2m, 5m).

### Added
- **Move to Folder option on pages** - Pages now have a "Move to Folder" option in their dropdown menu, allowing users to move pages into folders directly from the page context menu.
- **MoveToFolderModal component** - New single-select folder picker modal with full theme support.

### Fixed
- **Removed unused html2pdf.js dependency** - Was installed but never imported. Replaced with direct jspdf dependency.

### Changed
- **Encryption key caching for auto-save** - Derived AES keys are cached in memory during editing sessions to avoid slow PBKDF2 derivation on every auto-save.
- **Backwards-compatible with legacy locked pages** - Existing locked pages without encrypted content will be encrypted on next lock/unlock cycle.

## [1.3.91] - 2026-02-23

### Fixed
- **Improved critical error display in desktop app** - Better error boundary handling for production builds.

## [1.3.90] - 2026-02-22

### Added
- **Prompt macOS users to move app to Applications folder** - Shows a friendly prompt when the app is running from outside the Applications directory.

## [1.3.89] - 2026-02-21

### Fixed
- **Centered ActionSheet modals** - ActionSheet modals now properly center and match styling of other modal components.

## [1.3.87-1.3.88] - 2026-02-20

### Added
- **Mobile UX improvements** - ActionSheet component, MobileHeaderMenu, and click-outside detection fixes for mobile devices.

## [1.3.86] - 2026-01-23

### Security
- **Fixed XSS vulnerability in data: URI handling** - Blocked data: URLs except for safe image MIME types (PNG, JPEG, GIF, WebP, BMP, ICO). SVG data URIs are fully blocked as they can contain scripts.
- **Added password brute-force protection** - Limited to 5 attempts with 30-second lockout to prevent password guessing attacks.
- **Increased PBKDF2 iterations to 600,000** - Updated from 200,000 to meet NIST 2024 security recommendations.
- **Fixed race conditions in save system** - Implemented save queue with version tracking to prevent data loss during rapid page switches.

### Fixed
- **Fixed "Use on your phone" visibility** - Now hidden on mobile/PWA but visible on desktop Electron app so users can set up mobile sync.
- **Fixed export overwriting previous backups** - Dashpack exports now include date in filename (e.g., `dash-notes-2026-01-23.dashpack`).
- **Fixed sidebar overlapping iPhone status bar** - Added safe-area-inset support for notch and status bar.
- **Fixed dropdowns appearing behind sidebar** - Increased z-index for all dropdowns to appear above sidebar on mobile.
- **Fixed production error boundary** - Errors now show user-friendly messages in production (not just development).
- **Fixed ESLint violations** - Re-enabled react-hooks/exhaustive-deps and no-unused-vars rules; fixed all violations.
- **Fixed temporary page unlock behavior** - Unlocked pages now stay unlocked during session instead of re-locking on page switch.

### Added
- **User-friendly import/export errors** - Clear error messages for wrong passphrase, invalid file format, and file too large (50MB limit).
- **ARIA accessibility attributes** - Added proper aria-expanded, aria-haspopup, aria-controls, and role attributes to dropdowns and modals.
- **Centralized theme utilities** - New `utils/themeUtils.js` reduces code duplication across components.
- **Centralized device detection** - New `utils/deviceUtils.js` for consistent mobile/PWA detection.
- **Reusable dropdown positioning hook** - New `hooks/useDropdownPosition.js` for consistent dropdown behavior.
- **ConfirmModal component** - Replaced window.confirm() with accessible custom modal for better PWA/mobile support.

## [1.3.83] - 2026-01-08

### Fixed

#### Critical State Synchronization Bugs
- **Fixed: Pages automatically leaving folders after editing** - When a page was added to a folder and then edited, it would automatically come out of the folder. The `currentPage` state wasn't being updated when adding pages to folders, causing the stale state to overwrite the `folderId` on save.
- **Fixed: `deleteFolder` not updating currentPage** - When deleting a folder, pages inside the folder had their `folderId` removed, but if the current page was in that folder, the `currentPage` state wasn't updated, leading to stale state.
- **Fixed: Import bundle bypassing state synchronization** - The import bundle function was directly manipulating the `pages` array without properly updating `currentPage`, which could cause data inconsistency if the imported pages included the currently open page.

#### UI and Component Bugs
- **Fixed: Current page excluded from "Add Pages to Folder" modal** - Newly created pages couldn't be added to folders because they were incorrectly filtered out of the available pages list.
- **Fixed: Pages inside folders cannot be duplicated** - The `onDuplicate` prop wasn't being passed to `PageItem` components inside folders, preventing duplication.
- **Fixed: Folder data loss on save** - The Electron main process was stripping out the `pages` array from folder objects during sanitization, causing folders to lose track of their contents.
- **Fixed: Missing accessibility features** - The `useScreenReader` and `useSkipNavigation` hooks were imported but never called, meaning screen reader announcements and skip navigation weren't active.

#### UI Enhancements
- **Redesigned all modals with modern aesthetics**:
  - `AddPageToFolderModal` - Modern design with backdrop blur, custom checkboxes, selection counter, and full theme support
  - `FolderModal` - Icon header, descriptive subtitle, live preview, modern styling
  - `RenameModal` - Enhanced with live preview and modern design
  - `PasswordModal` - Added password strength meter and modern styling
  - `PassphraseModal` - Modern design with full theme support
- All modals now have complete support for light, dark, and fallout themes

### Technical Improvements
- Added new `importBundle` function in `usePagesManager` that properly handles state synchronization during import operations
- Improved state management pattern to ensure `currentPage` always stays in sync with the `pages` array
- Enhanced Electron main process to properly preserve folder structure during save operations

## [1.3.82] - Previous Release

_(Earlier releases not documented yet)_
