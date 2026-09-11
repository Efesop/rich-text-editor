/**
 * Importers: inline HTML that both sanitizers keep unchanged.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EDITOR_RULES, editorWouldChange } from './helpers/editorRules.mjs'

const { runsToHtml, normalizeRuns, safeHref, runsText, cleanInlineText } = await import('../lib/import/inline.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')

const NBSP = String.fromCharCode(0xA0)
const PAGE = '6f1c3b0e-2d4a-4c5e-9f7a-1b2c3d4e5f60'
const HREF = 'https://example.com/a?b=1&c="2"'
const R = (text, style = {}) => ({ text, ...style })
const BR = { br: true }

function appSanitized (block) {
  return sanitizeEditorContent({ blocks: [{ id: 'b1', ...block }] }).blocks[0].data
}

const SAMPLE = [
  R('Plain & <safe> '), R('bold', { b: true }), R(' and '), R('both', { b: true, i: true }), R(' '),
  R('under', { u: true }), R(' '), R('struck', { s: true }), R(' '), R('lit', { mark: true }), R(' '),
  R('x < y', { code: true }), BR, R('web', { href: HREF }), R(' '), R('Other note', { pageRef: PAGE }),
  R(' nbsp' + NBSP + 'kept')
]
const ESCAPED_HREF = 'https://example.com/a?b=1&amp;c=%222%22'

describe('runsToHtml', () => {
  it('writes rich text with the tags and classes the editor tools use', () => {
    assert.equal(runsToHtml(SAMPLE, 'rich'),
      'Plain &amp; &lt;safe&gt; <b>bold</b> and <b><i>both</i></b> <u class="cdx-underline">under</u> <s>struck</s> ' +
      '<mark class="cdx-marker">lit</mark> <code class="inline-code">x &lt; y</code><br>' +
      `<a href="${ESCAPED_HREF}" target="_blank" rel="noopener noreferrer">web</a> ` +
      `<a data-page-id="${PAGE}" class="page-link" href="#">Other note</a> nbsp&nbsp;kept`)
  })

  it('drops strikethrough and page links in quotes, and uses the link tool rel', () => {
    assert.equal(runsToHtml(SAMPLE, 'quote'),
      'Plain &amp; &lt;safe&gt; <b>bold</b> and <b><i>both</i></b> <u class="cdx-underline">under</u> struck ' +
      '<mark class="cdx-marker">lit</mark> <code class="inline-code">x &lt; y</code><br>' +
      `<a href="${ESCAPED_HREF}" target="_blank" rel="nofollow">web</a> Other note nbsp&nbsp;kept`)
  })

  it('turns line breaks into spaces in table cells', () => {
    assert.equal(runsToHtml(SAMPLE, 'table'),
      'Plain &amp; &lt;safe&gt; <b>bold</b> and <b><i>both</i></b> <u class="cdx-underline">under</u> struck ' +
      '<mark class="cdx-marker">lit</mark> <code class="inline-code">x &lt; y</code> ' +
      `<a href="${ESCAPED_HREF}" target="_blank" rel="nofollow">web</a> Other note nbsp&nbsp;kept`)
    assert.equal(runsToHtml([R('a', { b: true }), BR, R('b', { b: true })], 'table'), '<b>a b</b>')
  })

  it('keeps only highlight and inline code in headings', () => {
    assert.equal(runsToHtml(SAMPLE, 'heading'),
      'Plain &amp; &lt;safe&gt; bold and both under struck <mark class="cdx-marker">lit</mark> ' +
      '<code class="inline-code">x &lt; y</code> web Other note nbsp&nbsp;kept')
  })

  it('nests formatting in one order inside a single link', () => {
    assert.equal(runsToHtml([R('x', { code: true, b: true })]), '<b><code class="inline-code">x</code></b>')
    assert.equal(runsToHtml([R('a', { href: 'https://a.example/' }), R('b', { href: 'https://a.example/', b: true })]),
      '<a href="https://a.example/" target="_blank" rel="noopener noreferrer">a<b>b</b></a>')
  })

  it('writes HTML that the app sanitizer and the editor keep unchanged, in every field', () => {
    const rich = runsToHtml(SAMPLE, 'rich')
    const quote = runsToHtml(SAMPLE, 'quote')
    const table = runsToHtml(SAMPLE, 'table')
    const heading = runsToHtml(SAMPLE, 'heading')

    assert.equal(editorWouldChange(rich, EDITOR_RULES.paragraph), null)
    assert.equal(editorWouldChange(rich, EDITOR_RULES.callout), null)
    assert.equal(editorWouldChange(quote, EDITOR_RULES.quote), null)
    assert.equal(editorWouldChange(table, EDITOR_RULES.table), null)
    assert.equal(editorWouldChange(heading, EDITOR_RULES.header), null)

    assert.equal(appSanitized({ type: 'paragraph', data: { text: rich } }).text, rich)
    assert.equal(appSanitized({ type: 'bulletListItem', data: { text: rich } }).text, rich)
    assert.equal(appSanitized({ type: 'callout', data: { text: rich, variant: 'info' } }).text, rich)
    assert.equal(appSanitized({ type: 'toggle', data: { summary: rich, content: rich, defaultCollapsed: false } }).content, rich)
    assert.equal(appSanitized({ type: 'quote', data: { text: quote, caption: quote, alignment: 'left' } }).text, quote)
    assert.deepEqual(appSanitized({ type: 'table', data: { withHeadings: true, content: [[table, table]] } }).content, [[table, table]])
    assert.equal(appSanitized({ type: 'header', data: { text: heading, level: 2 } }).text, heading)
  })

  it('catches HTML the editor would change, so the check itself is live', () => {
    assert.match(editorWouldChange('<strong>x</strong>', EDITOR_RULES.table), /<strong> is removed/)
    assert.match(editorWouldChange('<a href="https://a.example/" rel="noopener noreferrer">x</a>', EDITOR_RULES.quote), /rel=/)
    assert.match(editorWouldChange('<b>x</b>', EDITOR_RULES.header), /<b> is removed/)
    assert.equal(editorWouldChange('<mark>x</mark>', EDITOR_RULES.header), null)
  })
})

describe('normalizeRuns', () => {
  it('collapses whitespace across runs and trims every line', () => {
    const runs = [R('  lead  '), R(' mid ', { b: true }), R('  '), BR, R(' after'), BR, BR, BR, R('end '), BR]
    assert.equal(runsToHtml(runs), 'lead <b>mid</b><br>after<br><br>end')
    assert.deepEqual(normalizeRuns([BR, R('  '), BR]), [])
  })

  it('keeps spaces and tabs as typed for plain text', () => {
    const html = runsToHtml([R('  two  spaces\n    indented\ttab  ')], 'rich', { preserveSpaces: true })
    assert.equal(html, '&nbsp; two&nbsp; spaces<br>&nbsp; &nbsp; indented&nbsp; &nbsp; tab')
  })

  it('removes invisible controls and repairs broken surrogate pairs', () => {
    const ch = String.fromCharCode
    assert.equal(cleanInlineText('a' + ch(0) + 'b' + ch(0x1F) + 'c' + ch(0xD83D) + 'd'), 'abc' + ch(0xFFFD) + 'd')
    assert.equal(runsToHtml([R('x' + ch(0x7F) + 'y')]), 'xy')
  })

  it('keeps unsafe links as plain text', () => {
    assert.equal(runsToHtml([R('run', { href: 'javascript:alert(1)' }), R(' and '), R('app', { href: 'evernote:///view/1' })]), 'run and app')
  })

  it('returns the text with line breaks as line feeds', () => {
    assert.equal(runsText([R('a'), BR, R('b', { b: true })]), 'a\nb')
  })
})

describe('safeHref', () => {
  it('keeps web, mail and phone links as the URL parser writes them', () => {
    assert.equal(safeHref(' https://example.com '), 'https://example.com/')
    assert.equal(safeHref('mailto:someone@example.com'), 'mailto:someone@example.com')
    assert.equal(safeHref('tel:+1 555 0100'), 'tel:+1%20555%200100')
    assert.equal(safeHref('mailto:Ann Lee <ann@example.com>'), 'mailto:Ann%20Lee%20%3Cann@example.com%3E')
  })

  it('refuses scripts, app links, relative paths and very long addresses', () => {
    assert.equal(safeHref('javascript:alert(1)'), null)
    assert.equal(safeHref('evernote:///view/123/s1/abc/abc/'), null)
    assert.equal(safeHref('../Other%20page.html'), null)
    assert.equal(safeHref('https://example.com/' + 'a'.repeat(3000)), null)
  })
})

describe('editor rules this module relies on', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

  it('still match the tool sources', () => {
    assert.match(read('components/Editor.js'), /class: Header,\s*inlineToolbar: \['marker', 'inlineCode'\]/)
    assert.match(read('components/Editor.js'), /class: Table,\s*inlineToolbar: true/)
    assert.match(read('components/editor-tools/Callout.js'), /mark: \{ class: true \},\s*code: \{ class: true \}/)
    assert.match(read('components/editor-tools/Toggle.js'), /mark: \{ class: true \},\s*code: \{ class: true \}/)
    assert.match(read('node_modules/@editorjs/quote/dist/quote.mjs'), /text: \{\s*br: !0\s*\},\s*caption: \{\s*br: !0\s*\}/)
    assert.match(read('node_modules/@editorjs/header/dist/header.mjs'), /level: !1,\s*text: \{\}/)
    assert.doesNotMatch(read('node_modules/@editorjs/table/dist/table.mjs'), /static get sanitize/)
    assert.match(read('node_modules/@editorjs/editorjs/dist/editorjs.mjs'), /href: !0,\s*target: "_blank",\s*rel: "nofollow"/)
    for (const [pkg, css] of [['marker', 'cdx-marker'], ['inline-code', 'inline-code'], ['underline', 'cdx-underline']]) {
      assert.ok(read(`node_modules/@editorjs/${pkg}/dist/${pkg}.mjs`).includes(`"${css}"`), `${pkg} still uses ${css}`)
    }
  })
})
