# Dash Roadmap

Future feature ideas and enhancements for Dash.

## Page Linking & Knowledge Graph

> Backlinks design settled Sep 10 2026 — canvas:
> https://claude.ai/code/artifact/6695dfd9-3a73-40b7-a3b0-3f55fc0b9159

- ~~**Backlinks — phase 1: a section at the foot of the note.**~~ ✓ **Built Sep 10 2026**
  (`lib/backlinks.js`, `components/BacklinksSection.js`, rendered from `RichTextEditor.js`;
  36 assertions in `tests/backlinks.test.mjs`). Sits under a hairline
  rule inside the existing 650px editor column, so it adds no chrome, costs no editor
  width, and needs no new responsive behaviour. Two-column cards, each a linking page's
  title plus a context snippet with the mention highlighted. Build is one query over the
  `[[` links already stored plus a snippet extractor — no new storage, no sync envelope
  change. States drawn on the canvas: empty (the common case, and where the feature has
  to teach `[[` rather than look broken), collapsed, hover, six-then-a-count truncation,
  and unlinked mentions expanded with a per-row Link action.
  - **Locked notes must not leak.** A locked note can contribute a title row but never a
    snippet — its contents are encrypted. Search already does this (lock icon, no
    preview); same rule here, and it is the one case worth a test.
- ~~**Backlinks — phase 2: a status-bar chip and popover.**~~ ✓ **Built Sep 10 2026**
  (`components/BacklinksPopover.js`; the scan is hoisted into `RichTextEditor.js` and
  shared with the section so every page is walked once). Reuses the chip pattern
  already beside Contents / AI / Features so backlinks are reachable without scrolling.
  Same data and same snippet extractor as phase 1 — presentation only, which is why it
  is cheap once phase 1 exists.
- Unlinked mentions: detect page titles mentioned in text without explicit links
- Graph view: visual node-based map of note connections

## Encrypted Sharing ✓
- ~~Encrypted sharing via URL (monograph-style): generate a one-time encrypted link to share a note~~
- ~~Recipient decrypts with a passphrase, no account needed~~
- Implemented: link-based encrypted share with optional password protection, QR code, system share
- Open shared notes directly in Dash via custom URL scheme (`dash://share#...`)
  - Register `dash://` protocol handler in Electron
  - Detect on share page: if Dash is installed, offer "Open in Dash" button
  - Import shared note directly into recipient's Dash notes

