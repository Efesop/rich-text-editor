# Offline-First Apps

> Context document for generating a landing/resource page about offline-first architecture and how Dash implements it.

---

## SEO Target Keywords

- offline-first app
- offline note taking app
- local-first software
- no internet notes app
- offline notes
- local storage notes
- works without internet
- no cloud note app
- pwa offline app

---

## What Is Offline-First?

Offline-first is a software design approach where the application is built to work fully without an internet connection as the **default state**, not as a fallback. The network is treated as an enhancement, not a requirement.

This is the opposite of how most modern apps work. A typical cloud-based app requires a connection to function — if you lose internet, you lose access to your data or get a degraded experience. An offline-first app stores data locally on your device and functions identically whether you're connected or not.

### Offline-First vs Cloud-Based vs Offline-Capable

**Cloud-based (online-first):**
- Data lives on a remote server
- App requires internet to function
- Offline access is limited or nonexistent
- Examples: Google Docs, Notion (without caching)

**Offline-capable (online-first with cache):**
- Data lives on a remote server but is cached locally
- App works offline with cached data, but sync requires internet
- Conflicts can occur when reconnecting
- Examples: Notion (with offline mode), Apple Notes

**Offline-first (local-first):**
- Data lives on your device as the primary copy
- App works fully offline with zero degradation
- No server, no sync, no conflicts
- Examples: Dash, Obsidian (vault mode)

---

## Why Offline-First Matters

### Reliability
Internet connections fail. Wi-Fi drops on trains, planes, and in buildings with poor coverage. Cellular data has dead zones. Even home connections experience outages. An offline-first app doesn't care — your data is always available because it's already on your device.

### Speed
Local reads and writes are orders of magnitude faster than network requests. There's no loading spinner waiting for a server response, no latency from a round trip across the internet. Every action in an offline-first app is instantaneous.

### Privacy
When your data stays on your device, there's nothing to intercept, breach, or subpoena from a server. Dash is local-first: by default your notes exist in exactly one place — the device in your hands. If you opt into Dash Sync, your notes are end-to-end encrypted on-device first, so the relay only ever holds ciphertext it cannot read.

### Ownership
With cloud-based apps, you're renting access to your data. The service can change terms, increase prices, shut down, or lock you out. With offline-first, your data is yours — stored in formats you can access, back up, and migrate independently.

---

## How Dash Implements Offline-First

### Storage Architecture

Dash runs on three platforms, each using the most appropriate local storage mechanism:

**Desktop (Electron):**
- Data stored as JSON files on your local filesystem
- Read and written through Electron's IPC (inter-process communication)
- Files are in your app data directory — accessible, portable, and backupable

**Mobile (PWA / Capacitor):**
- Primary storage: **IndexedDB** — a browser-native database with generous storage limits
- Database name: `DashNotesDB` with separate object stores for pages, tags, and metadata
- Automatic persistent storage request (`navigator.storage.persist()`) to prevent the OS from evicting data
- Fallback: localStorage if IndexedDB is unavailable

**Web Browser (Fallback):**
- Uses `localStorage` for simple key-value storage
- 5-10 MB limit depending on the browser
- Suitable for light use; desktop/mobile apps are recommended for heavy use

### Automatic Platform Detection

Dash automatically detects which platform it's running on and selects the right storage backend:

1. Check if running in **Electron** (desktop app) → use file system storage
2. Check if running as a **PWA** (installed web app / standalone mode) → use IndexedDB with localStorage fallback
3. Otherwise → use localStorage (browser tab)

This detection is transparent to the user — the app interface is identical regardless of storage backend.

### Data Migration

When a user transitions between storage backends (e.g., first opening the PWA after using the browser version), Dash automatically migrates existing data:

- Detects data in localStorage
- Copies it to IndexedDB
- Preserves all pages, tags, folders, and settings
- No user action required

### Offline-First, Sync Optional

Dash works fully offline with no account. Nothing is uploaded unless you opt in:

- **No account required for local use**: create and edit notes with no sign-up, login, or email
- **Your notes stay on your device by default**: nothing leaves the device unless you share a note or turn on Dash Sync
- **Export/import** in multiple formats (JSON, Markdown, PDF, DOCX, and more) moves data between devices without any server; encrypted exports can be password-protected

### Optional Network Features

While Dash works fully offline, two opt-in features use a zero-knowledge relay when you choose to use them:

- **Encrypted sharing**: When you share a note, the content is encrypted on your device with AES-256-GCM before being uploaded to the relay. The server stores only an encrypted blob it cannot read, which is auto-deleted after 30 days.
- **Dash Sync** (subscription): Syncs notes, attachments, and version history across your own devices. Everything is encrypted on-device before upload; the relay stores only ciphertext it cannot read, and your vault key never leaves your devices. Requires a passwordless magic-link email to link your subscription to your devices.

Both are entirely opt-in. If you never share a note or enable sync, Dash makes no network requests beyond checking for app updates on desktop. (Real-time live collaboration is built but currently disabled in shipping builds.)

---

## Technical Details

### IndexedDB Implementation

For the PWA/mobile platform, Dash uses IndexedDB with the following structure:

- **Database**: `DashNotesDB`, version 4
- **Object stores**:
  - `pages` — all page data (content, metadata, encryption info, self-destruct timestamps)
  - `tags` — tag definitions and colors
  - `metadata` — app-level data like last save timestamp
  - `attachments` — file attachments stored separately from page JSON
  - `versions` — page version history
  - `vaultMetadata` — Dash Sync vault state (no vault key)
  - `syncQueue` — pending sync operations
- **Indexing**: Pages indexed by `lastModified` for efficient sorting
- **Transactions**: All reads/writes use IndexedDB transactions for data integrity

### Progressive Web App (PWA)

Dash's PWA implementation includes:

- **Service worker**: Caches all app assets for offline use
- **Web app manifest**: Enables "Add to Home Screen" installation
- **Standalone display mode**: Runs like a native app without browser UI
- **Persistent storage**: Requests storage persistence to prevent data eviction on mobile browsers

### Storage Limits

| Platform | Storage | Typical Limit |
|----------|---------|---------------|
| Desktop (Electron) | File system | Disk space (effectively unlimited) |
| Mobile PWA (IndexedDB) | Browser storage | 50-100+ MB (varies by browser/OS) |
| Web browser (localStorage) | Browser storage | 5-10 MB |

---

## Key Differentiators

| Feature | Dash | Cloud note apps | Other local apps |
|---------|------|----------------|-----------------|
| Works without internet | Always | Limited/no | Varies |
| Data location | Your device only | Their servers | Usually local |
| Account required | No | Yes | Sometimes |
| Platform support | Desktop, Mobile PWA, Web | Web + native apps | Varies |
| Storage auto-detection | Yes (3 backends) | N/A | Usually single backend |
| Data migration | Automatic between backends | N/A | Manual |
| Export formats | JSON, MD, PDF, DOCX, RTF, CSV, XML | Usually limited | Varies |
