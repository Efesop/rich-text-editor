/**
 * Importers: planning an import before anything is written.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { scanImport, selectNotes, finalizePageLinks, summarizeSelection, uniqueFolderTitle } = await import('../lib/import/plan.js')

const paragraph = (text) => ({ id: `p-${text.length}`, type: 'paragraph', data: { text } })
const link = (id, text) => `<a data-page-id="${id}" class="page-link" href="#">${text}</a>`

function adapterItems (pageRefFor) {
  return [
    { key: 'A', title: 'Alpha', tags: ['work'], blocks: [paragraph('Alpha body')], resources: [], issues: { 'remote-photo': 1 } },
    { key: 'B', title: 'Budget', tags: ['money'], blocks: [paragraph('Numbers')], resources: [], issues: {} },
    { key: 'C', title: 'Alpha', tags: ['Work', 'copy'], blocks: [paragraph('Alpha body')], resources: [], issues: {} },
    { key: 'D', title: 'Budget', tags: [], blocks: [paragraph('Numbers'), { id: 'x', type: 'image', data: { importResource: 'res:1', caption: '' } }], resources: [{ key: 'res:1', name: 'chart.png', mimeType: 'image/png', size: 2048 }], issues: {} },
    { key: 'E', failed: true, title: 'Broken', reason: 'read failed', source: { path: 'Travel.enex' } },
    { key: 'F', skipped: true, title: 'Old', reason: 'in-trash' },
    { key: 'G', title: 'Links', tags: [], blocks: [paragraph(`${link(pageRefFor('A'), 'to A')} ${link(pageRefFor('E'), 'to E')} ${link(pageRefFor('B'), 'to <b>B</b>')} ${link(pageRefFor('C'), 'to C')} ${link('existing-page', 'kept')}`)], resources: [], issues: {} },
    { key: 'H', title: 'Receipt', tags: [], blocks: [paragraph('Lunch')], resources: [{ key: 'res:2', name: 'big.pdf', mimeType: 'application/pdf', size: 20 * 1024 * 1024 }], issues: {} }
  ]
}

const EXISTING = [
  { id: 'folder-1', type: 'folder', title: 'Evernote import', pages: [] },
  { id: 'X', title: 'Budget', content: { blocks: [paragraph('Numbers')] } },
  { id: 'Y', title: 'Alpha', trashed: true, content: { blocks: [paragraph('Alpha body')] } },
  { id: 'Z', title: 'Receipt', password: 'hash', content: null }
]

async function plan (extra = {}) {
  let n = 0
  const progress = []
  const result = await scanImport({
    readNotes: async function * ({ pageRefFor }) { yield * adapterItems(pageRefFor) },
    existingPages: EXISTING,
    existingTags: [{ name: 'Work' }],
    sourceFiles: [{ path: 'A' }, { path: 'res:1' }, { path: 'Travel.enex' }, { path: 'stray.pdf', container: 'x.zip' }, { path: 'Vault/.obsidian/app.json' }],
    folderTitle: 'Evernote import',
    newPageId: () => `id-${++n}`,
    yieldToUi: async () => {},
    onProgress: p => progress.push(p.found),
    ...extra
  })
  return { result, progress }
}

describe('scanImport', () => {
  it('reads every note, and finds duplicates in Dash and within the import', async () => {
    const { result, progress } = await plan()
    assert.deepEqual(result.notes.map(note => [note.key, note.duplicate?.kind ?? null]), [
      ['A', null], ['B', 'in-dash'], ['C', 'in-import'], ['D', null], ['G', null], ['H', null]
    ])
    assert.equal(result.notes.find(note => note.key === 'B').duplicate.pageId, 'X')
    assert.deepEqual(result.failed.map(item => item.key), ['E'])
    assert.deepEqual(result.skipped.map(item => item.key), ['F'])
    assert.deepEqual(result.unusedFiles, [{ path: 'stray.pdf', container: 'x.zip', reason: 'not-used' }])
    assert.equal(result.folderTitle, 'Evernote import (2)')
    assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7, 8])
    const ids = result.notes.map(note => note.id)
    assert.equal(new Set(ids).size, ids.length, 'every note has its own id')
  })

  it('knows notes an earlier import made', async () => {
    const first = await plan()
    const fingerprint = first.result.notes.find(note => note.key === 'H').importFingerprint
    const again = await plan({ importedBefore: value => (value === fingerprint ? 'X' : null) })
    assert.deepEqual(again.result.notes.find(note => note.key === 'H').duplicate, { kind: 'imported-before', pageId: 'X' })
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(plan({ signal: controller.signal }), { name: 'AbortError' })
  })
})

describe('selectNotes and finalizePageLinks', () => {
  it('skips duplicates, merges their tags, and repoints or removes links to notes left out', async () => {
    const { result } = await plan()
    const selection = selectNotes(result)
    assert.deepEqual(selection.importing.map(note => note.key), ['A', 'D', 'G', 'H'])
    assert.deepEqual(selection.duplicates.map(note => note.key), ['B', 'C'])
    const alpha = result.notes.find(note => note.key === 'A')
    assert.deepEqual(selection.tagNamesFor(alpha), ['Work', 'copy'], 'a copy found twice keeps both copies’ tags, matched to the existing Work')
    assert.deepEqual(selection.tags.added, ['copy'])

    const links = result.notes.find(note => note.key === 'G')
    const [block] = finalizePageLinks(links.blocks, { assignedIds: result.assignedIds, importedIds: selection.importedIds, retarget: selection.retarget })
    const idOf = key => result.notes.find(note => note.key === key)?.id
    assert.equal(block.data.text, `${link(idOf('A'), 'to A')} to E ${link('X', 'to <b>B</b>')} ${link(idOf('A'), 'to C')} ${link('existing-page', 'kept')}`)
  })

  it('imports duplicates too when asked, keeping links to them', async () => {
    const { result } = await plan()
    const selection = selectNotes(result, { skipDuplicates: false })
    assert.equal(selection.importing.length, 6)
    const links = result.notes.find(note => note.key === 'G')
    const [block] = finalizePageLinks(links.blocks, { assignedIds: result.assignedIds, importedIds: selection.importedIds, retarget: selection.retarget })
    assert.match(block.data.text, new RegExp(`data-page-id="${result.notes.find(note => note.key === 'B').id}"`))
  })
})

describe('summarizeSelection', () => {
  it('counts what the preview shows, including what photos and files mean for sync', async () => {
    const { result } = await plan()
    const summary = summarizeSelection(result, selectNotes(result), { syncEnabled: true, usedBytes: 0, quotaBytes: 1024 * 1024 })
    assert.deepEqual(summary.counts, { found: 8, importing: 4, duplicates: 2, skipped: 1, failed: 1, unusedFiles: 1, photos: 1, files: 1 })
    assert.deepEqual(summary.skippedReasons, { 'in-trash': 1, 'not-used': 1, 'in-dash': 1, 'in-import': 1 })
    assert.deepEqual(summary.issues, { 'remote-photo': { count: 1, notes: ['Alpha'] } })
    assert.deepEqual(summary.storage.tooLargeFiles, [{ name: 'big.pdf', size: 20 * 1024 * 1024 }])
    assert.equal(summary.storage.syncBytes, 2048)
    assert.equal(summary.storage.waitingForRoom, 0)
    assert.equal(summary.storage.syncMinutes, 1)
    assert.deepEqual(summary.samples[0], { title: 'Alpha', snippet: 'Alpha body', tagNames: ['Work', 'copy'] })
  })
})

describe('uniqueFolderTitle', () => {
  it('keeps folder titles unique and within 30 characters', () => {
    const pages = [{ type: 'folder', title: 'A very long import folder name' }, { type: 'folder', title: 'Notes' }]
    assert.equal(uniqueFolderTitle('Notes', pages), 'Notes (2)')
    assert.equal(uniqueFolderTitle('A really long title for this import', pages), 'A really long title for this', 'cut at a word')
    assert.equal(uniqueFolderTitle('A very long import folder name!', pages), 'A very long import folder', 'cutting at a word avoids the taken title')
    assert.equal(uniqueFolderTitle('A very long import folder name', pages), 'A very long import folder (2)', 'a taken title gets a number')
  })
})
