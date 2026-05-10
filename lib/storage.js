import mobileStorage from './mobileStorage.js'

// Use IndexedDB-backed mobileStorage when running as a PWA (home-screen
// install, `standalone` display) OR as a Capacitor native app (iOS / Android
// shell). Capacitor's WebView does NOT match `navigator.standalone` or the
// standalone display-mode media query, so without the Capacitor check we'd
// fall through to localStorage — which iOS WebKit purges aggressively under
// storage pressure / ITP, causing data loss after app updates.
const isPWA = typeof window !== 'undefined' &&
  (window.navigator.standalone ||
   window.matchMedia('(display-mode: standalone)').matches ||
   !!window.Capacitor?.isNativePlatform?.())

export async function readPages () {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-pages')
  }
  
  // PWA (mobile) - use enhanced storage. On first launch after the iOS
  // localStorage→IndexedDB migration fix, IndexedDB is empty but the user
  // may have data in legacy `localStorage['pages']`. Migrate it before
  // returning so users don't lose existing notes.
  if (isPWA) {
    const indexed = await mobileStorage.readPages()
    if (Array.isArray(indexed) && indexed.length > 0) return indexed
    try {
      const legacy = typeof window !== 'undefined' ? window.localStorage?.getItem('pages') : null
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('[storage] migrating', parsed.length, 'pages from legacy localStorage → IndexedDB')
          await mobileStorage.savePages(parsed)
          // Keep localStorage copy as a safety net; remove it after a release
          // once we're confident the migration is stable.
          return parsed
        }
      }
    } catch (err) {
      console.warn('[storage] legacy localStorage migration failed', err)
    }
    return indexed || []
  }

  // Web browser fallback
  try {
    const raw = localStorage.getItem('pages')
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.error('readPages fallback failed', err)
    return []
  }
}

export async function savePages (pages) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('save-pages', pages)
  }
  
  // PWA (mobile) - use enhanced storage
  if (isPWA) {
    return await mobileStorage.savePages(pages)
  }
  
  // Web browser fallback
  try {
    localStorage.setItem('pages', JSON.stringify(pages))
    return { success: true }
  } catch (err) {
    console.error('savePages fallback failed', err)
    throw err
  }
}

export async function readTags () {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-tags')
  }
  
  // PWA (mobile) - use enhanced storage
  if (isPWA) {
    return await mobileStorage.readTags()
  }
  
  // Web browser fallback
  try {
    const raw = localStorage.getItem('tags')
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.error('readTags fallback failed', err)
    return []
  }
}

export async function saveTags (tags) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('save-tags', tags)
  }
  
  // PWA (mobile) - use enhanced storage
  if (isPWA) {
    return await mobileStorage.saveTags(tags)
  }
  
  // Web browser fallback
  try {
    localStorage.setItem('tags', JSON.stringify(tags))
    return { success: true }
  } catch (err) {
    console.error('saveTags fallback failed', err)
    throw err
  }
}

export async function readDecoyPages () {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-decoy-pages')
  }
  if (isPWA) {
    return await mobileStorage.readDecoyPages()
  }
  try {
    // Obfuscated key — prevents forensic detection of duress mode
    const raw = localStorage.getItem('_dc') || localStorage.getItem('dash-decoy-pages')
    // Migrate old key name
    if (localStorage.getItem('dash-decoy-pages')) {
      localStorage.setItem('_dc', localStorage.getItem('dash-decoy-pages'))
      localStorage.removeItem('dash-decoy-pages')
    }
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function saveDecoyPages (encryptedPayload) {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('save-decoy-pages', encryptedPayload)
  }
  if (isPWA) {
    return await mobileStorage.saveDecoyPages(encryptedPayload)
  }
  try {
    localStorage.setItem('_dc', JSON.stringify(encryptedPayload))
    localStorage.removeItem('dash-decoy-pages') // Clean up old key if present
    return { success: true }
  } catch (err) {
    console.error('saveDecoyPages failed', err)
    throw err
  }
}

// Export storage info for debugging
export async function getStorageInfo() {
  if (isPWA) {
    return await mobileStorage.getStorageInfo()
  }
  
  return {
    type: 'localStorage',
    persistent: false,
    quota: 0,
    usage: 0,
    isIOS: false,
    isPWA: false
  }
}


