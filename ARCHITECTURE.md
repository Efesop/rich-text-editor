# Dash Architecture

This document explains how Dash works internally, its data flow, and key architectural decisions.

## Overview

Dash is a privacy-first, offline note-taking application. It runs as:
- **Desktop App**: Electron-based application for macOS, Windows, and Linux
- **Mobile PWA**: Progressive Web App for iOS/Android

All data is stored locally on your device - never in the cloud.

## Core Principles

1. **Privacy First**: No network requests for data, no analytics, no tracking
2. **Offline First**: Works without internet after initial install
3. **Local Storage**: Data stays on your device, encrypted when password-protected
4. **Cross-Platform**: Same codebase for desktop and mobile

## Application Structure

```
dash/
├── components/               # React UI components
│   ├── RichTextEditor.js     # Main app container + DnD orchestration
│   ├── Editor.js             # Editor.js wrapper
│   ├── MultiBlockToolbar.js  # Multi-block selection toolbar (convert menu)
│   ├── PageItem.js           # Page list item (rendering + menu)
│   ├── FolderItem.js         # Folder list item + nested SortableContext
│   ├── SortablePageItem.js   # Sortable wrapper for PageItem (dnd-kit)
│   ├── SortableFolderItem.js # Sortable wrapper for FolderItem (dnd-kit)
│   ├── editor-tools/         # Custom Editor.js block tools
│   │   ├── BulletListItem.js   # Individual bullet list item
│   │   ├── NumberedListItem.js # Individual numbered list item
│   │   ├── ChecklistItem.js    # Individual checklist item
│   │   ├── SeedPhrase.js       # Seed phrase storage grid (12/24 words, BIP-39)
│   │   ├── PageLink.js         # Page linking inline tool + [[ interceptor + dropdown
│   │   ├── AttachmentTool.js   # File attachment block (images + PDF)
│   │   ├── AIBlockTune.js      # "AI" tune in every block's settings menu
│   │   ├── AIInlineTool.js     # Bot icon in inline toolbar
│   │   ├── AIBlockTool.js      # /ai slash-menu block
│   │   └── CodeBlock.js        # Syntax-highlighted code block
│   ├── AIPanel.js              # Local AI slide-over panel
│   ├── VersionHistoryModal.js  # Version history viewer + "Restore as New Page"
│   └── ...
├── hooks/
│   ├── usePagesManager.js    # Page/folder CRUD + DnD reorder operations
│   ├── useKeyboardNavigation.js # Keyboard shortcuts
│   └── useUpdateManager.js   # Auto-update handling
├── lib/
│   ├── storage.js              # Storage abstraction (auto-detects environment)
│   ├── mobileStorage.js        # IndexedDB v3 (PWA + mobile)
│   ├── attachmentStorage.js    # File attachment storage (Electron/PWA/browser)
│   ├── versionStorage.js       # Version history storage (Electron/PWA/browser)
│   └── localAI.js              # Local LLM API layer (Ollama + OpenAI-compatible)
├── store/
│   ├── tagStore.js             # Zustand store for tags
│   ├── aiStore.js              # Zustand store for local AI settings
│   └── appLockStore.js         # App lock state, duress password, biometric settings
├── utils/
│   ├── securityUtils.js      # Content sanitization
│   ├── passwordUtils.js      # AES-256 encryption
│   ├── exportUtils.js        # Export to PDF, Markdown, etc.
│   ├── dataValidation.js     # Data structure validation
│   ├── bip39wordlist.js      # BIP-39 English wordlist (2048 words)
│   └── migrateBlocks.js      # Legacy block migration (nestedlist → individual items)
├── electron-main.js          # Electron main process
├── preload.js                # Electron preload script (IPC bridge)
└── pages/                    # Next.js pages
```

## Data Flow

### Storage Layer

The app uses different storage mechanisms depending on the environment:

```
┌─────────────────────────────────────────────────────────────────┐
│                        storage.js                                │
│  (abstraction layer - auto-detects environment)                  │
└─────────────────────────────────────────────────────────────────┘
                │                │                 │
                ▼                ▼                 ▼
    ┌───────────────┐   ┌──────────────┐   ┌─────────────┐
    │   Electron    │   │     PWA      │   │   Browser   │
    │  (File System)│   │  (IndexedDB) │   │(localStorage)│
    └───────────────┘   └──────────────┘   └─────────────┘
```

