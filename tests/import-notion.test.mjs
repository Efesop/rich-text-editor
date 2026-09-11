/**
 * Importers: Notion HTML exports.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { notionNotes, notionPageId } = await import('../lib/import/formats/notion.js')
const { editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

const ROOT = 'Export-1a2b3c'
const TRIP = `${ROOT}/Trip Plan 0123456789abcdef0123456789abcdef.html`
const FOLDER = `${ROOT}/Trip Plan 0123456789abcdef0123456789abcdef`
const DAY = `${FOLDER}/Day One fedcba9876543210fedcba9876543210.html`
const enc = (s) => encodeURI(s)

const TRIP_HTML = `<html><head><meta charset="utf-8"/><title>Trip Plan</title><style>body{}</style></head><body>
<article id="01234567-89ab-cdef-0123-456789abcdef" class="page sans">
<header><img class="page-cover-image" src="https://www.notion.so/images/page-cover/gradients_1.png" style="object-position:center 50%"/>
<div class="page-header-icon undefined"><span class="icon">&#x1F9F3;</span></div>
<h1 class="page-title">Trip Plan</h1><p class="page-description">Summer in Italy</p>
<table class="properties"><tbody>
<tr class="property-row property-row-created_time"><th><span class="icon property-icon"><svg><path/></svg></span>Created</th><td><time>@January 5, 2023 3:04 PM</time></td></tr>
<tr class="property-row property-row-multi_select"><th>Tags</th><td><span class="selected-value select-value-color-blue">travel</span><span class="selected-value select-value-color-red">italy</span></td></tr>
<tr class="property-row property-row-select"><th>Status</th><td><span class="selected-value">Draft</span></td></tr>
<tr class="property-row property-row-checkbox"><th>Booked</th><td><div class="checkbox checkbox-on"></div></td></tr>
</tbody></table></header>
<div class="page-body">
<p id="a1" class="">Plain <strong>bold</strong> <em>it</em> <span style="border-bottom:0.05em solid">under</span> <mark class="highlight-yellow_background">hl</mark> <mark class="highlight-red">red</mark> <code>code</code> <span class="notion-text-equation-token"><span class="katex"><math><semantics><annotation encoding="application/x-tex">e^x</annotation></semantics></math></span></span></p>
<h2 id="a2">Plan</h2>
<ul id="a3" class="bulleted-list"><li style="list-style-type:disc">Rome<ul id="a4" class="bulleted-list"><li style="list-style-type:circle">Colosseum</li></ul></li></ul><ul id="a5" class="bulleted-list"><li style="list-style-type:disc">Florence</li></ul>
<ol type="1" id="a6" class="numbered-list" start="1"><li>Book</li></ol>
<ul id="a7" class="to-do-list"><li><div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">Passport</span><div class="indented"><ul id="a8" class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">Renew</span></li></ul></div></li></ul>
<ul id="a9" class="toggle"><li><details open=""><summary>Packing</summary><p id="a10">Socks</p></details></li></ul>
<figure class="block-color-gray_background callout" style="white-space:pre-wrap;display:flex" id="a11"><div style="font-size:1.5em"><span class="icon">&#x26A0;&#xFE0F;</span></div><div style="width:100%">Check visas</div></figure>
<blockquote id="a12">Travel light</blockquote>
<pre id="a13" class="code"><code class="language-JavaScript">let x = 1</code></pre>
<figure id="a14" class="image"><a href="${enc('Trip Plan 0123456789abcdef0123456789abcdef/photo.png')}"><img style="width:240px" src="${enc('Trip Plan 0123456789abcdef0123456789abcdef/photo.png')}"/></a><figcaption>Beach</figcaption></figure>
<figure id="a15"><div class="source"><a href="${enc('Trip Plan 0123456789abcdef0123456789abcdef/Itinerary.pdf')}">Itinerary.pdf</a></div></figure>
<figure id="a16" class="link-to-page"><a href="${enc('Trip Plan 0123456789abcdef0123456789abcdef/Day One fedcba9876543210fedcba9876543210.html')}"><span class="icon">&#x1F4C4;</span>Day One</a></figure>
<figure id="a17" class="bookmark source"><a href="https://example.com/guide"><div class="bookmark-info"><div class="bookmark-text"><div class="bookmark-title">Rome guide</div><div class="bookmark-description">Everything about Rome</div></div><div class="bookmark-href"><img src="https://example.com/icon.png" class="icon bookmark-icon"/>https://example.com/guide</div></div><img src="https://example.com/cover.png" class="bookmark-image"/></a></figure>
<figure id="a18" class="equation"><div class="equation-container"><span class="katex-display"><span class="katex"><math><semantics><annotation encoding="application/x-tex">a^2+b^2</annotation></semantics></math></span></span></div></figure>
<table id="a19" class="simple-table"><tbody><tr id="r1"><td class="">City</td><td class="">Nights</td></tr><tr id="r2"><td class="">Rome</td><td class="">3</td></tr></tbody></table>
<nav id="a20" class="block-color-gray table_of_contents"><div class="table_of_contents-item table_of_contents-indent-0"><a class="table_of_contents-link" href="#a2">Plan</a></div></nav>
<div id="a21" class="column-list"><div id="a22" style="width:50%" class="column"><p id="a23">Left</p></div><div id="a24" style="width:50%" class="column"><p id="a25">Right</p></div></div>
<hr id="a26"/>
<p id="a27"><a href="https://www.notion.so/team/Day-One-fedcba9876543210fedcba9876543210">Mention</a> and <a href="${enc('Gone Page 11111111111111111111111111111111.html')}">Gone</a></p>
</div></article></body></html>`

const DAY_HTML = `<html><head><title>Day One</title></head><body><article class="page sans"><header><h1 class="page-title">Day One</h1>
<table class="properties"><tbody><tr class="property-row property-row-last_edited_time"><th>Edited</th><td><time>@February 1, 2023 9:00 AM</time></td></tr></tbody></table></header>
<div class="page-body"><p>Back to <a href="${enc('../Trip Plan 0123456789abcdef0123456789abcdef.html')}">Trip Plan</a></p></div></article></body></html>`

function sourceFile (path, content, lastModified = Date.UTC(2024, 4, 1)) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return {
    path,
    name: path.split('/').pop(),
    size: bytes.length,
    lastModified,
    container: 'notion.zip',
    text: async () => new TextDecoder().decode(bytes),
    bytes: async () => bytes
  }
}

const files = [
  sourceFile(`${ROOT}/index.html`, '<html><body><a href="x">index</a></body></html>'),
  sourceFile(TRIP, TRIP_HTML),
  sourceFile(`${FOLDER}/photo.png`, new Uint8Array([0x89, 0x50, 0x4E, 0x47])),
  sourceFile(`${FOLDER}/Itinerary.pdf`, '%PDF'),
  sourceFile(DAY, DAY_HTML)
]

const ref = (path) => `REF:${path}`
const pageLink = (path, text) => `<a data-page-id="${ref(path)}" class="page-link" href="#">${text}</a>`

describe('notionNotes', () => {
  it('reads page ids from file names', () => {
    assert.equal(notionPageId(TRIP), '0123456789abcdef0123456789abcdef')
    assert.equal(notionPageId(`${ROOT}/index.html`), null)
  })

  it('converts every kind of Notion block, with links, files, properties and dates', async () => {
    let n = 0
    const notes = []
    for await (const note of notionNotes(files, { newId: () => `b${++n}`, pageRefFor: ref })) notes.push(note)
    assert.deepEqual(notes.map(note => note.key), [TRIP, DAY], 'the index page is not a note')
    const [trip, day] = notes

    assert.equal(trip.title, 'Trip Plan')
    assert.equal(trip.createdAt, new Date(2023, 0, 5, 15, 4).toISOString())
    assert.deepEqual(trip.tags, ['Trip Plan', 'travel', 'italy'])
    assert.deepEqual(trip.blocks.map(({ type, data }) => [type, data]), [
      ['paragraph', { text: '<i>Summer in Italy</i>' }],
      ['table', { withHeadings: true, stretched: false, content: [['Property', 'Value'], ['Status', 'Draft'], ['Booked', 'Yes']] }],
      ['paragraph', { text: 'Plain <b>bold</b> <i>it</i> <u class="cdx-underline">under</u> <mark class="cdx-marker">hl</mark> red <code class="inline-code">code</code> $e^x$' }],
      ['header', { text: 'Plan', level: 2 }],
      ['bulletListItem', { text: 'Rome' }],
      ['bulletListItem', { text: 'Colosseum', indent: 1 }],
      ['bulletListItem', { text: 'Florence' }],
      ['numberedListItem', { text: 'Book' }],
      ['checklistItem', { text: 'Passport', checked: true }],
      ['checklistItem', { text: 'Renew', checked: false, indent: 1 }],
      ['toggle', { summary: 'Packing', content: 'Socks', defaultCollapsed: false }],
      ['callout', { text: 'Check visas', variant: 'warning' }],
      ['quote', { text: 'Travel light', caption: '', alignment: 'left' }],
      ['code', { code: 'let x = 1', language: 'javascript', encoding: 'raw' }],
      ['image', { importResource: `${FOLDER}/photo.png`, caption: 'Beach' }],
      ['attachment', { importResource: `${FOLDER}/Itinerary.pdf`, filename: 'Itinerary.pdf' }],
      ['paragraph', { text: pageLink(DAY, 'Day One') }],
      ['paragraph', { text: '<a href="https://example.com/guide" target="_blank" rel="noopener noreferrer">Rome guide</a>' }],
      ['paragraph', { text: '<i>Everything about Rome</i>' }],
      ['code', { code: '$$\na^2+b^2\n$$', language: 'plaintext', encoding: 'raw' }],
      ['table', { withHeadings: false, stretched: false, content: [['City', 'Nights'], ['Rome', '3']] }],
      ['paragraph', { text: 'Left' }],
      ['paragraph', { text: 'Right' }],
      ['delimiter', {}],
      ['paragraph', { text: `${pageLink(DAY, 'Mention')} and Gone` }]
    ])
    assert.deepEqual(trip.issues, { 'cover-skipped': 1, 'colours-dropped': 1, 'table-of-contents-skipped': 1, 'link-kept-as-text': 1 })
    assert.deepEqual(trip.resources.map(r => [r.key, r.name, r.mimeType, r.size]), [
      [`${FOLDER}/photo.png`, 'photo.png', 'image/png', 4],
      [`${FOLDER}/Itinerary.pdf`, 'Itinerary.pdf', 'application/pdf', 4]
    ])

    const storable = trip.blocks.filter(block => !block.data.importResource)
    assert.deepEqual(sanitizeEditorContent(editorContent(storable, 1)), editorContent(storable, 1))
    assert.deepEqual(editorChanges(storable), [])

    assert.equal(day.title, 'Day One')
    assert.equal(day.lastEdited, new Date(2023, 1, 1, 9, 0).getTime())
    assert.equal(day.createdAt, new Date(2023, 1, 1, 9, 0).toISOString())
    assert.deepEqual(day.tags, ['Trip Plan'])
    assert.deepEqual(day.blocks.map(({ type, data }) => [type, data]), [['paragraph', { text: `Back to ${pageLink(TRIP, 'Trip Plan')}` }]])
  })

  it('reports a page it cannot read and carries on', async () => {
    const broken = { ...sourceFile(`${ROOT}/Broken 22222222222222222222222222222222.html`, ''), text: async () => { throw new Error('read failed') } }
    const notes = []
    for await (const note of notionNotes([broken, sourceFile(DAY, DAY_HTML)])) notes.push(note)
    assert.deepEqual(notes.map(note => [note.failed ?? false, note.title]), [[true, 'Broken'], [false, 'Day One']])
    assert.equal(notes[0].reason, 'read failed')
  })
})
