import mobileStorage from './mobileStorage.js'

// Check if we're running as a PWA (mobile app)
const isPWA = typeof window !== 'undefined' &&
  (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)

// Allowed MIME types for attachments (v1: images + PDF only)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf'
])

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Magic bytes signatures for allowed file types
const MAGIC_BYTES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]] // %PDF
}

async function validateMagicBytes (file) {
  try {
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    const expected = MAGIC_BYTES[file.type]
    if (!expected) return false
    return expected.some(sig => sig.every((byte, i) => header[i] === byte))
  } catch { return false }
}

export async function validateAttachment (file) {
  if (!file) return { valid: false, error: 'No file provided' }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: 'Unsupported file type. Only images (JPEG, PNG, GIF, WebP) and PDFs are allowed.' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large. Maximum size is 10MB.' }
  }
  const magicValid = await validateMagicBytes(file)
  if (!magicValid) {
    return { valid: false, error: 'File content does not match its type. The file may be corrupted or renamed.' }
  }
  return { valid: true }
}

export function formatFileSize (bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export async function saveAttachment (attachmentId, arrayBuffer) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    // Pass as Uint8Array — Electron's structured clone handles typed arrays efficiently
    return await window.electron.invoke('save-attachment', attachmentId, new Uint8Array(arrayBuffer))
  }

  // PWA (mobile) — use IndexedDB
  if (isPWA) {
    return await mobileStorage.saveAttachment(attachmentId, arrayBuffer)
  }

  // Web browser fallback — store as base64 in localStorage
  try {
    const base64 = arrayBufferToBase64(arrayBuffer)
    localStorage.setItem(`attachment-${attachmentId}`, base64)
    return { success: true }
  } catch (err) {
    console.error('saveAttachment fallback failed', err)
    throw err
  }
}

export async function loadAttachment (attachmentId) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    const data = await window.electron.invoke('load-attachment', attachmentId)
    if (!data) return null
    // Data comes as Uint8Array via structured clone
    return data instanceof ArrayBuffer ? data : (data.buffer || new Uint8Array(data).buffer)
  }

  // PWA (mobile)
  if (isPWA) {
    return await mobileStorage.loadAttachment(attachmentId)
  }

  // Web browser fallback
  try {
    const base64 = localStorage.getItem(`attachment-${attachmentId}`)
    if (!base64) return null
    return base64ToArrayBuffer(base64)
  } catch (err) {
    console.error('loadAttachment fallback failed', err)
    return null
  }
}

export async function deleteAttachment (attachmentId) {
  // Electron (desktop)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return await window.electron.invoke('delete-attachment', attachmentId)
  }

  // PWA (mobile)
  if (isPWA) {
    return await mobileStorage.deleteAttachment(attachmentId)
  }

  // Web browser fallback
  try {
    localStorage.removeItem(`attachment-${attachmentId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteAttachment fallback failed', err)
    return { success: false }
  }
}

export async function deleteMultipleAttachments (attachmentIds) {
  const results = await Promise.allSettled(
    attachmentIds.map(id => deleteAttachment(id))
  )
  return results
}

export async function openAttachment (attachmentId, filename, mimeType) {
  // On Electron, use shell.openPath for native app experience (no need to load into memory)
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    const result = await window.electron.invoke('open-attachment', attachmentId, filename, mimeType)
    if (result?.opened) return
  }

  // PWA / Web fallback — load file and open as blob in new tab
  const buffer = await loadAttachment(attachmentId)
  if (!buffer) return

  const blob = new Blob([buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Revoke after a delay to allow the browser to load the blob
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// Collect all attachment data from page blocks as { attachmentId, data (base64) } pairs
export async function collectAttachmentsForExport (pages) {
  const attachments = {}
  for (const page of pages) {
    if (page.type === 'folder' || !page.content?.blocks) continue
    for (const block of page.content.blocks) {
      if (block.type === 'attachment' && block.data?.attachmentId) {
        const id = block.data.attachmentId
        if (attachments[id]) continue // already collected
        try {
          const buffer = await loadAttachment(id)
          if (buffer) {
            attachments[id] = arrayBufferToBase64(buffer)
          }
        } catch (err) {
          console.error('Failed to load attachment for export:', id, err)
        }
      }
    }
  }
  return attachments
}

// Restore attachments from exported { attachmentId: base64 } map
export async function restoreAttachmentsFromImport (attachments) {
  if (!attachments || typeof attachments !== 'object') return
  for (const [id, base64] of Object.entries(attachments)) {
    try {
      const buffer = base64ToArrayBuffer(base64)
      await saveAttachment(id, buffer)
    } catch (err) {
      console.error('Failed to restore attachment:', id, err)
    }
  }
}

// Duplicate attachments: load each, save with new ID, return old→new ID map
export async function duplicateAttachments (attachmentIds) {
  const idMap = {}
  for (const oldId of attachmentIds) {
    try {
      const buffer = await loadAttachment(oldId)
      if (buffer) {
        const newId = crypto.randomUUID()
        await saveAttachment(newId, buffer)
        idMap[oldId] = newId
      }
    } catch (err) {
      console.error('Failed to duplicate attachment:', oldId, err)
    }
  }
  return idMap
}

// Helpers
function arrayBufferToBase64 (buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer (base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
