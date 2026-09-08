# Dash Roadmap

Future feature ideas and enhancements for Dash.

## Page Linking & Knowledge Graph
- Backlinks panel: show all pages that link to the current page
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

## Editor Enhancements
- Callout / admonition blocks (info, warning, tip, etc.)
- Toggle / collapsible blocks
- Markdown shortcuts (e.g., `# ` for heading, `- ` for bullet)
- LaTeX / math equation support
- Mermaid diagram rendering
- Table of contents block (auto-generated from headings)
- Reading time and character count display
- Table column/row reordering via drag handles
- Table column resizing (drag to adjust width)

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
