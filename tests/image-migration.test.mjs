/**
 * Moving photos already in notes into attachment storage.
 *
 * Every test checks the note either ends up fully migrated with every photo
 * readable, or exactly as it was.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const {
  compareVersions,
  devicesReadyForMigration,
  inlinePhotos,
  migrationSkipReason,
  planImageMigration,
  migrateNotePhotos,
  recoverInterruptedMigration,
  DEVICE_SEEN_WINDOW_MS
} = await import('../lib/imageMigration.js')
const { storeImageBytes, ImageTooLargeError } = await import('../lib/imageAttachments.js')
const { imageStubUrl, imageAttachmentId } = await import('../lib/attachmentRefs.js')
const { applyPulledChanges } = await import('../lib/syncPull.js')

const KEY = new Uint8Array(32).fill(5)
const clone = (value) => JSON.parse(JSON.stringify(value))

function png (width, height, fill = 0, extra = 32) {
  const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height), 8, 6, 0, 0, 0, ...new Array(extra).fill(fill)])
}
const dataUrl = (bytes) => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64')

const PHOTO_A = png(640, 480, 1)
const PHOTO_B = png(1024, 768, 2, 64)

function note (id, photos, extra = {}) {
  return {
    id,
    title: `Note ${id}`,
    lastEdited: 1700000000000,
    content: {
      time: 1,
      version: '2.30.6',
      blocks: [
        { id: `${id}-intro`, type: 'paragraph', data: { text: 'Before the photos' } },
        ...photos.map((bytes, i) => ({
          id: `${id}-img${i}`,
          type: 'image',
          data: { file: { url: typeof bytes === 'string' ? bytes : dataUrl(bytes) }, caption: `Photo ${i}`, withBorder: i === 0, withBackground: false, stretched: true },
          tunes: { alignment: { alignment: 'center' } }
        })),
        { id: `${id}-outro`, type: 'paragraph', data: { text: 'After the photos' } }
      ]
    },
    ...extra
  }
}

// A pages manager, a disk and attachment storage, all in memory.
function harness (pages, { failSaves = [] } = {}) {
  const state = { pages, disk: clone(pages), openPageId: null, journal: null, lastJournal: null, saves: 0 }
  const attachments = new Map()
  const storage = {
    save: async (id, buffer) => { attachments.set(id, new Uint8Array(buffer.slice(0))) },
    load: async (id) => attachments.has(id) ? attachments.get(id).slice() : null
  }
  const deps = {
    getPages: () => state.pages,
    getOpenPageId: () => state.openPageId,
    swapPage: (next, expected) => {
      const index = state.pages.findIndex(page => page.id === next.id)
      if (index === -1 || state.pages[index] !== expected) return false
      state.pages = state.pages.map((page, i) => i === index ? next : page)
      return true
    },
    saveNow: async () => {
      state.saves++
      if (failSaves.includes(state.saves)) throw new Error('save did not reach storage')
      state.disk = clone(state.pages)
    },
    readSavedPage: async (id) => state.disk.find(page => page.id === id) || null,
    storePhoto: (bytes) => storeImageBytes({ bytes, keyBytes: KEY, storage }),
    loadAttachment: storage.load,
    journal: {
      write: async (entry) => { state.journal = clone(entry); state.lastJournal = clone(entry) },
      read: async () => state.journal,
      clear: async () => { state.journal = null }
    }
  }
  return { state, attachments, storage, deps }
}

const blockById = (page, id) => page.content.blocks.find(block => block.id === id)

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    assert.equal(compareVersions('1.6.9', '1.6.10'), -1)
    assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
    assert.equal(compareVersions('1.6.9', '1.6.9'), 0)
    assert.equal(compareVersions('1.6.9-beta.1', '1.6.9'), 0)
    assert.equal(compareVersions(undefined, '1.6.9'), -1)
  })
})

describe('devicesReadyForMigration', () => {
  const now = Date.UTC(2026, 8, 11)
  const day = 24 * 60 * 60 * 1000

  it('waits for a recently seen device on an older version, or one that never said', () => {
    const result = devicesReadyForMigration([
      { deviceId: 'mac', deviceName: 'Mac', lastSeenAt: now - day, appVersion: '1.6.9' },
      { deviceId: 'phone', deviceName: 'iPhone', lastSeenAt: now - 2 * day, appVersion: '1.6.4' },
      { deviceId: 'tablet', lastSeenAt: now - 3 * day }
    ], { now })
    assert.equal(result.ready, false)
    assert.deepEqual(result.waitingOn.map(device => device.deviceId), ['phone', 'tablet'])
  })

  it('does not wait for a device unseen for 30 days', () => {
    const result = devicesReadyForMigration([
      { deviceId: 'mac', lastSeenAt: now, appVersion: '1.7.0' },
      { deviceId: 'old', lastSeenAt: now - DEVICE_SEEN_WINDOW_MS - 1, appVersion: '1.5.0' }
    ], { now })
    assert.deepEqual(result, { ready: true, waitingOn: [] })
  })

  it('is ready with no other devices at all', () => {
    assert.deepEqual(devicesReadyForMigration([], { now }), { ready: true, waitingOn: [] })
  })
})

describe('which notes get migrated', () => {
  it('finds only photos still carried inline', () => {
    const page = note('n', [PHOTO_A])
    page.content.blocks.push(
      { id: 'stub', type: 'image', data: { file: { url: imageStubUrl('0f8fad5b-d9cb-469f-a165-70867728950e') }, caption: '' } },
      { id: 'web', type: 'image', data: { file: { url: 'https://example.com/a.png' }, caption: '' } },
      { id: 'text', type: 'paragraph', data: { text: 'data:image/png;base64,AAAA' } }
    )
    assert.deepEqual(inlinePhotos(page).map(photo => photo.blockId), ['n-img0'])
  })

  it('skips notes in Trash, open, password-locked or encrypted', () => {
    assert.equal(migrationSkipReason(note('a', [PHOTO_A], { trashed: true })), 'in-trash')
    assert.equal(migrationSkipReason(note('a', [PHOTO_A]), { openPageId: 'a' }), 'open')
    assert.equal(migrationSkipReason(note('a', [PHOTO_A], { password: { hash: 'h' } })), 'password-locked')
    assert.equal(migrationSkipReason({ id: 'a', appLockEncrypted: true, content: null }), 'encrypted')
    assert.equal(migrationSkipReason({ id: 'f', type: 'folder' }), 'not-a-note')
    assert.equal(migrationSkipReason(note('a', [PHOTO_A])), null)
  })

  it('plans the largest inline photos first and leaves out what it must skip', () => {
    const plan = planImageMigration([
      note('small', [PHOTO_A]),
      note('big', [PHOTO_A, PHOTO_B]),
      note('trashed', [PHOTO_B], { trashed: true }),
      note('open', [PHOTO_B]),
      note('excluded', [PHOTO_B]),
      note('none', [])
    ], { openPageId: 'open', exclude: new Set(['excluded']) })
    assert.deepEqual(plan.map(entry => entry.pageId), ['big', 'small'])
    assert.equal(plan[0].photos, 2)
  })
})

describe('migrateNotePhotos', () => {
  it('moves every photo into storage and changes nothing else in the note', async () => {
    const original = note('trip', [PHOTO_A, PHOTO_B])
    const other = note('other', [])
    const { state, attachments, deps } = harness([original, other])

    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })

    assert.equal(result.outcome, 'moved')
    assert.equal(result.photos, 2)
    assert.equal(result.bytes, PHOTO_A.byteLength + PHOTO_B.byteLength)
    const migrated = state.pages[0]
    assert.equal(migrated.lastEdited, original.lastEdited)
    assert.equal(state.pages[1], other, 'other notes are the same objects')
    assert.deepEqual(migrated.content.blocks.map(block => block.id), original.content.blocks.map(block => block.id))
    assert.deepEqual(blockById(migrated, 'trip-intro'), blockById(original, 'trip-intro'))
    for (const [i, bytes] of [PHOTO_A, PHOTO_B].entries()) {
      const block = blockById(migrated, `trip-img${i}`)
      const id = imageAttachmentId(block.data)
      assert.ok(id, 'photo has an attachment id')
      assert.equal(block.data.file.url, imageStubUrl(id))
      assert.equal(block.data.caption, `Photo ${i}`)
      assert.equal(block.data.withBorder, i === 0)
      assert.equal(block.data.stretched, true)
      assert.deepEqual(block.tunes, { alignment: { alignment: 'center' } })
      assert.equal(block.data.mimeType, 'image/png')
      assert.deepEqual(attachments.get(id), bytes)
    }
    assert.deepEqual(state.disk[0], clone(migrated), 'storage holds the migrated note')
    assert.equal(state.journal, null)
  })

  it('leaves a note alone that was edited while its photos were stored', async () => {
    const { state, deps } = harness([note('trip', [PHOTO_A])])
    const storePhoto = deps.storePhoto
    deps.storePhoto = async (bytes) => {
      const edited = clone(state.pages[0])
      edited.content.blocks[0].data.text = 'Edited meanwhile'
      state.pages = [edited]
      return storePhoto(bytes)
    }

    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })

    assert.deepEqual([result.outcome, result.reason], ['unchanged', 'edited-meanwhile'])
    assert.equal(state.pages[0].content.blocks[0].data.text, 'Edited meanwhile')
    assert.equal(inlinePhotos(state.pages[0]).length, 1)
    assert.equal(state.journal, null)
  })

  it('leaves a note alone that is opened while its photos are stored', async () => {
    const original = note('trip', [PHOTO_A])
    const { state, deps } = harness([original])
    const storePhoto = deps.storePhoto
    deps.storePhoto = async (bytes) => {
      state.openPageId = 'trip'
      return storePhoto(bytes)
    }
    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })
    assert.deepEqual([result.outcome, result.reason], ['unchanged', 'open'])
    assert.equal(state.pages[0], original)
  })

  it('puts the photos back inline when they do not read back after saving', async () => {
    const original = note('trip', [PHOTO_A, PHOTO_B])
    const { state, deps } = harness([original])
    const load = deps.loadAttachment
    deps.loadAttachment = async (id) => state.saves >= 1 ? null : load(id)

    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })

    assert.deepEqual([result.outcome, result.reason], ['restored', 'verify-failed'])
    for (const page of [state.pages[0], state.disk[0]]) {
      assert.deepEqual(page.content.blocks.map(block => block.data.file?.url), original.content.blocks.map(block => block.data.file?.url))
      assert.equal(page.content.blocks.some(block => imageAttachmentId(block.data)), false)
    }
    assert.equal(state.journal, null)
  })

  it('keeps the journal when putting the photos back fails as well', async () => {
    const { state, deps } = harness([note('trip', [PHOTO_A])], { failSaves: [2] })
    const load = deps.loadAttachment
    deps.loadAttachment = async (id) => state.saves >= 1 ? null : load(id)

    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })

    assert.deepEqual([result.outcome, result.reason], ['failed', 'restore-failed'])
    assert.equal(state.journal.pageId, 'trip')
    assert.equal(inlinePhotos(state.journal.original).length, 1)
  })

  it('moves the photos it can and leaves the rest inline', async () => {
    const { state, deps } = harness([note('trip', [PHOTO_A, PHOTO_B, 'data:image/png;base64,%%%'])])
    const storePhoto = deps.storePhoto
    deps.storePhoto = async (bytes) => {
      if (bytes.byteLength === PHOTO_B.byteLength) throw new ImageTooLargeError(bytes.byteLength, 10)
      return storePhoto(bytes)
    }

    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })

    assert.equal(result.outcome, 'moved')
    assert.equal(result.photos, 1)
    assert.equal(result.stayedInline, 2)
    assert.ok(imageAttachmentId(blockById(state.pages[0], 'trip-img0').data))
    assert.equal(imageAttachmentId(blockById(state.pages[0], 'trip-img1').data), null)
    assert.equal(blockById(state.pages[0], 'trip-img2').data.file.url, 'data:image/png;base64,%%%')
  })

  it('stops between photos when asked, before changing anything', async () => {
    const original = note('trip', [PHOTO_A, PHOTO_B])
    const { state, deps } = harness([original])
    let calls = 0
    const result = await migrateNotePhotos({ ...deps, pageId: 'trip', shouldStop: () => ++calls > 1 })
    assert.deepEqual([result.outcome, result.reason], ['unchanged', 'paused'])
    assert.equal(state.pages[0], original)
    assert.equal(state.lastJournal, null)
  })

  it('stops without changing the note when storing a photo fails', async () => {
    const original = note('trip', [PHOTO_A])
    const { state, deps } = harness([original])
    deps.storePhoto = async () => { throw new Error('disk full') }
    const result = await migrateNotePhotos({ ...deps, pageId: 'trip' })
    assert.deepEqual([result.outcome, result.reason], ['unchanged', 'storage-failed'])
    assert.equal(state.pages[0], original)
  })
})

describe('recoverInterruptedMigration', () => {
  async function interruptedRun () {
    const h = harness([note('trip', [PHOTO_A, PHOTO_B])])
    await migrateNotePhotos({ ...h.deps, pageId: 'trip' })
    // As if the app quit before clearing the journal.
    h.state.journal = clone(h.state.lastJournal)
    return h
  }

  it('keeps a migrated note whose photos all read back', async () => {
    const { state, deps } = await interruptedRun()
    const migrated = state.pages[0]
    assert.deepEqual(await recoverInterruptedMigration(deps), { outcome: 'kept' })
    assert.equal(state.pages[0], migrated)
    assert.equal(state.journal, null)
  })

  it('puts back inline the photos that no longer read back, keeping later caption edits', async () => {
    const { state, attachments, deps } = await interruptedRun()
    const lostId = imageAttachmentId(blockById(state.pages[0], 'trip-img1').data)
    attachments.delete(lostId)
    const edited = clone(state.pages[0])
    blockById(edited, 'trip-img1').data.caption = 'Renamed later'
    state.pages = [edited]

    const result = await recoverInterruptedMigration(deps)

    assert.deepEqual(result, { outcome: 'restored', photos: 1 })
    const recovered = blockById(state.disk[0], 'trip-img1')
    assert.equal(recovered.data.file.url, dataUrl(PHOTO_B))
    assert.equal(recovered.data.caption, 'Renamed later')
    assert.ok(imageAttachmentId(blockById(state.disk[0], 'trip-img0').data), 'the photo that reads back stays migrated')
    assert.equal(state.journal, null)
  })

  it('waits while the note is open, and drops the journal once the note is gone', async () => {
    const { state, attachments, deps } = await interruptedRun()
    attachments.clear()
    state.openPageId = 'trip'
    assert.deepEqual(await recoverInterruptedMigration(deps), { outcome: 'waiting', reason: 'open' })
    assert.notEqual(state.journal, null)
    state.pages = []
    assert.deepEqual(await recoverInterruptedMigration(deps), { outcome: 'none', reason: 'note-gone' })
    assert.equal(state.journal, null)
  })
})

describe('a migrated note reaches other devices', () => {
  it('replaces the inline copy on a device that pulls it, although lastEdited did not change', async () => {
    const { state, deps } = harness([note('trip', [PHOTO_A])])
    const peerCopy = clone(state.pages[0])
    await migrateNotePhotos({ ...deps, pageId: 'trip' })
    const migrated = clone(state.pages[0])

    const result = await applyPulledChanges([peerCopy], [{
      resourceType: 'note',
      envelopeType: 'note',
      resourceId: 'trip',
      version: 2,
      payload: migrated,
      payloadTimestamp: migrated.lastEdited + 60000
    }])

    assert.deepEqual(result.applied, ['trip'])
    const pulled = result.newPages.find(page => page.id === 'trip')
    assert.ok(imageAttachmentId(blockById(pulled, 'trip-img0').data))
  })
})
