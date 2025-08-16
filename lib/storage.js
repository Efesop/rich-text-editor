import mobileStorage from './mobileStorage.js'

// Check if we're running as a PWA (mobile app)
const isPWA = typeof window !== 'undefined' && 
  (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)

export async function readPages () {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-pages')
  }
  
  // PWA (mobile) - use enhanced storage
  if (isPWA) {
    return await mobileStorage.readPages()
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


