import { useState, useEffect, useCallback, useRef } from 'react'
import { hashPassword, verifyPassword } from '@/utils/passwordUtils'
import { sanitizeEditorContent, validatePageStructure } from '@/utils/securityUtils'
import { deriveKeyFromPassphrase, encryptJsonWithKey, decryptJsonWithKey } from '@/utils/cryptoUtils'
import useTagStore from '../store/tagStore'
import { readPages, savePages as savePagesToFallback, saveDecoyPages } from '@/lib/storage'
import { deleteMultipleAttachments } from '@/lib/attachmentStorage'
import { captureVersion, deleteVersions } from '@/lib/versionStorage'
import { recordHardDelete } from '@/lib/hardDeletes'
import { encryptJsonWithPassphrase } from '@/utils/cryptoUtils'
import { DEMO_PAGES, DEMO_TAGS, isDemoMode } from '@/lib/demoSeed'

// Debug logger: enable in browser console with window.__DASH_DEBUG = true
const dbg = (category, ...args) => {
  if (typeof window !== 'undefined' && window.__DASH_DEBUG) {
    console.log(`[${category}]`, ...args)
  }
}

export function usePagesManager() {
  const [pages, setPages] = useState([])
  const [currentPage, _setCurrentPage] = useState(null)
  const { tags, addTag, removeTag, updateTag } = useTagStore()
  const [saveStatus, setSaveStatus] = useState('saved')
  const [editorReloadKey, setEditorReloadKey] = useState(0)
  const [tempUnlockedPages, setTempUnlockedPages] = useState(new Set())
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [pageToAccess, setPageToAccess] = useState(null)

  // IMPORTANT: pagesRef is the single source of truth for page data.
  // savePage() only updates pagesRef (not React state) to avoid re-render loops
  // with Editor.js's MutationObserver. ALL page-modifying operations (delete,
  // rename, duplicate, reorder, lock, etc.) MUST read from pagesRef.current,
  // never from prevPages via setPages(prevPages => ...), which may be stale.
  const pagesRef = useRef([])
  const currentPageRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const isInitializedRef = useRef(false)

  // Race condition protection: save queue and version tracking
  const saveInProgressRef = useRef(false)
  const pendingSaveRef = useRef(null)
  const saveVersionRef = useRef(0)

  // Encryption: cache derived keys for temp-unlocked pages (avoids slow PBKDF2 on every save)
  const encryptionKeysRef = useRef(new Map()) // pageId -> { key: CryptoKey, salt: Uint8Array }
  const tempUnlockedPagesRef = useRef(new Set())

  // App lock encryption: cached key for bulk encrypt/decrypt
  const appLockKeyRef = useRef(null) // { key: CryptoKey, salt: Uint8Array }

  // Duress hide mode: blocks ALL saves to prevent overwriting encrypted data on disk
  const savesBlockedRef = useRef(false)
  // Decoy vault mode: when true, saves go to decoy storage instead of real storage
  const isDuressModeRef = useRef(false)
  const duressKeyRef = useRef(null) // passphrase string for re-encrypting decoy saves

  // Sync refs from React state ONLY on initial load.
  // After init, pagesRef is the source of truth — all operations set it explicitly.
  // A blanket `pagesRef.current = pages` useEffect would overwrite fresh pagesRef
  // data with stale React state when setPages triggers a re-render after savePage
  // has already written newer content to pagesRef.
  useEffect(() => {
    if (!isInitializedRef.current) {
      pagesRef.current = pages
    }
  }, [pages])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    tempUnlockedPagesRef.current = tempUnlockedPages
  }, [tempUnlockedPages])

  // Encrypt temp-unlocked pages before writing to storage
  const preparePagesForStorage = async (pages) => {
    const result = []
    for (const page of pages) {
      // If page is locked and temp-unlocked, encrypt content before saving
      if (page.password?.hash && tempUnlockedPagesRef.current.has(page.id)) {
        const keyData = encryptionKeysRef.current.get(page.id)
        if (keyData && page.content) {
          try {
            const encryptedContent = await encryptJsonWithKey(page.content, keyData.key, keyData.salt)
            result.push({ ...page, content: null, encryptedContent })
          } catch (error) {
            console.error('Failed to encrypt page for storage:', error)
            result.push(page) // Fallback: save as-is rather than lose data
          }
        } else {
          result.push(page)
        }
      } else {
        result.push(page)
      }
    }

    // App lock encryption: encrypt all non-individually-locked pages
    const appLockKey = appLockKeyRef.current
    if (appLockKey) {
      const encrypted = []
      for (const page of result) {
        // Skip folders, individually locked pages, and already app-lock-encrypted pages
        if (page.type === 'folder' || page.password?.hash || page.appLockEncrypted) {
          encrypted.push(page)
        } else if (page.content) {
          try {
            const encryptedContent = await encryptJsonWithKey(page.content, appLockKey.key, appLockKey.salt)
            encrypted.push({ ...page, content: null, encryptedContent, appLockEncrypted: true })
          } catch (error) {
            console.error('Failed to app-lock encrypt page:', page.id, error)
            encrypted.push(page) // Fallback: save plaintext
          }
        } else {
          encrypted.push(page)
        }
      }
      return encrypted
    }

    return result
  }

  // Execute the actual save operation with race condition protection
  const executeSave = useCallback(async (pagesToSave, version) => {
    // In decoy mode: save to decoy storage, encrypted with duress password
    if (isDuressModeRef.current && duressKeyRef.current) {
      dbg('save', 'decoy mode — saving to decoy storage')
      try {
        const encrypted = await encryptJsonWithPassphrase(pagesToSave, duressKeyRef.current)
        await saveDecoyPages(encrypted)
        if (version === saveVersionRef.current) {
          setPages(pagesRef.current)
          setSaveStatus('saved')
        }
      } catch (err) {
        dbg('save', 'decoy save error', err.message)
      }
      return
    }
    if (savesBlockedRef.current) {
      dbg('save', 'BLOCKED by duress mode, skipping disk write')
      return
    }
    try {
      // Encrypt temp-unlocked pages before writing to disk
      const pagesForStorage = await preparePagesForStorage(pagesToSave)

      if (typeof window !== 'undefined' && window.electron?.invoke) {
        await window.electron.invoke('save-pages', pagesForStorage)
      } else {
        await savePagesToFallback(pagesForStorage)
      }
      // Only mark as saved if this is still the latest version
      if (version === saveVersionRef.current) {
        dbg('save', 'disk write complete v' + version)
        // Sync React state after disk write — single batched re-render.
        // We defer this from savePage to avoid re-render during editing
        // which triggers EditorJS MutationObserver feedback loops.
        setPages(pagesRef.current)
        setSaveStatus('saved')

        // Phase 2.4: notify the sync layer (if active) that local save
        // succeeded so it can diff and enqueue changed envelopes. Wired
        // via a global callback so usePagesManager doesn't take a hard
        // dependency on the sync hook. If the callback isn't set, sync
        // is gated off and this is a no-op.
        if (typeof window !== 'undefined' && typeof window.__syncEnqueueChangedPages === 'function') {
          try {
            // Pass current tags as the third arg so the manifest payload
            // ships their colors. Without this, peers receive an empty
            // tagMap and fall back to the hashed-palette color in
            // StackedTags.js (visible mismatch on mobile vs desktop).
            const currentTags = useTagStore.getState().tags || []
            window.__syncEnqueueChangedPages(
              window.__syncLastSnapshot || [],
              pagesRef.current,
              currentTags
            )
            window.__syncLastSnapshot = pagesRef.current
          } catch (e) {
            // Sync MUST NOT break local save flow.
            console.error('sync enqueue callback threw', e)
          }
        }
      }
    } catch (error) {
      console.error('Error saving pages:', error)
      dbg('save', 'ERROR v' + version, error.message)
      if (version === saveVersionRef.current) {
        setSaveStatus('error')
      }
      throw error
    }
  }, [])

  // Process the save queue - ensures saves happen sequentially
  const processSaveQueue = useCallback(async () => {
    if (saveInProgressRef.current) return
    if (!pendingSaveRef.current) return

    saveInProgressRef.current = true
    const { pages: pagesToSave, version } = pendingSaveRef.current
    pendingSaveRef.current = null

    try {
      await executeSave(pagesToSave, version)
    } catch (error) {
      // Retry once on failure with latest data
      try {
        await executeSave(pagesRef.current, saveVersionRef.current)
      } catch (retryError) {
        console.error('Save retry failed:', retryError)
      }
    } finally {
      saveInProgressRef.current = false
      // Process any pending saves that queued while we were saving
      if (pendingSaveRef.current) {
        processSaveQueue()
      }
    }
  }, [executeSave])

  // Bypass the 150 ms `savePagesToStorage` debounce + write to disk
  // immediately. Required when the app is about to suspend (iOS Capacitor
  // background) — without this, a destructive op (trash, rename, reorder)
  // performed within 150 ms of the user backgrounding the app loses its
  // disk write entirely. Returns the executeSave promise so callers can
  // await it where they have an awaitable boundary.
  // Defined here (early in the hook body) so callbacks defined later in
  // this file — permanentlyDeletePage, the self-destruct sweep, the
  // trash sweep — can list it as a useCallback / useEffect dep without
  // a TDZ ReferenceError at render time.
  const flushSavesNow = useCallback(async () => {
    if (!isInitializedRef.current) return
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    saveVersionRef.current += 1
    const version = saveVersionRef.current
    const pagesToSave = pagesRef.current.filter(p => !p.id?.startsWith('live-'))
    pendingSaveRef.current = { pages: pagesToSave, version }
    await processSaveQueue()
  }, [processSaveQueue])

  // Debounced save function to prevent excessive saves.
  // `updatedPages` (when provided) takes precedence over pagesRef.current.
  // This matters because sync's applyRemoteChanges → setPages(pagesToSet) →
  // savePagesToStorage(pagesToSet) needs to use the freshly-pulled list, but
  // pagesRef is updated lazily via a useEffect[pages] one render later.
  // Passing the array explicitly skips that race.
  const savePagesToStorage = useCallback(async (updatedPages) => {
    // CRITICAL data-safety guard: refuse to fire a save BEFORE fetchPages
    // has populated the in-memory store IF the caller didn't supply pages.
    // Pre-init React state is `pages = []` and `pagesRef.current = []`. Any
    // save call during the bootstrap window that reads pagesRef.current
    // would write an empty array → data loss.
    //
    // Exception: if the caller passes a non-empty `updatedPages` array
    // (e.g. sync's applyRemoteChanges with freshly-pulled data), let it
    // through. We have authoritative data; persisting it is safe even
    // before fetchPages has run.
    const hasExplicitData = Array.isArray(updatedPages) && updatedPages.length > 0
    if (!isInitializedRef.current && !hasExplicitData) {
      dbg('save', 'BLOCKED — fetchPages has not completed yet (pre-init guard)')
      return
    }

    // If caller passed an explicit array, also seed pagesRef so subsequent
    // ops (debounced flush, ref-readers) see the fresh data immediately.
    if (Array.isArray(updatedPages)) {
      pagesRef.current = updatedPages
    }

    // Clear any pending debounce timer
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      dbg('save', 'debounce reset')
    }

    // Increment version to track save ordering
    saveVersionRef.current += 1
    const currentVersion = saveVersionRef.current

    dbg('save', 'queued v' + currentVersion)

    // Debounce: wait before actually saving to batch rapid updates
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving')
      dbg('save', 'debounce fired v' + currentVersion)
      // Always save the latest pages data, not stale closure data
      // Filter out live session guest pages (they're virtual, not persisted)
      const pagesToSave = pagesRef.current.filter(p => !p.id?.startsWith('live-'))

      // Queue the save with version tracking
      pendingSaveRef.current = { pages: pagesToSave, version: currentVersion }
      processSaveQueue()
    }, 150)
  }, [processSaveQueue])

  const fetchPages = useCallback(async () => {
    try {
      const data = await readPages()
      let validPages = Array.isArray(data) ? data : []
      dbg('pages', 'fetched', validPages.length, 'pages', validPages.filter(p => p.type === 'folder').length, 'folders')

      // Repair: sync folderId for pages in a folder's pages array but missing the property
      const folderMap = new Map()
      validPages.forEach(item => {
        if (item.type === 'folder' && Array.isArray(item.pages)) {
          item.pages.forEach(pageId => folderMap.set(pageId, item.id))
        }
      })
      let repaired = false
      validPages = validPages.map(item => {
        if (item.type !== 'folder' && !item.folderId && folderMap.has(item.id)) {
          repaired = true
          return { ...item, folderId: folderMap.get(item.id) }
        }
        return item
      })
      if (repaired) {
        dbg('pages', 'repaired missing folderId on some pages')
        savePagesToStorage(validPages)
      }

      // Preserve any existing live session guest pages (they're virtual, not in storage)
      // Check both React state ref AND localStorage (state ref may not be flushed yet)
      const liveFromState = pagesRef.current.filter(p => p.id?.startsWith('live-'))
      let existingLivePages = liveFromState
      if (existingLivePages.length === 0) {
        try {
          const liveKeys = Object.keys(localStorage).filter(k => k.startsWith('dash-live-page-'))
          existingLivePages = liveKeys.map(k => {
            try { return JSON.parse(localStorage.getItem(k)) } catch { return null }
          }).filter(Boolean).map(p => ({ id: p.id, title: p.title || 'Live Session', content: p.content || { blocks: [] }, tags: p.tags || [], lastEdited: p.lastEdited || Date.now() }))
        } catch { /* ignore */ }
      }
      const mergedPages = existingLivePages.length > 0 ? [...existingLivePages, ...validPages] : validPages
      setPages(mergedPages)
      pagesRef.current = mergedPages

      if (validPages.length > 0 && !currentPageRef.current) {
        // Filter trashed pages + folders before picking the initial
        // page. Pre-fix `validPages[0]` could be a trashed item that
        // the sidebar hides but the editor would still open on launch
        // — symptom: "the app opens a page I already deleted." Same
        // for folders (selectable items must be notes).
        const firstSelectable = validPages.find(p => p.type !== 'folder' && !p.trashed)
        if (firstSelectable) {
          dbg('pages', 'selecting first page:', firstSelectable.title || firstSelectable.id)
          setCurrentPage(firstSelectable)
        } else {
          dbg('pages', 'no selectable pages found, creating initial page')
          const newPage = await createNewPage()
          setCurrentPage(newPage)
        }
      } else if (validPages.length === 0) {
        if (isDemoMode()) {
          dbg('pages', 'demo seed mode — populating sample data')
          // Seed demo dataset for App Store screenshots
          try {
            for (const tag of DEMO_TAGS) {
              try { addTag(tag.name, tag.color) } catch {}
            }
          } catch {}
          setPages(DEMO_PAGES)
          pagesRef.current = DEMO_PAGES
          await savePagesToStorage(DEMO_PAGES)
          const firstSelectable = DEMO_PAGES.find(p => p.type !== 'folder' && !p.trashed)
          if (firstSelectable) setCurrentPage(firstSelectable)
        } else {
          dbg('pages', 'no pages found, creating initial page')
          const newPage = await createNewPage()
          setCurrentPage(newPage)
        }
      }

      isInitializedRef.current = true
    } catch (error) {
      console.error('Error fetching pages:', error)
      dbg('pages', 'ERROR fetching:', error.message)
      const newPage = await createNewPage()
      setCurrentPage(newPage)
      isInitializedRef.current = true
    }
  }, [])

  const createNewPage = useCallback(async () => {
    dbg('pages', 'creating new page')
    const newPage = {
      id: crypto.randomUUID(), // More unique IDs
      title: 'New Page',
      content: {
        time: Date.now(),
        blocks: [],
        version: '2.30.6'
      },
      tags: [],
      tagNames: [],
      createdAt: new Date().toISOString(),
      password: null
    }

    const updatedPages = [newPage, ...pagesRef.current]
    setPages(updatedPages)
    pagesRef.current = updatedPages
    await savePagesToStorage(updatedPages)

    return newPage
  }, [savePagesToStorage])

  const handleNewPage = useCallback(async () => {
    const newPage = await createNewPage()
    setCurrentPage(newPage)
    return newPage
  }, [createNewPage])

  const lastSavedContentRef = useRef(null)

  const savePage = useCallback(async (pageContent, forPageId) => {
    // ARCHITECTURAL RULE: Every save MUST carry the page ID from the editor
    // instance that produced the content. We NEVER read currentPageRef here
    // because it can point to a different page if a switch happened between
    // content capture and save execution (async gap = race condition).
    // Fallback to currentPageRef.current?.id only for legacy callers.
    const targetId = forPageId || currentPageRef.current?.id
    if (!targetId || !pageContent) return
    const currentPageData = pagesRef.current.find(p => p.id === targetId)
    if (!currentPageData) return
    // Block saves for pages that are self-destructing
    if (selfDestructingPagesRef.current.has(currentPageData.id)) return

    // Skip save if content hasn't structurally changed
    const contentStr = JSON.stringify(pageContent.blocks)
    if (contentStr === lastSavedContentRef.current) {
      dbg('save', 'skipped — content unchanged')
      return
    }
    lastSavedContentRef.current = contentStr

    try {
      // Sanitize the content before saving
      const sanitizedContent = sanitizeEditorContent(pageContent)

      const updatedPage = {
        ...currentPageData,
        content: sanitizedContent
      }

      // Validate the complete page structure
      const validation = validatePageStructure(updatedPage)
      if (!validation.isValid) {
        console.error('Page validation failed:', validation.errors)
        throw new Error('Invalid page data structure')
      }

      // Update pagesRef and queue disk save. We intentionally do NOT call
      // setPages or _setCurrentPage here — those cause React re-renders which
      // trigger EditorJS's MutationObserver, firing onChange again.
      // Instead, pagesRef is the source of truth during edits.
      // lockPage/unlockPage read from pagesRef for latest content.
      const currentPages = pagesRef.current
      if (!currentPages.find(p => p.id === validation.sanitized.id)) return

      const newPages = currentPages.map(p =>
        p.id === validation.sanitized.id ? validation.sanitized : p
      )
      pagesRef.current = newPages
      // Only update currentPageRef if saved page IS the current page.
      // If the user has already switched away, this save is for the old page
      // and must not overwrite the ref pointing to the new page.
      if (currentPageRef.current?.id === validation.sanitized.id) {
        currentPageRef.current = validation.sanitized
      }
      savePagesToStorage(newPages)

      // Capture version snapshot (fire-and-forget, never blocks save)
      // Skip for password-locked pages — versions would store plaintext on disk
      if (!validation.sanitized.password?.hash) {
        captureVersion(validation.sanitized.id, sanitizedContent.blocks).catch(err => {
          // captureVersion logs internally too, but the call-site swallow
          // erased the trail — we want to spot IDB-quota silent stops.
          console.warn('captureVersion failed (call site)', err)
        })
      }
    } catch (error) {
      console.error('Error saving page:', error)
      // Show user-friendly error message
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('saved'), 3000)
    }
  }, [savePagesToStorage])

  // ── Trash (Phase 2.5) ───────────────────────────────────────────────────
  // Soft-delete: marks the page as trashed (hidden from sidebar, visible in
  // Trash modal). Survives ~30 days then auto-purges. Folders cannot be
  // trashed — deleting a folder is structural and goes straight to permanent
  // delete (the pages inside are independently in trash if so trashed).
  const trashPage = useCallback(async (pageToTrash) => {
    if (!pageToTrash || pageToTrash.type === 'folder') {
      return permanentlyDeletePage(pageToTrash)
    }
    dbg('pages', 'trashing:', pageToTrash.title || pageToTrash.id)
    const latestPage = pagesRef.current.find(p => p.id === pageToTrash.id)
    if (!latestPage) return
    // Bump lastEdited so the trash envelope wins on receivers' latest-wins
    // tiebreak. Without this, payload's lastEdited equals the previous
    // edit's value → receivers' existing.lastEdited matches → trash gets
    // dropped by `incomingTs <= existingTs` → trash never propagates.
    // Also clear any prior `restoredAt` so a future restore is unambiguous.
    const now = Date.now()
    const { restoredAt: _ra, ...latestRest } = latestPage
    const trashedPage = {
      ...latestRest,
      trashed: true,
      trashedAt: now,
      lastEdited: now
    }
    const newPages = pagesRef.current.map(p =>
      p.id === pageToTrash.id ? trashedPage : p
    )
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
    // Move user off the trashed page if they're viewing it
    if (currentPageRef.current?.id === pageToTrash.id) {
      const remaining = newPages.filter(p => p.type !== 'folder' && !p.trashed)
      setCurrentPage(remaining[0] || null)
    }
  }, [])

  const restorePage = useCallback(async (pageToRestore) => {
    if (!pageToRestore) return
    const latestPage = pagesRef.current.find(p => p.id === pageToRestore.id)
    if (!latestPage || latestPage.trashed !== true) return
    dbg('pages', 'restoring:', latestPage.title || latestPage.id)
    const { trashed: _t, trashedAt: _ta, ...rest } = latestPage
    // `restoredAt` is the EXPLICIT-restore signal that syncPull checks
    // before resurrecting a page that's trashed on a peer. Without it,
    // any subsequent edit envelope from this device would look like a
    // stale-edit-on-trashed-page to the peer (correctly dropped) and
    // the restore would never propagate. Also bump lastEdited so the
    // restore wins normal latest-wins on peers that aren't trashed.
    const now = Date.now()
    const restored = { ...rest, restoredAt: now, lastEdited: now }
    const newPages = pagesRef.current.map(p =>
      p.id === pageToRestore.id ? restored : p
    )
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [])

  // Hard delete — removes from pagesRef + cleans up versions/attachments.
  // Pushes a tombstone envelope via the sync hook (when sync is enabled +
  // unlocked, which is checked in useSyncQueue's enqueueChangedPages).
  const permanentlyDeletePage = useCallback(async (pageToDelete) => {
    dbg('pages', 'permanently deleting:', pageToDelete.title || pageToDelete.id, pageToDelete.type === 'folder' ? '(folder)' : '')
    // Get latest page content from pagesRef BEFORE filtering (for attachment cleanup below)
    const latestPage = pagesRef.current.find(p => p.id === pageToDelete.id) || pageToDelete
    // Clean up cached encryption key for this page
    encryptionKeysRef.current.delete(pageToDelete.id)
    // Use pagesRef.current (source of truth) instead of React state (prevPages)
    // because savePage only updates pagesRef, not React state — prevPages is stale
    let updatedPages = pagesRef.current.filter(p => p.id !== pageToDelete.id)

    // Handle folder cleanup
    if (pageToDelete.folderId) {
      updatedPages = updatedPages.map(item => {
        if (item.id === pageToDelete.folderId && item.type === 'folder') {
          return {
            ...item,
            pages: (Array.isArray(item.pages) ? item.pages : []).filter(pageId => pageId !== pageToDelete.id)
          }
        }
        return item
      })
    }

    // No auto-create-New-Page on empty.
    // Pre-fix: if the last note got deleted, this branch pushed a fresh
    // "New Page" so the editor never sat blank. With sync enabled,
    // EACH device ran this independently → both auto-creates persisted
    // through sync as two distinct New Pages → duplicates accumulated
    // every time a user emptied + cleaned trash. Empty-state is the
    // honest UX: the user can tap "+" to create when they want one.
    // The empty-state branch in fetchPages still creates a New Page on
    // FIRST RUN (validPages.length === 0 with NO existing data), which
    // is the intended onboarding behavior.

    pagesRef.current = updatedPages
    savePagesToStorage(updatedPages)
    setPages(updatedPages)

    // Record the hard-delete in the local tombstone store. Sync pulls
    // check this set before inserting brand-new pages — protects
    // against the peer-resurrect race (e.g. another device autosaved
    // the same page right after our tombstone push, server stores its
    // alive envelope with a higher version, our next pull would
    // otherwise re-insert it).
    try {
      recordHardDelete(pageToDelete.id)
    } catch (err) {
      console.warn('permanentlyDeletePage: recordHardDelete failed', err)
    }

    // Clean up version history + attachments. AWAIT both — pre-fix
    // these were fire-and-forget, so iOS suspending mid-cleanup left
    // orphaned versions/attachments in IndexedDB → slow quota leak
    // over many delete cycles. Wrapped individually so a failure of
    // one cleanup doesn't block the other; the page itself is already
    // off the live list either way.
    try {
      await deleteVersions(pageToDelete.id)
    } catch (err) {
      console.error('permanentlyDeletePage: deleteVersions failed for', pageToDelete.id, err)
    }
    if (latestPage.content?.blocks) {
      const attachmentIds = latestPage.content.blocks
        .filter(b => b.type === 'attachment' && b.data?.attachmentId)
        .map(b => b.data.attachmentId)
      if (attachmentIds.length > 0) {
        try {
          await deleteMultipleAttachments(attachmentIds)
        } catch (err) {
          console.error('permanentlyDeletePage: deleteMultipleAttachments failed', err)
        }
      }
    }

    // Handle current page cleanup
    if (currentPageRef.current?.id === pageToDelete.id) {
      const remainingPages = (Array.isArray(pagesRef.current) ? pagesRef.current : []).filter(p => p.type !== 'folder' && !p.trashed)
      setCurrentPage(remainingPages[0] || null)
    }
  }, [savePagesToStorage])

  // Default delete = soft-trash for notes (recoverable from Trash),
  // permanent for folders (folders bypass trash since they're structural).
  // Existing call sites that imported `deletePage` keep working — the visible
  // change is that the page now appears in the Trash modal instead of
  // disappearing immediately.
  const deletePage = useCallback(async (pageToDelete) => {
    if (!pageToDelete) return
    if (pageToDelete.type === 'folder') {
      return permanentlyDeletePage(pageToDelete)
    }
    // If already trashed, this is a "delete forever" gesture
    if (pageToDelete.trashed === true) {
      return permanentlyDeletePage(pageToDelete)
    }
    return trashPage(pageToDelete)
  }, [permanentlyDeletePage, trashPage])

  const renamePage = useCallback(async (pageToRename, newTitle) => {
    if (!pageToRename || !newTitle || newTitle === pageToRename.title) return

    const trimmedTitle = newTitle.slice(0, 50) // Reasonable title length limit
    // Use pagesRef for latest content (savePage updates ref, not React state)
    const latestPage = pagesRef.current.find(p => p.id === pageToRename.id) || pageToRename
    const updatedPage = { ...latestPage, title: trimmedTitle }

    const newPages = pagesRef.current.map(p =>
      p.id === pageToRename.id ? updatedPage : p
    )
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current?.id === pageToRename.id) {
      _setCurrentPage(updatedPage)
    }
  }, [savePagesToStorage])

  const lockPage = useCallback(async (page, password) => {
    if (!page || !password) return false
    dbg('encrypt', 'locking page:', page.title || page.id)

    try {
      const hashedPassword = await hashPassword(password)

      // Derive encryption key and cache it for auto-save re-encryption
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const key = await deriveKeyFromPassphrase(password, salt)
      encryptionKeysRef.current.set(page.id, { key, salt })

      // Keep plaintext in memory, mark as temp-unlocked so user can keep editing
      // The save pipeline will encrypt before writing to disk
      // Use pagesRef to get latest content (savePage updates ref before React state)
      const latestPage = pagesRef.current.find(p => p.id === page.id) || page
      const updatedPage = { ...latestPage, password: { hash: hashedPassword } }
      // Update ref SYNCHRONOUSLY alongside the React state update.
      // `tempUnlockedPagesRef` is normally synced via the useEffect at
      // line 71 (after React commits), but if `flushSavesNow` runs
      // between the setState here and the useEffect tick (e.g. iOS
      // visibility-hidden in that window), `preparePagesForStorage`
      // reads a stale ref → page treated as not-temp-unlocked → falls
      // through to "fallback: save as-is" → PLAINTEXT WRITTEN TO DISK
      // for a page that should be locked. Updating the ref first
      // closes the race.
      const nextTempUnlocked = new Set(tempUnlockedPagesRef.current)
      nextTempUnlocked.add(page.id)
      tempUnlockedPagesRef.current = nextTempUnlocked
      setTempUnlockedPages(nextTempUnlocked)

      const newPages = pagesRef.current.map(p =>
        p.id === updatedPage.id ? updatedPage : p
      )
      pagesRef.current = newPages
      savePagesToStorage(newPages)
      setPages(newPages)

      // Remove plaintext version history now that page is locked
      deleteVersions(page.id).catch(() => {})

      if (currentPageRef.current?.id === page.id) {
        _setCurrentPage(updatedPage)
      }

      return true
    } catch (error) {
      console.error('Error locking page:', error)
      return false
    }
  }, [savePagesToStorage])

  const unlockPage = useCallback(async (page, password, temporary = false) => {
    if (!page?.password?.hash || !password) return false
    dbg('encrypt', 'unlocking page:', page.title || page.id, temporary ? '(temp)' : '(permanent)')

    try {
      const isPasswordCorrect = await verifyPassword(password, page.password.hash)
      if (!isPasswordCorrect) {
        dbg('encrypt', 'wrong password for:', page.title || page.id)
        return false
      }

      // Decrypt content if encrypted, or use plaintext for legacy pages
      let decryptedContent
      if (page.encryptedContent) {
        const salt = new Uint8Array(page.encryptedContent.salt)
        const key = await deriveKeyFromPassphrase(password, salt)
        decryptedContent = await decryptJsonWithKey(page.encryptedContent, key)
        // Cache key for auto-save re-encryption
        encryptionKeysRef.current.set(page.id, { key, salt })
      } else {
        // Legacy page: content is plaintext, generate key for future encryption
        decryptedContent = page.content
        const salt = crypto.getRandomValues(new Uint8Array(16))
        const key = await deriveKeyFromPassphrase(password, salt)
        encryptionKeysRef.current.set(page.id, { key, salt })
      }

      if (temporary) {
        // Temp unlock: update in-memory state with decrypted content, don't save to storage.
        // Sync ref synchronously alongside the React state update — see lockPage for rationale.
        const nextTempUnlocked = new Set(tempUnlockedPagesRef.current)
        nextTempUnlocked.add(page.id)
        tempUnlockedPagesRef.current = nextTempUnlocked
        setTempUnlockedPages(nextTempUnlocked)
        const updatedPage = { ...page, content: decryptedContent }
        const newPages = pagesRef.current.map(p =>
          p.id === updatedPage.id ? updatedPage : p
        )
        pagesRef.current = newPages
        // Don't call savePagesToStorage — content is decrypted in memory only
        setPages(newPages)
        _setCurrentPage(updatedPage)
        setEditorReloadKey(k => k + 1)
      } else {
        // Permanent unlock: remove encryption, save plaintext to storage
        const updatedPage = { ...page, content: decryptedContent }
        delete updatedPage.password
        delete updatedPage.encryptedContent
        encryptionKeysRef.current.delete(page.id)

        setTempUnlockedPages(prev => {
          const next = new Set(prev)
          next.delete(page.id)
          return next
        })

        const newPages = pagesRef.current.map(p =>
          p.id === updatedPage.id ? updatedPage : p
        )
        pagesRef.current = newPages
        savePagesToStorage(newPages)
        setPages(newPages)
        _setCurrentPage(updatedPage)
        setEditorReloadKey(k => k + 1)
      }

      return true
    } catch (error) {
      console.error('Error unlocking page:', error)
      return false
    }
  }, [savePagesToStorage])

  const removeLockFromUnlockedPage = useCallback((pageId) => {
    if (!pageId || !tempUnlockedPagesRef.current.has(pageId)) return false

    // Page is already decrypted in memory — just strip password fields and save
    setTempUnlockedPages(prev => {
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })

    encryptionKeysRef.current.delete(pageId)

    const newPages = pagesRef.current.map(p => {
      if (p.id === pageId) {
        const updated = { ...p }
        delete updated.password
        delete updated.encryptedContent
        return updated
      }
      return p
    })
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    // Update currentPage if it's the same page
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => {
        const updated = { ...prev }
        delete updated.password
        delete updated.encryptedContent
        return updated
      })
    }

    return true
  }, [savePagesToStorage])

  const addTagToPage = useCallback(async (pageId, tag) => {
    if (!pageId || !tag?.name) return

    const trimmedTag = { ...tag, name: tag.name.slice(0, 15) }
    addTag(trimmedTag)

    const newPages = pagesRef.current.map(page => {
      if (page.id === pageId) {
        const currentTagNames = page.tagNames || []
        if (!currentTagNames.includes(trimmedTag.name)) {
          return {
            ...page,
            tagNames: [...currentTagNames, trimmedTag.name]
          }
        }
      }
      return page
    })

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prevPage => {
        const currentTagNames = prevPage.tagNames || []
        if (!currentTagNames.includes(trimmedTag.name)) {
          return {
            ...prevPage,
            tagNames: [...currentTagNames, trimmedTag.name]
          }
        }
        return prevPage
      })
    }
  }, [addTag, savePagesToStorage])

  const removeTagFromPage = useCallback(async (pageId, tagName) => {
    if (!pageId || !tagName) return

    const newPages = pagesRef.current.map(page => {
      if (page.id === pageId) {
        return {
          ...page,
          tagNames: (page.tagNames || []).filter(t => t !== tagName)
        }
      }
      return page
    })

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: (prevPage.tagNames || []).filter(t => t !== tagName)
      }))
    }
  }, [savePagesToStorage])

  const deleteTagFromAllPages = useCallback(async (tagName) => {
    if (!tagName) return

    const newPages = pagesRef.current.map(page => ({
      ...page,
      tagNames: (page.tagNames || []).filter(t => t !== tagName)
    }))

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current) {
      _setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: (prevPage.tagNames || []).filter(t => t !== tagName)
      }))
    }

    removeTag(tagName)
  }, [removeTag, savePagesToStorage])

  const setCurrentPage = useCallback((page) => {
    if (!page) return
    dbg('nav', 'setCurrentPage:', page.title || page.id, page.password ? '(locked)' : '')
    lastSavedContentRef.current = null // Reset dedup on page switch

    // Note: We no longer clear temp unlocks on page switch.
    // Temp unlocks persist for the session, cleared only on:
    // 1. Page refresh/close (natural state reset)
    // 2. Explicitly re-locking a page via lockPage()

    if (page.password && !tempUnlockedPages.has(page.id)) {
      dbg('nav', 'page is locked, showing password modal')
      setPageToAccess(page)
      setIsPasswordModalOpen(true)
    } else {
      // Use pagesRef for latest content (savePage updates ref before React state)
      const latest = pagesRef.current.find(p => p.id === page.id) || page
      _setCurrentPage(latest)
    }
  }, [tempUnlockedPages])

  // Direct page navigation that bypasses lock checks.
  // Use after successful unlock (password or biometric) when the page
  // is already verified/decrypted but tempUnlockedPages may not be flushed yet.
  const navigateToPage = useCallback((page) => {
    if (page) _setCurrentPage(page)
  }, [])

  const updateTagInPages = useCallback(async (oldName, updatedTag) => {
    if (!oldName || !updatedTag?.name) return

    const newPages = pagesRef.current.map(page => ({
      ...page,
      tagNames: (page.tagNames || []).map(tagName =>
        tagName === oldName ? updatedTag.name : tagName
      )
    }))

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current) {
      _setCurrentPage(prevPage => ({
        ...prevPage,
        tagNames: (prevPage.tagNames || []).map(tagName =>
          tagName === oldName ? updatedTag.name : tagName
        )
      }))
    }

    updateTag(oldName, updatedTag)
  }, [updateTag, savePagesToStorage])

  // Folder management functions
  const createFolder = useCallback(async (folderName, emoji) => {
    if (!folderName) return

    const newFolder = {
      id: crypto.randomUUID(),
      title: folderName.slice(0, 30),
      type: 'folder',
      pages: [],
      createdAt: new Date().toISOString(),
      ...(emoji ? { emoji } : {})
    }

    const newPages = [newFolder, ...pagesRef.current]
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [savePagesToStorage])

  const deleteFolder = useCallback(async (folderId) => {
    if (!folderId) return

    // Check if currentPage is in this folder before deleting
    const currentPageInFolder = currentPageRef.current?.folderId === folderId

    const folderToDelete = pagesRef.current.find(item => item.id === folderId && item.type === 'folder')

    if (folderToDelete) {
      // Move pages out of folder before deleting
      const folderPages = Array.isArray(folderToDelete.pages) ? folderToDelete.pages : []
      const updatedPages = pagesRef.current.map(item => {
        if (folderPages.includes(item.id)) {
          const { folderId: _, ...pageWithoutFolder } = item
          return pageWithoutFolder
        }
        return item
      }).filter(item => item.id !== folderId)

      pagesRef.current = updatedPages
      savePagesToStorage(updatedPages)
      setPages(updatedPages)
    }

    // Update currentPage if it was in the deleted folder
    if (currentPageInFolder) {
      _setCurrentPage(prev => {
        const { folderId: _, ...pageWithoutFolder } = prev
        return pageWithoutFolder
      })
    }
  }, [savePagesToStorage])

  const addPageToFolder = useCallback(async (pageId, folderId) => {
    if (!pageId || !folderId) return

    const newPages = pagesRef.current.map(item => {
      if (item.id === folderId && item.type === 'folder') {
        const existing = Array.isArray(item.pages) ? item.pages : []
        const updatedPages = [...new Set([...existing, pageId])]
        return { ...item, pages: updatedPages }
      }
      if (item.id === pageId && item.type !== 'folder') {
        return { ...item, folderId }
      }
      return item
    })

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    // Update currentPage if it's the one being added to folder
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => ({ ...prev, folderId }))
    }
  }, [savePagesToStorage])

  const movePageToFolder = useCallback(async (pageId, targetFolderId) => {
    if (!pageId || !targetFolderId) return

    const page = pagesRef.current.find(p => p.id === pageId)
    if (!page) return

    const oldFolderId = page.folderId

    const newPages = pagesRef.current.map(item => {
      // Remove page from old folder's pages array
      if (oldFolderId && item.id === oldFolderId && item.type === 'folder') {
        const currentPages = Array.isArray(item.pages) ? item.pages : []
        return { ...item, pages: currentPages.filter(id => id !== pageId) }
      }
      // Add page to new folder's pages array
      if (item.id === targetFolderId && item.type === 'folder') {
        const existing = Array.isArray(item.pages) ? item.pages : []
        return { ...item, pages: [...new Set([...existing, pageId])] }
      }
      // Update the page's folderId
      if (item.id === pageId && item.type !== 'folder') {
        return { ...item, folderId: targetFolderId }
      }
      return item
    })

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    // Update currentPage if it's the one being moved
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => ({ ...prev, folderId: targetFolderId }))
    }
  }, [savePagesToStorage])

  const removePageFromFolder = useCallback(async (pageId, folderId) => {
    if (!pageId || !folderId) return

    const newPages = pagesRef.current.map(item => {
      if (item.id === folderId && item.type === 'folder') {
        const currentPages = Array.isArray(item.pages) ? item.pages : []
        return { ...item, pages: currentPages.filter(id => id !== pageId) }
      }
      if (item.id === pageId) {
        const { folderId: _, ...pageWithoutFolder } = item
        return pageWithoutFolder
      }
      return item
    })

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    // Update currentPage if it's the one being removed from folder
    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => {
        const { folderId: _, ...pageWithoutFolder } = prev
        return pageWithoutFolder
      })
    }
  }, [savePagesToStorage])

  const renameFolder = useCallback(async (folderId, newName, emoji) => {
    if (!folderId || !newName) return

    const newPages = pagesRef.current.map(item => {
      if (item.id === folderId && item.type === 'folder') {
        const updated = { ...item, title: newName.slice(0, 30) }
        if (emoji !== undefined) {
          if (emoji) {
            updated.emoji = emoji
          } else {
            delete updated.emoji
          }
        }
        return updated
      }
      return item
    })

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [savePagesToStorage])

  const handleDuplicatePage = useCallback(async (page) => {
    if (!page) return

    // Strip encryption fields — duplicate starts as an unencrypted copy
    const { password, encryptedContent, appLockEncrypted, ...pageWithoutEncryption } = page
    if (!pageWithoutEncryption.content) {
      // Page is locked and not temp-unlocked — can't duplicate without content
      dbg('pages', 'cannot duplicate locked page without decrypted content')
      return
    }
    const newPage = {
      ...pageWithoutEncryption,
      id: crypto.randomUUID(),
      title: `${page.title} (Copy)`,
      createdAt: new Date().toISOString(),
    }

    // Duplicate attachment files so each page owns independent copies
    if (newPage.content?.blocks) {
      const attachmentIds = newPage.content.blocks
        .filter(b => b.type === 'attachment' && b.data?.attachmentId)
        .map(b => b.data.attachmentId)
      if (attachmentIds.length > 0) {
        try {
          const { duplicateAttachments } = await import('@/lib/attachmentStorage')
          const idMap = await duplicateAttachments(attachmentIds)
          newPage.content = {
            ...newPage.content,
            blocks: newPage.content.blocks.map(b => {
              if (b.type === 'attachment' && b.data?.attachmentId && idMap[b.data.attachmentId]) {
                return { ...b, data: { ...b.data, attachmentId: idMap[b.data.attachmentId] } }
              }
              return b
            })
          }
        } catch (err) {
          console.error('Failed to duplicate attachments:', err)
        }
      }
    }

    // Use pagesRef.current (source of truth) to preserve in-flight edits
    let newPages = [...pagesRef.current]
    const pageIndex = newPages.findIndex(p => p.id === page.id)

    if (pageIndex !== -1) {
      newPages.splice(pageIndex + 1, 0, newPage)
    } else {
      newPages.unshift(newPage)
    }

    // Handle folder membership
    if (page.folderId) {
      const folderIndex = newPages.findIndex(item =>
        item.id === page.folderId && item.type === 'folder'
      )
      if (folderIndex !== -1) {
        newPages[folderIndex] = {
          ...newPages[folderIndex],
          pages: [...newPages[folderIndex].pages, newPage.id]
        }
      }
      newPage.folderId = page.folderId
    }

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    setCurrentPage(newPage)
  }, [savePagesToStorage, setCurrentPage])

  const reorderItems = useCallback((activeId, overId, dropPos) => {
    const newPages = [...pagesRef.current]
    const oldIndex = newPages.findIndex(p => p.id === activeId)
    const newIndex = newPages.findIndex(p => p.id === overId)
    if (oldIndex === -1 || newIndex === -1) return
    const [moved] = newPages.splice(oldIndex, 1)
    // After removing, find where overId ended up and insert based on dropPos
    let insertIdx = newPages.findIndex(p => p.id === overId)
    if (insertIdx === -1) insertIdx = newIndex > oldIndex ? newIndex - 1 : newIndex
    if (dropPos === 'below') insertIdx += 1
    newPages.splice(insertIdx, 0, moved)
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [savePagesToStorage])

  const reorderWithinFolder = useCallback((folderId, activeId, overId, dropPos) => {
    const newPages = pagesRef.current.map(item => {
      if (item.id === folderId && item.type === 'folder') {
        const folderPages = Array.isArray(item.pages) ? [...item.pages] : []
        const oldIdx = folderPages.indexOf(activeId)
        const newIdx = folderPages.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1) {
          const [moved] = folderPages.splice(oldIdx, 1)
          // After removing, adjust target index based on drop position
          let insertIdx = folderPages.indexOf(overId)
          if (insertIdx === -1) insertIdx = newIdx > oldIdx ? newIdx - 1 : newIdx
          if (dropPos === 'below') insertIdx += 1
          folderPages.splice(insertIdx, 0, moved)
          return { ...item, pages: folderPages }
        }
      }
      return item
    })
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [savePagesToStorage])

  const persistPages = useCallback(() => {
    savePagesToStorage(pagesRef.current)
  }, [savePagesToStorage])

  const wipeAllPages = useCallback(() => {
    setPages([])
    pagesRef.current = []
    _setCurrentPage(null)
    // Wipe must save immediately, bypassing debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = null
    saveVersionRef.current += 1
    executeSave([], saveVersionRef.current)
  }, [executeSave])

  // Duress hide mode: clear UI state but preserve encrypted data on disk
  // CRITICAL: blocks ALL future saves so disk data is never overwritten
  // If decoyPages provided, shows them instead of empty app (plausible deniability)
  const enterDuressHideMode = useCallback((decoyPages = null, duressPassword = null) => {
    dbg('duress', 'ENTERING duress hide mode — blocking real saves')
    // Block all real saves FIRST, before anything else
    savesBlockedRef.current = true
    // Cancel any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    pendingSaveRef.current = null
    // Clear encryption keys so nothing can re-encrypt real data
    appLockKeyRef.current = null
    encryptionKeysRef.current.clear()

    if (decoyPages && decoyPages.length > 0 && duressPassword) {
      // Decoy vault mode: show fake notes, allow edits to decoy storage
      dbg('duress', 'loading', decoyPages.length, 'decoy pages')
      isDuressModeRef.current = true
      duressKeyRef.current = duressPassword
      setPages(decoyPages)
      pagesRef.current = decoyPages
      if (decoyPages.length > 0) {
        _setCurrentPage(decoyPages[0])
      }
    } else {
      // Classic hide mode: empty app
      setPages([])
      pagesRef.current = []
      _setCurrentPage(null)
    }
  }, [])

  // Recover from duress hide mode: unblock saves and reload pages from disk
  // Only reloads if duress mode is active (savesBlockedRef), otherwise no-op
  const recoverFromDuressMode = useCallback(async () => {
    if (!savesBlockedRef.current && !isDuressModeRef.current) return false
    dbg('duress', 'RECOVERING from duress — unblocking saves, reloading from disk')
    savesBlockedRef.current = false
    isDuressModeRef.current = false
    duressKeyRef.current = null
    const data = await readPages()
    const validPages = Array.isArray(data) ? data : []
    dbg('duress', 'recovered', validPages.length, 'pages from disk')
    setPages(validPages)
    pagesRef.current = validPages
    return true
  }, [])

  // Move a page between containers (folder↔root, folder↔folder)
  // nearItemId: page to insert near; dropPosition: 'above' or 'below' relative to nearItemId
  const movePageToContainer = useCallback((pageId, fromContainer, toContainer, nearItemId, dropPos) => {
    let newPages = [...pagesRef.current]

    // Remove from old folder's pages array
    if (fromContainer !== 'root') {
      newPages = newPages.map(item => {
        if (item.id === fromContainer && item.type === 'folder') {
          return { ...item, pages: (Array.isArray(item.pages) ? item.pages : []).filter(id => id !== pageId) }
        }
        return item
      })
    }

    // Add to new folder's pages array
    if (toContainer !== 'root') {
      newPages = newPages.map(item => {
        if (item.id === toContainer && item.type === 'folder') {
          const fp = (Array.isArray(item.pages) ? item.pages : []).filter(id => id !== pageId)
          if (nearItemId) {
            const nearIdx = fp.indexOf(nearItemId)
            if (nearIdx !== -1) {
              const insertIdx = dropPos === 'below' ? nearIdx + 1 : nearIdx
              fp.splice(insertIdx, 0, pageId)
              return { ...item, pages: fp }
            }
          }
          return { ...item, pages: [...fp, pageId] }
        }
        return item
      })
    }

    // Update the page's folderId
    newPages = newPages.map(item => {
      if (item.id === pageId) {
        if (toContainer === 'root') {
          const { folderId: _, ...rest } = item
          return rest
        }
        return { ...item, folderId: toContainer }
      }
      return item
    })

    // Position near the target item in flat array (for root placement)
    if (toContainer === 'root' && nearItemId) {
      const pageIdx = newPages.findIndex(p => p.id === pageId)
      const nearIdx = newPages.findIndex(p => p.id === nearItemId)
      if (pageIdx !== -1 && nearIdx !== -1) {
        const [moved] = newPages.splice(pageIdx, 1)
        newPages.splice(nearIdx, 0, moved)
      }
    }

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [savePagesToStorage])

  // Import pages from an encrypted bundle (merges with existing)
  const importPages = useCallback(async (importedItems) => {
    if (!Array.isArray(importedItems) || importedItems.length === 0) return

    // Generate new UUIDs for all imported items to prevent overwriting existing pages
    const idMap = new Map()
    importedItems.forEach(item => {
      if (item.id) idMap.set(item.id, crypto.randomUUID())
    })

    // Re-map IDs, folder references, and sanitize content
    const remappedItems = importedItems.map(item => {
      const newId = idMap.get(item.id) || crypto.randomUUID()
      const remapped = { ...item, id: newId }

      // Remap folder page references
      if (item.type === 'folder' && Array.isArray(item.pages)) {
        remapped.pages = item.pages.map(pid => idMap.get(pid) || pid)
      }

      // Remap folderId reference
      if (item.folderId && idMap.has(item.folderId)) {
        remapped.folderId = idMap.get(item.folderId)
      }

      // Sanitize content
      if (item.type !== 'folder' && item.content?.blocks) {
        remapped.content = sanitizeEditorContent(item.content)
      }

      return remapped
    })

    // Merge: existing pages are NEVER overwritten (all imported IDs are new)
    const newPages = [...pagesRef.current, ...remappedItems]

    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)
  }, [savePagesToStorage])

  // Self-destruct: set a timer on a page
  const setSelfDestruct = useCallback((pageId, durationMs) => {
    if (!pageId || !durationMs) return
    const selfDestructAt = Date.now() + durationMs

    const newPages = pagesRef.current.map(p =>
      p.id === pageId ? { ...p, selfDestructAt } : p
    )
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => ({ ...prev, selfDestructAt }))
    }
  }, [savePagesToStorage])

  // Self-destruct: cancel timer
  const cancelSelfDestruct = useCallback((pageId) => {
    if (!pageId) return

    const newPages = pagesRef.current.map(p => {
      if (p.id === pageId) {
        const { selfDestructAt: _, ...rest } = p
        return rest
      }
      return p
    })
    pagesRef.current = newPages
    savePagesToStorage(newPages)
    setPages(newPages)

    if (currentPageRef.current?.id === pageId) {
      _setCurrentPage(prev => {
        const { selfDestructAt: _, ...rest } = prev
        return rest
      })
    }
  }, [savePagesToStorage])

  // App lock encryption: decrypt all app-lock-encrypted pages after unlock
  const decryptAllAppLockPages = useCallback(async (key, salt) => {
    appLockKeyRef.current = { key, salt }
    const currentPages = pagesRef.current
    const hasAppLockPages = currentPages.some(p => p.appLockEncrypted && p.encryptedContent)
    dbg('applock', 'decrypting all pages, encrypted count:', currentPages.filter(p => p.appLockEncrypted).length)
    if (!hasAppLockPages) {
      dbg('applock', 'no encrypted pages to decrypt')
      return
    }

    const decrypted = []
    for (const page of currentPages) {
      if (page.appLockEncrypted && page.encryptedContent) {
        try {
          const content = await decryptJsonWithKey(page.encryptedContent, key)
          const { appLockEncrypted: _, encryptedContent: __, ...rest } = page
          decrypted.push({ ...rest, content })
        } catch (err) {
          console.error('Failed to decrypt app-lock page:', page.id, err)
          decrypted.push(page) // Keep encrypted on failure
        }
      } else {
        decrypted.push(page)
      }
    }
    dbg('applock', 'decrypted', decrypted.filter(p => p.content).length, 'pages successfully')
    setPages(decrypted)
    pagesRef.current = decrypted
    // Re-fire sync diff with the freshly-decrypted state. Sync queue
    // skipped any earlier push attempts that found app-lock ciphertext
    // (peers can't decrypt that). Now that pagesRef holds plaintext,
    // diff against the last-synced snapshot will surface the pages as
    // upserts → push goes out with plaintext → peers receive readable
    // content. Without this, sync would never refresh after unlock
    // until the user manually edited each page, leading to "iPhone
    // shows synced pages but content is empty" (build-39 user report).
    try {
      if (typeof window !== 'undefined' && typeof window.__syncEnqueueChangedPages === 'function') {
        const currentTags = useTagStore.getState().tags || []
        window.__syncEnqueueChangedPages(
          window.__syncLastSnapshot || [],
          pagesRef.current,
          currentTags
        )
        window.__syncLastSnapshot = pagesRef.current
      }
    } catch (err) {
      console.warn('decryptAllAppLockPages: post-unlock sync push failed', err)
    }
    // Update currentPage with decrypted content and bump editorReloadKey
    // to force editor remount (same page ID won't remount via key alone)
    if (currentPageRef.current) {
      const updated = decrypted.find(p => p.id === currentPageRef.current.id)
      if (updated) {
        _setCurrentPage(updated)
        setEditorReloadKey(k => k + 1)
      }
    } else if (decrypted.length > 0) {
      const firstPage = decrypted.find(p => p.type !== 'folder') || decrypted[0]
      dbg('applock', 'selecting first page after recovery:', firstPage.title || firstPage.id)
      _setCurrentPage(firstPage)
    }
  }, [])

  // App lock encryption: encrypt all pages and clear plaintext from memory
  const encryptAndClearAppLockPages = useCallback(async () => {
    const appLockKey = appLockKeyRef.current
    if (!appLockKey) return
    dbg('applock', 'encrypting all pages for lock')

    // Flush: cancel any pending debounce and save immediately
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    // Wait for any in-progress save to finish before we save
    while (saveInProgressRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    saveVersionRef.current += 1
    await executeSave(pagesRef.current, saveVersionRef.current)

    // Clear plaintext from in-memory state
    const encrypted = []
    for (const page of pagesRef.current) {
      if (page.type === 'folder' || page.password?.hash || page.appLockEncrypted) {
        encrypted.push(page)
      } else if (page.content) {
        try {
          const encryptedContent = await encryptJsonWithKey(page.content, appLockKey.key, appLockKey.salt)
          encrypted.push({ ...page, content: null, encryptedContent, appLockEncrypted: true })
        } catch (err) {
          console.error('Failed to encrypt page for lock:', page.id, err)
          encrypted.push(page)
        }
      } else {
        encrypted.push(page)
      }
    }
    setPages(encrypted)
    pagesRef.current = encrypted
    appLockKeyRef.current = null
  }, [executeSave])

  // App lock encryption: re-encrypt all pages with a new key (password change)
  const reEncryptAppLockPages = useCallback(async (newKey, newSalt) => {
    appLockKeyRef.current = { key: newKey, salt: newSalt }
    // Pages are already decrypted in memory (user is unlocked)
    // Just save — preparePagesForStorage will encrypt with the new key
    await savePagesToStorage(pagesRef.current)
  }, [savePagesToStorage])

  // App lock encryption: remove all app-lock encryption (disable app lock)
  const removeAppLockEncryption = useCallback(async () => {
    // Pages should already be decrypted in memory
    const cleaned = pagesRef.current.map(p => {
      if (p.appLockEncrypted) {
        const { appLockEncrypted: _, ...rest } = p
        return rest
      }
      return p
    })
    appLockKeyRef.current = null
    setPages(cleaned)
    pagesRef.current = cleaned
    await savePagesToStorage(cleaned)
  }, [savePagesToStorage])

  // Self-destruct: track pages currently animating out
  const [selfDestructingPages, setSelfDestructingPages] = useState(new Set())
  const selfDestructingPagesRef = useRef(new Set())

  // completeSelfDestruct: called from UI when viewing a self-destructing page
  // The page is ALREADY deleted from storage by checkExpired — this just handles navigation + cleanup
  const completeSelfDestruct = useCallback((pageId) => {
    selfDestructingPagesRef.current.delete(pageId)
    setSelfDestructingPages(prev => {
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })
    if (currentPageRef.current?.id === pageId) {
      const remaining = pagesRef.current.filter(p => p.type !== 'folder' && p.id !== pageId)
      if (remaining.length > 0) {
        setCurrentPage(remaining[0])
      }
    }
  }, [setCurrentPage])

  // Self-destruct: check for expired pages every 5 seconds
  useEffect(() => {
    const checkExpired = async () => {
      const now = Date.now()
      const expired = pagesRef.current.filter(
        p => p.selfDestructAt && p.selfDestructAt <= now && p.type !== 'folder'
      )
      for (const page of expired) {
        if (!selfDestructingPagesRef.current.has(page.id)) {
          // Wait 2s after expiry so "Expired" badge is visible, then delete + animate
          const elapsed = now - page.selfDestructAt
          if (elapsed < 2000) continue

          // Delete from storage IMMEDIATELY so force-quit can't preserve
          // the page. Self-destruct bypasses Trash — the whole point of
          // the feature is unrecoverable destruction. AWAIT both the
          // delete and the disk flush so iOS suspend mid-window can't
          // race the destruct timer (the 150ms `savePagesToStorage`
          // debounce would otherwise lose the write entirely).
          try {
            await permanentlyDeletePage(page)
            await flushSavesNow()
          } catch (err) {
            console.error('self-destruct: delete/flush failed', err)
          }
          // Delete backup so content can't be recovered from .bak
          // (Electron only — iOS has no .bak file; durability of the
          // IDB delete is guaranteed by the build-19 transaction.oncomplete fix).
          if (typeof window !== 'undefined' && window.electron?.invoke) {
            setTimeout(() => window.electron.invoke('delete-pages-backup').catch(() => {}), 500)
          }

          // Start dissolve animation (cosmetic only — data is already gone)
          selfDestructingPagesRef.current.add(page.id)
          setSelfDestructingPages(prev => {
            const next = new Set(prev)
            next.add(page.id)
            return next
          })

          // Clean up animation state after dissolve
          if (currentPageRef.current?.id !== page.id) {
            setTimeout(() => {
              selfDestructingPagesRef.current.delete(page.id)
              setSelfDestructingPages(prev => {
                const next = new Set(prev)
                next.delete(page.id)
                return next
              })
            }, 900)
          }
        }
      }
    }

    const interval = setInterval(() => { checkExpired().catch(err => console.error('self-destruct sweep threw', err)) }, 1000)
    return () => clearInterval(interval)
  }, [permanentlyDeletePage, flushSavesNow])

  // Initialize on mount
  useEffect(() => {
    if (!isInitializedRef.current) {
      fetchPages()
    }
  }, [fetchPages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Returns latest pages from pagesRef (source of truth).
  // React `pages` state can be stale because savePage() only updates pagesRef.
  const getLatestPages = useCallback(() => pagesRef.current, [])

  return {
    pages,
    setPages,
    currentPage,
    saveStatus,
    setCurrentPage,
    handleNewPage,
    savePage,
    deletePage,
    renamePage,
    lockPage,
    unlockPage,
    removeLockFromUnlockedPage,
    fetchPages,
    addTagToPage,
    removeTagFromPage,
    deleteTagFromAllPages,
    tags,
    tempUnlockedPages,
    setTempUnlockedPages,
    isPasswordModalOpen,
    setIsPasswordModalOpen,
    pageToAccess,
    setPageToAccess,
    updateTagInPages,
    createFolder,
    deleteFolder,
    addPageToFolder,
    removePageFromFolder,
    renameFolder,
    handleDuplicatePage,
    importPages,
    movePageToFolder,
    reorderItems,
    reorderWithinFolder,
    persistPages,
    wipeAllPages,
    enterDuressHideMode,
    recoverFromDuressMode,
    movePageToContainer,
    setSelfDestruct,
    cancelSelfDestruct,
    navigateToPage,
    selfDestructingPages,
    completeSelfDestruct,
    editorReloadKey,
    setEditorReloadKey,
    decryptAllAppLockPages,
    encryptAndClearAppLockPages,
    reEncryptAppLockPages,
    removeAppLockEncryption,
    getLatestPages,
    flushSavesNow,
    // Phase 2.4 sync — exposed so RichTextEditor can pass the live duress
    // flag into useSyncQueue's canPush gate.
    isDuressModeRef,
    // Phase 2.5 trash — soft-delete (recoverable) and explicit permanent.
    trashPage,
    restorePage,
    permanentlyDeletePage,
    // Sync needs to persist pulled pages to local storage. Without this,
    // applyRemoteChanges only updates React state — pages live in memory
    // and vanish on app restart.
    savePagesToStorage,
  }
}