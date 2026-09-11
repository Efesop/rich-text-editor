/**
 * Moving photos already pasted into notes out of the notes and into
 * attachment storage.
 *
 * Before Stage 2 a pasted photo lived inside its note as a data URL, often
 * megabytes, which is what stops those notes from syncing. This moves each
 * photo's exact bytes (never re-encoded) into attachment storage and rewrites
 * only the image blocks, one note at a time, proving every step:
 *
 *   1. store each photo and read it back
 *   2. journal the note's original content
 *   3. swap in the rewritten note, only if nobody changed it meanwhile
 *   4. save for real, read the note back from storage, check each photo
 *   5. drop the journal entry
 *
 * If step 4 fails the photos go back inline with the same verified save, and
 * a journal left by an interrupted run is recovered on the next launch.
 *
 * Pure apart from what callers inject. Built in Stage 2, switched on in
 * Stage 3 (hooks/useImageMigration.js) once every syncing device can show
 * attachment photos.
 */

import { dataUrlToBytes, imageAttachmentId, sniffImageType } from './attachmentRefs.js'
import { buildImageBlockData, sameBytes } from './imageAttachments.js'

// The first app version that shows photos stored as attachments.
export const MIGRATION_MIN_APP_VERSION = '1.6.9'

// A device the relay hasn't seen for this long doesn't hold migration back.
export const DEVICE_SEEN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/** Compare dotted version numbers: -1, 0 or 1. Anything after a hyphen is ignored. */
export function compareVersions (a, b) {
  const parts = (version) => String(version || '').split('-')[0].split('.').map(part => parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/**
 * Whether every device syncing the vault can show photos stored as
 * attachments. Devices unseen for DEVICE_SEEN_WINDOW_MS don't count; a recent
 * device that never reported its version does.
 *
 * @param {Array<{deviceId: string, deviceName?: string, lastSeenAt: number, appVersion?: string}>} pairedDevices
 */
export function devicesReadyForMigration (pairedDevices, { now = Date.now(), minVersion = MIGRATION_MIN_APP_VERSION } = {}) {
  const waitingOn = []
  for (const device of Array.isArray(pairedDevices) ? pairedDevices : []) {
    const lastSeen = typeof device?.lastSeenAt === 'number' ? device.lastSeenAt : Date.parse(device?.lastSeenAt)
    if (!Number.isFinite(lastSeen) || now - lastSeen > DEVICE_SEEN_WINDOW_MS) continue
    if (!device.appVersion || compareVersions(device.appVersion, minVersion) < 0) {
      waitingOn.push({ deviceId: device.deviceId, deviceName: device.deviceName || null, appVersion: device.appVersion || null })
    }
  }
  return { ready: waitingOn.length === 0, waitingOn }
}

/** Why a note can't be migrated right now, or null when it can. */
export function migrationSkipReason (page, { openPageId = null } = {}) {
  if (!page || page.type === 'folder') return 'not-a-note'
  if (page.trashed) return 'in-trash'
  if (page.id === openPageId) return 'open'
  if (page.password?.hash) return 'password-locked'
  if (page.appLockEncrypted || page.encryptedContent || !Array.isArray(page.content?.blocks)) return 'encrypted'
  return null
}

/** The image blocks in a note that still carry their photo inline, as a data URL. */
export function inlinePhotos (page) {
  const blocks = page?.content?.blocks
  if (!Array.isArray(blocks)) return []
  const photos = []
  blocks.forEach((block, index) => {
    if (block?.type !== 'image' || imageAttachmentId(block.data)) return
    const url = block.data?.file?.url
    if (typeof url !== 'string' || !/^data:image\//i.test(url)) return
    photos.push({ index, blockId: block.id || null, approxBytes: Math.floor(url.length * 3 / 4) })
  })
  return photos
}

/** The notes worth migrating, largest inline photos first: those are the notes too big to sync. */
export function planImageMigration (pages, { openPageId = null, exclude = new Set() } = {}) {
  return (Array.isArray(pages) ? pages : [])
    .filter(page => !exclude.has(page?.id) && !migrationSkipReason(page, { openPageId }))
    .map(page => {
      const photos = inlinePhotos(page)
      return { pageId: page.id, photos: photos.length, inlineBytes: photos.reduce((sum, photo) => sum + photo.approxBytes, 0) }
    })
    .filter(entry => entry.photos > 0)
    .sort((a, b) => b.inlineBytes - a.inlineBytes)
}

function findPage (pages, pageId) {
  return (Array.isArray(pages) ? pages : []).find(page => page?.id === pageId) || null
}

// A moved photo's block in `blocks`: by block id, or by position when the note has no ids.
function findMovedBlock (blocks, item) {
  if (item.blockId) return blocks.find(block => block?.id === item.blockId) || null
  return blocks[item.index] || null
}

function asBytes (data) {
  if (!data) return null
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null
}

/**
 * The note with each moved photo swapped for its attachment. Block ids,
 * captions, tunes and order stay, and so does everything else in the note,
 * lastEdited included, so notes keep their place in the list.
 *
 * @param {object} page
 * @param {Array<{index: number, stored: {attachmentId: string, mimeType?: string, width?: number, height?: number}}>} moved
 */
export function rewriteInlinePhotos (page, moved) {
  const storedByIndex = new Map(moved.map(item => [item.index, item.stored]))
  const blocks = page.content.blocks.map((block, index) => {
    const stored = storedByIndex.get(index)
    if (!stored) return block
    const { caption, withBorder, withBackground, stretched } = block.data || {}
    return { ...block, data: buildImageBlockData({ ...stored, filename: undefined, caption, withBorder, withBackground, stretched }) }
  })
  return { ...page, content: { ...page.content, blocks } }
}

/**
 * Put moved photos back inline in the note as it is now, keeping any caption
 * or tune changed since. Blocks that no longer show the moved attachment are
 * left alone.
 *
 * @param {object} current - the note now
 * @param {object} original - the note before migration
 * @param {Array<{index: number, blockId: string|null, attachmentId: string}>} moved
 */
export function restoreInlinePhotos (current, original, moved) {
  const originalBlocks = original.content.blocks
  const blocks = current.content.blocks.slice()
  for (const item of moved) {
    const block = findMovedBlock(blocks, item)
    if (!block || block.type !== 'image' || imageAttachmentId(block.data) !== item.attachmentId) continue
    const url = originalBlocks[item.index]?.data?.file?.url
    if (typeof url !== 'string') continue
    const { caption, withBorder, withBackground, stretched } = block.data
    blocks[blocks.indexOf(block)] = { ...block, data: { file: { url }, caption, withBorder, withBackground, stretched } }
  }
  return { ...current, content: { ...current.content, blocks } }
}

function photosAreInline (saved, original, moved) {
  const blocks = saved?.content?.blocks
  if (!Array.isArray(blocks)) return false
  return moved.every(item => {
    const block = findMovedBlock(blocks, item)
    return block?.type === 'image' &&
      !imageAttachmentId(block.data) &&
      block.data?.file?.url === original.content.blocks[item.index]?.data?.file?.url
  })
}

async function movedPhotosReadBack (saved, original, moved, loadAttachment) {
  const blocks = saved?.content?.blocks
  if (!Array.isArray(blocks)) return false
  for (const item of moved) {
    const block = findMovedBlock(blocks, item)
    if (block?.type !== 'image' || imageAttachmentId(block.data) !== item.attachmentId) return false
    const expected = dataUrlToBytes(original.content.blocks[item.index].data.file.url)?.bytes
    if (!sameBytes(asBytes(await loadAttachment(item.attachmentId)), expected)) return false
  }
  return true
}

async function putPhotosBack ({ pageId, original, moved, getPages, getOpenPageId, swapPage, saveNow, readSavedPage }) {
  // An open note would be saved over by the editor: leave it for recovery.
  if (getOpenPageId() === pageId) return 'restore-waiting-for-open-note'
  const current = findPage(getPages(), pageId)
  if (!current) return 'restore-note-gone'
  if (!swapPage(restoreInlinePhotos(current, original, moved), current)) return 'restore-edited-meanwhile'
  try {
    await saveNow()
    if (photosAreInline(await readSavedPage(pageId), original, moved)) return 'restored'
  } catch { /* reported below */ }
  return 'restore-failed'
}

/**
 * Move one note's inline photos into attachment storage.
 *
 * @param {object} deps
 * @param {string} deps.pageId
 * @param {() => object[]} deps.getPages - the live pages
 * @param {() => string|null} deps.getOpenPageId - the note open in the editor
 * @param {(next: object, expected: object) => boolean} deps.swapPage - replace the note only if it is still `expected`
 * @param {() => Promise<void>} deps.saveNow - throws when the save didn't reach storage
 * @param {(pageId: string) => Promise<object|null>} deps.readSavedPage - the note as storage holds it
 * @param {(bytes: Uint8Array) => Promise<{attachmentId: string}>} deps.storePhoto - stores and reads back
 * @param {(id: string) => Promise<ArrayBuffer|Uint8Array|null>} deps.loadAttachment
 * @param {{write: (entry: object) => Promise<void>, clear: () => Promise<void>}} deps.journal
 * @param {() => boolean} [deps.shouldStop]
 * @returns {Promise<{outcome: 'moved'|'unchanged'|'restored'|'failed', reason: string|null, photos: number, bytes: number, stayedInline: number, tooLarge: number, unreadable: number}>}
 */
export async function migrateNotePhotos ({
  pageId,
  getPages,
  getOpenPageId = () => null,
  swapPage,
  saveNow,
  readSavedPage,
  storePhoto,
  loadAttachment,
  journal,
  shouldStop = () => false
}) {
  const report = (outcome, reason, extra = {}) => ({ outcome, reason, photos: 0, bytes: 0, stayedInline: 0, tooLarge: 0, unreadable: 0, ...extra })

  const original = findPage(getPages(), pageId)
  const skip = migrationSkipReason(original, { openPageId: getOpenPageId() })
  if (skip) return report('unchanged', skip)
  const photos = inlinePhotos(original)
  if (photos.length === 0) return report('unchanged', 'no-inline-photos')

  // 1. Store each photo's exact bytes. A photo that can't be decoded or is
  // over the attachment limit stays inline; any other failure stops here.
  const moved = []
  let bytes = 0
  let tooLarge = 0
  let unreadable = 0
  for (const photo of photos) {
    if (shouldStop()) return report('unchanged', 'paused')
    const decoded = dataUrlToBytes(original.content.blocks[photo.index].data.file.url)
    if (!decoded || !sniffImageType(decoded.bytes)) {
      unreadable++
      continue
    }
    try {
      const stored = await storePhoto(decoded.bytes)
      moved.push({ index: photo.index, blockId: photo.blockId, attachmentId: stored.attachmentId, stored })
      bytes += decoded.bytes.byteLength
    } catch (err) {
      if (err?.name === 'ImageTooLargeError') {
        tooLarge++
        continue
      }
      return report('unchanged', 'storage-failed')
    }
  }
  const stayedInline = photos.length - moved.length
  if (moved.length === 0) return report('unchanged', tooLarge ? 'photo-too-large' : 'unreadable-photo', { stayedInline, tooLarge, unreadable })
  if (shouldStop()) return report('unchanged', 'paused')

  // 2. Journal the original before the note changes.
  const journalMoved = moved.map(({ index, blockId, attachmentId }) => ({ index, blockId, attachmentId }))
  try {
    await journal.write({ pageId, original, moved: journalMoved, startedAt: Date.now() })
  } catch {
    return report('unchanged', 'storage-failed')
  }

  // 3. Swap in the rewritten note, only if it is still exactly what was read.
  if (getOpenPageId() === pageId || !swapPage(rewriteInlinePhotos(original, moved), original)) {
    const reason = getOpenPageId() === pageId ? 'open' : 'edited-meanwhile'
    await journal.clear()
    return report('unchanged', reason)
  }

  // 4. Save, read the note back from storage, and check every moved photo.
  let verified = false
  try {
    await saveNow()
    verified = await movedPhotosReadBack(await readSavedPage(pageId), original, journalMoved, loadAttachment)
  } catch {
    verified = false
  }
  if (!verified) {
    const outcome = await putPhotosBack({ pageId, original, moved: journalMoved, getPages, getOpenPageId, swapPage, saveNow, readSavedPage })
    if (outcome !== 'restored') return report('failed', outcome)
    await journal.clear()
    return report('restored', 'verify-failed')
  }

  // 5. Done: the journal entry can go.
  await journal.clear()
  return report('moved', null, { photos: moved.length, bytes, stayedInline, tooLarge, unreadable })
}

/**
 * Finish what an interrupted run left in the journal: keep the migrated note
 * when its photos read back, otherwise put the photos back inline.
 *
 * @returns {Promise<{outcome: 'none'|'kept'|'restored'|'waiting'|'failed', reason?: string, photos?: number}>}
 */
export async function recoverInterruptedMigration ({
  journal,
  getPages,
  getOpenPageId = () => null,
  swapPage,
  saveNow,
  readSavedPage,
  loadAttachment
}) {
  const entry = await journal.read()
  if (!entry) return { outcome: 'none' }
  const current = findPage(getPages(), entry.pageId)
  if (!current || !Array.isArray(current.content?.blocks) || !Array.isArray(entry.original?.content?.blocks)) {
    await journal.clear()
    return { outcome: 'none', reason: 'note-gone' }
  }

  const broken = []
  for (const item of entry.moved || []) {
    const block = findMovedBlock(current.content.blocks, item)
    // Never swapped in, or the photo was removed since: nothing to repair.
    if (!block || imageAttachmentId(block.data) !== item.attachmentId) continue
    const expected = dataUrlToBytes(entry.original.content.blocks[item.index]?.data?.file?.url)?.bytes
    if (!expected) continue
    if (!sameBytes(asBytes(await loadAttachment(item.attachmentId)), expected)) broken.push(item)
  }
  if (broken.length === 0) {
    await journal.clear()
    return { outcome: 'kept' }
  }

  if (getOpenPageId() === entry.pageId) return { outcome: 'waiting', reason: 'open' }
  if (!swapPage(restoreInlinePhotos(current, entry.original, broken), current)) return { outcome: 'waiting', reason: 'edited-meanwhile' }
  try {
    await saveNow()
    if (!photosAreInline(await readSavedPage(entry.pageId), entry.original, broken)) return { outcome: 'failed', reason: 'restore-failed' }
  } catch {
    return { outcome: 'failed', reason: 'restore-failed' }
  }
  await journal.clear()
  return { outcome: 'restored', photos: broken.length }
}
