# Dash — Feature Overview

> Privacy-first, offline-first note-taking app. No cloud, no tracking, your data stays on your device.

## Platforms

- **Desktop** — macOS, Windows, Linux (Electron)
- **Mobile** — iOS, Android (PWA + Capacitor)
- **Browser** — Any modern browser, no install needed

Storage auto-detects: Electron uses local JSON files, PWA uses IndexedDB, browser uses localStorage. All data stays on-device.

---

## Rich Text Editor

Block-based editor powered by Editor.js with 15+ content types:

| Block Type | Description |
|-----------|-------------|
| Paragraph | Standard text with inline formatting |
| Header | H2, H3, H4 levels |
| Bullet List | Individual bullet items, each its own block |
| Numbered List | Individual numbered items with auto-numbering |
| Checklist | Interactive checkbox items, each its own block |
| Quote | Block quotes with author caption |
| Code | Syntax-highlighted code blocks (22 languages) |
| Table | Rows, columns, and optional headings |
| Image | Drag-and-drop or file picker (up to 5MB, stored locally) |
| Embed | YouTube, Vimeo, GitHub, Twitter |
| Delimiter | Visual section separator |
| Seed Phrase | Secure numbered grid for cryptocurrency recovery phrases (12 or 24 words) with BIP-39 validation |

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

### Quick Switcher (Cmd+P)
- VS Code-style fuzzy search overlay to jump to any page instantly
- Arrow keys + Enter for keyboard navigation, Escape to close
- Recent pages shown at top
- Highlights matching characters in results

---

## Themes

Four built-in themes, each fully applied to the editor, sidebar, modals, and all UI elements:

| Theme | Description |
|-------|-------------|
| **Light** | Clean, bright interface |
| **Dark** | Pure neutral dark mode (no blue tint) |
| **Dark Blue** | Professional navy-tinted dark mode |
| **Fallout** | Retro terminal aesthetic — green on black |

Theme preference persists across sessions.

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
- **Touch ID / biometric unlock** — use Touch ID on macOS as an alternative to typing your password
- Biometrics also available for unlocking individual locked pages
- Instant lock with Cmd+Shift+L shortcut or sidebar lock button
- Locks automatically on app launch if enabled
- Settings persist across app updates

### Duress Password
- Set a secondary password during app lock setup or in settings
- When entered at the lock screen, silently triggers a panic action — the attacker sees a normal empty app
- **Hide mode** — clears the app from memory but preserves data on disk. Re-entering the real password restores everything.
- **Wipe mode** — permanently deletes all pages. Irreversible.
- Must be different from the real password
- No visual indication that a duress action was triggered

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
- Set a page to automatically delete after a time period (1 hour, 1 day, 7 days, or 30 days)
- Countdown badge in the sidebar shows precise time remaining
- Badge color shifts from green to orange to red as expiry approaches
- Cancel self-destruct at any time via the page's context menu

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

All exports can optionally be **encrypted with a passphrase** (AES-GCM-256).

### Import
- Import from JSON, Markdown, Plain Text, DOCX, or CSV
- Supports passphrase-protected encrypted files
- Up to 50MB file size
- Bulk import multiple pages at once

---

## Desktop Features (Electron)

- **Auto-update** — checks for updates automatically, download and install in-app
- **Native file storage** — pages saved as local JSON files
- **Bug reporting** — built-in GitHub issue creator
- **macOS Applications folder prompt** — guides users to install correctly
- **Cross-platform builds** — macOS (Apple Silicon + Intel), Windows, Linux
- **What's New modal** — shows new features on first launch after each update

---

## Mobile Features (PWA)

- **Install as app** — add to home screen on iOS/Android
- **Offline support** — full service worker caching
- **Touch-optimized UI** — action sheets replace dropdowns, responsive layout
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
| Mobile | PWA (next-pwa), Capacitor 6 |
| State | Zustand |
| Search | Fuse.js |
| Drag & Drop | @dnd-kit |
| Encryption | WebCrypto API (AES-GCM), bcryptjs |
| UI | Radix UI, Lucide React icons |
