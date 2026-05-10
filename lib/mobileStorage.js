// Enhanced storage for mobile PWAs - handles iOS data persistence issues
class MobileStorage {
  constructor() {
    this.dbName = 'DashNotesDB'
    this.version = 4
    this.db = null
    this.isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
    this.isPWA = typeof window !== 'undefined' && (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)
  }

  async init() {
    if (this.db) return this.db

    // Request persistent storage for PWAs
    if (this.isPWA && navigator.storage && navigator.storage.persist) {
      try {
        const granted = await navigator.storage.persist()
        console.log('Persistent storage granted:', granted)
      } catch (e) {
        console.warn('Could not request persistent storage:', e)
      }
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      
      request.onerror = () => {
        console.error('IndexedDB error:', request.error)
        reject(request.error)
      }
      
      request.onsuccess = () => {
        this.db = request.result
        console.log('IndexedDB opened successfully')
        resolve(this.db)
      }
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        
        // Create object stores
        if (!db.objectStoreNames.contains('pages')) {
          const pagesStore = db.createObjectStore('pages', { keyPath: 'id' })
          pagesStore.createIndex('lastModified', 'lastModified', { unique: false })
        }
        
        if (!db.objectStoreNames.contains('tags')) {
          db.createObjectStore('tags', { keyPath: 'id' })
        }
        
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }

        if (!db.objectStoreNames.contains('attachments')) {
          db.createObjectStore('attachments')
        }

        if (!db.objectStoreNames.contains('versions')) {
          db.createObjectStore('versions', { keyPath: 'pageId' })
        }

        // v4 (sync feature): vault metadata + sync queue persistence.
        // Both stores use a single fixed key 'singleton' since each device
        // has at most one vault and one queue.
        if (!db.objectStoreNames.contains('vaultMetadata')) {
          db.createObjectStore('vaultMetadata', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'key' })
        }

