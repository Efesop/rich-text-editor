import mobileStorage from './mobileStorage.js'

// Check if we're running as a PWA (mobile app)
const isPWA = typeof window !== 'undefined' &&
  (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)

const MAX_VERSIONS = 10

// Simple hash for dedup — fast, not cryptographic
function simpleHash (str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

export async function readVersions (pageId) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('read-versions', pageId)
  }

  // PWA (mobile) — use IndexedDB
  if (isPWA) {
    return await mobileStorage.readVersions(pageId)
  }

  // Web browser fallback — localStorage
  try {
    const raw = localStorage.getItem(`dash-versions-${pageId}`)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.error('readVersions fallback failed', err)
    return []
  }
}

export async function saveVersions (pageId, versions) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('save-versions', pageId, versions)
  }

  // PWA (mobile)
  if (isPWA) {
    return await mobileStorage.saveVersions(pageId, versions)
  }

  // Web browser fallback
  try {
    localStorage.setItem(`dash-versions-${pageId}`, JSON.stringify(versions))
    return { success: true }
  } catch (err) {
    console.error('saveVersions fallback failed', err)
    return { success: false }
  }
}

export async function deleteVersions (pageId) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('delete-versions', pageId)
  }

  // PWA (mobile)
  if (isPWA) {
    return await mobileStorage.deleteVersions(pageId)
  }

  // Web browser fallback
  try {
    localStorage.removeItem(`dash-versions-${pageId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteVersions fallback failed', err)
    return { success: false }
  }
}

// Throttle: minimum 30 seconds between version captures per page
const MIN_CAPTURE_INTERVAL = 30 * 1000
const lastCaptureTime = new Map()

// Capture a version snapshot if content has changed and enough time has passed
// Returns true if a version was saved, false if skipped
export async function captureVersion (pageId, blocks) {
  try {
    // Throttle — skip if captured too recently
    const now = Date.now()
    const lastTime = lastCaptureTime.get(pageId) || 0
    if (now - lastTime < MIN_CAPTURE_INTERVAL) {
      return false
    }

    const contentStr = JSON.stringify(blocks)
    const hash = simpleHash(contentStr)

    const existing = await readVersions(pageId)

    // Skip if latest version has same hash
    if (existing.length > 0 && existing[0].contentHash === hash) {
      return false
    }

    const snapshot = {
      timestamp: new Date().toISOString(),
      contentHash: hash,
      blocks
    }

    const updated = [snapshot, ...existing].slice(0, MAX_VERSIONS)
    await saveVersions(pageId, updated)
    lastCaptureTime.set(pageId, now)
    return true
  } catch (err) {
    console.error('captureVersion failed', err)
    return false
  }
}
