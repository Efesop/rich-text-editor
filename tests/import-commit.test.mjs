/**
 * Importers: committing a planned import.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { scanImport, selectNotes } = await import('../lib/import/plan.js')
const { commitImport, sameData } = await import('../lib/import/commit.js')
const { createImportJournal, createImportRegistry, recoverImport } = await import('../lib/import/journal.js')
const { buildImageBlockData } = await import('../lib/imageAttachments.js')

function memoryFiles () {
  const map = new Map()
  return { map, save: async (id, buffer) => { map.set(id, new Uint8Array(buffer)) }, load: async (id) => map.get(id) ?? null, remove: async (id) => { map.delete(id) } }
}

function memoryStorage () {
  const map = new Map()
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }
}

const paragraph = (id, text) => ({ id, type: 'paragraph', data: { text } })
const link = (id, text) => `<a data-page-id="${id}" class="page-link" href="#">${text}</a>`
const uuid = (n) => `00000000-0000-8000-8000-${String(n).padStart(12, '0')}`

async function planFixture () {
  let n = 0
  const plan = await scanImport({
    readNotes: async function * ({ pageRefFor }) {
      yield {
        key: 'A', title: 'Trip', tags: ['travel'], createdAt: '2023-01-01T00:00:00.000Z', lastEdited: Date.UTC(2023, 0, 2),
        blocks: [paragraph('a1', 'Hello'), { id: 'a2', type: 'image', data: { importResource: 'res:beach', caption: 'Beach' } }, { id: 'a3', type: 'attachment', data: { importResource: 'res:plan', filename: 'plan.pdf' } }],
        resources: [{ key: 'res:beach', name: 'beach.jpg', mimeType: 'image/jpeg', size: 10 }, { key: 'res:plan', name: 'plan.pdf', mimeType: 'application/pdf', size: 20 }]
      }
      yield {
        key: 'B', title: 'Links', tags: [], createdAt: '2023-02-01T00:00:00.000Z', lastEdited: Date.UTC(2023, 1, 2),
        blocks: [paragraph('b1', `${link(pageRefFor('A'), 'trip')} ${link(pageRefFor('C'), 'copy')}`), { id: 'b2', type: 'image', data: { importResource: 'res:huge', caption: '' } }],
        resources: [{ key: 'res:huge', name: 'huge.png', mimeType: 'image/png', size: 99 }]
      }
      yield { key: 'C', title: 'Budget', tags: ['money'], blocks: [paragraph('c1', 'Numbers')], resources: [] }
      yield { key: 'D', title: 'Bad', tags: [], blocks: [paragraph('d1', '<script>alert(1)</script>ok')], resources: [] }
      yield { key: 'E', failed: true, title: 'Broken', reason: 'read failed' }
    },
    existingPages: [{ id: 'X', title: 'Budget', content: { blocks: [paragraph('x1', 'Numbers')] } }],
    folderTitle: 'Evernote import',
    newPageId: () => `page-${++n}`,
    yieldToUi: async () => {}
  })
  return { plan, selection: selectNotes(plan) }
}

function fakeDeps (overrides = {}) {
  const events = []
  const storage = memoryFiles()
  const journal = createImportJournal(storage)
  let id = 0
  const deps = {
    events,
    storage,
    journal: {
      read: journal.read,
      write: async (record) => { events.push(['journal', record.state, [...record.createdIds]]); await journal.write(record) },
      clear: async (importId) => { events.push(['journal-clear']); await journal.clear(importId) },
      writePending: journal.writePending
    },
    storeResource: async ({ resource, as }) => {
      events.push(['store', resource.key, as])
      if (resource.key === 'res:huge') throw Object.assign(new Error('too big'), { code: 'too-large' })
      if (as === 'photo') return { kind: 'photo', attachmentId: uuid(1), created: true, data: { attachmentId: uuid(1), mimeType: 'image/jpeg', width: 4, height: 3, filename: resource.name }, notices: ['location-not-removed'] }
      return { kind: 'file', attachmentId: uuid(2), created: true, data: { attachmentId: uuid(2), filename: resource.name, mimeType: resource.mimeType, size: resource.size, preview: '' } }
    },
    mergeAndSave: async (changes) => { events.push(['merge', changes.pages.map(page => page.id), changes.folder.title]); deps.merged = changes },
    discardAttachments: async (ids) => { events.push(['discard', ids]); return { remaining: [] } },
    addTags: (names) => events.push(['tags', names]),
    recordImported: (pairs) => events.push(['registry', pairs.map(([, pageId]) => pageId)]),
    recordHistory: (entry) => events.push(['history', entry.folderTitle, entry.pageIds, entry.counts]),
    format: 'evernote',
    newId: () => `new-${++id}`,
    now: () => Date.UTC(2024, 0, 1),
    ...overrides
  }
  return deps
}

describe('commitImport', () => {
  it('stores files first under the journal, builds checked notes, then merges them in one step', async () => {
    const { plan, selection } = await planFixture()
    const deps = fakeDeps()
    const report = await commitImport(plan, selection, deps)

    assert.deepEqual(deps.events[0], ['journal', 'storing', []], 'the journal is written before any file')
    assert.deepEqual(deps.events.filter(event => event[0] === 'store').map(event => event.slice(1)), [['res:beach', 'photo'], ['res:plan', 'file'], ['res:huge', 'photo']])
    const merge = deps.events.findIndex(event => event[0] === 'merge')
    assert.ok(deps.events.findIndex(event => event[0] === 'journal' && event[1] === 'saving') < merge)
    // Ids are handed out as notes and the links to them are first seen: B links to C before C is read
    assert.deepEqual(deps.events[merge - 1], ['registry', ['page-1', 'page-3']], 'imported notes are remembered before they go in')
    assert.deepEqual(deps.events.slice(merge + 1), [['tags', ['travel']], ['history', 'Evernote import', ['page-1', 'page-3'], { imported: 2, failed: 2 }], ['journal', 'done', [uuid(1), uuid(2)]]])

    const [trip, links] = deps.merged.pages
    assert.equal(deps.merged.folder.title, 'Evernote import')
    assert.deepEqual(deps.merged.folder.pages, ['page-1', 'page-3'])
    assert.deepEqual(trip, {
      id: 'page-1',
      title: 'Trip',
      content: {
        time: Date.UTC(2023, 0, 2),
        version: '2.30.6',
        blocks: [
          paragraph('a1', 'Hello'),
          { id: 'a2', type: 'image', data: buildImageBlockData({ attachmentId: uuid(1), mimeType: 'image/jpeg', width: 4, height: 3, filename: 'beach.jpg', caption: 'Beach' }) },
          { id: 'a3', type: 'attachment', data: { attachmentId: uuid(2), filename: 'plan.pdf', mimeType: 'application/pdf', size: 20, preview: '' } }
        ]
      },
      tags: [],
      tagNames: ['travel'],
      createdAt: '2023-01-01T00:00:00.000Z',
      password: null,
      folderId: 'new-2',
      lastEdited: Date.UTC(2023, 0, 2)
    })
    assert.deepEqual(links.content.blocks, [
      paragraph('b1', `${link('page-1', 'trip')} ${link('X', 'copy')}`),
      paragraph('b2', '<i>[Photo not imported: huge.png, too large to sync]</i>')
    ])

    assert.equal(report.notes.imported, 2)
    assert.deepEqual(report.notes.duplicates.map(item => [item.title, item.kind]), [['Budget', 'in-dash']])
    assert.deepEqual(report.notes.failed.map(item => [item.title, item.reason]), [['Broken', 'read failed'], ['Bad', 'unexpected-content']])
    assert.deepEqual(report.resources, { stored: 2, failed: [{ name: 'huge.png', note: 'Links', reason: 'too-large' }], notices: { 'location-not-removed': ['beach.jpg'] } })
    assert.equal((await deps.journal.read()).state, 'done', 'kept, marked done, for the next launch to clear')
  })

  it('takes back stored files when saving fails, and says so', async () => {
    const { plan, selection } = await planFixture()
    const deps = fakeDeps({ mergeAndSave: async () => { throw new Error('disk full') } })
    await assert.rejects(commitImport(plan, selection, deps), error => error.message === 'disk full' && error.importMergeFailed === true)
    assert.deepEqual(deps.events.slice(-2), [['discard', [uuid(1), uuid(2)]], ['journal-clear']])
    assert.equal(await deps.journal.read(), null)
  })

  it('stops when cancelled while storing, and takes back what it stored', async () => {
    const { plan, selection } = await planFixture()
    const controller = new AbortController()
    const deps = fakeDeps()
    const store = deps.storeResource
    deps.storeResource = async (request) => {
      const result = await store(request)
      controller.abort()
      return result
    }
    deps.signal = controller.signal
    await assert.rejects(commitImport(plan, selection, deps), { name: 'AbortError' })
    assert.ok(!deps.events.some(event => event[0] === 'merge'))
    assert.deepEqual(deps.events.slice(-2), [['discard', [uuid(1)]], ['journal-clear']])
  })

  it('announces each file before writing it, so a stop between journal writes still finds it', async () => {
    const { plan, selection } = await planFixture()
    const deps = fakeDeps()
    const store = deps.storeResource
    const journaled = []
    deps.storeResource = async (request) => {
      const result = await store(request)
      if (result.created) {
        await request.beforeSave(result.attachmentId)
        journaled.push((await deps.journal.read()).createdIds)
      }
      return result
    }
    await commitImport(plan, selection, deps)
    assert.deepEqual(journaled, [[uuid(1)], [uuid(1), uuid(2)]])
  })

  it('takes back only files it created, and keeps the journal until they are gone', async () => {
    const { plan, selection } = await planFixture()
    const deps = fakeDeps({ mergeAndSave: async () => { throw new Error('disk full') } })
    const store = deps.storeResource
    deps.storeResource = async (request) => ({ ...(await store(request)), created: request.as === 'photo' })
    deps.discardAttachments = async (ids) => { deps.events.push(['discard', ids]); return { remaining: ids } }
    await assert.rejects(commitImport(plan, selection, deps), { message: 'disk full' })
    assert.deepEqual(deps.events.filter(event => event[0] === 'discard'), [['discard', [uuid(1)]]], 'the file stored before stays')
    assert.equal(deps.events.some(event => event[0] === 'journal-clear'), false)
    const kept = await deps.journal.read()
    assert.deepEqual([kept.state, kept.createdIds], ['discarding', [uuid(1)]])
  })

  it('keeps the journal when the files can not be removed right now', async () => {
    const { plan, selection } = await planFixture()
    const deps = fakeDeps({ mergeAndSave: async () => { throw new Error('disk full') }, discardAttachments: async () => { throw new Error('saves blocked') } })
    await assert.rejects(commitImport(plan, selection, deps), { message: 'disk full' })
    assert.deepEqual((await deps.journal.read()).createdIds, [uuid(1), uuid(2)])
  })

  it('leaves the files alone when storage has the notes after all', async () => {
    const { plan, selection } = await planFixture()
    const deps = fakeDeps({ mergeAndSave: async () => { throw new Error('read back failed') }, savedPageIds: async () => new Set(['page-1']) })
    await assert.rejects(commitImport(plan, selection, deps), { message: 'read back failed' })
    assert.equal(deps.events.some(event => event[0] === 'discard'), false)
    assert.equal((await deps.journal.read()).state, 'saving')
  })

  it('never fails an import whose notes are in over its bookkeeping', async () => {
    const { plan, selection } = await planFixture()
    const full = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }) }
    const deps = fakeDeps({ addTags: full, recordImported: full, recordHistory: full })
    const report = await commitImport(plan, selection, deps)
    assert.equal(report.notes.imported, 2)
    assert.equal((await deps.journal.read()).state, 'done')
    assert.equal(deps.events.some(event => event[0] === 'discard'), false)
  })
})

describe('recoverImport', () => {
  it('finishes an import whose notes landed, adding it to Recent imports', async () => {
    const journal = createImportJournal(memoryFiles())
    const history = []
    const entry = { folderTitle: 'Evernote import', format: 'evernote', at: 5, counts: { imported: 1, failed: 0 } }
    await journal.write({ importId: 'i1', folderId: 'f1', state: 'saving', pageIds: ['p1'], createdIds: ['a1'], history: entry })
    const result = await recoverImport({ journal, savedPageIds: async () => new Set(['p1']), discardAttachments: async () => { throw new Error('not called') }, recordHistory: item => history.push(item) })
    assert.equal(result.outcome, 'completed')
    assert.deepEqual(history, [{ ...entry, importId: 'i1', folderId: 'f1', pageIds: ['p1'] }])
    assert.equal(await journal.read(), null)
  })

  it('removes the files an import created when its notes did not land, keeping the journal until they are gone', async () => {
    const journal = createImportJournal(memoryFiles())
    await journal.write({ importId: 'i2', state: 'storing', pageIds: ['p2'], createdIds: ['a2', 'a3'] })
    const stuck = await recoverImport({ journal, savedPageIds: async () => new Set(), discardAttachments: async () => ({ remaining: ['a3'] }) })
    assert.equal(stuck.outcome, 'pending')
    const kept = await journal.read()
    assert.deepEqual([kept.state, kept.createdIds], ['discarding', ['a3']])

    const refused = await recoverImport({ journal, savedPageIds: async () => new Set(), discardAttachments: async () => { throw new Error('locked') } })
    assert.equal(refused.outcome, 'pending')
    assert.deepEqual((await journal.read()).createdIds, ['a3'])

    const removed = []
    const done = await recoverImport({ journal, savedPageIds: async () => new Set(), discardAttachments: async (ids) => { removed.push(...ids); return { remaining: [] } } })
    assert.equal(done.outcome, 'rolled-back')
    assert.deepEqual(removed, ['a3'])
    assert.equal(await journal.read(), null)
    assert.equal((await recoverImport({ journal, savedPageIds: async () => new Set(), discardAttachments: async () => ({ remaining: [] }) })).outcome, 'none')
  })

  it('clears a finished import without taking anything back, restoring its Recent imports entry only if missing', async () => {
    const journal = createImportJournal(memoryFiles())
    const registry = createImportRegistry(memoryStorage())
    const entry = { folderTitle: 'Notion import', format: 'notion', at: 7, counts: { imported: 2, failed: 0 } }
    const discard = async () => { throw new Error('a finished import is never taken back') }
    const recordHistory = item => registry.addHistoryIfMissing(item)
    await journal.write({ importId: 'i3', folderId: 'f3', state: 'done', pageIds: ['p3'], createdIds: ['a4'], history: entry })
    assert.equal((await recoverImport({ journal, savedPageIds: async () => new Set(), discardAttachments: discard, recordHistory })).outcome, 'completed')
    assert.deepEqual(registry.history().map(item => item.importId), ['i3'])
    assert.equal(await journal.read(), null)

    registry.updateHistory('i3', { undoneAt: 9 })
    await journal.write({ importId: 'i3', folderId: 'f3', state: 'done', pageIds: ['p3'], createdIds: [], history: entry })
    await recoverImport({ journal, savedPageIds: async () => new Set(['p3']), discardAttachments: discard, recordHistory })
    assert.equal(registry.history()[0].undoneAt, 9, 'an undone import stays undone')
  })
})

describe('import journal', () => {
  it('counts announced files in, ignores another import\'s, and clears both parts', async () => {
    const files = memoryFiles()
    const journal = createImportJournal(files)
    await journal.write({ importId: 'i5', state: 'storing', pageIds: ['p5'], createdIds: ['a1'] })
    await journal.writePending('i5', ['a1', 'a2'])
    assert.deepEqual((await journal.read()).createdIds, ['a1', 'a2'])
    await journal.writePending('other', ['a9'])
    assert.deepEqual((await journal.read()).createdIds, ['a1'])
    await journal.clear('i5')
    assert.equal(files.map.size, 0)
  })
})

describe('import registry', () => {
  it('remembers imported notes and a short history', () => {
    const registry = createImportRegistry(memoryStorage())
    registry.record([['fp1', 'p1'], ['fp2', 'p2']])
    assert.equal(registry.lookup('fp1'), 'p1')
    assert.equal(registry.lookupAll()('fp2'), 'p2')
    for (let i = 0; i < 12; i++) registry.addHistory({ importId: `i${i}`, at: i })
    assert.deepEqual(registry.history().map(item => item.importId), ['i11', 'i10', 'i9', 'i8', 'i7', 'i6', 'i5', 'i4', 'i3', 'i2'])
    registry.updateHistory('i11', { undone: true })
    assert.equal(registry.history()[0].undone, true)
  })

  it('fits the registry and history into the room storage has', () => {
    const limited = (limit) => {
      const map = new Map()
      const size = () => [...map].reduce((sum, [key, value]) => sum + key.length + value.length, 0)
      return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        removeItem: key => map.delete(key),
        setItem: (key, value) => {
          const previous = map.get(key)
          map.set(key, String(value))
          if (size() > limit) {
            if (previous === undefined) map.delete(key)
            else map.set(key, previous)
            throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
          }
        }
      }
    }
    const registry = createImportRegistry(limited(20000))
    assert.equal(registry.record(Array.from({ length: 1000 }, (_, i) => [`fingerprint-${String(i).padStart(4, '0')}`, `page-${i}`])), true)
    assert.equal(registry.lookup('fingerprint-0999'), 'page-999', 'the newest are kept')
    assert.equal(registry.lookup('fingerprint-0000'), null, 'the oldest were let go to fit')

    const history = createImportRegistry(limited(20000))
    const pageIds = Array.from({ length: 300 }, (_, i) => uuid(i))
    assert.equal(history.addHistory({ importId: 'old', pageIds }), true)
    assert.equal(history.addHistory({ importId: 'new', pageIds }), true)
    const [latest, earlier] = history.history()
    assert.deepEqual([latest.importId, latest.pageIds.length, earlier.importId, earlier.pageIds], ['new', 300, 'old', undefined])
  })
})

describe('sameData', () => {
  it('ignores key order and undefined fields', () => {
    assert.equal(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1, d: undefined }), true)
    assert.equal(sameData({ a: 1 }, { a: '1' }), false)
  })
})
