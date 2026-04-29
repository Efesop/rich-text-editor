# Changelog

All notable changes to Dash will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.164] - 2026-04-07

### Security
- **Save pipeline pageId pinning** — Every save now carries a `pageId` from the Editor instance that produced the content. `savePage` looks up the target page via `pagesRef.current.find(p => p.id === forPageId)` and never reads `currentPageRef`. Eliminates an entire class of cross-page save corruption bugs caused by async gaps (debounce, unmount flush, concurrent ops).
- **`pagesRef` useEffect guard** — `pagesRef` only syncs from React state before initialization; after init, all operations set it explicitly. Prevents stale React state from overwriting fresh save data.
- **Test suite** — 116 tests, 19 suites. Covers XSS, encryption schema, import safety, export escaping, URL validation, data-safety invariants, codebase static analysis, and page-switch race-condition prevention.

## [1.3.163] - 2026-04-07

### Security
- **Security audit — 12 medium-severity fixes** — Round 2 of the security audit. Includes hardening across encryption flows, sanitization edges, and import paths.

## [1.3.162] - 2026-04-06

### Security
- **Security audit — 14 critical and high-severity fixes** — Major audit pass. Magic-bytes attachment validation, RTF injection escaping, share image URL validation, brute-force lockout persisted to Electron IPC file, decoy vault key obfuscation, GitHub Actions pinned to commit SHAs, encrypted-content schema validation in `electron-main.js`, `.env` removed from Electron bundle, and more.
- **Async attachment validation** — `validateAttachment()` now reads file headers and verifies magic bytes against the declared MIME type. Callers must `await`.

## [1.3.161] - 2026-04-05

### Fixed
- **Editor toolbar clipping** — Block toolbar (+/⋮⋮ icons) no longer gets clipped behind the sidebar on narrow windows.

## [1.3.160] - 2026-03-20

### Fixed
- **Flush editor before share/export/save** — `window.__editorFlush()` is now called before share, export, and beforeunload to prevent the last ~300ms of typing from being lost.

## [1.3.159] - 2026-03-19

### Added
- **Version history** — Browse and restore previous page versions. Up to 10 versions per page, throttled to 30s minimum between captures, SHA-256 content-hash dedup. "Restore as New Page" creates a non-destructive copy with the old content. Locked pages do not capture versions; existing versions are deleted when a page is locked.

### Fixed
- **`pagesRef` as source of truth** — All ~22 page-modifying operations (delete, rename, duplicate, lock, reorder, etc.) now read from `pagesRef.current` instead of stale `prevPages` from React state. Fixes a silent data-loss bug where edits could be overwritten by structural operations performed without first navigating away.

## [1.3.158] - 2026-03-19

### Fixed
- **Attachment handling for dashpack, duplicate, and share** — Dashpack export bundles attachments as base64 via `collectAttachmentsForExport()`. Page duplicate copies attachment files with new UUIDs. Share replaces attachment blocks with `[Attachment: filename]` placeholders.

## [1.3.157] - 2026-03-19

### Added
- **File attachments (v1)** — Attach images (JPEG, PNG, GIF, WebP) and PDFs to notes via the `+` block menu. Max 10MB per file. Stored separately from page JSON: Electron uses `userData/attachments/`, PWA uses IndexedDB, browser uses localStorage base64. Page blocks store small references (`{ attachmentId, filename, mimeType, size }`).

### Fixed
- **Page unlock after app lock** — Pages no longer show empty content or wrong modal when unlocked after the app has been locked.

## [1.3.156] - 2026-03-18

### Added
- **AI panel enhancements** — Markdown preview, chat mode, keyboard shortcuts, and "Save as Note" for AI responses.

## [1.3.155] - 2026-03-17

### Added
- **Local AI integration** — On-device LLM support for Summarize, Rewrite, Continue, Explain, and Custom prompts. Works with Ollama, LM Studio, LocalAI, and Jan. Settings persisted via `store/aiStore.js`. All data stays on-device; no cloud calls.

### Changed
- **Guides + project docs updated** — Refreshed landing-page guides and project docs.

