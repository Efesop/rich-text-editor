# Changelog

All notable changes to Dash will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