- **Electron (Desktop)**: Uses `fs` module to read/write JSON files in user data directory
- **PWA (Mobile)**: Uses IndexedDB with localStorage fallback
- **Web Browser**: Uses localStorage for development/testing

### Page Management

The `usePagesManager` hook centralizes all page operations:

```javascript
// Core CRUD operations
handleNewPage()     // Create new page
savePage(content)   // Save page content
deletePage(page)    // Delete page
renamePage(page, newTitle)
lockPage(page, password)    // Encrypt with AES-256
unlockPage(page, password)  // Decrypt

// Folder operations
addPageToFolder(pageId, folderId)
removePageFromFolder(pageId, folderId)

// Drag-and-drop operations
reorderItems(activeId, overId)                          // Reorder root-level items
reorderWithinFolder(folderId, activeId, overId)         // Reorder pages within a folder
movePageToContainer(pageId, fromContainer, toContainer)  // Move page between root/folders
persistPages()                                           // Save current state to storage
```

### Data Structure

**Page Object:**
```json
{
  "id": "unique-id-string",
  "title": "Page Title",
  "content": {
    "time": 1234567890,
    "blocks": [...],       // Editor.js blocks
    "version": "2.30.6"
  },
  "tags": [],
  "tagNames": ["work", "important"],
  "createdAt": "2024-01-01T00:00:00Z",
  "password": null,        // or { hash: "..." } if locked
  "folderId": null         // or folder ID if in folder
}
```

**Folder Object:**
```json
{
  "id": "folder-unique-id",
  "title": "Folder Name",
  "type": "folder",
  "pages": ["page-id-1", "page-id-2"],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

## Drag-and-Drop Architecture

The sidebar uses [@dnd-kit](https://dndkit.com/) for drag-and-drop with a multi-container pattern.

### Container Model

The sidebar has multiple sortable containers:
- **Root container** — holds folder IDs and root-level page IDs (pages without a `folderId`)
- **Folder containers** — each folder holds its own ordered list of page IDs (from `folder.pages`)

### Component Hierarchy

```
<DndContext onDragStart onDragOver onDragEnd collisionDetection={custom}>
  <SortableContext items={rootItemIds}>           ← root container
    <SortablePageItem />                          ← root-level pages
    <SortableFolderItem>                          ← folders (sortable + drop target)
      <SortableContext items={folderPageIds}>      ← folder container
        <SortablePageItem />                      ← pages inside folder
      </SortableContext>
    </SortableFolderItem>
  </SortableContext>
  <DragOverlay />