        console.log('IndexedDB structure created (v' + this.version + ')')
      }
    })
  }

  async readPages() {
    try {
      await this.init()

      return new Promise((resolve, reject) => {
        // Read pages AND the persisted order in parallel from a single
        // transaction. CRITICAL: `IDBObjectStore.getAll()` returns
        // records ordered by PRIMARY KEY (page.id), NOT insertion or
        // save order. Without re-sorting by a persisted order array,
        // every app launch presents pages in id-sorted order regardless
        // of what the user (or sync) just set — visible bug: "I
        // reordered the sidebar / synced from desktop, quit the app,
        // and on reopen the order reverts."
        const transaction = this.db.transaction(['pages', 'metadata'], 'readonly')
        const pagesStore = transaction.objectStore('pages')
        const metaStore = transaction.objectStore('metadata')
        const pagesReq = pagesStore.getAll()
        const orderReq = metaStore.get('pageOrder')

        let pagesResult = null
        let orderResult = null
        let resolved = false

        const finish = () => {
          if (resolved) return
          if (pagesResult === null) return
          resolved = true

          let pages = pagesResult
          // Fallback: localStorage mirror has the correct order if
          // IndexedDB is empty (legacy migrate path) or if pageOrder is
          // missing (older data written before this fix).
          if (pages.length === 0) {
            const fallbackPages = this.readFromLocalStorage('pages')
            if (fallbackPages.length > 0) {
              console.log('Found pages in localStorage, migrating to IndexedDB')
              this.savePages(fallbackPages).catch(err => console.error('[mobileStorage] migration save failed', err))
              resolve(fallbackPages)
              return
            }
            resolve([])
            return
          }

          const order = orderResult?.value
          if (Array.isArray(order) && order.length > 0) {
            const indexById = new Map(order.map((id, i) => [id, i]))
            // Stable sort: pages NOT in the order array (legacy or
            // newly-pulled-but-pre-order-write) keep their relative
            // position at the end.
            pages = [...pages].sort((a, b) => {
              const ai = indexById.has(a.id) ? indexById.get(a.id) : Number.MAX_SAFE_INTEGER
              const bi = indexById.has(b.id) ? indexById.get(b.id) : Number.MAX_SAFE_INTEGER
              return ai - bi
            })
          } else {
            // No persisted order yet — try the localStorage mirror,
            // which historically preserved order.
            const mirror = this.readFromLocalStorage('pages')
            if (Array.isArray(mirror) && mirror.length === pages.length) {
              const mirrorOrder = new Map(mirror.map((p, i) => [p.id, i]))
              if (pages.every(p => mirrorOrder.has(p.id))) {
                pages = [...pages].sort((a, b) => mirrorOrder.get(a.id) - mirrorOrder.get(b.id))
                // Persist the recovered order so next load skips this branch.
                this.updateMetadata('pageOrder', pages.map(p => p.id)).catch(err => console.error('[mobileStorage] pageOrder recovery save failed', err))
              }
            }
          }

          console.log(`Loaded ${pages.length} pages from IndexedDB (order:${order ? 'persisted' : 'fallback'})`)
          resolve(pages)
        }

        pagesReq.onsuccess = () => { pagesResult = pagesReq.result || []; finish() }
        pagesReq.onerror = () => {
          console.error('Error reading pages from IndexedDB:', pagesReq.error)
          if (!resolved) {
            resolved = true
            resolve(this.readFromLocalStorage('pages'))
          }
        }
        orderReq.onsuccess = () => { orderResult = orderReq.result || null; finish() }
        orderReq.onerror = () => { orderResult = null; finish() }
      })
    } catch (error) {
      console.error('IndexedDB not available, falling back to localStorage:', error)
      return this.readFromLocalStorage('pages')
    }
  }

  async savePages(pages) {
    try {
      await this.init()

      return new Promise((resolve, reject) => {
        if (!Array.isArray(pages)) pages = []
        const pageIds = new Set(pages.map(p => p.id))

        if (pages.length === 0) {
          // SAFETY: refuse to wipe the entire `pages` store on an empty save.
          // Pre-fix this branch called `store.clear()`, which combined with
          // any spurious `savePages([])` (e.g. before fetchPages populates
          // React state) silently nuked all the user's notes. Legitimate
          // "delete every page" should go through an explicit purge API
          // rather than an empty upsert. No-op preserves data; if the caller
          // really meant to delete everything, the next mutation that adds
          // a page will start from the (preserved) existing set, which
          // matches what the user sees in UI.
          console.warn('[mobileStorage] savePages called with empty array — refusing to clear store (data-loss guard)')
          resolve({ success: true, skipped: 'empty-input-guard' })
          return
        }

        // Include `metadata` so we can write `pageOrder` atomically with
        // the page records. Without this, IndexedDB's id-sorted `getAll`
        // ignores save-order, and reordering the sidebar (or syncing a
        // peer's manifest.rootOrder) wouldn't survive an app restart.
        const transaction = this.db.transaction(['pages', 'metadata'], 'readwrite')
        const store = transaction.objectStore('pages')
        const metaStore = transaction.objectStore('metadata')
        let quotaErrored = null

        // Resolve ONLY when the transaction commits — IndexedDB doesn't
        // flush to disk until commit. Resolving on the last put.onsuccess
        // (the previous behavior) returned to the caller before the
        // transaction's actual commit, so an iOS WebView suspend in the
        // window between "last put succeeded" and "transaction committed"
        // dropped the entire save. transaction.oncomplete fires after
        // the commit.
        transaction.oncomplete = () => {
          if (quotaErrored) {
            const fallback = this.saveToLocalStorage('pages', pages)
            resolve(fallback?.success ? fallback : { success: false, error: 'Storage full' })
            return
          }
          // Mirror to localStorage as a belt-and-braces backup for the
          // small-data case (it's bounded by ~5 MB; large notes won't
          // fit but at least page metadata survives an IDB corruption).
          this.saveToLocalStorage('pages', pages)
          this.updateMetadata('lastSave', Date.now())
          resolve({ success: true })
        }
        // Persist the order alongside (within the same atomic tx) — see
        // readPages for why this is needed.
        try {
          metaStore.put({
            key: 'pageOrder',
            value: pages.map(p => p.id),
            timestamp: Date.now()
          })
        } catch (err) {
          console.warn('[mobileStorage] pageOrder put failed (non-fatal)', err)
        }
        transaction.onerror = () => {
          console.error('[mobileStorage] savePages transaction error', transaction.error)
          if (quotaErrored) {
            const fallback = this.saveToLocalStorage('pages', pages)
            resolve(fallback?.success ? fallback : { success: false, error: 'Storage full' })
            return
          }
          reject(transaction.error)
        }
        transaction.onabort = () => {
          console.error('[mobileStorage] savePages transaction aborted', transaction.error)
          // Fall back to localStorage if quota or other error caused abort.
          const fallback = this.saveToLocalStorage('pages', pages)
          resolve(fallback?.success ? fallback : { success: false, error: 'Aborted' })
        }

        // Order matters: delete stale keys FIRST, then upsert. With the
        // previous parallel ordering (getAllKeys onsuccess running in
        // parallel with the put loop), a delete could land after a put
        // for the same key on some implementations. Doing deletes first
        // (still within the same atomic transaction) eliminates the
        // ordering risk.
        const getAllRequest = store.getAllKeys()
        getAllRequest.onsuccess = () => {
          const existingKeys = getAllRequest.result || []
          for (const key of existingKeys) {
            if (!pageIds.has(key)) {
              store.delete(key)
            }
          }
          for (const page of pages) {
            const putRequest = store.put({
              ...page,
              lastModified: Date.now()
            })
            putRequest.onerror = () => {
              if (putRequest.error?.name === 'QuotaExceededError') {
                quotaErrored = putRequest.error
                console.warn('[mobileStorage] IDB quota exceeded — will fall back to localStorage on tx complete')
              } else {
                console.error('[mobileStorage] put failed for', page.id, putRequest.error)
              }
              try { transaction.abort() } catch { /* already aborting */ }
            }
          }
        }
      })
    } catch (error) {
      console.error('IndexedDB not available, falling back to localStorage:', error)
      return this.saveToLocalStorage('pages', pages)
    }
  }

  async readTags() {
    try {
      await this.init()
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['tags'], 'readonly')
        const store = transaction.objectStore('tags')
        const request = store.getAll()
        
        request.onsuccess = () => {
          const tags = request.result || []
          console.log(`Loaded ${tags.length} tags from IndexedDB`)
          
          // Fallback to localStorage if IndexedDB is empty
          if (tags.length === 0) {
            const fallbackTags = this.readFromLocalStorage('tags')
            if (fallbackTags.length > 0) {
              console.log('Found tags in localStorage, migrating to IndexedDB')
              this.saveTags(fallbackTags).then(() => {
                localStorage.removeItem('tags') // Clean up old storage
              })
              resolve(fallbackTags)
              return
            }
          }
          
          resolve(tags)
        }
        
        request.onerror = () => {
          console.error('Error reading tags from IndexedDB:', request.error)
          resolve(this.readFromLocalStorage('tags'))
        }
      })
    } catch (error) {
      console.error('IndexedDB not available, falling back to localStorage:', error)
      return this.readFromLocalStorage('tags')
    }
  }

  async saveTags(tags) {
    try {
      await this.init()

      return new Promise((resolve, reject) => {
        if (!Array.isArray(tags)) tags = []
        const transaction = this.db.transaction(['tags'], 'readwrite')
        const store = transaction.objectStore('tags')
        const tagIds = new Set(tags.map(t => t.id))

        // Resolve on transaction commit, not on individual put.onsuccess
        // — same suspend-window data-loss class as savePages.
        transaction.oncomplete = () => {
          this.saveToLocalStorage('tags', tags)
          resolve({ success: true })
        }
        transaction.onerror = () => {
          console.error('[mobileStorage] saveTags transaction error', transaction.error)
          this.saveToLocalStorage('tags', tags)
          resolve({ success: true })
        }
        transaction.onabort = () => {
          console.error('[mobileStorage] saveTags transaction aborted', transaction.error)
          this.saveToLocalStorage('tags', tags)
          resolve({ success: true })
        }

        if (tags.length === 0) {
          store.clear()
          return
        }

        // Deletes first, then puts (same atomic transaction).
        const getAllRequest = store.getAllKeys()
        getAllRequest.onsuccess = () => {
          const existingKeys = getAllRequest.result || []
          for (const key of existingKeys) {
            if (!tagIds.has(key)) store.delete(key)
          }
          for (const tag of tags) {
            store.put(tag)
          }
        }
      })
    } catch (error) {
      console.error('IndexedDB not available, falling back to localStorage:', error)
      return this.saveToLocalStorage('tags', tags)
    }
  }

  async updateMetadata(key, value) {
    try {
      await this.init()
      
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['metadata'], 'readwrite')
        const store = transaction.objectStore('metadata')
        const request = store.put({ key, value, timestamp: Date.now() })
        
        request.onsuccess = () => resolve({ success: true })
        request.onerror = () => {
          console.error('Error updating metadata:', request.error)
          resolve({ success: false })
        }
      })
    } catch (error) {
      console.error('Could not update metadata:', error)
      return { success: false }
    }
  }

  // Fallback methods for localStorage
  readFromLocalStorage(key) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : []
    } catch (err) {
      console.error(`Error reading ${key} from localStorage:`, err)
      return []
    }
  }

  saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data))
      return { success: true }
    } catch (err) {
      console.error(`Error saving ${key} to localStorage:`, err)
      return { success: false }
    }
  }

  // Decoy vault — stored as a single encrypted blob in metadata store
  async readDecoyPages () {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['metadata'], 'readonly')
        const store = transaction.objectStore('metadata')
        const request = store.get('decoy-pages')
        request.onsuccess = () => resolve(request.result ? request.result.value : null)
        request.onerror = () => resolve(null)
      })
    } catch {
      try {
        const raw = localStorage.getItem('dash-decoy-pages')
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    }
  }

  async saveDecoyPages (encryptedPayload) {
    try {
      await this.init()
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['metadata'], 'readwrite')
        const store = transaction.objectStore('metadata')
        store.put({ key: 'decoy-pages', value: encryptedPayload })
        transaction.oncomplete = () => resolve({ success: true })
        transaction.onerror = () => reject(transaction.error)
      })
    } catch {
      localStorage.setItem('dash-decoy-pages', JSON.stringify(encryptedPayload))
      return { success: true }
    }
  }

  // --- Attachment storage ---
  async saveAttachment (attachmentId, arrayBuffer) {
    try {
      await this.init()
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['attachments'], 'readwrite')
        const store = transaction.objectStore('attachments')
        let putError = null
        store.put(arrayBuffer, attachmentId).onerror = (e) => { putError = e.target.error }
        // Resolve on transaction commit, not put.onsuccess — see savePages.
        transaction.oncomplete = () => resolve({ success: true })
        transaction.onerror = () => reject(transaction.error || putError || new Error('attachment save failed'))
        transaction.onabort = () => reject(transaction.error || putError || new Error('attachment save aborted'))
      })
    } catch (error) {
      console.error('Failed to save attachment to IndexedDB:', error)
      throw error
    }
  }

  async loadAttachment (attachmentId) {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['attachments'], 'readonly')
        const store = transaction.objectStore('attachments')
        const request = store.get(attachmentId)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  async deleteAttachment (attachmentId) {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['attachments'], 'readwrite')
        const store = transaction.objectStore('attachments')
        const request = store.delete(attachmentId)
        request.onsuccess = () => resolve({ success: true })
        request.onerror = () => resolve({ success: false })
      })
    } catch {
      return { success: false }
    }
  }

  // --- Version history storage ---
  async readVersions (pageId) {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['versions'], 'readonly')
        const store = transaction.objectStore('versions')
        const request = store.get(pageId)
        request.onsuccess = () => resolve(request.result ? request.result.snapshots : [])
        request.onerror = () => resolve([])
      })
    } catch {
      return []
    }
  }

  async saveVersions (pageId, snapshots) {
    try {
      await this.init()
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['versions'], 'readwrite')
        const store = transaction.objectStore('versions')
        store.put({ pageId, snapshots })
        transaction.oncomplete = () => resolve({ success: true })
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error || new Error('versions save aborted'))
      })
    } catch (error) {
      console.error('Failed to save versions to IndexedDB:', error)
      return { success: false }
    }
  }

  async deleteVersions (pageId) {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['versions'], 'readwrite')
        const store = transaction.objectStore('versions')
        const request = store.delete(pageId)
        request.onsuccess = () => resolve({ success: true })
        request.onerror = () => resolve({ success: false })
      })
    } catch {
      return { success: false }
    }
  }

  // ── Sync vault metadata + queue (v4) ────────────────────────────────────
  async readVaultMetadata () {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['vaultMetadata'], 'readonly')
        const store = transaction.objectStore('vaultMetadata')
        const request = store.get('singleton')
        request.onsuccess = () => resolve(request.result?.metadata || null)
        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  async saveVaultMetadata (metadata) {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['vaultMetadata'], 'readwrite')
        const store = transaction.objectStore('vaultMetadata')
        let putError = null
        store.put({ key: 'singleton', metadata }).onerror = (e) => { putError = e.target.error }
        // Vault key wrap MUST land on disk before we report success —
        // a partial write here means the next launch loads stale crypto
        // material and pull/push silently fail with auth errors.
        transaction.oncomplete = () => resolve({ success: true })
        transaction.onerror = () => resolve({ success: false, error: (transaction.error || putError)?.message })
        transaction.onabort = () => resolve({ success: false, error: (transaction.error || putError)?.message })
      })
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async clearVaultMetadata () {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['vaultMetadata'], 'readwrite')
        const store = transaction.objectStore('vaultMetadata')
        const request = store.delete('singleton')
        request.onsuccess = () => resolve({ success: true })
        request.onerror = () => resolve({ success: false })
      })
    } catch {
      return { success: false }
    }
  }

  async readSyncQueue () {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readonly')
        const store = transaction.objectStore('syncQueue')
        const request = store.get('singleton')
        request.onsuccess = () => resolve(request.result?.entries || null)
        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  async saveSyncQueue (entries) {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite')
        const store = transaction.objectStore('syncQueue')
        store.put({ key: 'singleton', entries })
        // Sync queue is the recovery surface for unsent envelopes when
        // iOS suspends the WebView mid-flight. resolve on commit so a
        // caller that AWAITS this (e.g. a future flushPending path)
        // sees success only when bytes are actually durable.
        transaction.oncomplete = () => resolve({ success: true })
        transaction.onerror = () => resolve({ success: false, error: transaction.error?.message })
        transaction.onabort = () => resolve({ success: false, error: transaction.error?.message })
      })
    } catch {
      return { success: false }
    }
  }

  async clearSyncQueue () {
    try {
      await this.init()
      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite')
        const store = transaction.objectStore('syncQueue')
        const request = store.delete('singleton')
        request.onsuccess = () => resolve({ success: true })
        request.onerror = () => resolve({ success: false })
      })
    } catch {
      return { success: false }
    }
  }

  // Check storage status
  async getStorageInfo() {
    const info = {
      type: 'unknown',
      persistent: false,
      quota: 0,
      usage: 0,
      isIOS: this.isIOS,
      isPWA: this.isPWA
    }

    try {
      if (navigator.storage) {
        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate()
          info.quota = estimate.quota
          info.usage = estimate.usage
        }
        
        if (navigator.storage.persisted) {
          info.persistent = await navigator.storage.persisted()
        }
      }
      
      info.type = this.db ? 'IndexedDB' : 'localStorage'
    } catch (error) {
      console.warn('Could not get storage info:', error)
    }

    return info
  }
}

// Create singleton instance
const mobileStorage = new MobileStorage()

export { mobileStorage }
export default mobileStorage
