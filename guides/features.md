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

### Duress Password

A secondary password that triggers a panic action when entered at the lock screen. If someone forces you to unlock the app, entering the duress password silently wipes or hides your data instead of unlocking normally.

- Configure in App Lock settings after enabling app lock
- Choose between wipe (deletes all data) or hide (shows empty state)
- Indistinguishable from a normal unlock attempt to an observer
- Provides plausible deniability under coercion

### Self-Destructing Notes

Set any page to automatically delete itself after a time period. A live countdown badge in the sidebar tracks the remaining time. Useful for temporary information you don't want lingering — passwords, one-time codes, sensitive instructions.

- Preset timers: 1 hour, 24 hours, 7 days, 30 days
- Custom timer with days, hours, and minutes precision
- Live countdown badge visible in the sidebar
- Deletion happens automatically even if the app is reopened later

### Seed Phrase Storage

A dedicated secure block type for storing cryptocurrency wallet recovery phrases. Displays as a numbered grid with BIP-39 word validation. Combined with page encryption, this provides a secure offline backup for seed phrases.

- 12 or 24-word grid layout
- BIP-39 wordlist validation with visual feedback
- Add from the + block menu in the editor
- Designed to pair with page encryption for maximum security

---

## Editor

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
- Supports all block types: paragraph, headings, lists, code, seed phrase

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

### Folders & Tags

Organize your pages into collapsible folders and add tags for quick filtering. Folders can be nested in the sidebar, and tags appear as colored chips on pages. Filter pages by tag from the sidebar to quickly find related notes.

- Create folders and drag pages into them
- Add multiple tags to any page
- Filter sidebar by tag
- Folders collapse to keep the sidebar tidy

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

---

## Platform & Architecture

- **Desktop**: Electron app for macOS (Windows/Linux planned)
- **Mobile**: Progressive Web App (PWA) with Capacitor
- **Storage**: Local JSON files (desktop) or IndexedDB (mobile) — no cloud, no sync
- **Framework**: Next.js 13, React 18, Tailwind CSS
- **Editor**: Editor.js with custom block tools
