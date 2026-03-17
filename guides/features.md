# All Dash Features

## Overview

Dash is a privacy-first, offline-first note-taking app with end-to-end encryption, built for people who want full control over their data. Everything runs locally on your device — no accounts, no cloud sync, no telemetry.

Below is a comprehensive list of every feature in Dash, organized by category.

---

## Security & Privacy

### Page Encryption

Lock individual pages with AES-256-GCM encryption. When you lock a page, the entire content is encrypted on disk using a password you choose. The encryption key is derived using PBKDF2 with 600,000 iterations. Without the password, the content is unreadable — even if someone accesses the raw data files.

- Algorithm: AES-256-GCM with PBKDF2 key derivation
- Encryption happens client-side — no data ever leaves your device
- Each page has its own password and salt
- Locked pages show a lock icon in the sidebar

### App Lock & Touch ID

Lock the entire app behind a password. All pages are encrypted with AES-256 when app lock is enabled — not just hidden behind a password screen, but actually encrypted on disk. Every page's content is encrypted using a key derived from your password, so even if someone accesses the raw data files, they can't read anything. Supports automatic locking after a configurable inactivity period.

- All pages encrypted on disk with AES-256-GCM when locked
- Biometric unlock via Touch ID (macOS) when available
- Auto-lock after 1, 5, 15, or 30 minutes of inactivity
- Brute-force protection with escalating cooldowns
- Password stored in system secure storage for biometric unlock
- Visual indicator on sidebar lock icon when app lock is enabled

### Decoy App (Decoy Password)

A secondary password that shows fake decoy notes when entered at the lock screen. If someone forces you to unlock the app, entering the decoy password shows a convincing set of fake notes instead of your real data. Your actual notes stay encrypted and hidden on disk.

- Configure in App Lock settings after enabling app lock
- Set up decoy notes that appear when the decoy password is used
- Real data stays encrypted and untouched on disk — nothing is deleted or wiped
- Indistinguishable from a normal unlock to an observer
- Provides plausible deniability under coercion
- Hide mode only — your real data is always preserved and recoverable by entering your real password

### Self-Destructing Notes

Set any page to automatically delete itself after a time period. A live countdown badge in the sidebar tracks the remaining time. Useful for temporary information you don't want lingering — passwords, one-time codes, sensitive instructions.

- Preset timers: 1 hour, 24 hours, 7 days, 30 days
- Custom timer with days, hours, and minutes precision
- Live countdown badge visible in the sidebar
- Deletion happens automatically even if the app is reopened later

### Encrypted Sharing

Share any note via an encrypted link. The note content is encrypted client-side using AES-256-GCM with a PBKDF2-derived key. For short notes, the encrypted data is encoded directly in the URL fragment (never leaves the browser). For larger notes, the encrypted blob is uploaded to a relay server and a short link is generated — the server stores only encrypted data it cannot read, and auto-deletes it after 30 days.

- Zero-knowledge: encryption key lives in the URL fragment, never sent to a server
- Short links for larger notes — encrypted blob stored on relay with 30-day TTL, then auto-deleted
- Optional password protection: separate the link from the decryption password for extra security
- Password QR code: generate a QR code for the password to share via a different channel
- Deep link support: recipients with Dash installed can import notes directly via `dashnotes://` protocol
- Share page hosted at dash-share.vercel.app with full client-side decryption
- Native share sheet (AirDrop, Messages, etc.) on supported platforms, copy link fallback elsewhere

### Live Collaboration (Live Sessions)

Real-time collaborative editing with end-to-end encryption. The host starts a session and shares a link — guests join and see live edits in real-time. All communication is encrypted client-side before being relayed through the server; the relay never sees plaintext content.

- End-to-end encrypted: AES-256-GCM with a random 256-bit key per session
- Encryption key is in the URL fragment — never sent to the server
- WebSocket relay at dash-relay.efesop.deno.net broadcasts encrypted binary messages between peers
- Duration options: 1 hour, 6 hours, 24 hours, 1 week, or unlimited
- Optional session password for access control (guests must enter password to join)
- Live remote cursor indicators showing where other participants are editing
- Participant avatars with typing indicators
- Guests receive a read-only copy of the note after the session ends
- Edit request system: guests can request edit access, host approves/dismisses via notification panel
- Session link can be copied or shared via QR code
- Live session bar shows: live indicator dot, participant avatars, elapsed/remaining time, E2E encryption badge, end session button

