/**
 * The note opened after the open note is trashed, deleted or removed.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { nextNoteToOpen } from '../lib/nextNote.js'

const note = (id, extra = {}) => ({ id, title: id, content: { blocks: [] }, ...extra })

describe('nextNoteToOpen', () => {
  it('opens the first note, passing over folders and notes in Trash', () => {
    const items = [
      { id: 'folder', type: 'folder', pages: ['b'] },
      note('a', { trashed: true, trashedAt: 1 }),
      note('b', { folderId: 'folder' }),
      note('c')
    ]
    assert.equal(nextNoteToOpen(items)?.id, 'b')
  })

  it('passes over the note going away', () => {
    assert.equal(nextNoteToOpen([note('gone'), note('next')], { excludeId: 'gone' })?.id, 'next')
  })

  it('passes over notes with a password unless they are unlocked this session', () => {
    const items = [note('locked', { password: { hash: 'h' } }), note('open')]
    assert.equal(nextNoteToOpen(items)?.id, 'open')
    assert.equal(nextNoteToOpen(items, { unlockedIds: new Set(['locked']) })?.id, 'locked')
  })

  it('is null when no note opens without a password, so the caller clears the open note', () => {
    const items = [
      { id: 'folder', type: 'folder', pages: [] },
      note('trashed', { trashed: true }),
      note('locked', { password: { hash: 'h' } }),
      note('gone')
    ]
    assert.equal(nextNoteToOpen(items, { excludeId: 'gone' }), null)
    assert.equal(nextNoteToOpen([]), null)
    assert.equal(nextNoteToOpen(undefined), null)
  })
})
