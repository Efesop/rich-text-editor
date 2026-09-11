/**
 * Importers: recognising exports, and wrong ones.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { detectExport, detectionMessage, DETECTION_MESSAGES } = await import('../lib/import/detect.js')

const file = (path, content = '') => {
  const bytes = new TextEncoder().encode(content)
  return { path, name: path.split('/').pop(), size: bytes.length, lastModified: 0, container: null, head: async (n) => bytes.slice(0, n) }
}
const ID = '0123456789abcdef0123456789abcdef'

describe('detectExport', () => {
  it('recognises each supported export', async () => {
    assert.equal((await detectExport([file('My Notes.enex', '<?xml version="1.0"?><en-export>')])).format, 'evernote')

    const notion = await detectExport([file(`Export-1/Page ${ID}.html`, `<html><head><style>${'x'.repeat(40000)}</style></head><body><article id="a" class="page sans">`), file(`Export-1/Page ${ID}/a.png`)])
    assert.deepEqual([notion.format, notion.noteFiles], ['notion', 1])

    const vault = await detectExport([file('Vault/.obsidian/app.json', '{}'), file('Vault/Note.md', '# Hi'), file('Vault/img.png')])
    assert.deepEqual([vault.format, vault.flavour, vault.noteFiles], ['markdown', 'obsidian', 1])

    const notesnook = await detectExport([file('Work/Plan.md', '---\ntitle: "Plan"\ncreated_at: 05-01-2023 03:04 PM\n---\n')])
    assert.deepEqual([notesnook.format, notesnook.flavour], ['markdown', 'markdown'])

    const backup = file('Standard Notes Backup and Import File.txt', '{"version":"004","items":[{"uuid":"a","content_type":"Note","content":{"title":"x"}}]}')
    const sn = await detectExport([backup, file('Items/Note/x-a.txt', 'x')])
    assert.deepEqual([sn.format, sn.backupFile], ['standard-notes', backup])
  })

  it('recognises exports that need to be made again, and says how', async () => {
    const cases = [
      [[file(`Page ${ID}.md`, '# Page'), file(`Table ${ID}.csv`, 'a,b')], 'notion-markdown'],
      [[file('Standard Notes Encrypted Backup and Import File.txt', '{"version":"004","keyParams":{},"items":[{"uuid":"a","content_type":"Note","content":"004:abc"}]}')], 'standard-notes-encrypted'],
      [[file('notesnook-backup.nnbackup', '{}')], 'notesnook-backup'],
      [[file('Note.html', '<html><head><meta name="exporter-version" content="Evernote Mac 7.14"/></head>')], 'evernote-html'],
      [[file('Notes.bear2bk')], 'unsupported-app'],
      [[file('photo.png'), file('sheet.xlsx')], 'nothing-found']
    ]
    for (const [files, problem] of cases) {
      const detection = await detectExport(files)
      assert.deepEqual([detection.format, detection.problem], [null, problem], problem)
      assert.equal(detectionMessage('notion', detection), DETECTION_MESSAGES[problem])
    }
  })
})

describe('detectionMessage', () => {
  it('says nothing when the files match, and names the right app when they do not', () => {
    assert.equal(detectionMessage('evernote', { format: 'evernote', problem: null }), null)
    assert.equal(detectionMessage('notesnook', { format: 'markdown', problem: null }), null)
    assert.match(detectionMessage('evernote', { format: 'notion', problem: null }), /look like a Notion export, not Evernote/)
  })
})
