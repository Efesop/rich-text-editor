# Changelog

All notable changes to Dash will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
