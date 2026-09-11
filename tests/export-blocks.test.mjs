/**
 * Export: one reading of a note that every format shares.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  decodeEntities,
  inlineRuns,
  inlineText,
  inlineMarkdown,
  exportItems,
  toMarkdown,
  toPlainText,
  toCsvRows,
  toRtf,
  rtfEscape
} from '../utils/exportBlocks.js'
import { parseMarkdownToBlocks } from '../lib/markdownBlocks.js'
import { listIndentOf } from '../lib/listIndent.js'
import { imageStubUrl } from '../lib/attachmentRefs.js'

const PHOTO_ID = '0f8fad5b-d9cb-869f-a165-70867728950e'
const content = (...blocks) => ({ blocks })
const b = (type, data) => ({ type, data })

describe('reading inline HTML', () => {
  it('decodes entities, turning a non-breaking space into a plain one', () => {
    assert.equal(decodeEntities('a&nbsp;&amp;&lt;b&gt; &#233; &#x1F600; &unknown;'), 'a &<b> ' + String.fromCharCode(233) + ' ' + String.fromCodePoint(0x1F600) + ' &unknown;')
    assert.equal(decodeEntities('x' + String.fromCharCode(160) + 'y'), 'x y')
  })

  it('turns tags into formatted runs, merging neighbours that look the same', () => {
    assert.deepEqual(inlineRuns('Plain <b>bold <i>both</i></b><strong> more</strong><br>next <a href="https://example.com">link</a>'), [
      { text: 'Plain ' },
      { text: 'bold ', bold: true },
      { text: 'both', bold: true, italic: true },
      { text: ' more', bold: true },
      { text: '\nnext ' },
      { text: 'link', href: 'https://example.com' }
    ])
  })

  it('keeps only web and mail links, and reads code, marks, underline and strikethrough', () => {
    assert.deepEqual(inlineRuns('<a data-page-id="p1" class="page-link">Other note</a> <a href="javascript:alert(1)">bad</a>'), [{ text: 'Other note bad' }])
    assert.deepEqual(inlineRuns('<code class="inline-code">x</code><mark>y</mark><u>z</u><s>w</s>').map(run => Object.keys(run).sort().join()), ['code,text', 'mark,text', 'text,underline', 'strike,text'])
  })

  it('gives plain text with no tags or entities left', () => {
    assert.equal(inlineText('<b>Tom</b> &amp; <i>Jerry</i>&nbsp;<!-- note -->'), 'Tom & Jerry ')
  })
})

describe('inlineMarkdown', () => {
  it('opens and closes formatting only where it changes, with spaces outside the markers', () => {
    assert.equal(inlineMarkdown('<b>bold <i>both</i></b> plain'), '**bold *both*** plain')
    assert.equal(inlineMarkdown('<b> spaced </b>word'), ' **spaced** word')
  })

  it('escapes characters Markdown would read as formatting', () => {
    assert.equal(inlineMarkdown('2*3 = 6 and snake_case [x] &lt;tag&gt;'), '2\\*3 = 6 and snake\\_case \\[x\\] \\<tag>')
  })

  it('writes code spans that survive backticks inside them', () => {
    assert.equal(inlineMarkdown('run <code>a `b` c</code>'), 'run ``a `b` c``')
  })

  it('writes links, including formatting inside them', () => {
    assert.equal(inlineMarkdown('see <a href="https://example.com/a b">the <b>docs</b></a>'), 'see [the **docs**](<https://example.com/a b>)')
  })

  it('writes marks, strikethrough and underline', () => {
    assert.equal(inlineMarkdown('<mark>hi</mark> <s>old</s> <u>under</u>'), '==hi== ~~old~~ <u>under</u>')
  })
})

describe('exportItems', () => {
  it('keeps callouts, toggles and captions without inventing "undefined"', () => {
    const items = exportItems(content(
      b('callout', { text: 'Careful', variant: 'warning' }),
      b('toggle', { summary: 'More', content: 'Hidden' }),
      b('quote', { text: 'Said' }),
      b('image', { file: { url: 'https://example.com/a.png' } })
    ))
    assert.deepEqual(items.map(item => item.kind), ['callout', 'toggle', 'quote', 'image'])
    assert.equal(JSON.stringify(items).includes('undefined'), false)
  })

  it('skips empty tables instead of failing, and evens out ragged rows', () => {
    const items = exportItems(content(b('table', { content: [] }), b('table', { content: [[]] }), b('table', { content: [['a', 'b'], ['c']] })))
    assert.equal(items.length, 1)
    assert.deepEqual(items[0].rows, [['a', 'b'], ['c', '']])
  })

  it('numbers and labels nested list items the way the editor does', () => {
    const items = exportItems(content(
      b('numberedListItem', { text: 'one' }),
      b('numberedListItem', { text: 'nested', indent: 1 }),
      b('numberedListItem', { text: 'two' })
    ))
    assert.deepEqual(items.map(item => [item.indent, item.label]), [[0, '1'], [1, 'a'], [0, '2']])
  })

  it('reads legacy nested and flat lists as list items', () => {
    const items = exportItems(content(
      b('nestedlist', { style: 'unordered', items: [{ content: 'parent', items: [{ content: 'child', items: [] }] }] }),
      b('list', { style: 'ordered', items: ['first', 'second'] })
    ))
    assert.deepEqual(items.map(item => [item.listType, item.indent, item.html]), [['bullet', 0, 'parent'], ['bullet', 1, 'child'], ['numbered', 0, 'first'], ['numbered', 0, 'second']])
  })

  it('recognises photos stored as attachments', () => {
    const [item] = exportItems(content(b('image', { file: { url: imageStubUrl(PHOTO_ID) }, caption: 'Beach' })))
    assert.equal(item.attachmentId, PHOTO_ID)
    assert.equal(item.url, '')
  })
})

describe('toMarkdown', () => {
  const note = content(
    b('header', { text: 'Trip', level: 2 }),
    b('paragraph', { text: '# not a heading<br>second line' }),
    b('bulletListItem', { text: 'Pack' }),
    b('checklistItem', { text: 'Passport', checked: true, indent: 1 }),
    b('numberedListItem', { text: 'Flights<br>and hotel', indent: 2 }),
    b('paragraph', { text: '' }),
    b('callout', { text: 'Visa needed', variant: 'danger' }),
    b('toggle', { summary: 'Packing list', content: 'Socks<br>Shoes' }),
    b('quote', { text: 'Go', caption: '' }),
    b('code', { code: 'echo ```', language: 'bash' }),
    b('table', { content: [['City', 'Note'], ['Rome', 'a | b']], withHeadings: true }),
    b('image', { file: { url: imageStubUrl(PHOTO_ID) }, caption: 'Beach' }),
    b('image', { file: { url: imageStubUrl(PHOTO_ID) }, caption: 'Beach again' }),
    b('delimiter', {})
  )

  it('writes each block the way Markdown readers expect', () => {
    const images = new Map([[PHOTO_ID, { dataUrl: 'data:image/png;base64,AAAA' }]])
    const markdown = toMarkdown(content(...note.blocks.slice(0, 12)), { images })
    assert.equal(markdown, [
      '## Trip',
      '',
      '\\# not a heading  ',
      'second line',
      '',
      '- Pack',
      '    - [x] Passport',
      '        1. Flights  ',
      '           and hotel',
      '',
      '> [!danger]',
      '> Visa needed',
      '',
      '> [!note]- Packing list',
      '> Socks',
      '> Shoes',
      '',
      '> Go',
      '',
      '````bash',
      'echo ```',
      '````',
      '',
      '| City | Note |',
      '| --- | --- |',
      '| Rome | a \\| b |',
      '',
      '![Beach](data:image/png;base64,AAAA)',
      ''
    ].join('\n'))
  })

  it('says when a photo could not be included, and never prints undefined', () => {
    const markdown = toMarkdown(note)
    assert.match(markdown, /\*\[Photo not included: Beach again\]\*/)
    assert.equal(markdown.includes('undefined'), false)
  })

  it('parses back into the same nesting', () => {
    const lists = content(
      b('bulletListItem', { text: 'a' }),
      b('bulletListItem', { text: 'b', indent: 1 }),
      b('numberedListItem', { text: 'c', indent: 2 }),
      b('checklistItem', { text: 'd', checked: false, indent: 1 }),
      b('bulletListItem', { text: 'e' })
    )
    const reparsed = parseMarkdownToBlocks(toMarkdown(lists))
    assert.deepEqual(reparsed.map(block => [block.type, block.data.text, listIndentOf(block)]), lists.blocks.map(block => [block.type, block.data.text, listIndentOf(block)]))
  })
})

