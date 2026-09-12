/**
 * Which notes a list shows (lib/noteLists.js).
 *
 * A note moved to Trash keeps its place in its folder, so Restore puts it
 * back where it was. Until then it belongs only in the Trash modal. Before
 * this, a trashed note in a folder still showed under that folder in the
 * sidebar and in the folder's count, and arrow keys, search, the link pickers
 * and links could all open it.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Imported directly on purpose: a module that fails to load must fail this
// suite, not quietly skip it.
import { folderNoteIds, isInTrash, notesOutsideTrash } from '../lib/noteLists.js'

const readSrc = (file) => readFileSync(resolve(process.cwd(), file), 'utf8')

const note = (id, fields = {}) => ({ id, title: id, content: { blocks: [] }, ...fields })
const folder = (id, pages, fields = {}) => ({ id, title: id, type: 'folder', pages, ...fields })

describe('isInTrash', () => {
  it('is true only when trashed is true', () => {
    assert.equal(isInTrash(note('a', { trashed: true })), true)
    for (const value of [false, undefined, null, 'true', 1]) {
      assert.equal(isInTrash(note('a', { trashed: value })), false, String(value))
    }
    assert.equal(isInTrash(null), false)
  })
})

describe('notesOutsideTrash', () => {
  it('keeps notes in order and leaves out folders and notes in Trash', () => {
    const pages = [note('a'), folder('f', ['b']), note('b', { folderId: 'f', trashed: true }), note('c')]
    assert.deepEqual(notesOutsideTrash(pages).map(p => p.id), ['a', 'c'])
  })

  it('returns the note objects themselves', () => {
    const a = note('a')
    assert.equal(notesOutsideTrash([a])[0], a)
  })

  it('tolerates a missing list and empty entries', () => {
    assert.deepEqual(notesOutsideTrash(undefined), [])
    assert.deepEqual(notesOutsideTrash([null, note('a')]).map(p => p.id), ['a'])
  })
})

describe('folderNoteIds', () => {
  it('leaves a note in Trash out of its folder', () => {
    const pages = [
      folder('f', ['a', 'b', 'c']),
      note('a', { folderId: 'f' }),
      note('b', { folderId: 'f', trashed: true, trashedAt: 1 }),
      note('c', { folderId: 'f' })
    ]
    assert.deepEqual(folderNoteIds(pages, 'f'), ['a', 'c'])
  })

  it('lists the note in its old place again once it is restored', () => {
    const trashed = [
      folder('f', ['a', 'b', 'c']),
      note('a', { folderId: 'f' }),
      note('b', { folderId: 'f', trashed: true, trashedAt: 1 }),
      note('c', { folderId: 'f' })
    ]
    const restored = trashed.map(p => p.id === 'b' ? note('b', { folderId: 'f', restoredAt: 2 }) : p)
    assert.deepEqual(folderNoteIds(restored, 'f'), ['a', 'b', 'c'])
  })

  it("keeps the folder's order, not the order of the page list", () => {
    const pages = [note('c'), note('a'), folder('f', ['a', 'c'])]
    assert.deepEqual(folderNoteIds(pages, 'f'), ['a', 'c'])
  })

  it('skips ids with no note, and ids of folders', () => {
    const pages = [folder('f', ['gone', 'g', 'a']), folder('g', []), note('a')]
    assert.deepEqual(folderNoteIds(pages, 'f'), ['a'])
  })

  it('returns nothing for an unknown folder, a note id, or a folder without a list', () => {
    const pages = [folder('f', ['a']), note('a'), folder('empty', undefined)]
    assert.deepEqual(folderNoteIds(pages, 'missing'), [])
    assert.deepEqual(folderNoteIds(pages, 'a'), [])
    assert.deepEqual(folderNoteIds(pages, 'empty'), [])
    assert.deepEqual(folderNoteIds(undefined, 'f'), [])
  })
})

// The sidebar and the lists that open notes live in components these tests
// can't render, so these checks make sure each one uses the helpers above.
describe('Lists that show or open notes leave out notes in Trash', () => {
  // The source from `anchor` up to the first `end` after it.
  const between = (file, anchor, end) => {
    const code = readSrc(file)
    const start = code.indexOf(anchor)
    assert.ok(start !== -1, `could not find "${anchor}" in ${file} — update this check`)
    const stop = code.indexOf(end, start + anchor.length)
    assert.ok(stop !== -1, `could not find the end of "${anchor}" in ${file} — update this check`)
    return code.slice(start, stop)
  }

  it("a folder's notes, their drag order and the folder's count come from folderNoteIds", () => {
    assert.ok(between('components/RichTextEditor.js', 'const getFolderPageIds = useCallback', '[pages])').includes('folderNoteIds('))
    const folderRow = between('components/RichTextEditor.js', 'const folderPageIds = getFolderPageIds(item.id)', '/>')
    assert.ok(folderRow.includes('folderPageIds={folderPageIds}'), 'the folder must list folderPageIds')
    assert.ok(folderRow.includes('pagesCount={folderPageIds.length}'), "the folder's count must be the length of that list")
  })

  const lists = [
    ['arrow-key navigation', 'useKeyboardNavigation({', '\n  })'],
    ['the [[ link picker', 'usePageLinkInterceptor({', '\n  })'],
    ['the toolbar link picker', 'isOpen={!!toolbarLinkState}', '/>'],
    ['search', '<SearchModal', '/>'],
    ['adding notes to a folder', '<AddPageToFolderModal', '/>']
  ]
  for (const [list, anchor, end] of lists) {
    it(`${list} gets notesOutsideTrash`, () => {
      assert.ok(between('components/RichTextEditor.js', anchor, end).includes('notesOutsideTrash('), `${list} must not offer notes in Trash`)
    })
  }

  it('the [[ link picker filters its own list too', () => {
    assert.ok(between('components/editor-tools/PageLink.js', 'export function usePageLinkInterceptor', 'const filteredPagesRef').includes('notesOutsideTrash('))
  })

  it('a link to a note in Trash offers to restore it instead of opening it', () => {
    const handler = between('components/RichTextEditor.js', 'const handlePageLinkClick = useCallback', '\n  }, [')
    assert.ok(handler.includes('isInTrash('), 'must check whether the linked note is in Trash')
    assert.ok(handler.includes('restorePage('), 'must offer to restore it')
  })
})