## Note Management
- ~~Trash / recently deleted with 30-day recovery~~ ✓ **Shipped** — soft-delete with 30-day auto-purge; restore or permanently delete from the Trash modal (always on, independent of sync)
- ~~Note versioning / revision history~~ ✓ **Shipped in v1.3.159** — see [FEATURES.md#version-history](./FEATURES.md#version-history)
- ~~Swipe actions on iPhone (left = Trash, right = lock)~~ ✓ **Shipped in v1.6.1**
- Pinned notes and favorites
- Smart filters (by date, tag, word count, locked status)
- Nested folders (sub-folders)
- Page icons / emoji per page

## Platforms

- **iPad support** — the iOS target is `TARGETED_DEVICE_FAMILY = "1"` (iPhone only) in both
  Debug and Release, so iPad users get a scaled iPhone binary or the PWA. The PWA lands them
  on the *desktop* layout, because responsiveness is a single `isSmallScreen` boolean from one
  `max-width: 768px` query in `components/RichTextEditor.js` used in ~17 places — so an iPad in
  Safari gets hover-reveal menus and mouse-sized hit targets. Needs the target flipped to
  `"1,2"` plus a third layout tier: touch-sized targets, no hover-only affordances, split-view
  sidebar. Hard prerequisite for any Apple Pencil work, but worth shipping on its own merits.
- Native Windows / Linux builds (electron-builder targets exist; CI builds macOS only)
- Native Android app (currently PWA only)

## Editor Enhancements
- ~~Callout / admonition blocks (info, warning, tip, etc.)~~ ✓ **Built Sep 10 2026**
  — `components/editor-tools/Callout.js`. Five variants (info, tip, done, warning,
  danger) sharing the quote block's vocabulary: tinted fill, 8px radius, coloured
  icon, no rule down the side. Variant switcher in the block's tune menu; trigger
  is `[!info] ` and friends, including GitHub's `[!NOTE]` spelling.
- ~~Toggle / collapsible blocks~~ ✓ **Built Sep 10 2026** — `components/editor-tools/Toggle.js`.
  `defaultCollapsed` is saved in the block so the author controls how a note opens;
  whether YOU have it open right now is per-device in localStorage, because folding
  a section to read it is not an edit. Body is rich text: Editor.js is a flat block
  list, so arbitrary nested blocks are NOT supported.
- ~~Markdown shortcuts (e.g., `# ` for heading, `- ` for bullet)~~ ✓ **Built Sep 10 2026**
  — `lib/markdownShortcuts.js` (pure matching, tested) + `components/editor-tools/markdownInput.js`
  (DOM + Editor.js wiring). Blocks convert on keydown with `preventDefault` so the
  trigger character never lands; inline wrappers (`**b**`, `*i*`, `` `c` ``, `~~s~~`,
  `==h==`) fire on the closing delimiter. Heading levels use the SAME clamp as
  `parseMarkdownToBlocks`, so typing and pasting markdown agree — which is why both
  `#` and `##` give the biggest heading.
- LaTeX / math equation support
- Mermaid diagram rendering
- Table of contents block (auto-generated from headings)
- Reading time and character count display
- Table column/row reordering via drag handles
- Table column resizing (drag to adjust width)

## Handwriting & Sketching

> Researched Sep 10 2026 and deliberately deferred. Findings kept here so the research does
> not have to be repeated.

- **Ink / sketch block** — an Editor.js block for freehand drawing and handwriting.
  - Blocked on iPad support above: no iPhone has ever supported Apple Pencil, so the entire
    Pencil audience is currently unreachable in the native app.
  - Use `perfect-freehand` (MIT) for stroke geometry with our own Pointer Events handling.
    Avoid tldraw (custom licence, watermark unless paid, reported ~$6k/yr) and probably
    Excalidraw (MIT but an entire whiteboard, and its pressure handling is a live complaint).
  - Pointer Events carry `pressure`, `tiltX`/`tiltY`, and since Safari 18.2 also
    `altitudeAngle`, `azimuthAngle`, `getCoalescedEvents()` and `getPredictedEvents()`.
    NOT exposed to web content: Pencil hover (M2+ iPads), Pencil Pro squeeze / barrel roll /
    haptics — those are `UIPencilInteraction` and PencilKit only.
  - **Strokes must be attachment-backed, never inline block JSON.** `MAX_ENVELOPE_BYTES` is
    62 KB (`server/sync.ts`) and a page of handwriting is ~40–150 KB of raw stroke JSON, so
    inlining breaks sync on the first serious page. `MAX_ATTACHMENT_BYTES` is 10 MB and
    `lib/syncAttachments.js` already does content-addressed, vault-encrypted, lazy-pull blobs
    with the local store injected. Store quantized stroke arrays (integer coordinates, 0–255
    pressure, delta-encoded timestamps) in the blob; keep the attachment id plus a small
    raster preview in the block. Compress before encrypting, never after.
  - No Editor.js drawing plugin exists — this is a twelfth custom tool in
    `components/editor-tools/`, not a research risk.
- **Searchable handwriting on iOS 27+** — `PKStrokeRecognizer` (WWDC26 session 203) does
  on-device, offline recognition in 29 languages, returns an indexable string built even from
  ambiguous strokes, and searches for a word *inside* a drawing with bounding boxes. Requires
  iOS / iPadOS / macOS 27 (ships Sep 14 2026). It works with any canvas via new Bézier
  path-conversion APIs, so web-drawn strokes may be feedable without PencilKit owning input.
  Build as a **modal** native canvas (the `capacitor-pdf-annotator` pattern), not an inline
  `PKCanvasView` over the WebView — that route is weeks of z-order, scroll-sync and keyboard
  fights for an iOS-only payoff. No Capacitor PencilKit plugin exists
  (`capacitor-community/proposals#151` asked in 2021; nothing shipped).
  - Recognition options to avoid: Google ML Kit Digital Ink (we already pulled MLKit once over
    the `ITMS-91061` privacy-manifest rejection, still unresolved ecosystem-wide), MyScript
    (web libs call their cloud, which breaks E2E; the offline SDK is native-only and
    sales-quoted), Tesseract (printed-text trained, commonly 30–55% on handwriting).
    transformers.js + TrOCR is the only licence-free cross-platform on-device option but is a
    large model with unproven accuracy — prefer shipping no recognition off iOS 27.
- **Why it is strategically interesting**: handwriting-first apps (GoodNotes, Notability,
  Noteshelf, Samsung Notes, OneNote) do not do E2E encryption, and encrypted-notes apps
  (Standard Notes, Notesnook, Anytype, Amplenote, Joplin, Obsidian) do not do handwriting.
  Craft, Capacities and Bear have each said publicly they will not add E2EE. NoteSam is the one
  competitor in the overlap (iPad / Android / web, AES-256-GCM + Argon2id, six sync backends,
  no Mac app, no real block editor).
- **Unmeasured, check before committing**: there is no public web-vs-native ink latency
  benchmark, and demand from Dash users specifically has never been asked. Prototype the web
  canvas on real hardware and ask users before building the native recognition path.

## Templates
- Built-in page templates (meeting notes, journal, to-do, etc.)
- Custom user templates
- Template variables (date, time, page title)

## Backup & Sync
- ~~Auto-backup: scheduled encrypted `.dashpack` export~~ ✓ **Shipped in v1.4.0**
- ~~Cloud sync (encrypted, zero-knowledge)~~ ✓ **Shipped in v1.4.0** alpha, paywalled in v1.5.0 as Dash Sync subscription ($4.99/mo or $47.99/yr)
- P2P local network sync: devices on same WiFi discover each other via mDNS, pair with confirmation code, sync pages over encrypted WebSocket channel. No cloud, no internet required. Last-write-wins conflict resolution. Electron-only.
- Live collaboration (real-time multi-device editing sessions): **built but gated off** (`LIVE_SESSIONS_ENABLED = false` in `components/RichTextEditor.js`) — the code is in the tree but not yet enabled for users.

## Monetization follow-ups (after v1.5)
- iOS Keychain for session token (currently `localStorage['dash:auth:token']`)
- Lifetime sync tier (one-time alternative to recurring sub) — price TBD
- France IAP availability (file encryption export documentation, currently 1 of 175 countries excluded)
- Server-side bulk vault purge on cancellation (today relies on 90-day inactive-vault sweep)
- Team / shared vaults
- BYO-relay self-host docs (sync server is open-source by source disclosure; package self-host instructions)

## Import & Export
- Import from Standard Notes, Evernote, Notion, Markdown files
- Bulk markdown export

## Security & Privacy
- TOTP authenticator (store 2FA codes)
- PGP key management
- Encrypted clipboard
- Note content hashing (integrity verification)

## Local AI Enhancements
- Multi-note folder context: open AI panel from folder's 3-dot menu with all folder notes pre-loaded as context. Folder badge shown in panel, placeholder "Ask about these notes…". Large context warning for 15k+ char payloads.
- Model presets: save per-model temperature/max token preferences
- Prompt library: save and reuse custom prompts

## Themes & Customization
- ~~Match system (macOS / iOS) light-dark appearance~~ ✓ **Shipped in v1.6.0** (Mac) and **v1.6.1** (iPhone)
- Custom theme editor
- Font selection
- Adjustable editor width