### Image Privacy (EXIF Stripping)

Photos pasted into Dash are automatically stripped of EXIF metadata before being stored. GPS coordinates, camera model, lens information, timestamps, and other embedded metadata are removed. This prevents accidentally leaking location data or device information when sharing notes.

- Strips GPS location, camera info, timestamps, and all other EXIF tags
- Runs automatically on paste — no user action required
- Works with JPEG and other image formats that contain EXIF data
- Metadata removal happens locally, before the image is saved

### Seed Phrase Storage

A dedicated secure block type for storing cryptocurrency wallet recovery phrases. Displays as a numbered grid with BIP-39 word validation. Combined with page encryption, this provides a secure offline backup for seed phrases.

- 12 or 24-word grid layout
- BIP-39 wordlist validation with visual feedback
- Add from the + block menu in the editor
- Designed to pair with page encryption for maximum security

---

## Editor

### Block Types

The editor supports a variety of content block types:

- **Paragraph** — standard text with inline formatting (bold, italic, underline, strikethrough, inline code, links)
- **Headings** — H1 through H6
- **Bullet list items** — unordered list items (one block per item)
- **Numbered list items** — ordered list items with automatic numbering
- **Checklist items** — checkbox items that can be toggled complete/incomplete
- **Code blocks** — syntax-highlighted code with 22 language support
- **Tables** — row/column data with optional header row
- **Images** — inline images with optional captions
- **Seed phrase grid** — BIP-39 wallet recovery phrase storage
- **Delimiter** — horizontal rule / section separator

### Multi-Block Selection & Conversion

Select multiple blocks at once and convert them between types using a floating toolbar. Select a range of blocks and change them all from paragraphs to bullet points, checklist items, headings, etc. in one click.

- Click and drag or shift-click to select multiple blocks
- Floating conversion toolbar appears with block type options
- Convert between paragraph, bullet, numbered, checklist, and heading types

### Page Linking

Connect your notes with wiki-style `[[` links. Type `[[` anywhere in a text block to open an autocomplete dropdown of all your pages. Links are clickable and navigate instantly. Links survive page renames since they reference page IDs, not titles. Build a connected knowledge base where ideas link to each other.

- Type `[[` to trigger autocomplete
- Also available via the inline toolbar link icon
- Links styled with dotted underline and theme-aware colors
- All local references — no network requests

### Syntax-Highlighted Code Blocks

Full code block support with syntax highlighting for 22 programming languages. Language auto-detection means you can paste code and it will be highlighted correctly without manual selection. Highlighting is theme-aware — colors adapt to your chosen theme.

