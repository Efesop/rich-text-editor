/**
 * Rebasing a sync pull onto pages that changed while it ran.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { rebasePulledPages } = await import('../lib/syncRebase.js')

const page = (id, fields = {}) => ({ id, title: id, lastEdited: 100, content: { blocks: [] }, ...fields })

describe('rebasePulledPages', () => {
  it('keeps a page added locally during the pull, which writing newPages back would drop', () => {
    const a = page('a')
    const base = [a]
    const pulledA = page('a', { lastEdited: 200, title: 'from peer' })
    const pulled = [pulledA]
    const imported = page('imported')
    const latest = [a, imported]

    // What applyRemoteChanges did before: replace the list with newPages.
    assert.equal(pulled.some(p => p.id === 'imported'), false)

    const { pages } = rebasePulledPages({ base, pulled, changedIds: ['a'], latest })
    assert.deepEqual(pages.map(p => p.id), ['a', 'imported'])
    assert.equal(pages[0], pulledA)
  })

  it('applies the pulled version to a page nobody touched locally', () => {
    const a = page('a')
    const pulledA = page('a', { lastEdited: 200 })
    const { pages, keptLocal } = rebasePulledPages({ base: [a], pulled: [pulledA], changedIds: ['a'], latest: [a] })
    assert.equal(pages[0], pulledA)
    assert.deepEqual(keptLocal, [])
  })

  it('keeps a local edit made during the pull when it is newer', () => {
    const a = page('a')
    const pulledA = page('a', { lastEdited: 200, title: 'peer' })
    const editedA = page('a', { lastEdited: 300, title: 'typed during the pull' })
    const { pages, keptLocal } = rebasePulledPages({ base: [a], pulled: [pulledA], changedIds: ['a'], latest: [editedA] })
    assert.equal(pages[0], editedA)
    assert.deepEqual(keptLocal, ['a'])
  })

  it('takes the pulled version over an older concurrent local change', () => {
    const a = page('a')
    const pulledA = page('a', { lastEdited: 500 })
    const touchedA = page('a', { lastEdited: 150 })
    const { pages } = rebasePulledPages({ base: [a], pulled: [pulledA], changedIds: ['a'], latest: [touchedA] })
    assert.equal(pages[0], pulledA)
  })

  it('leaves pages the pull did not change exactly as they are now', () => {
    const a = page('a')
    const b = page('b')
    const bNow = page('b', { lastEdited: 900 })
    const { pages } = rebasePulledPages({ base: [a, b], pulled: [a, page('b', { lastEdited: 1 })], changedIds: [], latest: [a, bNow] })
    assert.equal(pages[1], bNow)
  })

  it('appends pages the pull created', () => {
    const a = page('a')
    const fresh = page('fresh')
    const { pages } = rebasePulledPages({ base: [a], pulled: [a, fresh], changedIds: ['fresh'], latest: [a] })
    assert.deepEqual(pages.map(p => p.id), ['a', 'fresh'])
  })

  it('does not bring back a page deleted locally during the pull', () => {
    const a = page('a')
    const gone = page('gone')
    const { pages } = rebasePulledPages({ base: [a, gone], pulled: [a, page('gone', { lastEdited: 999 })], changedIds: ['gone'], latest: [a] })
    assert.deepEqual(pages.map(p => p.id), ['a'])
  })

  it('applies a peer delete to a page edited during the pull, keeping the local content', () => {
    const a = page('a')
    const trashed = page('a', { trashed: true, trashedAt: 400, trashedBy: 'phone', lastEdited: 100 })
    const edited = page('a', { lastEdited: 300, content: { blocks: [{ type: 'paragraph', data: { text: 'keep me' } }] } })
    const { pages } = rebasePulledPages({ base: [a], pulled: [trashed], changedIds: ['a'], latest: [edited] })
    assert.equal(pages[0].trashed, true)
    assert.equal(pages[0].trashedBy, 'phone')
    assert.equal(pages[0].content.blocks[0].data.text, 'keep me')
  })

  it('keeps a local trash unless the peer explicitly restored the page', () => {
    const a = page('a')
    const localTrash = page('a', { trashed: true, trashedAt: 400 })
    const staleEdit = page('a', { lastEdited: 900 })
    assert.equal(rebasePulledPages({ base: [a], pulled: [staleEdit], changedIds: ['a'], latest: [localTrash] }).pages[0], localTrash)
    const restored = page('a', { lastEdited: 900, restoredAt: 500 })
    assert.equal(rebasePulledPages({ base: [a], pulled: [restored], changedIds: ['a'], latest: [localTrash] }).pages[0], restored)
  })

  it('keeps pages added to a folder locally while the pull renamed it', () => {
    const folder = { id: 'f', type: 'folder', title: 'Old', pages: ['x'] }
    const pulledFolder = { id: 'f', type: 'folder', title: 'Renamed', pages: ['x'] }
    const localFolder = { id: 'f', type: 'folder', title: 'Old', pages: ['x', 'imported'] }
    const { pages } = rebasePulledPages({ base: [folder], pulled: [pulledFolder], changedIds: ['f'], latest: [localFolder] })
    assert.equal(pages[0].title, 'Renamed')
    assert.deepEqual(pages[0].pages, ['x', 'imported'])
  })

  it('preserves the current order', () => {
    const a = page('a')
    const b = page('b')
    const pulledA = page('a', { lastEdited: 200 })
    const { pages } = rebasePulledPages({ base: [a, b], pulled: [pulledA, b], changedIds: ['a'], latest: [b, a] })
    assert.deepEqual(pages.map(p => p.id), ['b', 'a'])
  })
})
