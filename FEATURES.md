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
| Nested List | Ordered and unordered with unlimited nesting |
| Checklist | Interactive to-do items |
| Quote | Block quotes with author caption |
| Code | Code blocks with monospace formatting |
| Table | Rows, columns, and optional headings |
| Image | Drag-and-drop or file picker (up to 5MB, stored locally) |
| Embed | YouTube, Vimeo, GitHub, Twitter |
| Delimiter | Visual section separator |

### Inline Formatting

- **Bold** (Cmd+B)
- **Italic** (Cmd+I)
- **Underline** (Cmd+U)
- **Strikethrough**
- **Highlight / Marker** (Cmd+Shift+H)
- **Inline Code** (Cmd+Shift+M)
- **Links** (Cmd+K)

### Text Alignment

Left, center, and right alignment available on paragraphs and headers via the block settings menu.

### Undo / Redo

Full undo/redo history with Cmd+Z and Cmd+Shift+Z.

### Auto-Save

Changes save automatically with a 300ms debounce. A save indicator shows current status.

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

### Search
- Full-text search across all page titles and content (powered by Fuse.js)
- Combine search with tag filters
- Instant results as you type

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
