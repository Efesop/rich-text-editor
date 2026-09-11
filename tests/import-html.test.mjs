/**
 * Importers: HTML to note blocks.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { parseHtml, htmlToDrafts, parseStyle } = await import('../lib/import/htmlToBlocks.js')
const { finishBlocks, editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

function convert (html, options = {}) {
  const { drafts, issues } = htmlToDrafts(parseHtml(html), options)
  let n = 0
  const blocks = finishBlocks(drafts, { newId: () => `b${++n}` })
  // Placeholders are filled in on commit; everything else must already be storable as is.
  const storable = blocks.filter(block => !block.data.importResource)
  const content = editorContent(storable, 1)
  assert.deepEqual(sanitizeEditorContent(content), content, 'the app sanitizer changes nothing')
  assert.deepEqual(editorChanges(storable), [], 'Editor.js changes nothing on save')
  return { blocks: blocks.map(({ type, data }) => [type, data]), issues }
}

const link = (href, text, rel = 'noopener noreferrer') => `<a href="${href}" target="_blank" rel="${rel}">${text}</a>`

describe('htmlToDrafts', () => {
  it('keeps inline formatting from tags and inline styles', () => {
    const { blocks, issues } = convert(`<p>Plain <strong>bold</strong> <em>it</em> <u>under</u> <del>gone</del> <mark>hi</mark> <code>x&lt;y</code>
      <span style="font-weight: 700">cssbold</span> <span style="font-style:italic">cssit</span>
      <span style="text-decoration: underline line-through">both</span> <span style="--en-highlight:yellow">enhl</span> <span style="color:red">red</span></p>`)
    assert.deepEqual(blocks, [['paragraph', {
      text: 'Plain <b>bold</b> <i>it</i> <u class="cdx-underline">under</u> <s>gone</s> <mark class="cdx-marker">hi</mark> ' +
        '<code class="inline-code">x&lt;y</code> <b>cssbold</b> <i>cssit</i> <u class="cdx-underline"><s>both</s></u> ' +
        '<mark class="cdx-marker">enhl</mark> red'
    }]])
    assert.deepEqual(issues, { 'colours-dropped': 1 })
  })

  it('keeps web and mail links, resolves note and file links, and keeps the rest as text', () => {
    const { blocks, issues } = convert(
      '<p><a href="https://example.com/x">web</a> <a href="evernote:///view/1">app</a> <a href="#top">anchor</a> <a href="mailto:a@b.co">mail</a></p>')
    assert.deepEqual(blocks, [['paragraph', { text: `${link('https://example.com/x', 'web')} app anchor ${link('mailto:a@b.co', 'mail')}` }]])
    assert.deepEqual(issues, { 'link-kept-as-text': 1 })

    const resolved = convert('<p>See <a href="Other.html">Other</a>.</p><p><a href="doc.pdf">Plan</a></p>', {
      resolveLink: href => (href === 'Other.html' ? { pageRef: 'P1' } : href === 'doc.pdf' ? { file: 'res:doc' } : null)
    })
    assert.deepEqual(resolved.blocks, [
      ['paragraph', { text: 'See <a data-page-id="P1" class="page-link" href="#">Other</a>.' }],
      ['attachment', { importResource: 'res:doc', filename: 'Plan' }]
    ])
  })

  it('reads Evernote lines, blank lines and to-dos', () => {
    const { blocks } = convert(
      '<en-note><div>First line</div><div><br/></div><div><br/></div><div><en-todo checked="true"/>Done task</div>' +
      '<div><en-todo checked="false"/>Open task</div><div>Last</div></en-note>',
      { checkbox: node => (node.name === 'en-todo' ? { checked: node.attribs.checked === 'true' } : null) })
    assert.deepEqual(blocks, [
      ['paragraph', { text: 'First line' }],
      ['paragraph', { text: '' }],
      ['checklistItem', { text: 'Done task', checked: true }],
      ['checklistItem', { text: 'Open task', checked: false }],
      ['paragraph', { text: 'Last' }]
    ])
  })

  it('turns nested lists into indented list items', () => {
    const { blocks } = convert(`
      <ul>
        <li>One
          <ul><li>One A</li><li><input type="checkbox" checked> One B done</li></ul>
          more about one
        </li>
        <li><p>Two</p><p>Second paragraph</p></li>
      </ul>
      <ol><li>First</li><li>Second<ol><li>Inner</li></ol></li></ol>
      <ul><li>Evernote</li><ul><li>nested without li</li></ul></ul>`)
    assert.deepEqual(blocks, [
      ['bulletListItem', { text: 'One' }],
      ['bulletListItem', { text: 'One A', indent: 1 }],
      ['checklistItem', { text: 'One B done<br>more about one', checked: true, indent: 1 }],
      ['bulletListItem', { text: 'Two<br>Second paragraph' }],
      ['numberedListItem', { text: 'First' }],
      ['numberedListItem', { text: 'Second' }],
      ['numberedListItem', { text: 'Inner', indent: 1 }],
      ['bulletListItem', { text: 'Evernote' }],
      ['bulletListItem', { text: 'nested without li', indent: 1 }]
    ])
  })

  it('keeps headings, quotes, toggles, code and dividers, in order', () => {
    const { blocks, issues } = convert(`<h1>Title</h1><h3>Section</h3><p>Text</p>
      <blockquote><p>Quoted <b>bold</b></p><ul><li>point</li></ul><pre><code class="language-py">print(1)</code></pre><p>after code</p></blockquote>
      <details><summary>More</summary><p>Hidden text</p></details>
      <details open><summary>Open</summary><p>Visible</p><pre>code</pre></details>
      <hr>`)
    assert.deepEqual(blocks, [
      ['header', { text: 'Title', level: 2 }],
      ['header', { text: 'Section', level: 3 }],
      ['paragraph', { text: 'Text' }],
      ['quote', { text: 'Quoted <b>bold</b><br>' + String.fromCharCode(0x2022) + ' point', caption: '', alignment: 'left' }],
      ['code', { code: 'print(1)', language: 'python', encoding: 'raw' }],
      ['quote', { text: 'after code', caption: '', alignment: 'left' }],
      ['toggle', { summary: 'More', content: 'Hidden text', defaultCollapsed: true }],
      ['toggle', { summary: 'Open', content: 'Visible', defaultCollapsed: false }],
      ['code', { code: 'code', language: 'auto', encoding: 'raw' }],
      ['delimiter', {}]
    ])
    assert.deepEqual(issues, { 'toggle-content-moved': 1 })
  })

  it('lays out tables with merged cells on a full grid', () => {
    const { blocks, issues } = convert(`<table><thead><tr><th>Name</th><th>Qty</th><th>Note</th></tr></thead>
      <tbody><tr><td rowspan="2">Apples</td><td colspan="2">Lots<br>really</td></tr>
      <tr><td>3</td><td><img src="https://x.example/a.png"></td></tr></tbody></table>`)
    assert.deepEqual(blocks, [['table', {
      withHeadings: true,
      stretched: false,
      content: [['Name', 'Qty', 'Note'], ['Apples', 'Lots really', ''], ['', '3', link('https://x.example/a.png', 'a.png', 'nofollow')]]
    }]])
    assert.deepEqual(issues, { 'remote-photo': 1 })
  })

  it('splits paragraphs around photos, attaches figure captions, and marks missing photos', () => {
    const { blocks, issues } = convert(
      '<p>Before <img src="photo.jpg" alt="Beach"> after</p>' +
      '<figure><a href="photo2.jpg"><img src="photo2.jpg"></a><figcaption>Sunset <i>glow</i></figcaption></figure>' +
      '<p><img src="nope.png" alt="Gone"></p>',
      { resolveImage: src => (src.startsWith('photo') ? { resource: 'res:' + src } : null) })
    assert.deepEqual(blocks, [
      ['paragraph', { text: 'Before' }],
      ['image', { importResource: 'res:photo.jpg', caption: '' }],
      ['paragraph', { text: 'after' }],
      ['image', { importResource: 'res:photo2.jpg', caption: 'Sunset <i>glow</i>' }],
      ['paragraph', { text: '<i>[Photo not found: Gone]</i>' }]
    ])
    assert.deepEqual(issues, { 'missing-photo': 1 })
  })

  it('leaves out scripts, styles and icons, keeps maths as TeX and embedded media as links', () => {
    const { blocks, issues } = convert(`<head><title>T</title><style>p { color: red }</style></head>
      <script>alert(1)</script><svg><text>icon</text></svg>
      <p>E = <math><semantics><mrow></mrow><annotation encoding="application/x-tex">mc^2</annotation></semantics></math></p>
      <iframe src="https://www.youtube.com/embed/abc" title="Video"></iframe>`)
    assert.deepEqual(blocks, [
      ['paragraph', { text: 'E = $mc^2$' }],
      ['paragraph', { text: link('https://www.youtube.com/embed/abc', 'Video') }]
    ])
    assert.deepEqual(issues, { 'embedded-media': 1 })
  })

  it('lets a format handle its own elements', () => {
    const { blocks } = convert('<div class="callout"><p>Careful</p><ul><li>hot</li></ul></div>', {
      handleElement (node, walker) {
        if (node.name !== 'div' || node.attribs.class !== 'callout') return false
        walker.callout(walker.collect(node.children), 'warning')
        return true
      }
    })
    assert.deepEqual(blocks, [['callout', { text: 'Careful<br>' + String.fromCharCode(0x2022) + ' hot', variant: 'warning' }]])
  })
})

describe('parseStyle', () => {
  it('reads declarations leniently', () => {
    assert.deepEqual([...parseStyle('font-weight: bold !important; COLOR:Red;;bad').entries()], [['font-weight', 'bold'], ['color', 'Red']])
  })
})
