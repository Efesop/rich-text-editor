# Dash — Feature Overview

> Privacy-first, offline-first note-taking app. No cloud, no tracking, your data stays on your device.

## Platforms

- **Desktop** — macOS (DMG via dashnote.io, $14.99 one-time). Win/Linux build paths exist in the codebase but the GitHub Actions release workflow only builds macOS — Win/Linux are unshipped today.
- **Mobile** — iOS native app via Capacitor (free download from App Store, Dash Sync subscription required for cloud sync). Android via PWA.
- **Browser** — Any modern browser, no install needed (Dash Sync subscription required for cloud sync).

Storage auto-detects: Electron uses local JSON files, PWA uses IndexedDB, browser uses localStorage. All data stays on-device.

## Pricing (v1.5+)

- **Mac desktop app** — $14.99 one-time. Includes everything except cloud sync. Lifetime updates.
- **Dash Sync subscription** — $4.99/mo or $47.99/yr (≈20% off annual). 7-day free trial. End-to-end encrypted multi-device sync — same subscription unlocks sync on iPhone, iPad, Mac, and PWA. Cancel anytime via Settings → Apple ID → Subscriptions (iOS) or the customer portal at https://dashnote.io/payment/manage (Mac/web).
- **iOS app** — Free download. Works offline-first without a subscription; the sub only unlocks the sync feature.
- **PWA / browser** — Free. Same offline-first model as iOS; sub unlocks sync.

The Mac one-time price covers the desktop license only. The subscription pays for the relay server costs (sync only — the server never sees your note contents, just encrypted blobs).

---

## Rich Text Editor

Block-based editor powered by Editor.js with 15+ content types:

| Block Type | Description |
|-----------|-------------|
| Paragraph | Standard text with inline formatting |
| Header | H2, H3, H4 levels |
| Bullet List | Individual bullet items, each its own block; nest up to 8 levels |
| Numbered List | Individual numbered items, numbered per level (1, a, i) |
| Checklist | Interactive checkbox items, each its own block; nest like any list |
| Quote | Block quotes with author caption |
| Code | Syntax-highlighted code blocks (20 languages) |
| Table | Rows, columns, and optional headings |
| Image | Paste, drag-and-drop or file picker; location and camera data removed, shrunk to at most 2048 px, stored as an attachment |
| Embed | YouTube, Vimeo, GitHub, Twitter |
| Delimiter | Visual section separator |
| Seed Phrase | Secure numbered grid for cryptocurrency recovery phrases (12 or 24 words) with BIP-39 validation |

### Nested Lists

- **Tab / Shift+Tab** indent and outdent bullet, numbered and checklist items, up to 8 levels; sub-items move with their item
- **Indent / Outdent** in a list item's block menu (⋮⋮), for touch screens
- **Enter** keeps the level; Enter on an empty nested item, or Backspace at its start, steps out a level first
- Nesting is kept when pasting lists from web pages, Google Docs or Markdown, and in share links, version history and every export

### Multi-Block Selection & Conversion

Select multiple blocks by dragging across them, then click the floating settings icon to convert them all at once. Supports converting to: Text, Heading 1, Heading 2, Heading 3, Bullet List, Numbered List, Checklist, Quote, and Code.

### Page Linking

Link between pages using wiki-style `[[` syntax:
- Type `[[` anywhere in text to trigger an autocomplete dropdown of existing pages
- Filter by typing after `[[`, then press Enter or click to insert the link
- Or highlight text and click the Page Link button in the inline toolbar
- Clicking a page link navigates to that page instantly
- Links are styled distinctly from external URLs and work across all themes

### Inline Formatting

- **Bold** (Cmd+B)
- **Italic** (Cmd+I)
- **Underline** (Cmd+U)
- **Strikethrough**
- **Highlight / Marker** (Cmd+Shift+H)
- **Inline Code** (Cmd+Shift+M)
- **Links** (Cmd+K)
- **Page Link** (via toolbar or `[[` shortcut)

### Text Alignment

Left, center, and right alignment available on paragraphs and headers via the block settings menu.

### Undo / Redo

Full undo/redo history with Cmd+Z and Cmd+Shift+Z.

### Auto-Save

Changes save automatically with a 300ms debounce. A save indicator shows current status.

### Focus Mode

Toggle a distraction-free writing mode (Cmd+Shift+F) that hides the sidebar, header, and footer:

- **Typewriter mode** — keeps the current line centered vertically as you type
- **Paragraph dimming** — dims all paragraphs except the one you're editing
- **Session stats** — tracks words written and time spent; displayed when you exit
- Exit with Esc key or the floating exit button (auto-hides after 2 seconds of inactivity)

### Word Count

Real-time word count displayed in the editor footer.

