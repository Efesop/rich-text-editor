// Enhanced storage for mobile PWAs - handles iOS data persistence issues
class MobileStorage {
  constructor() {
    this.dbName = 'DashNotesDB'
    this.version = 1
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
        
        console.log('IndexedDB structure created')
      }
    })
  }

  async readPages() {
    try {
      await this.init()
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['pages'], 'readonly')
        const store = transaction.objectStore('pages')
        const request = store.getAll()
        
        request.onsuccess = () => {
          const pages = request.result || []
          console.log(`Loaded ${pages.length} pages from IndexedDB`)
          
          // Fallback to localStorage if IndexedDB is empty
          if (pages.length === 0) {
            const fallbackPages = this.readFromLocalStorage('pages')
            if (fallbackPages.length > 0) {
              console.log('Found pages in localStorage, migrating to IndexedDB')
              this.savePages(fallbackPages).then(() => {
                localStorage.removeItem('pages') // Clean up old storage
              })
              resolve(fallbackPages)
              return
            }
          }
          
          resolve(pages)
        }
        
        request.onerror = () => {
          console.error('Error reading pages from IndexedDB:', request.error)
          // Fallback to localStorage
          resolve(this.readFromLocalStorage('pages'))
        }
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
        const transaction = this.db.transaction(['pages'], 'readwrite')
        const store = transaction.objectStore('pages')
        
        // Clear existing pages
        const clearRequest = store.clear()
        
        clearRequest.onsuccess = () => {
          // Add all pages
          let completed = 0
          const total = pages.length
          
          if (total === 0) {
            resolve({ success: true })
            return
          }
          
          for (const page of pages) {
            const addRequest = store.add({
              ...page,
              lastModified: Date.now()
            })
            
            addRequest.onsuccess = () => {
              completed++
              if (completed === total) {
                console.log(`Saved ${total} pages to IndexedDB`)
                
                // Also backup to localStorage as secondary fallback
                this.saveToLocalStorage('pages', pages)
                
                // Update last save timestamp
                this.updateMetadata('lastSave', Date.now())
                
                resolve({ success: true })
              }
            }
            
            addRequest.onerror = () => {
              console.error('Error saving page to IndexedDB:', addRequest.error)
              // Fallback to localStorage
              this.saveToLocalStorage('pages', pages)
              resolve({ success: true })
            }
          }
        }
        
        clearRequest.onerror = () => {
          console.error('Error clearing pages from IndexedDB:', clearRequest.error)
          reject(clearRequest.error)
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
        const transaction = this.db.transaction(['tags'], 'readwrite')
        const store = transaction.objectStore('tags')
        
        // Clear existing tags
        const clearRequest = store.clear()
        
        clearRequest.onsuccess = () => {
          // Add all tags
          let completed = 0
          const total = tags.length
          
          if (total === 0) {
            resolve({ success: true })
            return
          }
          
          for (const tag of tags) {
            const addRequest = store.add(tag)
            
            addRequest.onsuccess = () => {
              completed++
              if (completed === total) {
                console.log(`Saved ${total} tags to IndexedDB`)
                
                // Also backup to localStorage
                this.saveToLocalStorage('tags', tags)
                
                resolve({ success: true })
              }
            }
            
            addRequest.onerror = () => {
              console.error('Error saving tag to IndexedDB:', addRequest.error)
              this.saveToLocalStorage('tags', tags)
              resolve({ success: true })
            }
          }
        }
        
        clearRequest.onerror = () => {
          console.error('Error clearing tags from IndexedDB:', clearRequest.error)
          reject(clearRequest.error)
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
