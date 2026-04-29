# Dash — Sharing & Live Sessions

Complete reference for all sharing and real-time collaboration features in Dash.

> **Status:** Encrypted share links are **shipped and active**. Live Sessions are **disabled in the UI** — the implementation is retained in the codebase for future re-enable, but all UI entry points (word-count click, bell edit-requests path, modal/chip/notifications-panel renders, sidebar live indicators, deep-link auto-join) are gated on `LIVE_SESSIONS_ENABLED = false` in `components/RichTextEditor.js`. The Live Sessions section below documents the design as it was when last enabled.

---

## Table of Contents

1. [Encrypted Share Links](#encrypted-share-links)
2. [Live Sessions (Real-time Collaboration)](#live-sessions)
3. [Security Architecture](#security-architecture)
4. [Message Protocol](#message-protocol)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Deployment](#deployment)

---

## Encrypted Share Links

### Overview

Share a read-only, encrypted snapshot of a note via a URL. The entire payload is encrypted client-side and embedded in the URL fragment (`#`), which browsers never send to servers. Zero-knowledge — no server ever sees the content.

### Key Files

- `utils/shareUtils.js` — Encryption, link generation, QR code
- `utils/shareDecrypt.js` — Decryption (shared between share page and Electron deep link handler)
- `pages/share.js` — Browser-based decryptor page (deployed to dash-share.vercel.app)
- `components/ShareModal.js` — UI for generating share links

### How It Works

1. **User clicks Share** → `ShareModal` opens with `noteContent={currentPage?.content}` and `noteTitle={currentPage?.title}`
2. **Encryption** (`generateShareLink`):
   - Generates a random 3-word passphrase (e.g. `maple-storm-42`)
   - Derives AES-256-GCM key from passphrase via PBKDF2 (100,000 iterations, SHA-256)
   - Encrypts `{ title, content, exportedAt }` as JSON
   - Encodes as: `[16-byte salt][12-byte IV][ciphertext]` → base64url
3. **Link format**: `https://dash-share.vercel.app/share.html#[passphrase].[encrypted-base64url]`
   - With password protection: `https://dash-share.vercel.app/share.html#[encrypted-base64url]` (passphrase omitted from URL)
4. **Fragment size limit**: 50KB (safe for Safari ~80KB, Firefox ~65KB)
   - Notes with large images may exceed this — shows "too large" error
5. **Recipient opens link** → `pages/share.js`:
   - Parses fragment to extract passphrase and encrypted data
   - If no passphrase in URL (password-protected mode): shows password input
   - Decrypts with PBKDF2 + AES-256-GCM
   - Renders blocks as HTML via `renderBlocks()` + DOMPurify sanitization
   - Shows "Save to Dash" button (deep link: `dashnotes://share#...`)

### Password Protection Mode

When enabled in ShareModal:
- The passphrase is **removed from the URL** — recipient must enter it manually
- Link alone cannot decrypt the note
- QR code available for the passphrase (scan to get password)
- Sender should share the passphrase via a different channel

### Content Format

The encrypted payload contains:
```json
{
  "title": "Page Title",
  "content": {
    "blocks": [
      { "type": "paragraph", "data": { "text": "Hello <b>world</b>" } },
      { "type": "header", "data": { "text": "Heading", "level": 2 } }
    ]
  },
  "exportedAt": "2026-03-16T..."
}
```

The `content` is the raw Editor.js page content (`currentPage.content`). Block `data.text` fields contain HTML for inline formatting (`<b>`, `<i>`, `<a>`, `<code>`, `<mark>`, `<s>`).

### Share Page Rendering

`pages/share.js` → `renderBlocks()` converts Editor.js blocks to HTML:
- Paragraph, header, list, checklist, bulletListItem, numberedListItem, checklistItem, quote, code/codeBlock, image, table, delimiter
- Includes `convertInlineMarkdown()` fallback for blocks containing raw markdown text instead of HTML
- All output sanitized with DOMPurify (allowlisted tags + attributes)

### Electron Deep Link

When a Dash desktop user clicks "Save to Dash":
- Opens `dashnotes://share#[fragment]`
- Electron handles this via the protocol handler in `electron-main.js`
- Uses `shareDecrypt.js` to decrypt and imports the note

---

## Live Sessions

### Overview

Real-time collaborative editing between two or more Dash users. All communication is end-to-end encrypted via AES-256-GCM. A WebSocket relay server forwards encrypted binary blobs between peers — the relay never sees plaintext content.

### Key Files

- `lib/liveSession.js` — WebSocket connection, E2E encryption/decryption, session lifecycle
- `components/RichTextEditor.js` — Session orchestration (host + guest logic), message handlers, UI (LiveSessionChip)
- `components/LiveSessionModal.js` — Session creation UI (duration picker, password)
- `store/liveNotesStore.js` — Zustand store for session state
- `pages/live.js` — Join page (parses URL fragment, redirects to main app)

### Session Creation (Host)

1. Host clicks "Start Live Session" → `LiveSessionModal` opens
2. Host selects duration (15min / 30min / 1hr / 2hr / unlimited) and optional password
3. `handleStartLiveSession()`:
   - Generates `roomId` (UUID) and `keyStr` (32 random bytes → base64url)
   - If password set: hashes with SHA-256 for later comparison
   - Creates WebSocket connection to relay at `wss://dash-relay.efesop.deno.dev/ws/{roomId}`
   - Imports AES-256-GCM key from `keyStr`
   - Builds session link: `{origin}/live#{roomId}.{keyStr}` (or `dashnotes://live#...` in Electron)
   - Stores session in Zustand: `{ roomId, keyStr, docId, pageId, isHost, link, duration, startedAt, passwordHash }`

### Joining a Session (Guest)

1. Guest receives link → opens `/live#{roomId}.{keyStr}`
2. `pages/live.js` stores `{ roomId, key }` in `sessionStorage`, redirects to `/`
3. Main app picks up from sessionStorage → calls `joinLiveSessionAsGuest(roomId, key)`
4. Guest flow:
   - Creates a temporary page with ID `live-{roomId}` (filtered from persistent storage saves)
   - Checks localStorage for existing page content (for rejoin scenarios)
   - Connects to WebSocket relay
   - Sends `request-sync` to get current document state

### Authentication Flow (Password Protected)

```
Guest → Host:  { type: 'request-sync' }
Host → Guest:  { type: 'auth-challenge' }
Guest → Host:  { type: 'auth-response', passwordHash: sha256(password) }
Host → Guest:  { type: 'auth-result', accepted: true/false }
Host → Guest:  { type: 'full-sync', blocks: [...] }  (only if accepted)
```

- Guest gets 3 attempts before being locked out
- Password is hashed client-side with SHA-256 — never sent in plaintext
- All auth messages are E2E encrypted through the relay

### Document Sync Protocol

**Full sync** — sent when a new peer joins or on reconnect:
```json
{
  "type": "full-sync",
  "title": "Page Title",
  "blocks": [{ "type": "paragraph", "data": { "text": "..." } }],
  "duration": 3600,
  "startedAt": 1710600000000
}
```

**Block-level delta** — sent on individual block edits:
```json
{ "type": "block-update", "index": 3, "block": { "type": "paragraph", "data": { "text": "updated" } } }
```

**Other message types**:
- `cursor` — cursor position for presence indicators: `{ blockIndex, peerId }`
- `typing` — typing indicator: `{ peerId, isTyping: true/false }`
- `session-end` — host ended session gracefully

### Conflict Resolution

When both host and guest edit the same block simultaneously:
- Each peer tracks locally modified blocks in `locallyModifiedBlocksRef`
- When a remote `block-update` arrives for a locally modified block, the local version wins
- A toast notification appears: "Conflict detected — your version was kept"
- The local modification flag is cleared after the conflict is resolved

### Encryption Details

- **Algorithm**: AES-256-GCM
- **Key**: 32 random bytes, imported as raw CryptoKey
- **IV**: 12 random bytes per message (fresh for each encryption)
- **Wire format**: `[12-byte IV][ciphertext]` as ArrayBuffer
- **Key exchange**: Embedded in URL fragment (never sent to relay server)
- The relay server only sees opaque binary blobs

### LiveSessionChip UI

The LIVE indicator in the page header shows:
- Pulsing green dot + "LIVE" label
- Avatar circles for all participants (colored using AVATAR_COLORS array based on peer ID hash)
- Countdown timer (synced between host and guest via `duration` + `startedAt` from full-sync)
- E2E encryption shield icon
- Copy link button
- End/Leave session button
- **Hover dropdown**: participant list with aliases, typing indicators, session info

### Timer Sync

- Host sends `duration` and `startedAt` in every `full-sync`
- Guest extracts these and updates local `activeSession` state
- Both peers calculate remaining time from `startedAt + duration - now`
- Timer persists across page switches (stored in `activeSession.startedAt`, not component state)

### Session End Flow

**Host ends session**:
1. Host clicks "End Session" → sends `{ type: 'session-end' }` to all peers
2. Host destroys WebSocket, clears session state

**Guest receives session-end**:
1. Destroys WebSocket, clears live session state
2. Converts `live-{roomId}` page to a normal page:
   - Generates new UUID for the page
   - Replaces `live-` page in pages array with the new adopted page
   - `live-` prefix pages are filtered from storage saves, so this conversion is critical
3. Navigates to the adopted page if currently viewing it
4. Cleans up localStorage entry
5. Shows toast: "Session ended — this page is now yours to edit"

**Guest disconnects / navigates away**:
- Page data persisted to `localStorage['dash-live-page-{roomId}']` on every sync
- On return to app, if session data exists in localStorage, shows banner:
  - If session ended by host: "Session ended — this is your copy now" + "Keep as My Page" button
  - If session might still be active: "Shared page from a live session" + "Rejoin" button

### Sidebar Indicators

- Pages with active live sessions show colored avatar dots (2-3 small circles)
- Uses `liveAvatarColors` derived from AVATAR_COLORS array
- Works in both expanded and collapsed sidebar modes

### Relay Server

- URL: `wss://dash-relay.efesop.deno.dev`
- Configurable via `NEXT_PUBLIC_RELAY_URL` env var
- Sends `{ type: '_meta', participants: N }` as JSON (unencrypted) for participant count
- All peer messages forwarded as binary blobs (E2E encrypted, relay cannot read)
- Auto-reconnect with exponential backoff (1s → 2s → 4s → ... max 30s)

---

## Security Architecture

### Share Links

| Property | Implementation |
|----------|---------------|
| Encryption | AES-256-GCM via Web Crypto API |
| Key derivation | PBKDF2, 100K iterations, SHA-256 |
| Key in URL | Fragment only (`#`) — never sent to any server |
| Server knowledge | Zero — decryptor page is static HTML, no backend |
| Content sanitization | DOMPurify with strict allowlist |

### Live Sessions

| Property | Implementation |
|----------|---------------|
| Encryption | AES-256-GCM via Web Crypto API |
| Key | 32 random bytes (cryptographic random) |
| Key exchange | URL fragment — never passes through relay |
| Per-message IV | 12 fresh random bytes per message |
| Relay sees | Opaque binary blobs only |
| Session password | SHA-256 hashed client-side, compared on host |
| Auth | Challenge-response with 3 attempt limit |

### What the Relay Never Sees

- Document content
- Page titles
- User identities
- Encryption keys
- Session passwords
- Cursor positions (encrypted like all other messages)

---

## Message Protocol

All messages between peers are JSON objects encrypted with AES-256-GCM before being sent as binary WebSocket frames.

| Type | Direction | Fields | Description |
|------|-----------|--------|-------------|
| `request-sync` | Guest → Host | `peerId` | Request full document state |
| `auth-challenge` | Host → Guest | `peerId` | Password required |
| `auth-response` | Guest → Host | `passwordHash`, `peerId` | SHA-256 of entered password |
| `auth-result` | Host → Guest | `accepted`, `peerId` | Auth success/failure |
| `full-sync` | Host → Guest | `title`, `blocks`, `duration`, `startedAt` | Complete document state |
| `block-update` | Either → Either | `index`, `block` | Single block changed |
| `cursor` | Either → Either | `blockIndex`, `peerId` | Cursor position |
| `typing` | Either → Either | `peerId`, `isTyping` | Typing indicator |
| `session-end` | Host → Guest | — | Host ended session |

### Relay Metadata (unencrypted)

| Type | Direction | Fields | Description |
|------|-----------|--------|-------------|
| `_meta` | Relay → Peer | `participants` | Current room participant count |

---

## Data Flow Diagrams

### Encrypted Share Link

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Host (Dash) │────→│ URL with #frag  │────→│  Recipient  │
│              │     │ (no server sees │     │  (browser)  │
│ AES-256-GCM  │     │  the fragment)  │     │             │
│ encrypt with │     └─────────────────┘     │ Decrypts    │
│ PBKDF2 key  │                              │ client-side │
└─────────────┘                              └─────────────┘
```

### Live Session

```
┌──────────┐   E2E encrypted    ┌─────────┐   E2E encrypted    ┌──────────┐
│   Host   │ ←───────────────→ │  Relay  │ ←───────────────→ │  Guest   │
│          │   (binary blobs)   │ Server  │   (binary blobs)   │          │
│ AES-GCM  │                    │         │                    │ AES-GCM  │
│ encrypt/ │                    │ Sees:   │                    │ encrypt/ │
│ decrypt  │                    │ - blobs │                    │ decrypt  │
│          │                    │ - count │                    │          │
└──────────┘                    └─────────┘                    └──────────┘
```

---

## Deployment

### Share Page (dash-share.vercel.app)

The share decryptor page at `https://dash-share.vercel.app` is a static HTML export of `pages/share.js`. See `MEMORY.md` → `vercel-deployment.md` for deployment instructions.

**Important**: Changes to `pages/share.js` must be redeployed to take effect on the live share page. The share link URL always points to `dash-share.vercel.app`, regardless of whether it was generated from localhost, the Electron app, or the PWA.

### Relay Server

The WebSocket relay runs on Deno Deploy at `dash-relay.efesop.deno.dev`. It:
- Accepts WebSocket connections at `/ws/{roomId}`
- Broadcasts binary messages to all other peers in the same room
- Sends participant count metadata as JSON
- Has no database, no auth, no logging of message content
- Stateless — rooms exist only while peers are connected

---

## Debug Mode

Set `window.__DASH_DEBUG = true` in the browser console to enable verbose logging:

- `[LiveSession]` — WebSocket connection, message encryption/decryption, send/receive
- `[live:host]` — Host message handler (request-sync, auth, block updates)
- `[live:guest]` — Guest message handler (full-sync, block updates, session end)
- `[share]` — Share link encryption (block count, content size)
- `[editor]` — Editor.js onChange events (block count, structural change detection)