---

## Organization

### Pages
- Create, rename, duplicate, and delete pages
- Drag-and-drop reordering (custom sort)
- Sort by: Date Modified, Date Created, Title, or Custom Order

### Folders
- Create, rename, and delete folders
- Drag pages into/out of folders
- Move pages between folders via context menu
- Collapse/expand folders

### Tags
- Create color-coded tags
- Assign multiple tags per page
- Filter pages by one or more tags
- Tag management modal for bulk operations

### Sort Modes
- **Custom** — manual drag-and-drop reordering (drag only enabled in this mode)
- **Newest** — by creation date, most recent first
- **Oldest** — by creation date, oldest first
- **A-Z** — alphabetical ascending
- **Z-A** — alphabetical descending
- **By Tag** — grouped by assigned tags

### Search
- Full-text search across all page titles and content (powered by Fuse.js)
- Locked pages show with a lock icon in search results
- Combine search with tag filters
- Instant results as you type
- On iPhone, filter chips above the list narrow it to All, one tag, or Locked notes

### Quick Switcher (Cmd+P)
- VS Code-style fuzzy search overlay to jump to any page instantly
- Arrow keys + Enter for keyboard navigation, Escape to close
- Recent pages shown at top
- Highlights matching characters in results

---

## Themes

Four built-in themes, each fully applied to the editor, sidebar, modals, and all UI elements:

| Theme (UI label) | Internal id | Description |
|-------|-------------|-------------|
| **Light** | `light` | Clean, bright interface |
| **Dark** | `dark` | Pure neutral dark mode (no blue tint) |
| **Night** | `darkblue` | Navy-tinted dark mode (labelled "Dark Blue" before v1.6) |
| **Terminal** | `fallout` | Retro terminal aesthetic — green on black (labelled "Fallout" before v1.6) |

Themes are picked from visible swatches in Settings (the gear in the Mac title bar) or from the Appearance sheet on iPhone (sun/moon icon in the header). Theme preference persists across sessions.

### Match system appearance (v1.6)

Turn on **Match macOS appearance** (Mac) or **Match iOS appearance** (iPhone) and Dash follows the system light/dark setting: Light when the system is light, and your preferred dark theme (Dark, Night, or Terminal — whichever you last chose) when it is dark. Picking a theme by hand turns matching off again.

---

## Layout (v1.6)

### Mac
- **Title in the document** — the page title sits at the top of the editor column with tags, date, and word count beneath it. There is no separate header bar.
- **Title-bar toolbar** — Lock page, Self-destruct, Export, Settings (gear), and a ⋯ menu.
- **⋯ menu** — Share encrypted note, Version history, Move to folder, Duplicate (⌘⇧D), Import encrypted bundle, Use on your phone, Report a bug, Move to Trash (⌘⇧⌫). When an update is available the menu shows a dot and an "Update to Dash x.y.z" row.
- **Settings popover** — theme swatches, Match macOS appearance, App lock, Dash Sync, Backups, Trash, Keyboard shortcuts, version and Check for updates.
- **Sidebar** — FOLDERS and NOTES sections; new-folder on the Folders label, sort on the Notes label; the footer is just the collapse button. Expanded folders show a chevron and a bright title.
- **Status bar** — encryption chip and sync status on the left; outline, AI, and features on the right.

### iPhone
- **Notes screen** — full-width list with a large title, search bar, filter chips (All, tags, Locked), FOLDERS and NOTES sections, and a New note button within thumb reach.
- **Swipe actions** — swipe a note left to move it to Trash, right to lock or unlock it. Press-and-hold still drags for reordering.
- **Appearance sheet** — from the sun/moon icon in the header: theme swatches plus Match iOS appearance.
- **Settings sheet** — from the footer: Appearance, App lock, Dash Sync, Backups, Trash, table of contents, Keyboard shortcuts, Report a bug, version.

---

## Security & Privacy

- **Page-level password protection** — lock individual notes with a password
- **AES-GCM-256 encryption** — for encrypted exports and passphrase-protected data
- **PBKDF2 key derivation** — 600,000 iterations per NIST 2024 recommendations
- **BCrypt password hashing** — 10 salt rounds
- **Rate limiting** — exponential backoff after failed unlock attempts
- **XSS protection** — DOMPurify sanitization, strict HTML whitelist
- **No telemetry** — zero tracking, analytics, or cloud calls
- **Offline-first** — works without internet, no data leaves your device

### App Lock & Auto-Lock
- Lock the entire app after a configurable idle timeout (1, 5, 15, 30 minutes, custom, or Never)
- Master password required to unlock
- **Touch ID / Face ID biometric unlock** — use Touch ID on macOS or Face ID (Touch ID on older devices) on iOS, via `@aparajita/capacitor-biometric-auth`, as an alternative to typing your password
- Biometrics also available for unlocking individual locked pages
- Instant lock with Cmd+Shift+L
- Locks automatically on app launch if enabled
- Settings persist across app updates