## [1.3.154] - 2026-03-17

### Added
- **Markdown table and image paste** — Paste markdown tables and image URLs and they convert to native blocks.

### Fixed
- **Share UX** — Various share-flow polish.
- **Offline error silencing** — Suppress noisy errors when offline.

## [1.3.153] - 2026-03-16

### Security
- **CSP — relay server allowed in `connect-src`** — Required for share-blob uploads.

## [1.3.152] - 2026-03-16

### Fixed
- **Relay URL wss→https conversion** — Code that uses `NEXT_PUBLIC_RELAY_URL` for HTTP requests now correctly converts `wss://` to `https://`.
- **Preserve folder emoji on save** — Folder emoji no longer stripped during save.

## [1.3.151] - 2026-03-16

### Fixed
- **Relay URL domain** — Corrected `.deno.dev` → `.deno.net` for share storage.

## [1.3.150] - 2026-03-16

### Added
- **Server-stored share links** — Optional server-stored share blobs with 30-day expiry. Encrypted client-side; the relay only stores opaque ciphertext.

## [1.3.149] - 2026-03-16

### Added
- **Deflate compression for share payloads** — Share links are smaller.

### Fixed
- **List rendering on share page** — List items now group correctly.
- **Real logo on share page**.

## [1.3.148] - 2026-03-16

### Fixed
- **Share page** — Real logo and proper list grouping.

## [1.3.147] - 2026-03-16

### Added
- **Live sessions** — Real-time collaboration via the `dash-relay` WebSocket relay (WSS-only, with `roomId` and `key` validation).
- **Share page redesign**.

### Fixed
- **Editor flush on share** — Share now flushes the editor before encrypting the snapshot.

## [1.3.146] - 2026-03-14

### Added
- **Folder rename modal with emoji picker**.
- **Auto-linkify URLs in tables**.

## [1.3.145] - 2026-03-14

### Added
- **Improved drag-and-drop** — Smoother cross-folder moves and reordering.
- **Auto-linkify table URLs**.
- **Page link icon**.

### Fixed
- **Folder badge counts**.

## [1.3.144] - 2026-03-14

### Fixed
- **Dropdown positioning for folder pages**.
- **Content loss on rapid page switch**.

## [1.3.143] - 2026-03-14

### Added
- **Micro-animations** across UI interactions.
- **Reliable undo/redo** — Replaced buggy `editorjs-undo` plugin with custom snapshot-based system (50-snapshot stack, debounced 500ms, capture-on-first-undo).

### Fixed
- **App lock save flow**.

## [1.3.142] - 2026-03-14

### Added
- **Collapsed sidebar redesign** — 3-letter squircles for pages, bare folder icon, right-side tooltips with 150ms delay.
- **Lock indicator** — Blue/green check icon for locked pages on hover.
- **Hover slide animations** — Negative-margin slide pattern that pulls tags/badges into the three-dot button space when idle and slides them left on hover.

## [1.3.141] - 2026-03-12

### Added
- **Mini-outline (table-of-contents) widget** — Auto-generated from headings.
- **Checklist paste support**.

### Fixed
- **Paragraph paste** — Various paste-handler edge cases.

## [1.3.140] - 2026-03-12

### Fixed
- **Paste queue deferred element refs**.
- **Divider styling and rename**.

## [1.3.139] - 2026-03-12

### Added
- **Cmd+click multi-block selection** — Toggle individual blocks in/out of selection.
- **Paste link preservation** — Inline links survive paste.

### Changed
- **Link styling**.

## [1.3.138] - 2026-03-12

### Fixed
- **Multi-block selection** edge cases.
- **Update error suppression**.
- **Block highlights**.

### Security
- **DOMPurify on share page**.

## [1.3.137] - 2026-03-12

### Added
- **Encrypted share links (v1)** — Generate read-only, encrypted share links. Payload encrypted client-side and embedded in the URL fragment (zero-knowledge — never sent to a server). Optional password protection.
- **EXIF stripping** on image attachments.
- **Decoy app** — Hidden via duress password.
- **Deep linking** — `dash://share#...` protocol handler.
- **Share page** at `dash-share.vercel.app`.

