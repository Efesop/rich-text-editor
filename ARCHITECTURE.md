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
├── components/           # React UI components
│   ├── RichTextEditor.js # Main app container
│   ├── Editor.js         # Editor.js wrapper
│   ├── PageItem.js       # Page list item
│   ├── FolderItem.js     # Folder list item
│   └── ...
├── hooks/
│   ├── usePagesManager.js    # Page CRUD operations
│   ├── useKeyboardNavigation.js # Keyboard shortcuts
│   └── useUpdateManager.js   # Auto-update handling
├── lib/
│   ├── storage.js        # Storage abstraction layer
│   └── mobileStorage.js  # PWA-specific storage
├── utils/
│   ├── securityUtils.js  # Content sanitization
│   ├── passwordUtils.js  # AES-256 encryption
│   ├── exportUtils.js    # Export to PDF, Markdown, etc.
│   └── dataUtils.js      # Data validation/repair
├── electron-main.js      # Electron main process
├── preload.js            # Electron preload script (IPC bridge)
└── pages/                # Next.js pages
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
// Key operations
handleNewPage()     // Create new page
savePage(content)   // Save page content
deletePage(page)    // Delete page
renamePage(page, newTitle)
lockPage(page, password)    // Encrypt with AES-256
unlockPage(page, password)  // Decrypt
addPageToFolder(pageId, folderId)
removePageFromFolder(pageId, folderId)
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
  list: List,
  checklist: Checklist,
  quote: Quote,
  code: CodeTool,
  table: Table,
  // ... more tools
}
```

The `Editor` component:
1. Initializes Editor.js with configured tools
2. Handles content changes with debounced saves
3. Injects theme-specific CSS
4. Manages the MultiBlockTuneEnhancer for multi-block editing

## State Management

- **Zustand**: Global state for tags (`store/tagStore.js`)
- **React hooks**: Local component state
- **Refs**: Prevent stale closures in async operations

```javascript
// usePagesManager.js uses refs to track latest state
const pagesRef = useRef([])
const currentPageRef = useRef(null)
```

## Themes

Three themes are supported:
1. **Light**: Clean, professional look
2. **Dark**: Easy on the eyes for night use
3. **Fallout**: Terminal-style green phosphor aesthetic

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
