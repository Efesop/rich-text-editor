/**
 * Sync diff (change detection) test suite.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { diffPages, snapshotPages, buildManifestPayload } = await import('../lib/syncDiff.js')

const note = (overrides = {}) => ({
  id: overrides.id || 'p1',
  title: 'Untitled',
  content: { time: 0, blocks: [], version: '2.30.6' },
  tagNames: [],
  folderId: null,
  password: null,
  ...overrides
})

const folder = (overrides = {}) => ({
  id: overrides.id || 'f1',
  title: 'Folder',
  type: 'folder',
  pages: [],
  ...overrides
})

describe('diffPages — empty cases', () => {
  it('both empty → no changes', () => {
    const r = diffPages([], [])
    assert.equal(r.notesUpserted.size, 0)
    assert.equal(r.notesDeleted.size, 0)
    assert.equal(r.manifestChanged, false)
  })

  it('null inputs treated as empty', () => {
    const r = diffPages(null, undefined)
    assert.equal(r.notesUpserted.size, 0)
    assert.equal(r.manifestChanged, false)
  })
})

describe('diffPages — note operations', () => {
  it('new note → upsert', () => {
    const before = []
    const after = [note({ id: 'p1', title: 'Hello' })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
    assert.ok(r.notesUpserted.has('p1'))
    assert.equal(r.notesDeleted.size, 0)
  })

  it('deleted note → in deleted set', () => {
    const before = [note({ id: 'p1' })]
    const after = []
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 0)
    assert.equal(r.notesDeleted.size, 1)
    assert.ok(r.notesDeleted.has('p1'))
  })

  it('unchanged note → no change', () => {
    const a = note({ id: 'p1', title: 'Stable' })
    const b = JSON.parse(JSON.stringify(a))
    const r = diffPages([a], [b])
    assert.equal(r.notesUpserted.size, 0)
    assert.equal(r.notesDeleted.size, 0)
    assert.equal(r.manifestChanged, false)
  })

  it('title changed → upsert', () => {
    const before = [note({ id: 'p1', title: 'Old' })]
    const after = [note({ id: 'p1', title: 'New' })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
    assert.equal(r.notesUpserted.get('p1').title, 'New')
  })

  it('content changed → upsert', () => {
    const before = [note({ id: 'p1', content: { time: 0, blocks: [{ type: 'paragraph', data: { text: 'old' } }], version: '2.30' } })]
    const after = [note({ id: 'p1', content: { time: 0, blocks: [{ type: 'paragraph', data: { text: 'new' } }], version: '2.30' } })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
  })

  it('tagNames changed → upsert', () => {
    const before = [note({ id: 'p1', tagNames: ['work'] })]
    const after = [note({ id: 'p1', tagNames: ['work', 'urgent'] })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
  })

  it('folderId changed → upsert (move)', () => {
    const before = [note({ id: 'p1', folderId: null })]
    const after = [note({ id: 'p1', folderId: 'f1' })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
  })

  it('selfDestructAt added → upsert', () => {
    const before = [note({ id: 'p1' })]
    const after = [note({ id: 'p1', selfDestructAt: Date.now() + 60000 })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
  })

  it('encryptedContent changed → upsert', () => {
    const before = [note({ id: 'p1', content: null, encryptedContent: { v: 1, iv: [1, 2], data: [10, 20] }, appLockEncrypted: true })]
    const after = [note({ id: 'p1', content: null, encryptedContent: { v: 1, iv: [1, 2], data: [99, 88] }, appLockEncrypted: true })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
  })

  it('locking a note (password added) → upsert', () => {
    const before = [note({ id: 'p1', password: null })]
    const after = [note({ id: 'p1', password: { hash: 'bcrypted-x' } })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
  })

  it('createdAt and lastEdited ignored', () => {
    const before = [note({ id: 'p1', createdAt: '2026-01-01', lastEdited: 100 })]
    const after = [note({ id: 'p1', createdAt: '2026-12-31', lastEdited: 999 })]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 0, 'createdAt/lastEdited should not trigger sync push')
  })

  it('multiple notes — only changed ones in upsert', () => {
    const before = [
      note({ id: 'p1', title: 'A' }),
      note({ id: 'p2', title: 'B' }),
      note({ id: 'p3', title: 'C' })
    ]
    const after = [
      note({ id: 'p1', title: 'A' }),     // unchanged
      note({ id: 'p2', title: 'B-NEW' }), // changed
      note({ id: 'p3', title: 'C' })      // unchanged
    ]
    const r = diffPages(before, after)
    assert.equal(r.notesUpserted.size, 1)
    assert.ok(r.notesUpserted.has('p2'))
  })
})

describe('diffPages — folder operations', () => {
  it('new folder → manifestChanged', () => {
    const r = diffPages([], [folder({ id: 'f1' })])
    assert.equal(r.manifestChanged, true)
    assert.ok(r.foldersUpserted.has('f1'))
  })

  it('folder rename → manifestChanged', () => {
    const r = diffPages(
      [folder({ id: 'f1', title: 'Old' })],
      [folder({ id: 'f1', title: 'New' })]
    )
    assert.equal(r.manifestChanged, true)
    assert.ok(r.foldersUpserted.has('f1'))
  })

  it('folder pages array changed → manifestChanged', () => {
    const r = diffPages(
      [folder({ id: 'f1', pages: ['p1'] })],
      [folder({ id: 'f1', pages: ['p1', 'p2'] })]
    )
    assert.equal(r.manifestChanged, true)
  })

  it('folder deleted → manifestChanged + foldersDeleted', () => {
    const r = diffPages([folder({ id: 'f1' })], [])
    assert.equal(r.manifestChanged, true)
    assert.ok(r.foldersDeleted.has('f1'))
  })

  it('folder emoji change → manifestChanged', () => {
    const r = diffPages(
      [folder({ id: 'f1', emoji: '📁' })],
      [folder({ id: 'f1', emoji: '🎯' })]
    )
    assert.equal(r.manifestChanged, true)
  })
})

describe('diffPages — manifest (root order)', () => {
  it('root order swap → manifestChanged', () => {
    const before = [note({ id: 'p1' }), note({ id: 'p2' })]
    const after = [note({ id: 'p2' }), note({ id: 'p1' })]
    const r = diffPages(before, after)
    assert.equal(r.manifestChanged, true)
    // No notes upserted since content didn't change
    assert.equal(r.notesUpserted.size, 0)
  })

  it('order within folder does not flag manifest (covered by folder pages[])', () => {
    // Folder.pages array determines folder-internal order; root order ignores in-folder pages.
    const before = [
      folder({ id: 'f1', pages: ['p1', 'p2'] }),
      note({ id: 'p1', folderId: 'f1' }),
      note({ id: 'p2', folderId: 'f1' })
    ]
    const after = [
      folder({ id: 'f1', pages: ['p1', 'p2'] }),
      note({ id: 'p2', folderId: 'f1' }), // swapped order in array
      note({ id: 'p1', folderId: 'f1' })
    ]
    const r = diffPages(before, after)
    // Root order considers only folderId=null pages — both empty here, so no change
    assert.equal(r.manifestChanged, false)
  })
})

describe('snapshotPages', () => {
  it('deep clones', () => {
    const orig = [note({ id: 'p1', content: { blocks: [{ type: 'p', data: { x: 1 } }] } })]
    const snap = snapshotPages(orig)
    snap[0].content.blocks[0].data.x = 999
    assert.equal(orig[0].content.blocks[0].data.x, 1, 'snapshot must not share refs')
  })

  it('non-array → empty array', () => {
    assert.deepEqual(snapshotPages(null), [])
    assert.deepEqual(snapshotPages(undefined), [])
  })
})

describe('buildManifestPayload', () => {
  it('extracts folders, root order, tag map', () => {
    const pages = [
      folder({ id: 'f1', title: 'Work', emoji: '💼', pages: ['p2'] }),
      note({ id: 'p1', folderId: null }),
      note({ id: 'p2', folderId: 'f1' })
    ]
    const tags = [{ name: 'urgent', color: '#f00' }]
    const m = buildManifestPayload(pages, tags)
    assert.equal(m.folders.length, 1)
    assert.equal(m.folders[0].title, 'Work')
    assert.equal(m.folders[0].emoji, '💼')
    assert.deepEqual(m.folders[0].pages, ['p2'])
    assert.deepEqual(m.rootOrder, ['f1', 'p1'])
    assert.deepEqual(m.tagMap, [{ name: 'urgent', color: '#f00' }])
    assert.ok(m.generatedAt > 0)
  })

  it('handles empty inputs', () => {
    const m = buildManifestPayload([], [])
    assert.deepEqual(m.folders, [])
    assert.deepEqual(m.rootOrder, [])
    assert.deepEqual(m.tagMap, [])
  })

  it('handles null inputs', () => {
    const m = buildManifestPayload(null, undefined)
    assert.deepEqual(m.folders, [])
  })
})
