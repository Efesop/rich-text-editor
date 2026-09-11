/**
 * Importers: Standard Notes decrypted backups.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { standardNotesNotes, parseBackup } = await import('../lib/import/formats/standardNotes.js')
const { editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

const at = (day) => `2023-01-${String(day).padStart(2, '0')}T10:00:00.000Z`
const note = (uuid, content, extra = {}) => ({ uuid, content_type: 'Note', created_at: at(1), updated_at: at(2), content: { references: [], appData: {}, ...content }, ...extra })
const superText = (children) => JSON.stringify({ root: { type: 'root', children } })
const text = (value, format = 0) => ({ type: 'text', text: value, format })

const BACKUP = {
  version: '004',
  items: [
    { uuid: 'key', content_type: 'SN|ItemsKey', content: { itemsKey: 'x' } },
    { uuid: 't1', content_type: 'Tag', created_at: at(1), updated_at: at(1), content: { title: 'Work', references: [{ uuid: 'n1', content_type: 'Note' }, { uuid: 'n2', content_type: 'Note' }] } },
    { uuid: 't2', content_type: 'Tag', created_at: at(1), updated_at: at(1), content: { title: 'Projects', references: [{ uuid: 't1', content_type: 'Tag', reference_type: 'TagToParentTag' }, { uuid: 'n2', content_type: 'Note' }] } },
    note('n1', { title: 'Plain', text: 'First line\n  indented\n\n\nSecond paragraph', noteType: 'plain-text', appData: { 'org.standardnotes.sn': { client_updated_at: at(9) } } }),
    note('n2', { title: 'Markdown', text: '- [ ] task\n- [x] **done**', noteType: 'markdown', references: [{ uuid: 'n1', content_type: 'Note', reference_type: 'NoteToNote' }] }),
    note('n3', { title: 'Rich', text: '<p>Hello <b>there</b></p>', editorIdentifier: 'org.standardnotes.plus-editor' }),
    note('n4', { title: 'Code', text: 'const a = 1', noteType: 'code' }),
    note('n5', { title: 'Super', text: superText([{ type: 'paragraph', children: [text('See '), { type: 'snbubble', itemUuid: 'n1' }] }, { type: 'snfile', fileUuid: 'f1' }]), noteType: 'super' }),
    note('n6', { title: '2FA', text: '[{"service":"bank","secret":"ABC"}]', noteType: 'authentication' }),
    note('n7', { title: 'Old', text: 'binned', trashed: true }),
    note('n8', { title: 'Legacy markdown', text: '# Heading', editorIdentifier: 'org.standardnotes.advanced-markdown-editor' }),
    note('n9', { title: '', text: superText([{ type: 'paragraph', children: [text('Untyped super', 1)] }]) }),
    note('n10', { title: 'Deleted' }, { deleted: true }),
    { uuid: 'f1', content_type: 'File', content: { name: 'scan.pdf', references: [] } },
    { uuid: 'f2', content_type: 'File', content: { name: 'receipt.jpg', references: [{ uuid: 'n4', content_type: 'Note', reference_type: 'FileToNote' }] } },
    { uuid: 'c1', content_type: 'SN|Component', content: { name: 'Editor' } }
  ]
}

const backupFile = (backup) => {
  const json = JSON.stringify(backup)
  return { path: 'Standard Notes Backup and Import File.txt', name: 'Standard Notes Backup and Import File.txt', size: json.length, lastModified: Date.UTC(2024, 0, 1), container: 'backup.zip', text: async () => json }
}

async function readAll (options = {}) {
  let n = 0
  const notes = []
  for await (const item of standardNotesNotes(backupFile(BACKUP), { newId: () => `b${++n}`, pageRefFor: uuid => `P:${uuid}`, ...options })) notes.push(item)
  return notes
}

const shapes = (note) => note.blocks.map(({ type, data }) => [type, data])

describe('standardNotesNotes', () => {
  it('converts each note type, with nested tags and dates', async () => {
    const notes = await readAll()
    const byKey = Object.fromEntries(notes.map(item => [item.key, item]))
    assert.deepEqual(notes.map(item => item.key), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'])

    assert.deepEqual(shapes(byKey.n1), [
      ['paragraph', { text: 'First line<br>&nbsp; indented' }],
      ['paragraph', { text: 'Second paragraph' }]
    ])
    assert.equal(byKey.n1.createdAt, at(1))
    assert.equal(byKey.n1.lastEdited, Date.parse(at(9)), 'the edit time the person saw')
    assert.deepEqual(byKey.n1.tags, ['Work'])

    assert.deepEqual(shapes(byKey.n2), [
      ['checklistItem', { text: 'task', checked: false }],
      ['checklistItem', { text: '<b>done</b>', checked: true }],
      ['paragraph', { text: '<i>Linked notes:</i> <a data-page-id="P:n1" class="page-link" href="#">Plain</a>' }]
    ])
    assert.deepEqual(byKey.n2.tags, ['Work', 'Work/Projects'])
    assert.equal(byKey.n2.lastEdited, Date.parse(at(2)))

    assert.deepEqual(shapes(byKey.n3), [['paragraph', { text: 'Hello <b>there</b>' }]])
    assert.deepEqual(shapes(byKey.n4), [
      ['code', { code: 'const a = 1', language: 'auto', encoding: 'raw' }],
      ['paragraph', { text: '<i>[File not included in the backup: receipt.jpg]</i>' }]
    ])
    assert.deepEqual(shapes(byKey.n5), [
      ['paragraph', { text: 'See <a data-page-id="P:n1" class="page-link" href="#">Plain</a>' }],
      ['paragraph', { text: '<i>[File not included in the backup: scan.pdf]</i>' }]
    ])
    assert.deepEqual(byKey.n5.issues, { 'file-not-in-backup': 1 })
    assert.deepEqual(shapes(byKey.n8), [['header', { text: 'Heading', level: 2 }]])
    assert.equal(byKey.n9.title, 'Untyped super')
    assert.deepEqual(shapes(byKey.n9), [['paragraph', { text: '<b>Untyped super</b>' }]])

    assert.deepEqual([byKey.n6.skipped, byKey.n6.reason], [true, 'authenticator'])
    assert.deepEqual([byKey.n7.skipped, byKey.n7.reason], [true, 'in-trash'])

    for (const item of notes.filter(entry => entry.blocks)) {
      assert.deepEqual(sanitizeEditorContent(editorContent(item.blocks, 1)), editorContent(item.blocks, 1))
      assert.deepEqual(editorChanges(item.blocks), [])
    }
  })

  it('imports authenticator notes only when asked, and says what they hold', async () => {
    const notes = await readAll({ includeAuthenticator: true })
    const secrets = notes.find(item => item.key === 'n6')
    assert.deepEqual(shapes(secrets), [['code', { code: '[{"service":"bank","secret":"ABC"}]', language: 'json', encoding: 'raw' }]])
    assert.deepEqual(secrets.issues, { 'authenticator-secrets': 1 })
  })
})

describe('parseBackup', () => {
  it('refuses encrypted backups and files that are not backups', () => {
    const encrypted = JSON.stringify({ version: '004', keyParams: { identifier: 'a' }, items: [{ uuid: 'n', content_type: 'Note', content: '004:abc:def' }] })
    assert.throws(() => parseBackup(encrypted), { code: 'encrypted-backup' })
    assert.throws(() => parseBackup('{"hello":1}'), { code: 'not-a-backup' })
    assert.throws(() => parseBackup('not json'), { code: 'not-a-backup' })
  })
})