## [1.3.136] - 2026-03-10

### Fixed
- **Terminal (Fallout) theme CSS cleanup**.
- **Quote placeholder bug**.
- **Tag colors**.

## [1.3.135] - 2026-03-09

### Added
- **App lock indicator** — Sidebar lock icon shows when app lock is enabled.

## [1.3.134] - 2026-03-09

### Fixed
- **Save flicker loop**.
- **Self-destruct timer loss**.
- **DarkBlue theme color tweaks**.

## [1.3.133] - 2026-03-09

### Fixed
- **Seed phrase blur toggle**.
- **Quote/table/wiki-link theming**.
- **Save flicker**.

## [1.3.132] - 2026-03-08

### Fixed
- **Duress recovery without restart** — Re-entering the real password restores hidden state without needing to restart the app.
- **Tags clear correctly on duress hide**.
- **Features panel re-ordering**.

## [1.3.131] - 2026-03-08

### Security
- **CRITICAL: Duress password data-loss fix** — Wipe mode disabled in the UI (kept in code as `wipeAllPages` but unreachable from the duress flow). Hide mode now sets `savesBlockedRef = true` BEFORE clearing in-memory state, then cancels pending debounced saves and clears encryption keys. Fixes a March 2026 incident where `setPages([])` triggered a stale `pagesRef` save that destroyed both `pages.json` and `pages.json.bak`.

## [1.3.130] - 2026-03-08

### Added
- **Feature discovery panel** — Slide-over drawer with stagger-animated feature cards and looping CSS illustrations.
- **Page linking (`[[wiki links]]`)** — Type `[[` to trigger autocomplete dropdown of existing pages. Also via inline toolbar.
- **Seed phrase storage** — Editor.js block type for crypto wallet recovery phrases. 12/24-word grid with BIP-39 validation, multi-word paste, 30-second auto-clear copy, Tab/Enter nav.
- **Duress password (initial)** — Secondary password that silently triggers a panic action at the lock screen. (Wipe mode later disabled in 1.3.131.)

### Security
- **Sanitization for new block types** — `bulletListItem`, `numberedListItem`, `checklistItem`, `seedPhrase` get dedicated DOMPurify cases.
- **Page link sanitization** — `data-page-id` and `class` whitelisted on `<a>` tags.
- **Duress password validation** — Must differ from real password; disabled when app lock is off.

## [1.3.129] - 2026-03-07

### Added
- **Block drag-and-drop** within the editor.

### Fixed
- **Header hover behavior**.
- **Keyboard shortcut conflicts**.

## [1.3.128] - 2026-03-07

### Fixed
- **Typewriter scrolling centering**.
- **Focus pill idle behavior**.

## [1.3.127] - 2026-03-07

### Added
- **What's New modal** updated with focus mode features and keyboard shortcuts.

## [1.3.126] - 2026-03-07

### Added
- **Focus mode improvements** — Typewriter scrolling, paragraph dimming, session word count stats.
- **Keyboard shortcuts modal**.
- **Session stats** on focus-mode exit.

## [1.3.125] - 2026-03-06

### Fixed
- **Page lock button doing nothing when app lock was enabled**.

## [1.3.124] - 2026-03-06

### Fixed
- **Preload IPC** — Was only forwarding one argument, breaking `safe-storage-store`.

## [1.3.123] - 2026-03-06

### Fixed
- **Update button on error boundary fallback**.

## [1.3.122] - 2026-03-06

### Fixed
- **WhatsNewModal crash** — `onClose` was undefined.

## [1.3.121] - 2026-03-06

### Fixed
- **Biometric unlock regression**.
- **Modal backdrop close** — Backdrop div now has `onClick={onClose}` directly (was previously only on parent wrapper).
- **Icon tooltips** — `pointer-events-none` on lucide-react SVGs so the parent button's `title` tooltip works.

## [1.3.120] - 2026-03-06

### Security
- **Comprehensive security hardening** — Multiple defensive fixes across save flow, sanitization, and storage.