- 22 supported languages including JavaScript, Python, Rust, Go, HTML, CSS, SQL, and more
- Automatic language detection
- Theme-aware color schemes
- Add via the + block menu or type ``` to create a code block

### Markdown Paste Support

Paste markdown content and it's automatically converted to rich editor blocks. Supports:

- Headings (`# H1` through `###### H6`)
- Bold, italic, strikethrough, inline code
- Bullet lists, numbered lists, checklists (`- [ ]` / `- [x]`)
- Indented list items
- Code blocks (fenced with ```)
- Tables (pipe-delimited markdown tables with header rows)
- Images (`![alt](url)`)
- Horizontal rules (`---`)
- Links (`[text](url)`)

### Drag & Drop

Reorder pages and folders in the sidebar by dragging. Reorder blocks within the editor by dragging. Move pages between folders by dragging them onto a folder. Everything supports smooth animated transitions.

- Drag pages and folders to reorder
- Drag pages into or out of folders
- Drag editor blocks to rearrange content within a page
- Only active in Manual sort mode

### Undo & Redo

Full undo/redo history within the editor. Every text change is tracked and reversible.

- Undo: Cmd+Z (Mac) / Ctrl+Z (Windows)
- Redo: Cmd+Shift+Z (Mac) / Ctrl+Shift+Z (Windows)

### Block Menu

Press the + button or type `/` to open the block menu. Quickly add any block type — headings, bullet lists, numbered lists, checklists, code blocks, seed phrase grids, and more. The slash command menu filters as you type for fast insertion.

- Press `+` button at the start of any empty block
- Type `/` anywhere to open the slash command menu
- Filter block types by typing after `/`
- Supports all block types: paragraph, headings, lists, code, tables, seed phrase

### Export & Import

Export any page to 7 different formats, or share pages between devices using `.dashpack` bundles.

- Export formats: PDF, Markdown, Plain Text, RTF, DOCX, CSV, XML
- `.dashpack` export bundles pages with all their data for transfer
- Import `.dashpack` files to restore or merge pages
- All export happens locally — no cloud processing

---

## Navigation & UI

### Quick Switcher

Press Cmd+P to open a fuzzy-search dialog that lets you jump to any page instantly. Start typing a page name and results update in real-time. Works like Spotlight or VS Code's quick open.

- Shortcut: Cmd+P (Mac) / Ctrl+P (Windows)
- Fuzzy matching — type partial names or words from anywhere in the title
- Keyboard navigation with arrow keys and Enter to select
- Results ranked by relevance

### Focus Mode

Distraction-free writing mode that hides the sidebar and dims everything except the paragraph you're currently editing. Includes typewriter scrolling (active line stays centered) and session stats.

- Shortcut: Cmd+Shift+F to toggle
- Typewriter scrolling keeps your writing position centered
- Paragraph dimming fades non-active paragraphs
- Session word count and time stats in the bottom bar
- Press Escape to exit

### Keyboard Shortcuts

Comprehensive keyboard shortcut support. Press `?` or click the keyboard icon in the footer to see all available shortcuts at a glance in a themed modal.

- `?` — Show shortcuts reference
- `Cmd+P` — Quick switcher
- `Cmd+Shift+F` — Focus mode
- `Cmd+Z` / `Cmd+Shift+Z` — Undo / Redo
- `Cmd+U` — Underline
- `Cmd+B` — Bold
- `Cmd+I` — Italic
- And many more listed in the shortcuts modal

### Folders with Emojis & Tags

Organize your pages into collapsible folders and add tags for quick filtering. Folders support custom emoji icons. Tags appear as colored stacked chips on pages in the sidebar. Filter pages by tag to quickly find related notes.

- Create folders and drag pages into them
- Set emoji icons on folders for visual organization
- Add multiple tags to any page
- Stacked tag chips visible in sidebar with theme-aware colors
- Filter sidebar by tag
- Folders collapse to keep the sidebar tidy

### Sorting

Multiple sort modes for organizing pages in the sidebar:

- Manual (drag to reorder)
- Alphabetical (A-Z)
- Date created (newest/oldest first)
- Date modified (recently edited first)

### Four Themes

Every screen in Dash is fully themed. Choose from four distinct visual themes:

- **Light** — Clean white background with neutral accents
- **Dark** — True dark theme with soft grays
- **Dark Blue** — Deep navy blue with cool-toned accents
- **Fallout** — Terminal-style green-on-black with monospace fonts and glow effects

All themes apply consistently across the editor, sidebar, modals, settings, and footer.

---

## Feature Discovery

### Features Panel

A slide-over panel accessible from the Sparkles icon in the bottom bar. Browse all Dash features organized by category (Security, Editor, Navigation) with animated illustrations and keyboard shortcut badges. Filter by category using chips at the top.

### What's New

An auto-showing modal that appears when Dash is updated to a new version. Features are grouped by release date so you can see what was added recently. Dismisses automatically and won't show again until the next update.

### Auto-Updates

The desktop app checks for updates automatically in the background. When an update is available, a notification appears with options to download and install. Update checks are silent — no notifications when offline or when already on the latest version.

---

## Platform & Architecture

- **Desktop**: Electron app for macOS (primary platform)
- **Web**: Progressive Web App (PWA) accessible via browser
- **Storage**: Local JSON files (desktop) or IndexedDB (PWA) — no cloud, no sync
- **Open source**: Source code available on GitHub at https://github.com/Efesop/rich-text-editor
- **Price**: $14.99 one-time purchase for the macOS app
- **Framework**: Next.js 13, React 18, Tailwind CSS
- **Editor**: Editor.js with custom block tools

---

## Relay Server

The relay server at dash-relay.efesop.deno.net provides two services:

1. **Live session relay** — WebSocket server that broadcasts encrypted binary messages between session participants. The relay never decrypts content; it just forwards encrypted payloads between peers in the same room.

2. **Share link storage** — Stores encrypted note blobs for share links. The server receives only encrypted data (AES-256-GCM encrypted client-side) and stores it with a 30-day TTL. After 30 days, the encrypted blob is automatically deleted. The server is zero-knowledge — it cannot read any stored content.

Both services are hosted on Deno Deploy. The relay is stateless and disposable — no user data, no accounts, no logs.
