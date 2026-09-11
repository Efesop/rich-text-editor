/**
 * Importers: reading picked files and zip archives.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

const { openSources, normalizePath, decodeText, DEFAULT_SOURCE_LIMITS } = await import('../lib/import/source.js')

const named = (parts, name, lastModified = 1700000000000) => Object.assign(new Blob(parts), { name, lastModified })

async function zipOf (files, options = {}) {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return new Blob([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', ...options })])
}

async function readAll (file) {
  let text = ''
  for await (const piece of file.textChunks()) text += piece
  return text
}

describe('normalizePath', () => {
  it('uses NFC, forward slashes and no empty, dot or dot-dot segments', () => {
    assert.equal(normalizePath('./Vault\\Cafe' + String.fromCharCode(0x301) + '//notes/../a.md'), 'Vault/Caf' + String.fromCharCode(0xE9) + '/a.md')
    assert.equal(normalizePath('/../x'), 'x')
  })
})

describe('decodeText', () => {
  it('reads UTF-8, and UTF-16 with a byte order mark', () => {
    assert.equal(decodeText(new Uint8Array([0xEF, 0xBB, 0xBF, 0x68, 0x69])), 'hi')
    assert.equal(decodeText(new Uint8Array([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00])), 'hi')
  })
})

describe('openSources', () => {
  it('lists picked files, keeping folder paths', async () => {
    const note = named(['# Hello'], 'note.md')
    const inFolder = Object.assign(named(['text'], 'b.md'), { webkitRelativePath: 'Vault/sub/b.md' })
    const { files, skipped } = await openSources([note, inFolder])
    assert.deepEqual(files.map(f => [f.path, f.name, f.size, f.lastModified, f.container]), [
      ['note.md', 'note.md', 7, 1700000000000, null],
      ['Vault/sub/b.md', 'b.md', 4, 1700000000000, null]
    ])
    assert.equal(await files[0].text(), '# Hello')
    assert.equal(await readAll(files[1]), 'text')
    assert.deepEqual(skipped, [])
  })

  it('reads zip entries in place, with non-ASCII names, and skips system files', async () => {
    const zip = await zipOf({
      'Export/Café note.md': 'é'.repeat(3000),
      'Export/img/a.png': new Uint8Array([1, 2, 3]),
      '__MACOSX/Export/._Café note.md': 'fork',
      'Export/.DS_Store': 'x'
    })
    const { files, close } = await openSources([named([zip], 'export.zip')])
    assert.deepEqual(files.map(f => [f.path, f.container]), [['Export/Café note.md', 'export.zip'], ['Export/img/a.png', 'export.zip']])
    assert.equal(await files[0].text(), 'é'.repeat(3000))
    assert.equal(await readAll(files[0]), 'é'.repeat(3000))
    assert.deepEqual([...await files[1].bytes()], [1, 2, 3])
    assert.equal(files[0].size, 6000)
    assert.equal(decodeText(await files[0].head(5)), 'éé' + String.fromCharCode(0xFFFD), 'the start only, even mid-character')
    const pieces = files[0].textChunks()
    const first = await pieces.next()
    await pieces.return()
    assert.ok(first.value.length > 0, 'a reader can stop early')
    await close()
  })

  it('opens the zips inside a zip that holds only zips, and not otherwise', async () => {
    const part1 = await zipOf({ 'Page one abc.html': '<p>1</p>' })
    const part2 = await zipOf({ 'Sub/Page two def.html': '<p>2</p>' })
    const outer = await zipOf({ 'Export-Part-1.zip': new Uint8Array(await part1.arrayBuffer()), 'Export-Part-2.zip': new Uint8Array(await part2.arrayBuffer()) })
    const multi = await openSources([named([outer], 'notion.zip')])
    assert.deepEqual(multi.files.map(f => f.path), ['Page one abc.html', 'Sub/Page two def.html'])
    assert.equal(await multi.files[1].text(), '<p>2</p>')

    const mixed = await zipOf({ 'note.md': 'hi', 'attachments/project.zip': new Uint8Array(await part1.arrayBuffer()) })
    const vault = await openSources([named([mixed], 'vault.zip')])
    assert.deepEqual(vault.files.map(f => f.path), ['note.md', 'attachments/project.zip'])
  })

  it('reports the same path twice, keeping the first', async () => {
    const one = await zipOf({ 'a.md': 'first' })
    const two = await zipOf({ 'a.md': 'second' })
    const { files, skipped } = await openSources([named([one], 'one.zip'), named([two], 'two.zip')])
    assert.equal(files.length, 1)
    assert.equal(await files[0].text(), 'first')
    assert.deepEqual(skipped, [{ path: 'a.md', container: 'two.zip', reason: 'duplicate-path' }])
  })

  it('refuses zip bombs and archives past the limits', async () => {
    const bomb = await zipOf({ 'zeros.txt': new Uint8Array(2 * 1024 * 1024), 'ok.md': 'fine' })
    const tight = { ...DEFAULT_SOURCE_LIMITS, ratioFloorBytes: 1024, maxRatio: 10 }
    const { files, skipped } = await openSources([named([bomb], 'bomb.zip')], { limits: tight })
    assert.deepEqual(files.map(f => f.path), ['ok.md'])
    assert.deepEqual(skipped, [{ path: 'zeros.txt', container: 'bomb.zip', reason: 'too-large' }])

    await assert.rejects(openSources([named([bomb], 'bomb.zip')], { limits: { ...DEFAULT_SOURCE_LIMITS, maxEntries: 1 } }), { code: 'too-many-files' })
    await assert.rejects(openSources([named([bomb], 'bomb.zip')], { limits: { ...DEFAULT_SOURCE_LIMITS, maxTotalBytes: 1024 } }), { code: 'too-large' })
  })

  it('says when a file only looks like a zip', async () => {
    const broken = named([new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0, 0, 0])], 'broken.zip')
    await assert.rejects(openSources([broken]), { code: 'unreadable-zip' })
  })
})
