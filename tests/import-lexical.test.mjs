/**
 * Importers: Standard Notes Super notes (Lexical editor states).
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { lexicalToDrafts, parseLexicalState } = await import('../lib/import/formats/lexical.js')
const { finishBlocks, editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

const text = (value, format = 0) => ({ type: 'text', text: value, format, detail: 0, mode: 'normal', style: '', version: 1 })
const para = (...children) => ({ type: 'paragraph', children, direction: 'ltr', format: '', indent: 0, version: 1 })
const item = (children, extra = {}) => ({ type: 'listitem', children, value: 1, ...extra })

const STATE = {
  root: {
    type: 'root',
    children: [
      para(text('Plain '), text('bold', 1), text(' '), text('italic', 2), text(' '), text('struck', 4), text(' '), text('under', 8), text(' '), text('code', 16), text(' '), text('hl', 128), { type: 'linebreak' }, { type: 'link', url: 'https://example.com', children: [text('site')] }, text(' '), { type: 'hashtag', text: '#work' }),
      { type: 'heading', tag: 'h2', children: [text('Section')] },
      { type: 'quote', children: [text('Wise words')] },
      { type: 'list', listType: 'bullet', tag: 'ul', children: [item([text('One')]), item([{ type: 'list', listType: 'number', children: [item([text('Nested')])] }])] },
      { type: 'list', listType: 'check', tag: 'ul', children: [item([text('Done')], { checked: true }), item([text('Todo')], { checked: false })] },
      { type: 'code', language: 'python', children: [{ type: 'code-highlight', text: 'print(1)' }, { type: 'linebreak' }, { type: 'tab' }, { type: 'code-highlight', text: 'x' }] },
      { type: 'table', children: [
        { type: 'tablerow', children: [{ type: 'tablecell', headerState: 1, children: [para(text('A'))] }, { type: 'tablecell', headerState: 1, children: [para(text('B'))] }] },
        { type: 'tablerow', children: [{ type: 'tablecell', headerState: 0, children: [para(text('1'))] }, { type: 'tablecell', headerState: 0, children: [para(text('2'))] }] }
      ] },
      { type: 'collapsible-container', open: false, children: [
        { type: 'collapsible-title', children: [text('More')] },
        { type: 'collapsible-content', children: [para(text('Hidden')), { type: 'horizontalrule' }] }
      ] },
      { type: 'snfile', fileUuid: 'file-1' },
      para(text('See '), { type: 'snbubble', itemUuid: 'note-2' }, text(' and '), { type: 'snbubble', itemUuid: 'gone' }),
      { type: 'youtube', videoID: 'abc123' },
      { type: 'unencrypted-image', src: 'https://example.com/a.png', alt: 'Chart' },
      { type: 'inline-file', src: 'data:image/png;base64,AAAA', fileName: 'shot.png', mimeType: 'image/png' },
      { type: 'future-node', children: [para(text('Kept anyway'))] },
      { type: 'mystery' }
    ]
  }
}

describe('parseLexicalState', () => {
  it('reads a Super note and refuses anything else', () => {
    assert.ok(parseLexicalState(JSON.stringify(STATE)))
    assert.equal(parseLexicalState('Just a plain note'), null)
    assert.equal(parseLexicalState('{"not":"lexical"}'), null)
    assert.equal(parseLexicalState('{broken'), null)
  })
})

describe('lexicalToDrafts', () => {
  it('converts every kind of Super node', () => {
    const { drafts, issues } = lexicalToDrafts(STATE, {
      noteLink: uuid => (uuid === 'note-2' ? { pageRef: 'P2', title: 'Second note' } : null),
      fileName: uuid => (uuid === 'file-1' ? 'report.pdf' : null),
      dataResource: (src, name) => (src.startsWith('data:image/png') ? { key: `res:${name}`, photo: true } : null)
    })
    let n = 0
    const blocks = finishBlocks(drafts, { newId: () => `b${++n}` })
    assert.deepEqual(blocks.map(({ type, data }) => [type, data]), [
      ['paragraph', { text: 'Plain <b>bold</b> <i>italic</i> <s>struck</s> <u class="cdx-underline">under</u> <code class="inline-code">code</code> <mark class="cdx-marker">hl</mark><br><a href="https://example.com/" target="_blank" rel="noopener noreferrer">site</a> #work' }],
      ['header', { text: 'Section', level: 2 }],
      ['quote', { text: 'Wise words', caption: '', alignment: 'left' }],
      ['bulletListItem', { text: 'One' }],
      ['numberedListItem', { text: 'Nested', indent: 1 }],
      ['checklistItem', { text: 'Done', checked: true }],
      ['checklistItem', { text: 'Todo', checked: false }],
      ['code', { code: 'print(1)\n\tx', language: 'python', encoding: 'raw' }],
      ['table', { withHeadings: true, stretched: false, content: [['A', 'B'], ['1', '2']] }],
      ['toggle', { summary: 'More', content: 'Hidden', defaultCollapsed: true }],
      ['delimiter', {}],
      ['paragraph', { text: '<i>[File not included in the backup: report.pdf]</i>' }],
      ['paragraph', { text: 'See <a data-page-id="P2" class="page-link" href="#">Second note</a> and Linked note' }],
      ['paragraph', { text: '<a href="https://www.youtube.com/watch?v=abc123" target="_blank" rel="noopener noreferrer">YouTube video</a>' }],
      ['paragraph', { text: '<a href="https://example.com/a.png" target="_blank" rel="noopener noreferrer">Chart</a>' }],
      ['image', { importResource: 'res:shot.png', caption: '' }],
      ['paragraph', { text: 'Kept anyway' }]
    ])
    assert.deepEqual(issues, {
      'toggle-content-moved': 1, 'file-not-in-backup': 1, 'link-kept-as-text': 1, 'embedded-media': 1, 'remote-photo': 1, 'unsupported-content': 1
    })
    const storable = blocks.filter(block => !block.data.importResource)
    assert.deepEqual(sanitizeEditorContent(editorContent(storable, 1)), editorContent(storable, 1))
    assert.deepEqual(editorChanges(storable), [])
  })
})