### Duress Password
- Set a secondary password during app lock setup or in settings
- When entered at the lock screen, silently triggers a panic action — the attacker sees a decoy app
- **Show Decoy Notes (Hide mode)** — fake notes are shown; real data stays encrypted on disk. Re-entering the real password restores everything. Saves are blocked while in duress mode so the decoy state can never overwrite real data.
- Must be different from the real password
- No visual indication that a duress action was triggered

> **Note:** Wipe mode (irreversibly deleting all data) was previously available but is **disabled** as of v1.3.131 due to a data-loss incident. Only Hide mode is exposed in the UI.

### Seed Phrase Storage
- Dedicated Editor.js block type for storing cryptocurrency wallet recovery phrases
- Numbered grid of 12 or 24 word inputs (toggle between modes)
- BIP-39 English wordlist validation (green checkmark for valid words, red X for invalid)
- Multi-word paste support — paste a full phrase and words distribute across inputs
- "Copy All" button with automatic clipboard clearing after 30 seconds
- Tab/Enter navigation between inputs
- Autocomplete, spellcheck, and autocorrect disabled for security
- Data saved as standard Editor.js block JSON — benefits from page encryption when the page is locked

### Self-Destructing Notes
- Set a page to automatically delete after a time period (1 hour, 12 hours, 1 day, 7 days, or 30 days, plus custom durations)
- Countdown badge in the sidebar shows precise time remaining
- Badge color shifts from green to orange to red as expiry approaches
- Cancel self-destruct at any time via the page's context menu

---

## File Attachments

Attach images and PDFs directly to notes via the `+` block menu or drag-and-drop.

- **Supported types** (v1): JPEG, PNG, GIF, WebP, PDF
- **Max size**: 10 MB per file
- **Magic-bytes validation** — file headers verified against MIME type (not just extension), so renamed `.exe`-as-`.png` files are rejected
- **Storage** — files stored separately from the page JSON: Electron uses `userData/attachments/`, PWA uses IndexedDB, browser uses localStorage base64
- **Card UI** — attachment blocks render as a compact card with file icon, filename, and size badge; click opens the file (Electron uses `shell.openPath`, web uses a blob URL)
- **Dashpack export** bundles attachment data as base64
- **Photos** — images added to a note are stored as attachments too (except in a plain browser tab, where they stay in the note); a device still downloading a synced photo shows a placeholder
- **Page duplicate** shares the original's attachment files
- **Share** replaces attachments and photos with placeholders (attachments are not transmitted in share links)
- **Deleting a note for good** removes only the attachment files no other note uses

---

## Version History

Browse and restore previous versions of any page.

- **Up to 10 versions per page** — oldest dropped automatically when the limit is hit
- **Throttled** — minimum 30 seconds between captures, with SHA-256 content-hash dedup so identical states aren't snapshotted twice
- **Block preview** — version list modal shows a preview of each version's blocks before restoring
- **Restore as New Page** — restoring creates a *new* page with the old content rather than overwriting; non-destructive, no tag/folder conflicts
- **Privacy** — locked pages do **not** capture versions, and existing versions are deleted the moment a page is locked. The "Version History" menu item is hidden for locked pages.
- **Storage** — versions stored separately per page (Electron: `userData/versions/{pageId}.json`, PWA: IndexedDB, browser: localStorage)
- **Page delete** cleans up associated version history

---

## Multi-Device Sync (Dash Sync)

Optional end-to-end-encrypted sync keeps notes, folders, tags, attachments, and version history in step across Mac, iPhone, iPad, and the PWA. Sync requires a **Dash Sync** subscription ($4.99/mo or $47.99/yr, 7-day free trial) on every platform; with it turned off, Dash is 100% local and offline exactly as before.

- **Zero-knowledge relay** — the sync server (`dash-relay.efesop.deno.net`, with an automatic fallback through `dashnote.io/relay` on networks that block deno.net) only ever stores encrypted blobs. It never sees note contents and never holds your vault key.
- **Client-side vault encryption** — a per-account vault key encrypts everything before upload; the key is derived on-device and never leaves it.
- **Magic-link sign-in** — sign in with your email and a 6-digit code (no password to remember). Identity only ties your subscription to your devices.
- **Trash & auto-backup** — deleted pages sync to a recoverable Trash (30-day retention); scheduled encrypted `.dashpack` backups run independently of sync.

---

## Local AI

