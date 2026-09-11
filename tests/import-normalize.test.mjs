/**
 * Importers: titles, dates, tags and duplicate fingerprints.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { cleanTitle, cutText, titleFromFilename, MAX_TITLE_LENGTH } = await import('../lib/import/titles.js')
const { parseEnexDate, parseIsoDate, parseEpoch, parseNotionDate, parseAnyDate, noteDates } = await import('../lib/import/dates.js')
const { dashTagName, planTags, cleanTagText, MAX_TAG_LENGTH } = await import('../lib/import/tags.js')
const { noteFingerprint, noteBodyText, noteHasFiles } = await import('../lib/import/fingerprint.js')

const ch = (code) => String.fromCodePoint(code)

describe('cleanTitle', () => {
  it('keeps an ordinary title and normalizes it to NFC', () => {
    assert.equal(cleanTitle('Caf' + 'e' + ch(0x301) + ' menu'), 'Caf' + ch(0xE9) + ' menu')
  })

  it('removes invisible and direction-changing characters, and turns line breaks into spaces', () => {
    assert.equal(cleanTitle('in' + ch(0x202E) + 'voice' + ch(0x200B) + '\n\tQ3 ' + ch(0xFEFF)), 'invoice Q3')
  })

  it('keeps the joiner that emoji sequences need', () => {
    const family = ch(0x1F468) + ch(0x200D) + ch(0x1F469) + ch(0x200D) + ch(0x1F467)
    assert.equal(cleanTitle(family + ' photos'), family + ' photos')
  })

  it('falls back to the first line of text, then to Untitled', () => {
    assert.equal(cleanTitle('   ', { fallbackText: '\n\n  First real line  \nSecond' }), 'First real line')
    assert.equal(cleanTitle(''), 'Untitled')
    assert.equal(cleanTitle(null, { fallback: 'Imported note' }), 'Imported note')
  })

  it('cuts long titles at 200 code units without splitting an emoji', () => {
    const long = 'a'.repeat(199) + ch(0x1F600) + 'tail'
    const title = cleanTitle(long)
    assert.ok(title.length <= MAX_TITLE_LENGTH)
    assert.equal(title, 'a'.repeat(199))
    assert.equal(cutText('abc', 10), 'abc')
  })

  it('makes a title from a file name, dropping folders, the extension and a Notion id', () => {
    assert.equal(titleFromFilename('Vault/Projects/Trip plan.md'), 'Trip plan')
    assert.equal(titleFromFilename('Export/Meeting notes 1f2e3d4c5b6a79880a1b2c3d4e5f6a7b.html'), 'Meeting notes')
    assert.equal(titleFromFilename('C:\\notes\\draft.txt'), 'draft')
    assert.equal(titleFromFilename('v1.2 release'), 'v1.2 release')
  })
})

describe('dates', () => {
  it('reads Evernote dates as UTC and refuses impossible ones', () => {
    assert.equal(parseEnexDate('20230115T093000Z'), Date.UTC(2023, 0, 15, 9, 30, 0))
    assert.equal(parseEnexDate('20230230T000000Z'), null)
    assert.equal(parseEnexDate('2023-01-15'), null)
  })

  it('reads ISO dates with and without a time or zone', () => {
    assert.equal(parseIsoDate('2023-01-15T09:30:00Z'), Date.UTC(2023, 0, 15, 9, 30, 0))
    assert.equal(parseIsoDate('2023-01-15T09:30:00+0200'), Date.UTC(2023, 0, 15, 7, 30, 0))
    assert.equal(parseIsoDate('2023-01-15'), new Date(2023, 0, 15).getTime())
    assert.equal(parseIsoDate('2023-02-31'), null)
    assert.equal(parseIsoDate('yesterday'), null)
  })

  it('reads seconds and milliseconds since 1970', () => {
    assert.equal(parseEpoch(1673775000), 1673775000000)
    assert.equal(parseEpoch('1673775000123'), 1673775000123)
    assert.equal(parseEpoch('12'), null)
  })

  it("reads Notion's written dates as local time", () => {
    assert.equal(parseNotionDate('January 5, 2023 3:04 PM'), new Date(2023, 0, 5, 15, 4).getTime())
    assert.equal(parseNotionDate('Jan 5, 2023'), new Date(2023, 0, 5).getTime())
    assert.equal(parseNotionDate('December 31, 2022 12:00 AM (GMT+1)'), new Date(2022, 11, 31, 0, 0).getTime())
    assert.equal(parseNotionDate('Smarch 5, 2023'), null)
    assert.equal(parseNotionDate('January 5, 2023 13:00 PM'), null)
  })

  it('treats dates before 1971 or far in the future as missing', () => {
    assert.equal(parseAnyDate('19600101T000000Z'), null)
    assert.equal(parseAnyDate(String(Date.now() + 30 * 24 * 60 * 60 * 1000)), null)
    assert.equal(parseAnyDate('20230115T093000Z'), Date.UTC(2023, 0, 15, 9, 30, 0))
  })

  it('falls back from updated to created, then to the file time, never to now', () => {
    const created = Date.UTC(2020, 0, 1)
    const updated = Date.UTC(2021, 0, 1)
    const fileTime = Date.UTC(2022, 0, 1)
    assert.deepEqual(noteDates({ created, updated }), { createdAt: new Date(created).toISOString(), lastEdited: updated })
    assert.deepEqual(noteDates({ created }), { createdAt: new Date(created).toISOString(), lastEdited: created })
    assert.deepEqual(noteDates({ updated }), { createdAt: new Date(updated).toISOString(), lastEdited: updated })
    assert.deepEqual(noteDates({ fileTime }), { createdAt: new Date(fileTime).toISOString(), lastEdited: fileTime })
    assert.deepEqual(noteDates({}), { createdAt: null, lastEdited: null })
  })
})

describe('tags', () => {
  it('keeps a tag that fits, without its leading #', () => {
    assert.equal(dashTagName('#work'), 'work')
    assert.equal(dashTagName('  Recipes '), 'Recipes')
    assert.equal(cleanTagText('##  a  b '), 'a b')
    assert.equal(dashTagName('   '), null)
  })

  it('shortens a long tag to 15 characters with a hash of the whole name', () => {
    const name = dashTagName('Project planning 2024')
    assert.equal(name.length, MAX_TAG_LENGTH)
    assert.match(name, /^Project pl~[0-9a-z]{4}$/)
    assert.equal(dashTagName('Project planning 2024'), name, 'the same tag always gets the same name')
    assert.notEqual(dashTagName('Project planning 2025'), name, 'a different long tag gets a different name')
  })

  it('plans which names are new, which merge into existing tags, and which were shortened', () => {
    const plan = planTags(['work', '#work', 'Travel/Japan/Kyoto trip', 'ideas'], ['work', 'personal'])
    assert.equal(plan.names.get('work'), 'work')
    assert.equal(plan.names.get('#work'), 'work')
    const long = plan.names.get('Travel/Japan/Kyoto trip')
    assert.equal(long.length, MAX_TAG_LENGTH)
    assert.deepEqual(plan.added, [long, 'ideas'])
    assert.deepEqual(plan.shortened, [{ from: 'Travel/Japan/Kyoto trip', to: long }])
  })

  it('matches tags case-insensitively, keeping the spelling Dash already has', () => {
    const plan = planTags(['work', 'WORK', 'Travel', 'travel'], ['Work'])
    assert.equal(plan.names.get('work'), 'Work')
    assert.equal(plan.names.get('WORK'), 'Work')
    assert.equal(plan.names.get('travel'), 'Travel')
    assert.deepEqual(plan.added, ['Travel'])
    assert.deepEqual(plan.shortened, [])
  })

  it('never lets a shortened tag merge into an existing tag that only starts the same way', () => {
    const plan = planTags(['Project planning 2024'], ['Project planni', 'Project pl'])
    const name = plan.names.get('Project planning 2024')
    assert.notEqual(name, 'Project planni')
    assert.notEqual(name, 'Project pl')
    assert.deepEqual(plan.added, [name])
  })
})

describe('fingerprints', () => {
  const blocks = (text) => [
    { type: 'paragraph', data: { text } },
    { type: 'bulletListItem', data: { text: 'Pack <b>socks</b>' } },
    { type: 'table', data: { content: [['Rome', '3 nights']] } }
  ]

  it('matches notes that differ only in formatting, case and whitespace', async () => {
    const a = await noteFingerprint({ title: 'Trip', blocks: blocks('Book the <i>flights</i>') })
    const b = await noteFingerprint({ title: '  trip ', blocks: blocks('book   the flights') })
    assert.match(a, /^[0-9a-f]{64}$/)
    assert.equal(a, b)
  })

  it('tells apart notes whose words differ', async () => {
    const a = await noteFingerprint({ title: 'Trip', blocks: blocks('Book the flights') })
    const b = await noteFingerprint({ title: 'Trip', blocks: blocks('Book the train') })
    assert.notEqual(a, b)
  })

  it('does not fingerprint a note with no words', async () => {
    assert.equal(await noteFingerprint({ title: 'Untitled', blocks: [] }), null)
    assert.equal(await noteFingerprint({ title: 'Photo', blocks: [{ type: 'image', data: { file: { url: 'https://example.com/a.png' }, caption: '' } }] }), null)
    assert.equal(noteBodyText(blocks('x')), 'x pack socks rome 3 nights')
  })

  it('tells apart notes whose checkmarks, block kinds or photos differ', async () => {
    const list = (checked) => [{ type: 'checklistItem', data: { text: 'Milk', checked } }]
    assert.notEqual(await noteFingerprint({ title: 'Shop', blocks: list(true) }), await noteFingerprint({ title: 'Shop', blocks: list(false) }))
    assert.notEqual(
      await noteFingerprint({ title: 'Shop', blocks: [{ type: 'paragraph', data: { text: 'Milk' } }] }),
      await noteFingerprint({ title: 'Shop', blocks: [{ type: 'bulletListItem', data: { text: 'Milk' } }] }))
    const photo = { type: 'image', data: { file: { url: 'https://example.com/a.png' }, caption: '' } }
    assert.notEqual(
      await noteFingerprint({ title: 'Receipt', blocks: [{ type: 'paragraph', data: { text: 'Lunch' } }] }),
      await noteFingerprint({ title: 'Receipt', blocks: [{ type: 'paragraph', data: { text: 'Lunch' } }, photo] }))
    assert.equal(noteHasFiles([photo]), true)
    assert.equal(noteHasFiles(blocks('x')), false)
  })

  it('ignores blank paragraphs', async () => {
    const spaced = [{ type: 'paragraph', data: { text: 'One' } }, { type: 'paragraph', data: { text: '' } }, { type: 'paragraph', data: { text: 'Two' } }]
    const tight = [{ type: 'paragraph', data: { text: 'One' } }, { type: 'paragraph', data: { text: 'Two' } }]
    assert.equal(await noteFingerprint({ title: 'T', blocks: spaced }), await noteFingerprint({ title: 'T', blocks: tight }))
  })
})