</DndContext>
```

### Custom Collision Detection

A custom collision detection function in `RichTextEditor.js` uses raw pointer coordinates and droppable rects to determine targets:

1. **Dragging onto a different folder** — if pointer is inside a folder's bounding rect, target that folder (triggers move-into-folder)
2. **Dragging within a folder** — if pointer is inside the current folder's rect, target sibling pages (triggers reorder)
3. **Dragging out of a folder** — if pointer is outside the current folder's rect, target root-level items (triggers move-to-root)
4. **Fallback** — uses dnd-kit's `closestCorners` for root-level reordering

### Drag Operations

| Operation | Handler |
|-----------|---------|
| Reorder root items (pages & folders) | `reorderItems()` |
| Reorder pages within a folder | `reorderWithinFolder()` |
| Move page into a folder | `movePageToContainer(pageId, 'root', folderId)` |
| Move page out of a folder | `movePageToContainer(pageId, folderId, 'root')` |
| Move page between folders | `movePageToContainer(pageId, folderA, folderB)` |

All cross-container moves are handled in `onDragEnd` (not `onDragOver`) to avoid bounce loops. The `movePageToContainer` function performs atomic state updates: removes from old folder, adds to new folder, updates `folderId`, and repositions in the flat array — all in a single `setPages` call.

### Visual Feedback

- **Drop indicator line** — a blue line appears between items to show the drop position
- **Folder highlight** — folders highlight when a page is dragged over them
- **Folder auto-expand** — collapsed folders auto-expand after 500ms when a page hovers over them
- **Folder page styling** — pages inside folders have a subtle left border to distinguish them from root pages

### Sort Mode Integration

Drag-and-drop is only enabled when sort mode is set to "Manual" (the default). Other sort modes (Newest, Oldest, A-Z, Z-A, Tags) disable drag handles and use automatic ordering.

## Security Model

### Content Sanitization

All content is sanitized using DOMPurify before saving:

```javascript
// securityUtils.js
sanitizeEditorContent(content)  // Removes XSS vectors
validatePageStructure(page)      // Validates data structure
```

### Password Protection

Individual pages can be encrypted with AES-256-GCM:

```javascript
// passwordUtils.js
hashPassword(password)          // Argon2-style hashing
verifyPassword(password, hash)  // Constant-time comparison
encryptContent(content, password)
decryptContent(encrypted, password)
```

### Rate Limiting

The Electron main process implements rate limiting to prevent DoS:

```javascript
// 100 saves per minute max
checkRateLimit('save-pages')
```

## Electron Architecture

### Main Process (`electron-main.js`)

Handles:
- Window creation and lifecycle
- File system operations (IPC handlers)
- Auto-updates via electron-updater
- Security policies (CSP, sandbox)

### Preload Script (`preload.js`)

Exposes safe IPC bridge to renderer:

```javascript
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  openExternal: (url) => shell.openExternal(url)
})
```

### IPC Channels

| Channel | Purpose |
|---------|---------|
| `read-pages` | Load pages from disk |
| `save-pages` | Save pages to disk |
| `read-tags` | Load tags from disk |
| `save-tags` | Save tags to disk |
| `check-for-updates` | Manual update check |
| `download-update` | Download available update |
| `get-app-version` | Get current version |

## Editor Integration

Dash uses [Editor.js](https://editorjs.io/) for rich text editing:

```javascript
// Editor.js tools configuration
const tools = {
  header: Header,
  bulletListItem: BulletListItem,     // Custom: one block per bullet item
  numberedListItem: NumberedListItem, // Custom: one block per numbered item
  checklistItem: ChecklistItem,       // Custom: one block per checklist item
  quote: Quote,
  code: CodeTool,
  table: Table,
  seedPhrase: SeedPhraseTool,        // Secure seed phrase grid (12/24 words)
  pageLink: PageLinkInlineTool,      // Inline tool: page linking via toolbar
  // Legacy tools (hidden, kept for backwards compatibility)
  nestedlist: NestedList,  // toolbox: false, conversionConfig: undefined
  checklist: Checklist,    // toolbox: false, conversionConfig: undefined
}
```

### Page Linking Architecture

Page linking works via two mechanisms:

1. **`[[` interceptor** — `usePageLinkInterceptor` hook listens for `input` events in the editor, detects `[[` typed in text nodes, and shows a floating autocomplete dropdown. On selection, replaces the `[[query` text with an `<a data-page-id="..." class="page-link">` element.

2. **Inline toolbar tool** — `PageLinkInlineTool` is an Editor.js inline tool (like bold/italic). When text is selected and the page link button is clicked, it dispatches a `dash-page-link-toolbar` CustomEvent with the saved range. React catches this event and shows a searchable dropdown. On selection, `PageLinkInlineTool.insertLink()` restores the range and wraps the selection in a page link element.

Both mechanisms produce the same HTML: `<a data-page-id="uuid" class="page-link" href="#">Page Title</a>`. The `data-page-id` attribute is whitelisted in DOMPurify sanitization.

### Custom List Tools

Instead of using Editor.js's built-in list/checklist (which group all items into one block), Dash uses custom tools where **each list item is its own `.ce-block`**. This enables:
- Individual item selection and conversion
- Drag-to-select across list items
- Per-item inline toolbar access

Each tool handles Enter (split at cursor), Backspace (exit to paragraph), and `/` (slash menu) natively.

Numbered list ordering is computed via JavaScript DOM traversal (`renumberAll()`) — numbers are stored as `data-number` attributes, not in block data.

### Block Migration

`utils/migrateBlocks.js` automatically converts legacy `nestedlist` and `checklist` blocks to individual item blocks on page load. This is transparent and non-destructive (original data is preserved if no migration is needed).

The `Editor` component:
1. Initializes Editor.js with configured tools
2. Handles content changes with debounced saves
3. Injects theme-specific CSS
4. Manages the MultiBlockToolbar for multi-block selection and conversion

### App Lock & Duress Password

The app lock system (`store/appLockStore.js`) manages:

- **Master password** — bcrypt-hashed, stored persistently
- **Encryption key** — AES-256 key derived from password via PBKDF2, cached in module-level variable (not serialized in Zustand)
- **Duress password** — separate bcrypt hash, checked before the real password on the lock screen
- **Duress action (Hide / Show Decoy Notes)** — only mode exposed in the UI. Sets `savesBlockedRef = true` BEFORE clearing in-memory state, then cancels pending debounced saves and clears encryption key refs. Real data stays encrypted on disk; re-entering the real password restores everything. Wipe mode (`wipeAllPages()`) exists in code but is **disabled** in the UI as of v1.3.131 — see [data-safety.md](./data-safety.md) (or memory) for the incident report.

On lock, all pages are encrypted with AES-256-GCM and plaintext is cleared from memory. On unlock, pages are decrypted back into memory.

## State Management

- **Zustand**: Global state for tags (`store/tagStore.js`) and app lock (`store/appLockStore.js`)
- **React hooks**: Local component state
- **Refs**: Prevent stale closures in async operations

```javascript
// usePagesManager.js uses refs to track latest state
const pagesRef = useRef([])
const currentPageRef = useRef(null)
```

## Themes

Four themes are supported:
1. **Light**: Clean, professional look
2. **Dark**: Easy on the eyes for night use
3. **Dark Blue**: Professional navy-tinted dark mode
4. **Fallout**: Terminal-style green phosphor aesthetic

Theme is applied via:
- Tailwind CSS classes with theme conditions
- next-themes for persistence
- Component-level theme class generators

## Export Formats

Supported export formats:
- **PDF**: Via browser print API
- **Markdown**: Clean text conversion
- **Plain Text**: Strip all formatting
- **Word (DOCX)**: Rich document format
- **RTF**: Rich Text Format
- **JSON**: Raw Editor.js data
- **XML**: Structured data export
- **Encrypted Bundle (.dashpack)**: For secure transfer

## File Attachments

Files are stored separately from the page JSON to keep page data small and avoid IndexedDB bloat.

```
Page block (in Editor.js JSON):
  { type: 'attachment', data: { attachmentId, filename, mimeType, size } }

Actual file bytes:
  Electron → userData/attachments/{attachmentId}
  PWA      → IndexedDB attachments store, keyed by attachmentId
  Browser  → localStorage (base64), keyed by attachmentId
```

`lib/attachmentStorage.js` exposes `saveAttachment`, `loadAttachment`, `deleteAttachment`, `duplicateAttachments`, `collectAttachmentsForExport`, `validateAttachment`.

**Validation**: `validateAttachment()` is async and reads the first 8 bytes of the file to verify magic bytes against the declared MIME type. Callers MUST `await`. Allowed types: JPEG, PNG, GIF, WebP, PDF. Max 10 MB per file.

**Lifecycle**:
- `duplicatePage` → `duplicateAttachments()` copies files with new UUIDs.
- Dashpack export → `collectAttachmentsForExport()` bundles base64 data alongside the page JSON.
- Page delete → `deleteMultipleAttachments()` cleans up the orphaned files.
- Share → attachment blocks are replaced with `[Attachment: filename]` placeholder paragraphs (attachments are not transmitted in share links).

## Version History

Per-page snapshot history, stored independently from the live page data.

```
Storage:
  Electron → userData/versions/{pageId}.json
  PWA      → IndexedDB versions store, keyed by pageId
  Browser  → localStorage, keyed by pageId

Snapshot:
  { id, timestamp, contentHash, content }
```

`lib/versionStorage.js` exposes `captureVersion`, `loadVersions`, `deleteVersions`.

**Throttling and dedup**:
- Minimum 30 seconds between captures per page.
- SHA-256 content hash via `crypto.subtle.digest()` with a DJB2 fallback for non-HTTPS environments. First 8 bytes (16 hex chars) used for dedup.
- Max 10 versions per page; oldest is dropped when the limit is hit.

**Security**:
- No versions captured for password-locked pages.
- Existing versions deleted the moment a page is locked.
- "Version History" menu item hidden for locked pages.

**Restore** creates a new page with the old content (non-destructive — the active page is untouched, no folder/tag conflicts).

## Local AI Integration

Optional integration with on-device LLMs (Ollama, LM Studio, LocalAI, Jan, custom). All inference happens locally — no cloud calls.

### Components

| File | Purpose |
|------|---------|
| `store/aiStore.js` | Zustand store: endpoint, model, preset, temperature, maxTokens. Persisted to `localStorage('dash-ai-settings')`. |
| `lib/localAI.js` | API layer: `checkConnection()`, `streamChat()`, `buildPrompt()`. Handles Ollama native (`/api/chat`, NDJSON) + OpenAI-compatible (`/v1/chat/completions`, SSE). |
| `components/AIPanel.js` | Right-side slide-over panel (settings, actions, streaming response, insert/replace/save-as-note). |
| `components/editor-tools/AIBlockTune.js` | Block Tune — adds "AI" to every block's settings menu via the MenuConfig API. |
| `components/editor-tools/AIInlineTool.js` | Inline tool — Bot icon in text-selection toolbar. |
| `components/editor-tools/AIBlockTool.js` | Slash-menu tool — `/ai` command. |
| `components/MultiBlockToolbar.js` | Multi-block selection toolbar — sends multiple selected blocks to AI. |

### Data Flow

All entry points dispatch `window.dispatchEvent(new CustomEvent('dash-ai-inline', { detail }))`:
- `detail.selectedText` — text to send as context
- `detail.blockIndex` — (optional) exact block index for single-block replacement (from `AIBlockTune`)

`RichTextEditor` listens for the event, sets `aiContextText` / `aiBlockIndex`, and opens `AIPanel`. After the response, the user can:

- **Insert** — append blocks at the end of the note
- **Replace** — swap a single block (when `blockIndex` is set), a selected range (text-matched), or the entire note
- **Save as Note** — create a brand-new page from the response

After saving, `setCurrentPage()` is called to force-sync React state (because `savePage` only updates refs during editing to avoid MutationObserver re-render loops).

### CSP

`electron-main.js` `connect-src` includes `http://localhost:* http://127.0.0.1:*`. Wildcard ports are required because each LLM runtime uses a different default (Ollama 11434, LM Studio 1234, LocalAI 8080, Jan 1337) and users may run on custom ports.

## Sharing

See [SHARING.md](./SHARING.md) for the full data flow. Brief summary:

- **Encrypted share links** — payload encrypted client-side with a passphrase-derived AES-GCM-256 key, embedded in the URL fragment (`#`) so the server never sees content. Optional 30-day server-stored blob via the relay for shorter links.
- **Decryption page** — `pages/share.js` runs purely client-side at `dash-share.vercel.app`.

> **Live sessions** (real-time collaboration over `wss://dash-relay.efesop.deno.net`) are implemented in the codebase (`lib/liveSession.js`, `components/LiveSessionModal.js`, `components/LiveSessionBar.js`, `components/LiveNotificationsPanel.js`, `store/liveNotesStore.js`) but **disabled in the UI** — gated on `LIVE_SESSIONS_ENABLED = false` in `RichTextEditor.js`. Code is kept for future re-enable. All UI entry points (word-count click, bell-edit-requests path, modal/chip/panel renders, sidebar live indicators, deep-link auto-join) are gated; persisted `live-*` pages from prior versions render the "Session ended — Keep as My Page" banner so users can adopt them as normal pages.

## Auto-Updates (Desktop)

The desktop app supports auto-updates via `electron-updater`:

1. User manually checks for updates
2. If available, downloads in background
3. User confirms to install
4. App restarts with new version

No automatic background update checks - user initiates all update checks.

## Accessibility

- **ARIA labels**: All interactive elements
- **Keyboard navigation**: Full keyboard support
- **Screen reader**: Announcements via live regions
- **Skip navigation**: Skip to main content link
- **Focus management**: Trapped focus in modals

## Testing

Browser testing covers most functionality since the core is React/Next.js. For Electron-specific features:

1. Run `npm run electron-dev` for development
2. Build with `npm run electron:build` for distribution testing
3. File system operations only work in Electron environment

## Performance Considerations

- **Debounced saves**: 150ms debounce prevents excessive writes
- **Lazy loading**: Editor.js tools loaded on demand
- **Memoization**: React.memo and useMemo for expensive renders
- **Ref-based updates**: Avoid stale closure issues