Optional integration with **on-device large language models** — Ollama, LM Studio, LocalAI, and Jan. All data stays on your machine; nothing is sent to a cloud service.

### Setup
- Pick a preset (Ollama, LM Studio, LocalAI, Jan, or Custom) or enter your own endpoint
- Configure model name, temperature, and max tokens
- Settings persisted locally in `localStorage`

### Entry points
- **Footer Bot button** — opens AI panel with full note context
- **Inline toolbar** — highlight text, click the Bot icon
- **Block settings menu** — every block has an "AI" tune via the 6-dot popover
- **Multi-block selection** — drag-select or Cmd+click multiple blocks, then send to AI
- **Slash menu** — type `/ai` for an AI block

### Actions
- **Summarize** the current note or selection
- **Rewrite** to improve clarity or change tone
- **Continue** writing from the cursor
- **Explain** the selected text
- **Custom prompt** — write your own instruction
- **Chat mode** — multi-turn conversation about the current note

### Output handling
- **Streaming** — AI responses stream in token-by-token with markdown preview
- **Insert / Replace** — append the response below the source, replace a single block, or replace the whole note
- **Save as Note** — convert the AI response into a brand-new page

### Network
- **CSP** allows `localhost:*` and `127.0.0.1:*` so any local LLM port works (Ollama 11434, LM Studio 1234, LocalAI 8080, Jan 1337, custom)
- No external connections — if the local LLM is offline, AI features are simply unavailable

---

## Encrypted Sharing

Generate read-only, encrypted share links of any note.

- **Zero-knowledge** — payload is encrypted client-side and embedded in the URL fragment (`#`), which browsers never send to the server
- **Passphrase** — auto-generated 4-word + 3-digit passphrase (~38 bits entropy), or set your own password
- **Optional server storage** — opt in to upload the encrypted blob to the relay (`dash-relay.efesop.deno.net`) for a 30-day shorter link; the relay only ever sees ciphertext
- **Deflate compression** — share payloads compressed before encryption
- **EXIF stripping** — image attachments have EXIF metadata removed before encoding
- **QR code** — share via QR for in-person handoff
- **System share sheet** — native share sheet on supported platforms
- **Open in Dash** — `dash://share#…` deep-link protocol opens shared notes directly in the desktop app
- **Decryption page** at `https://dash-share.vercel.app` — purely client-side, runs in any modern browser

---

---

## Export & Import

### Export Formats
- PDF
- Markdown (.md)
- Plain Text (.txt)
- Word Document (.docx)
- Rich Text Format (.rtf)
- JSON (raw Editor.js data)
- XML
- CSV

Exports keep nested lists (numbered per level), callouts, toggles and inline formatting. PDF, Word and RTF include photos; Markdown embeds them.

All exports can optionally be **encrypted with a passphrase** (AES-GCM-256).

### Import
- Import an encrypted bundle (.dashpack) exported from Dash, with its attachments (⋯ menu → Import encrypted bundle)
- Importing from other apps (Evernote, Notion, Obsidian and other Markdown apps, Standard Notes) is on the roadmap; there is no import from JSON, Markdown, plain text, DOCX or CSV

---

## Desktop Features (Electron)

- **Auto-update** — silent background checks; an available update shows as a card (Later / Download) and as a dot on the ⋯ menu. Nothing downloads or installs without confirmation
- **Native file storage** — pages saved as local JSON files
- **Bug reporting** — built-in GitHub issue creator
- **macOS Applications folder prompt** — guides users to install correctly
- **macOS builds** — signed, notarized DMG for Apple Silicon + Intel (Windows/Linux electron-builder targets exist in the codebase but are not built or shipped by the release pipeline)
- **What's New modal** — shows new features on first launch after each update

---

## Mobile Features (iOS app & PWA)

- **Install as app** — add to home screen on iOS/Android
- **Offline support** — full service worker caching
- **Touch-optimized UI** — bottom sheets replace dropdowns; full-width Notes screen with swipe actions (v1.6.1)
- **Mobile install guide** — step-by-step prompt for first-time mobile visitors
- **IndexedDB storage** — persistent storage that survives browser cache clearing

---

## Accessibility

- Keyboard navigation throughout the app
- ARIA labels on all interactive elements
- Skip navigation links
- Screen reader announcements for actions
- Visible focus indicators
- Semantic HTML structure

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 13, React 18 |
| Editor | Editor.js 2.30 |
| Styling | Tailwind CSS |
| Desktop | Electron 32 |
| Mobile | iOS native (Capacitor 8), PWA (next-pwa) |
| State | Zustand |
| Search | Fuse.js |
| Drag & Drop | @dnd-kit |
| Encryption | WebCrypto API (AES-GCM), bcryptjs |
| UI | Radix UI, Lucide React icons |
