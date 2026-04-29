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
- Trash / recently deleted with 30-day recovery
- ~~Note versioning / revision history~~ ✓ **Shipped in v1.3.159** — see [FEATURES.md#version-history](./FEATURES.md#version-history)
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
- Auto-backup: scheduled encrypted `.dashpack` export
- Cloud sync (encrypted, zero-knowledge)
- P2P local network sync: devices on same WiFi discover each other via mDNS, pair with confirmation code, sync pages over encrypted WebSocket channel. No cloud, no internet required. Last-write-wins conflict resolution. Electron-only.

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
- Custom theme editor
- Font selection
- Adjustable editor width
