/**
 * Importers: Evernote .enex files.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { enexNotes } = await import('../lib/import/formats/enex.js')
const { editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

const md5 = (bytes) => createHash('md5').update(bytes).digest('hex')
const b64 = (bytes) => Buffer.from(bytes).toString('base64').replace(/(.{16})/g, '$1\n')
const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8, 9])
const pdf = new TextEncoder().encode('%PDF-1.4 tickets')
const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])

const ENEX = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20240101T000000Z" application="Evernote" version="10.0">
<note>
  <title>Rome &amp; Florence</title>
  <created>20230115T093000Z</created>
  <updated>20230116T120000Z</updated>
  <tag>travel</tag><tag>Italy 2023 summer holiday</tag>
  <note-attributes><source-url>https://example.com/rome</source-url><reminder-time>20230201T000000Z</reminder-time><latitude>41.89</latitude></note-attributes>
  <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>Day one <span style="--en-highlight:yellow;">Colosseum</span></div><div><br/></div><div><en-todo checked="true"/>Book tickets</div><en-media hash="${md5(png)}" type="image/png"/><div><en-media hash="${md5(pdf)}" type="application/pdf"/></div><div style="--en-codeblock:true;-en-syntaxLanguage:js;"><div>let a = 1</div><div>let b = a &lt; 2</div></div><en-crypt hint="pin">RU5DMA==</en-crypt><div style="--en-task-group:true;--en-id:G1;"></div><div><a href="evernote:///view/1/s1/abc/abc/">Other note</a></div></en-note>]]></content>
  <resource><data encoding="base64">${b64(png)}</data><mime>image/png</mime><width>1</width><height>1</height><resource-attributes><file-name>colosseum.png</file-name></resource-attributes></resource>
  <resource><data encoding="base64">${b64(pdf)}</data><mime>application/pdf</mime><resource-attributes><file-name>tickets.pdf</file-name></resource-attributes></resource>
  <task><title>Pack bags</title><taskStatus>open</taskStatus><sortWeight>B</sortWeight><taskGroupNoteLevelID>G1</taskGroupNoteLevelID><dueDate>20230120T120000Z</dueDate></task>
  <task><title>Buy guide</title><taskStatus>completed</taskStatus><sortWeight>A</sortWeight><taskGroupNoteLevelID>G1</taskGroupNoteLevelID></task>
  <task><title>Loose task</title><taskStatus>open</taskStatus><sortWeight>A</sortWeight><taskGroupNoteLevelID>G2</taskGroupNoteLevelID></task>
</note>
<note>
  <title></title>
  <created>20220301T080000Z</created>
  <content><![CDATA[<en-note><div>Just text</div><en-media hash="00000000000000000000000000000000" type="image/jpeg"/></en-note>]]></content>
  <resource><data encoding="base64">${b64(jpeg)}</data><mime>image/jpeg</mime></resource>
  <resource><data encoding="base64">!!!notbase64</data><mime>image/png</mime></resource>
</note>
</en-export>`

function enexFile (text, chunkSize = 5) {
  return {
    path: 'Exports/Travel.enex',
    name: 'Travel.enex',
    size: text.length,
    lastModified: Date.UTC(2024, 0, 1),
    container: null,
    async * textChunks () {
      for (let i = 0; i < text.length; i += chunkSize) yield text.slice(i, i + chunkSize)
    }
  }
}

async function readAll (file) {
  let n = 0
  const notes = []
  for await (const note of enexNotes(file, { newId: () => `b${++n}` })) notes.push(note)
  return notes
}

describe('enexNotes', () => {
  it('converts every part of an Evernote note, reading the file in small pieces', async () => {
    const [first, second] = await readAll(enexFile(ENEX))
    const key = 'Exports/Travel.enex#1'
    assert.equal(first.key, key)
    assert.equal(first.title, 'Rome & Florence')
    assert.equal(first.createdAt, '2023-01-15T09:30:00.000Z')
    assert.equal(first.lastEdited, Date.UTC(2023, 0, 16, 12))
    assert.deepEqual(first.tags, ['Travel', 'travel', 'Italy 2023 summer holiday'])
    assert.deepEqual(first.blocks.map(({ type, data }) => [type, data]), [
      ['paragraph', { text: 'Day one <mark class="cdx-marker">Colosseum</mark>' }],
      ['paragraph', { text: '' }],
      ['checklistItem', { text: 'Book tickets', checked: true }],
      ['image', { importResource: `${key}/resource-1`, caption: '' }],
      ['attachment', { importResource: `${key}/resource-2`, filename: 'tickets.pdf' }],
      ['code', { code: 'let a = 1\nlet b = a < 2', language: 'javascript', encoding: 'raw' }],
      ['paragraph', { text: '<i>Encrypted text (hint: pin)</i>' }],
      ['code', { code: 'RU5DMA==', language: 'plaintext', encoding: 'raw' }],
      ['checklistItem', { text: 'Buy guide', checked: true }],
      ['checklistItem', { text: 'Pack bags <i>(due 2023-01-20)</i>', checked: false }],
      ['paragraph', { text: 'Other note' }],
      ['checklistItem', { text: 'Loose task', checked: false }],
      ['paragraph', { text: '<i>Source:</i> <a href="https://example.com/rome" target="_blank" rel="noopener noreferrer">https://example.com/rome</a>' }]
    ])
    assert.deepEqual(first.issues, { 'encrypted-text': 1, 'link-kept-as-text': 1, 'reminder-dropped': 1 })
    assert.deepEqual(first.resources.map(r => [r.key, r.name, r.mimeType, r.size, r.md5]), [
      [`${key}/resource-1`, 'colosseum.png', 'image/png', png.length, md5(png)],
      [`${key}/resource-2`, 'tickets.pdf', 'application/pdf', pdf.length, md5(pdf)]
    ])
    assert.deepEqual(new Uint8Array(await first.resources[0].blob.arrayBuffer()), png)

    const storable = first.blocks.filter(block => !block.data.importResource)
    assert.deepEqual(sanitizeEditorContent(editorContent(storable, 1)), editorContent(storable, 1))
    assert.deepEqual(editorChanges(storable), [])

    assert.equal(second.title, 'Just text')
    assert.equal(second.createdAt, '2022-03-01T08:00:00.000Z')
    assert.equal(second.lastEdited, Date.UTC(2022, 2, 1, 8))
    assert.deepEqual(second.blocks.map(({ type, data }) => [type, data]), [
      ['paragraph', { text: 'Just text' }],
      ['paragraph', { text: '<i>[Attachment missing from the export]</i>' }],
      ['image', { importResource: 'Exports/Travel.enex#2/resource-1', caption: '' }]
    ])
    assert.deepEqual(second.issues, { 'unreadable-attachment': 1, 'missing-attachment': 1, 'unreferenced-attachment': 1 })
  })

  it('gives the same notes however the file is split', async () => {
    const whole = await readAll(enexFile(ENEX, ENEX.length))
    const pieces = await readAll(enexFile(ENEX, 3))
    assert.deepEqual(pieces.map(n => [n.title, n.blocks, n.issues]), whole.map(n => [n.title, n.blocks, n.issues]))
  })

  it('marks a note the file ends inside as truncated', async () => {
    const cut = ENEX.slice(0, ENEX.indexOf('Just text') + 4)
    const notes = await readAll(enexFile(cut, 64))
    assert.equal(notes.length, 2)
    assert.equal(notes[0].issues['truncated-note'], undefined)
    assert.equal(notes[1].issues['truncated-note'], 1)
  })
})
