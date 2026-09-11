/**
 * Importers: Obsidian vaults, Notesnook exports and Markdown folders.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { markdownNotes, parseNotesnookDate } = await import('../lib/import/formats/markdownVault.js')
const { editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

const FILE_TIME = Date.UTC(2024, 5, 1)
function sourceFile (path, content = '') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return { path, name: path.split('/').pop(), size: bytes.length, lastModified: FILE_TIME, container: 'vault.zip', text: async () => new TextDecoder().decode(bytes), bytes: async () => bytes }
}
const ref = (path) => `REF:${path}`
const pageLink = (path, text) => `<a data-page-id="${ref(path)}" class="page-link" href="#">${text}</a>`
const shapes = (note) => note.blocks.map(({ type, data }) => [type, data])

async function readAll (files) {
  let n = 0
  const notes = []
  for await (const note of markdownNotes(files, { newId: () => `b${++n}`, pageRefFor: ref })) notes.push(note)
  for (const note of notes.filter(item => item.blocks)) {
    const storable = note.blocks.filter(block => !block.data.importResource)
    assert.deepEqual(sanitizeEditorContent(editorContent(storable, 1)), editorContent(storable, 1), note.key)
    assert.deepEqual(editorChanges(storable), [], note.key)
  }
  return notes
}

const HOME = `---
tags: [home, "#pinned"]
created: 2023-01-15
status: active
aliases: [Start]
---
# Home

Links: [[Projects/Alpha|Alpha project]], [[Beta]] and [[Missing]].
![[diagram.png]]
![[notes.pdf]]
![[Beta]]
[Relative](Projects/Alpha.md) ![img](attachments/photo%201.jpg) #inline-tag

> [!tip] Remember
> Water the plants
`

describe('markdownNotes', () => {
  it('imports an Obsidian vault, resolving links and embeds the way Obsidian does', async () => {
    const files = [
      sourceFile('Vault/.obsidian/app.json', '{}'),
      sourceFile('Vault/Home.md', HOME),
      sourceFile('Vault/Projects/Alpha.md', 'Back to [[Home]]'),
      sourceFile('Vault/Beta.md', 'Beta text'),
      sourceFile('Vault/Archive/Beta.md', 'Old beta'),
      sourceFile('Vault/attachments/diagram.png', new Uint8Array([1, 2, 3])),
      sourceFile('Vault/attachments/photo 1.jpg', new Uint8Array([4, 5])),
      sourceFile('Vault/Projects/notes.pdf', '%PDF'),
      sourceFile('Vault/Board.canvas', '{}'),
      sourceFile('Vault/.trash/Old.md', 'deleted'),
      sourceFile('Vault/Drawing.excalidraw.md', '---\nexcalidraw-plugin: parsed\n---\n# Drawing'),
      sourceFile('Vault/Broken frontmatter.md', '---\ntitle: a: b: c\n\tbad: [\n---\nBody'),
      sourceFile('Vault/Readme.txt', 'Line one\n  two\n\nPara')
    ]
    const notes = await readAll(files)
    assert.deepEqual(notes.map(note => [note.key, note.skipped ? note.reason : note.failed ? 'failed' : 'note']), [
      ['Vault/Home.md', 'note'],
      ['Vault/Projects/Alpha.md', 'note'],
      ['Vault/Beta.md', 'note'],
      ['Vault/Archive/Beta.md', 'note'],
      ['Vault/Board.canvas', 'canvas'],
      ['Vault/.trash/Old.md', 'in-trash'],
      ['Vault/Drawing.excalidraw.md', 'excalidraw'],
      ['Vault/Broken frontmatter.md', 'note'],
      ['Vault/Readme.txt', 'note']
    ])
    const [home, alpha, beta, oldBeta, , , , broken, readme] = notes

    assert.equal(home.title, 'Home')
    assert.deepEqual(home.tags, ['home', 'pinned', 'inline-tag'])
    assert.equal(home.createdAt, new Date(2023, 0, 15).toISOString())
    assert.equal(home.lastEdited, new Date(2023, 0, 15).getTime())
    assert.deepEqual(shapes(home), [
      ['table', { withHeadings: true, stretched: false, content: [['Property', 'Value'], ['status', 'active'], ['aliases', 'Start']] }],
      ['paragraph', { text: `Links: ${pageLink('Vault/Projects/Alpha.md', 'Alpha project')}, ${pageLink('Vault/Beta.md', 'Beta')} and Missing.` }],
      ['image', { importResource: 'Vault/attachments/diagram.png', caption: '' }],
      ['attachment', { importResource: 'Vault/Projects/notes.pdf', filename: 'notes.pdf' }],
      ['paragraph', { text: `${pageLink('Vault/Beta.md', 'Beta')}<br>${pageLink('Vault/Projects/Alpha.md', 'Relative')}` }],
      ['image', { importResource: 'Vault/attachments/photo 1.jpg', caption: '' }],
      ['paragraph', { text: '#inline-tag' }],
      ['callout', { text: '<b>Remember</b><br>Water the plants', variant: 'tip' }]
    ])
    assert.deepEqual(home.issues, { 'wikilink-unresolved': 1 })
    assert.deepEqual(home.resources.map(r => [r.key, r.name, r.mimeType, r.size, r.file.path]), [
      ['Vault/attachments/diagram.png', 'diagram.png', 'image/png', 3, 'Vault/attachments/diagram.png'],
      ['Vault/Projects/notes.pdf', 'notes.pdf', 'application/pdf', 4, 'Vault/Projects/notes.pdf'],
      ['Vault/attachments/photo 1.jpg', 'photo 1.jpg', 'image/jpeg', 2, 'Vault/attachments/photo 1.jpg']
    ])

    assert.deepEqual([alpha.title, alpha.tags, alpha.lastEdited], ['Alpha', ['Projects'], FILE_TIME])
    assert.deepEqual(shapes(alpha), [['paragraph', { text: `Back to ${pageLink('Vault/Home.md', 'Home')}` }]])
    assert.deepEqual([beta.tags, oldBeta.tags], [[], ['Archive']])

    assert.equal(broken.title, 'a: b: c')
    assert.deepEqual(shapes(broken), [
      ['code', { code: 'title: a: b: c\n\tbad: [', language: 'yaml', encoding: 'raw' }],
      ['paragraph', { text: 'Body' }]
    ])
    assert.deepEqual(broken.issues, { 'frontmatter-unreadable': 1 })

    assert.equal(readme.title, 'Readme')
    assert.deepEqual(shapes(readme), [['paragraph', { text: 'Line one<br>&nbsp; two' }], ['paragraph', { text: 'Para' }]])
  })

  it("reads Notesnook's frontmatter, dates and folders", async () => {
    const plan = `---
title: "Plan: Q3"
created_at: 05-01-2023 03:04 PM
updated_at: 06-01-2023 10:00 AM
pinned: true
tags: work, planning
---

# Plan: Q3

See [Other](../Other.md) ![](../attachments/file.png)`
    const notes = await readAll([
      sourceFile('notesnook/Work/Plan.md', plan),
      sourceFile('notesnook/Other.md', 'Other note'),
      sourceFile('notesnook/attachments/file.png', new Uint8Array([9]))
    ])
    const [planNote, other] = notes
    assert.equal(planNote.title, 'Plan: Q3')
    assert.equal(planNote.createdAt, new Date(2023, 0, 5, 15, 4).toISOString())
    assert.equal(planNote.lastEdited, new Date(2023, 0, 6, 10, 0).getTime())
    assert.deepEqual(planNote.tags, ['Work', 'planning'])
    assert.deepEqual(shapes(planNote), [
      ['table', { withHeadings: true, stretched: false, content: [['Property', 'Value'], ['pinned', 'true']] }],
      ['paragraph', { text: `See ${pageLink('notesnook/Other.md', 'Other')}` }],
      ['image', { importResource: 'notesnook/attachments/file.png', caption: '' }]
    ])
    assert.deepEqual(other.tags, [])
  })
})

describe('parseNotesnookDate', () => {
  it('reads DD-MM-YYYY with a 12-hour time, and refuses impossible dates', () => {
    assert.equal(parseNotesnookDate('31-12-2022 11:59 PM'), new Date(2022, 11, 31, 23, 59).getTime())
    assert.equal(parseNotesnookDate('05-01-2023'), new Date(2023, 0, 5).getTime())
    assert.equal(parseNotesnookDate('31-02-2023 10:00 AM'), null)
    assert.equal(parseNotesnookDate('2023-01-05'), null)
  })
})
