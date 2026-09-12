/**
 * Pinned notes: which notes count as pinned, and their order.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { isPinned, pinnedNotes, setPinned, withPinnedFirst } = await import('../lib/pinnedNotes.js')
const { validatePageStructure } = await import('../utils/securityUtils.js')

const note = (id, extra = {}) => ({ id, title: id, ...extra })

describe('pinned notes', () => {
  it('counts only notes with a pin time, never folders or notes in Trash', () => {
    assert.equal(isPinned(note('a', { pinnedAt: 5 })), true)
    assert.equal(isPinned(note('b')), false)
    assert.equal(isPinned(note('c', { pinnedAt: '5' })), false)
    assert.equal(isPinned(note('d', { pinnedAt: 5, trashed: true })), false)
    assert.equal(isPinned({ id: 'f', type: 'folder', pinnedAt: 5 }), false)
  })

  it('lists the most recently pinned first, and puts pinned notes ahead of the rest', () => {
    const pages = [note('a'), note('b', { pinnedAt: 10 }), note('c'), note('d', { pinnedAt: 30 }), note('e', { pinnedAt: 20, trashed: true })]
    assert.deepEqual(pinnedNotes(pages).map(page => page.id), ['d', 'b'])
    assert.deepEqual(withPinnedFirst(pages).map(page => page.id), ['d', 'b', 'a', 'c', 'e'])
  })

  it('pins and unpins a copy of the note', () => {
    const page = note('a')
    const pinned = setPinned(page, true, 42)
    assert.equal(pinned.pinnedAt, 42)
    assert.equal(page.pinnedAt, undefined)
    assert.equal('pinnedAt' in setPinned(pinned, false), false)
  })
})

describe('pins through a save', () => {
  it('keeps a pin time and drops anything else', () => {
    const base = { id: 'a', title: 'A', content: { time: 1, blocks: [], version: '2.30.6' } }
    assert.equal(validatePageStructure({ ...base, pinnedAt: 42 }).sanitized.pinnedAt, 42)
    assert.equal('pinnedAt' in validatePageStructure({ ...base, pinnedAt: 'soon' }).sanitized, false)
    assert.equal('pinnedAt' in validatePageStructure(base).sanitized, false)
  })
})