## [1.3.119] - 2026-03-05

### Added
- **Unified search & tag filter modal** — One overlay for full-text search and tag filtering.

## [1.3.118] - 2026-03-05

### Added
- **Encryption choice modal** — Pick between page-level password and app-level encryption.
- **Biometric toggle UX** improvements.

### Fixed
- **Self-destruct save race**.

## [1.3.117] - 2026-03-05

### Security
- **Real AES-256-GCM encryption for app lock** — Pages encrypted at rest under the app-lock key (PBKDF2 600K iters → AES-GCM-256). Plaintext cleared from memory on lock.

### Added
- **Encryption choice modal**.
- **SEO guides** (`guides/` directory).

## [1.3.116] - 2026-03-04

### Added
- **Self-destruct animations** — Pulse/shake/dissolve sequence on expiring notes.

### Fixed
- **Encryption badge display**.
- **Icon hover behavior**.

## [1.3.115] - 2026-03-04

### Added
- **Lock UI improvements**.
- **Custom self-destruct time** input.
- **Page lock and self-destruct icons**.

## [1.3.114] - 2026-03-04

### Fixed
- **Tag chips z-index** — Wrapped in `isolate` container to prevent leaking above modals/backdrops.

## [1.3.113] - 2026-03-04

### Changed
- **Platforms table** — README/marketing now show macOS + browser only.

## [1.3.112] - 2026-03-04

### Changed
- **README** updated for open-source project page.

## [1.3.111] - 2026-03-04

### Fixed
- **Sidebar tag display** — Compact chips for multi-tag, proper truncation, fixed-position popups (escape `overflow-hidden` ancestors).

## [1.3.110] - 2026-03-04

### Added
- **Individual list item blocks** — Bullet, numbered, and checklist items are each their own `.ce-block` (one item = one block). Custom tools: `BulletListItem`, `NumberedListItem`, `ChecklistItem` with Enter/Backspace/slash-menu support.
- **Multi-block convert menu** — Floating settings icon converts selected blocks to Text, H1, H2, H3, Bullet List, Numbered List, Checklist, Quote, or Code.
- **Block migration** — Legacy `nestedlist`/`checklist` blocks auto-migrated on load via `utils/migrateBlocks.js`.

### Fixed
- **Header toolbar alignment** — Headers use `padding-top` (not `margin-top`) so the toolbar (+/⋮⋮) aligns with header text.
- **Numbered list numbering in exports** — PDF, Markdown, Plain Text, RTF, DOCX exports include sequential numbering that resets after non-list blocks.
- **Word count includes list items**.

## [1.3.109] - 2026-03-04

### Fixed
- **Robust sidebar layout**.
- **DarkBlue +N chip**.
- **Self-destruct timer inside badge**.
- **Tag X colors**.

## [1.3.108] - 2026-03-04

### Fixed
- **Sidebar title truncation**.
- **Tag modal improvements**.
- **Folder "add new page"**.

## [1.3.107] - 2026-03-03

### Fixed
- **3-dot menu visibility**.
- **Hover contrast**.
- **Dark scrollbars**.

## [1.3.106] - 2026-03-03

### Fixed
- **Sidebar 3-dot button visibility**.
- **List conversion preserving items**.

## [1.3.105] - 2026-03-03

### Fixed
- **Sidebar icons**.
- **Lock/self-destruct UX**.
- **Export/theme button sizing**.

## [1.3.104] - 2026-03-03

### Fixed
- **Tag z-index**.
- **Sidebar cramping**.
- **Duplicate pages**.
- **Undo/redo**.
- **Multi-block convert**.
- **Selection preservation**.

## [1.3.103] - 2026-03-02

### Fixed
- **Lock dropdown clipping**.

### Added
- **Page lock and self-destruct icons** in the page header.

## [1.3.102] - 2026-03-02

### Added
- **Lock UI improvements**.
- **Custom self-destruct time**.
- **Page lock icon**.

## [1.3.101] - 2026-03-02

