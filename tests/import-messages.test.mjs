/**
 * Importers: the words people read in the preview and the report.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const { issueMessage, skipMessage, noticeMessage, formatBytes, formatMinutes, reportText, failureMessage } = await import('../lib/import/messages.js')

describe('import messages', () => {
  it('has words for every finding the converters report', () => {
    const folder = new URL('../lib/import/', import.meta.url)
    const sources = ['htmlToBlocks.js', 'markdownToBlocks.js', 'blocks.js', 'formats/enex.js', 'formats/notion.js', 'formats/markdownVault.js', 'formats/standardNotes.js', 'formats/lexical.js']
      .map(file => readFileSync(new URL(file, folder), 'utf8'))
      .join('\n')
    const codes = new Set([...sources.matchAll(/report\('([a-z-]+)'/g)].map(match => match[1]))
    assert.ok(codes.size >= 20, `found ${codes.size} codes`)
    for (const code of codes) assert.ok(!issueMessage(code, 2).includes(`(${code})`), `${code} needs words`)
    assert.ok(readdirSync(folder).includes('messages.js'))
  })

  it('counts in singular and plural', () => {
    assert.equal(issueMessage('remote-photo', 1), "1 photo is on the web, kept as a link (Dash doesn't load images from the web)")
    assert.equal(issueMessage('remote-photo', 1200), "1,200 photos are on the web, kept as links (Dash doesn't load images from the web)")
    assert.equal(skipMessage('in-dash', 3), '3 notes are already in Dash')
    assert.equal(noticeMessage('photo-resized', 1), '1 photo was made smaller to fit the 10 MB limit')
    assert.match(issueMessage('something-new', 2), /something-new/)
  })

  it('writes sizes and durations briefly', () => {
    assert.equal(formatBytes(512), '512 B')
    assert.equal(formatBytes(1536), '1.5 KB')
    assert.equal(formatBytes(120 * 1024 * 1024), '120 MB')
    assert.equal(formatMinutes(0), 'under a minute')
    assert.equal(formatMinutes(45), 'about 45 minutes')
    assert.equal(formatMinutes(300), 'about 5 hours')
    assert.equal(formatMinutes(60 * 72), 'about 3 days')
  })

  it('writes a report people can copy', () => {
    const text = reportText({
      folderTitle: 'Evernote import',
      notes: {
        imported: 2,
        skipped: [{ title: 'Old', reason: 'in-trash' }],
        duplicates: [{ title: 'Budget', kind: 'in-dash' }],
        failed: [{ title: 'Broken', reason: 'read failed' }, { title: 'Odd', reason: 'unexpected-content' }]
      },
      resources: { stored: 3, failed: [{ name: 'huge.png', note: 'Trip', reason: 'too-large' }], notices: { 'heic-converted': ['a.heic', 'b.heic'] } },
      unusedFiles: [{ path: 'stray.pdf' }]
    })
    assert.equal(text, [
      'Imported 2 notes into "Evernote import".',
      "Left out: 1 note was in the other app's trash.",
      'Left out: 1 note is already in Dash.',
      "Left out: 1 file isn't used by any note.",
      'Not imported: "Broken" read failed.',
      `Not imported: "Odd" ${failureMessage('unexpected-content')}.`,
      'Photos and files stored: 3.',
      'Not imported: huge.png in "Trip", too large to sync.',
      '2 HEIC photos converted to JPEG: a.heic, b.heic.'
    ].join('\n'))
  })
})