describe('toPlainText', () => {
  it('writes readable text with list markers, labels and indentation', () => {
    const text = toPlainText(content(
      b('paragraph', { text: '<b>Intro</b>&nbsp;text' }),
      b('numberedListItem', { text: 'one' }),
      b('bulletListItem', { text: 'sub', indent: 1 }),
      b('numberedListItem', { text: 'deeper', indent: 1 }),
      b('checklistItem', { text: 'done', checked: true }),
      b('quote', { text: 'Quoted' }),
      b('callout', { text: 'Heads up', variant: 'tip' }),
      b('toggle', { summary: 'Details', content: 'Line 1<br>Line 2' }),
      b('image', { file: { url: 'https://example.com/a.png' } })
    ))
    assert.equal(text, [
      'Intro text',
      '',
      '1. one',
      '    • sub',
      '    a. deeper',
      '[x] done',
      '',
      '"Quoted"',
      '',
      'Tip: Heads up',
      '',
      'Details',
      '    Line 1',
      '    Line 2',
      '',
      '[Image]',
      ''
    ].join('\n'))
  })
})

describe('toCsvRows', () => {
  it('puts list indent in Level and checklist state in Checked', () => {
    assert.deepEqual(toCsvRows(content(
      b('header', { text: 'Title', level: 3 }),
      b('numberedListItem', { text: 'x', indent: 1 }),
      b('checklistItem', { text: 'y', checked: false }),
      b('table', { content: [] })
    )), [
      ['Header', 3, 'Title', ''],
      ['Numbered Item', 1, 'a. x', ''],
      ['Checklist Item', 0, 'y', 'Unchecked']
    ])
  })
})

