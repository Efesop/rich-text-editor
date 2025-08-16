// Enhanced storage system for mobile PWAs with multiple fallbacks
class PersistentStorage {
  constructor() {
    this.dbName = 'DashNotesDB'
    this.dbVersion = 1
    this.db = null
    this.initPromise = this.init()
  }

  async init() {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      console.log('Server-side environment detected, skipping storage initialization')
      return null
    }

    // Request persistent storage on mobile
    if (typeof navigator !== 'undefined' && 'storage' in navigator && 'persist' in navigator.storage) {
      try {
        const persistent = await navigator.storage.persist()
        console.log('Persistent storage granted:', persistent)
      } catch (e) {
        console.log('Persistent storage request failed:', e)
      }
    }

    // Initialize IndexedDB
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.log('IndexedDB not supported, falling back to localStorage')
        resolve(null)
        return
      }

      const request = indexedDB.open(this.dbName, this.dbVersion)
      
      request.onerror = () => {
        console.error('IndexedDB failed to open:', request.error)
        resolve(null)
      }
      
      request.onsuccess = () => {
        this.db = request.result
        console.log('IndexedDB initialized successfully')
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
      }
    })
  }

  async readPages() {
    // Return empty array if not in browser
    if (typeof window === 'undefined') {
      return []
    }

    // Electron fallback
    if (window.electron?.invoke) {
      return await window.electron.invoke('read-pages')
    }

    await this.initPromise

    // Try IndexedDB first
    if (this.db) {
      try {
        return await this._readFromIndexedDB('pages')
      } catch (e) {
        console.error('IndexedDB read failed, falling back to localStorage:', e)
      }
    }

    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('dash_pages')
      const pages = raw ? JSON.parse(raw) : []
      
      // If we got data from localStorage but IndexedDB is available, migrate it
      if (pages.length > 0 && this.db) {
        console.log('Migrating pages from localStorage to IndexedDB')
        await this._saveToIndexedDB('pages', pages)
      }
      
      return pages
    } catch (err) {
      console.error('All storage methods failed for pages:', err)
      return []
    }
  }

  async savePages(pages) {
    // Return success if not in browser
    if (typeof window === 'undefined') {
      return { success: true }
    }

    // Electron fallback
    if (window.electron?.invoke) {
      return await window.electron.invoke('save-pages', pages)
    }

    await this.initPromise

    const savePromises = []

    // Save to IndexedDB
    if (this.db) {
      savePromises.push(
        this._saveToIndexedDB('pages', pages).catch(e => 
          console.error('IndexedDB save failed:', e)
        )
      )
    }

    // Always save to localStorage as backup
    savePromises.push(
      new Promise((resolve) => {
        try {
          localStorage.setItem('dash_pages', JSON.stringify(pages))
          localStorage.setItem('dash_pages_backup', JSON.stringify({
            data: pages,
            timestamp: Date.now()
          }))
          resolve()
        } catch (e) {
          console.error('localStorage save failed:', e)
          resolve()
        }
      })
    )

    // Save to service worker cache
    savePromises.push(
      this._saveToServiceWorker('pages', pages).catch(e =>
        console.error('Service worker save failed:', e)
      )
    )

    await Promise.allSettled(savePromises)
    return { success: true }
  }

  async readTags() {
    // Return empty array if not in browser
    if (typeof window === 'undefined') {
      return []
    }

    if (window.electron?.invoke) {
      return await window.electron.invoke('read-tags')
    }

    await this.initPromise

    if (this.db) {
      try {
        return await this._readFromIndexedDB('tags')
      } catch (e) {
        console.error('IndexedDB tags read failed:', e)
      }
    }

    try {
      const raw = localStorage.getItem('dash_tags')
      const tags = raw ? JSON.parse(raw) : []
      
      if (tags.length > 0 && this.db) {
        await this._saveToIndexedDB('tags', tags)
      }
      
      return tags
    } catch (err) {
      console.error('All storage methods failed for tags:', err)
      return []
    }
  }

  async saveTags(tags) {
    // Return success if not in browser
    if (typeof window === 'undefined') {
      return { success: true }
    }

    if (window.electron?.invoke) {
      return await window.electron.invoke('save-tags', tags)
    }

    await this.initPromise

    const savePromises = []

    if (this.db) {
      savePromises.push(
        this._saveToIndexedDB('tags', tags).catch(e => 
          console.error('IndexedDB tags save failed:', e)
        )
      )
    }

    savePromises.push(
      new Promise((resolve) => {
        try {
          localStorage.setItem('dash_tags', JSON.stringify(tags))
          resolve()
        } catch (e) {
          console.error('localStorage tags save failed:', e)
          resolve()
        }
      })
    )

    await Promise.allSettled(savePromises)
    return { success: true }
  }

  async _readFromIndexedDB(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()
      
      request.onsuccess = () => {
        if (storeName === 'pages') {
          // Pages are stored individually, return as array
          resolve(request.result || [])
        } else {
          // Tags are stored as array in single record
          const result = request.result
          if (result.length > 0) {
            resolve(result[0].data || [])
          } else {
            resolve([])
          }
        }
      }
      
      request.onerror = () => reject(request.error)
    })
  }

  async _saveToIndexedDB(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      
      if (storeName === 'pages') {
        // Clear existing pages
        store.clear()
        // Add each page individually
        data.forEach(page => store.add(page))
      } else {
        // Store tags as single record
        store.clear()
        store.add({ id: 'tags', data: data, lastModified: Date.now() })
      }
      
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async _saveToServiceWorker(key, data) {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        // Send data to service worker for caching
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_USER_DATA',
          key: key,
          data: data,
          timestamp: Date.now()
        })
      } catch (e) {
        console.error('Service worker cache failed:', e)
      }
    }
  }

  // Storage health check
  async getStorageInfo() {
    const info = {
      persistent: false,
      quota: 0,
      usage: 0,
      indexedDBAvailable: !!this.db,
      localStorageAvailable: false
    }

    // Only check browser APIs if in browser environment
    if (typeof window === 'undefined') {
      return info
    }

    try {
      localStorage.setItem('test', 'test')
      localStorage.removeItem('test')
      info.localStorageAvailable = true
    } catch (e) {
      // localStorage not available
    }

    if (typeof navigator !== 'undefined' && 'storage' in navigator) {
      try {
        const estimate = await navigator.storage.estimate()
        info.quota = estimate.quota
        info.usage = estimate.usage
        info.persistent = await navigator.storage.persisted()
      } catch (e) {
        console.error('Storage estimate failed:', e)
      }
    }

    return info
  }
}

// Create singleton instance
const persistentStorage = new PersistentStorage()

// Export functions that match the original API
export const readPages = () => persistentStorage.readPages()
export const savePages = (pages) => persistentStorage.savePages(pages)
export const readTags = () => persistentStorage.readTags()
export const saveTags = (tags) => persistentStorage.saveTags(tags)
export const getStorageInfo = () => persistentStorage.getStorageInfo()

export default persistentStorage