### Added
- **What's New modal** — Shown on first launch after each update.
- **Quick Switcher** — Cmd+P fuzzy search overlay (VS Code-style) with recent pages, arrow-key nav, character highlighting.
- **Self-destructing notes** — Set a page to auto-delete after 1 hour, 1 day, 7 days, or 30 days. Countdown badge with color shift (green → orange → red). Cancel via context menu.
- **Auto-lock with Touch ID** — Lock the app after a configurable idle timeout. Master password unlock or Touch ID on macOS. Cmd+Shift+L for instant lock.

## [1.3.100] - 2026-02-28

### Fixed
- **CI runner** — Reverted to `macos-latest` (`macos-13` deprecated).

## [1.3.99] - 2026-02-28

### Added
- **Focus mode** — Distraction-free writing with sidebar/header/footer hidden. Cmd+Shift+F to toggle.
- **Syntax-highlighted code blocks** — 22 languages.

### Fixed
- **CI build**.

## [1.3.98] - 2026-02-27

### Added
- **Frameless title bar on macOS**.

### Removed
- **Broken toggle block plugin**.

## [1.3.97] - 2026-02-27

### Fixed
- **Sidebar logo** — Use relative path so the image renders in Electron.

### Changed
- **FEATURES.md** added for landing-page reference.

## [1.3.96] - 2026-02-27

### Added
- **Editor.js improvements** — Custom undo/redo, underline, text alignment, toggle blocks (later removed).

## [1.3.95] - 2026-02-27

### Added
- **DarkBlue theme**.

### Fixed
- **Dark theme neutrals**.
- **Editor.js popovers themed correctly**.

## [1.3.94] - 2026-02-27

### Changed
- Version bump after 1.3.93 release.

## [1.3.93] - 2026-02-26

### Security
- **Encrypted locked page content with AES-256-GCM** - Locked pages now have their content encrypted on disk using AES-256-GCM with PBKDF2 key derivation (600K iterations). Previously only the password was hashed.
- **Removed unsecured API endpoint** - Deleted `/api/pages` which allowed unauthenticated read/write access.
- **Removed leaked certificate files from git tracking** - Untracked `certificate.p12` and `encoded-certificate.txt` from the repository index.
- **Tightened Content Security Policy** - Removed `https:` from `img-src` directive since the app is offline-only.
- **Persistent brute-force lockout** - Password attempt tracking now persists across page reloads via localStorage with exponential backoff (30s, 60s, 2m, 5m).

### Added
- **Move to Folder option on pages** - Pages now have a "Move to Folder" option in their dropdown menu, allowing users to move pages into folders directly from the page context menu.
- **MoveToFolderModal component** - New single-select folder picker modal with full theme support.

### Fixed
- **Removed unused html2pdf.js dependency** - Was installed but never imported. Replaced with direct jspdf dependency.

### Changed
- **Encryption key caching for auto-save** - Derived AES keys are cached in memory during editing sessions to avoid slow PBKDF2 derivation on every auto-save.
- **Backwards-compatible with legacy locked pages** - Existing locked pages without encrypted content will be encrypted on next lock/unlock cycle.

## [1.3.91] - 2026-02-23

### Fixed
- **Improved critical error display in desktop app** - Better error boundary handling for production builds.

## [1.3.90] - 2026-02-22

### Added
- **Prompt macOS users to move app to Applications folder** - Shows a friendly prompt when the app is running from outside the Applications directory.

## [1.3.89] - 2026-02-21

### Fixed
- **Centered ActionSheet modals** - ActionSheet modals now properly center and match styling of other modal components.

## [1.3.87-1.3.88] - 2026-02-20

### Added
- **Mobile UX improvements** - ActionSheet component, MobileHeaderMenu, and click-outside detection fixes for mobile devices.

## [1.3.86] - 2026-01-23

### Security
- **Fixed XSS vulnerability in data: URI handling** - Blocked data: URLs except for safe image MIME types (PNG, JPEG, GIF, WebP, BMP, ICO). SVG data URIs are fully blocked as they can contain scripts.
- **Added password brute-force protection** - Limited to 5 attempts with 30-second lockout to prevent password guessing attacks.
- **Increased PBKDF2 iterations to 600,000** - Updated from 200,000 to meet NIST 2024 security recommendations.
- **Fixed race conditions in save system** - Implemented save queue with version tracking to prevent data loss during rapid page switches.