describe('toRtf', () => {
  it('escapes RTF syntax and writes non-ASCII text as unicode escapes', () => {
    assert.equal(rtfEscape('{a}\\b'), '\\{a\\}\\\\b')
    assert.equal(rtfEscape('Caf' + String.fromCharCode(233)), 'Caf\\u233?')
    assert.equal(rtfEscape(String.fromCodePoint(0x1F600)), '\\u-10179?\\u-8704?')
    assert.equal(rtfEscape('line\nnext'), 'line\\line next')
  })

  it('indents nested list items, keeps formatting and prints no undefined', () => {
    const rtf = toRtf(content(
      b('bulletListItem', { text: 'top' }),
      b('bulletListItem', { text: '<b>child</b>', indent: 1 }),
      b('quote', { text: 'No caption' }),
      b('table', { content: [] })
    ))
    assert.match(rtf, /\\li360\\fi-360\\sa40 \\u8226\?\\tab top\\par/)
    assert.match(rtf, /\\li720\\fi-360\\sa40 \\u8226\?\\tab \{\\b child\}\\par/)
    assert.equal(rtf.includes('undefined'), false)
    assert.ok(rtf.startsWith('{\\rtf1') && rtf.endsWith('}'))
  })

  it('embeds a PNG photo when its bytes are given', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
    const rtf = toRtf(content(b('image', { file: { url: imageStubUrl(PHOTO_ID) }, caption: '' })), {
      images: new Map([[PHOTO_ID, { bytes, mimeType: 'image/png', width: 100, height: 50 }]])
    })
    assert.match(rtf, /\{\\pict\\pngblip\\picw100\\pich50\\picwgoal1500\\pichgoal750\n89504e47\}/)
  })
})