### Fixed
- **Fixed "Use on your phone" visibility** - Now hidden on mobile/PWA but visible on desktop Electron app so users can set up mobile sync.
- **Fixed export overwriting previous backups** - Dashpack exports now include date in filename (e.g., `dash-notes-2026-01-23.dashpack`).
- **Fixed sidebar overlapping iPhone status bar** - Added safe-area-inset support for notch and status bar.
- **Fixed dropdowns appearing behind sidebar** - Increased z-index for all dropdowns to appear above sidebar on mobile.
- **Fixed production error boundary** - Errors now show user-friendly messages in production (not just development).
- **Fixed ESLint violations** - Re-enabled react-hooks/exhaustive-deps and no-unused-vars rules; fixed all violations.
- **Fixed temporary page unlock behavior** - Unlocked pages now stay unlocked during session instead of re-locking on page switch.

### Added
- **User-friendly import/export errors** - Clear error messages for wrong passphrase, invalid file format, and file too large (50MB limit).
- **ARIA accessibility attributes** - Added proper aria-expanded, aria-haspopup, aria-controls, and role attributes to dropdowns and modals.
- **Centralized theme utilities** - New `utils/themeUtils.js` reduces code duplication across components.
- **Centralized device detection** - New `utils/deviceUtils.js` for consistent mobile/PWA detection.
- **Reusable dropdown positioning hook** - New `hooks/useDropdownPosition.js` for consistent dropdown behavior.
- **ConfirmModal component** - Replaced window.confirm() with accessible custom modal for better PWA/mobile support.

## [1.3.83] - 2026-01-08

### Fixed

#### Critical State Synchronization Bugs
- **Fixed: Pages automatically leaving folders after editing** - When a page was added to a folder and then edited, it would automatically come out of the folder. The `currentPage` state wasn't being updated when adding pages to folders, causing the stale state to overwrite the `folderId` on save.
- **Fixed: `deleteFolder` not updating currentPage** - When deleting a folder, pages inside the folder had their `folderId` removed, but if the current page was in that folder, the `currentPage` state wasn't updated, leading to stale state.
- **Fixed: Import bundle bypassing state synchronization** - The import bundle function was directly manipulating the `pages` array without properly updating `currentPage`, which could cause data inconsistency if the imported pages included the currently open page.

#### UI and Component Bugs
- **Fixed: Current page excluded from "Add Pages to Folder" modal** - Newly created pages couldn't be added to folders because they were incorrectly filtered out of the available pages list.
- **Fixed: Pages inside folders cannot be duplicated** - The `onDuplicate` prop wasn't being passed to `PageItem` components inside folders, preventing duplication.
- **Fixed: Folder data loss on save** - The Electron main process was stripping out the `pages` array from folder objects during sanitization, causing folders to lose track of their contents.
- **Fixed: Missing accessibility features** - The `useScreenReader` and `useSkipNavigation` hooks were imported but never called, meaning screen reader announcements and skip navigation weren't active.

#### UI Enhancements
- **Redesigned all modals with modern aesthetics**:
  - `AddPageToFolderModal` - Modern design with backdrop blur, custom checkboxes, selection counter, and full theme support
  - `FolderModal` - Icon header, descriptive subtitle, live preview, modern styling
  - `RenameModal` - Enhanced with live preview and modern design
  - `PasswordModal` - Added password strength meter and modern styling
  - `PassphraseModal` - Modern design with full theme support
- All modals now have complete support for light, dark, and fallout themes

### Technical Improvements
- Added new `importBundle` function in `usePagesManager` that properly handles state synchronization during import operations
- Improved state management pattern to ensure `currentPage` always stays in sync with the `pages` array
- Enhanced Electron main process to properly preserve folder structure during save operations

## [1.3.82] - Previous Release

_(Earlier releases not documented yet)_
