/**
 * Importers: drafts to Editor.js blocks in the shapes the tools save.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { finishBlocks, flattenDrafts, codeLanguage, cleanCode, editorContent, createBlockId } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')

const R = (text, style = {}) => ({ text, ...style })
const NBSP = String.fromCharCode(0xA0)
const ids = () => {
  let n = 0
  return () => `b${++n}`
}
const para = (text) => ({ kind: 'paragraph', runs: [R(text)] })
const item = (indent, text, listType = 'bullet') => ({ kind: 'list', listType, indent, runs: [R(text)] })

describe('finishBlocks', () => {
  it('builds every block kind as its tool saves it, and the app sanitizer changes nothing', () => {
    const blocks = finishBlocks([
      { kind: 'heading', level: 1, runs: [R('Trip')] },
      { kind: 'paragraph', runs: [R('Book '), R('flights', { b: true })] },
      item(0, 'Pack'),
      { kind: 'list', listType: 'numbered', indent: 1, runs: [R('Socks')] },
      { kind: 'list', listType: 'checklist', indent: 1, checked: true, runs: [R('Passport')] },
      { kind: 'quote', runs: [R('Go')], captionRuns: [R('Me')] },
      { kind: 'callout', variant: 'warning', runs: [R('Visa')] },
      { kind: 'toggle', summaryRuns: [R('More')], contentRuns: [R('Hidden')], collapsed: true },
      { kind: 'code', code: '\n\nlet a = 1 < 2\r\n\n', language: 'JS' },
      { kind: 'table', rows: [[[R('City')], [R('Nights')]], [[R('Rome')]]], withHeadings: true },
      { kind: 'divider' },
      { kind: 'heading', level: 3, runs: [R('Later')] }
    ], { newId: ids() })

    assert.deepEqual(blocks, [
      { id: 'b1', type: 'header', data: { text: 'Trip', level: 2 } },
      { id: 'b2', type: 'paragraph', data: { text: 'Book <b>flights</b>' } },
      { id: 'b3', type: 'bulletListItem', data: { text: 'Pack' } },
      { id: 'b4', type: 'numberedListItem', data: { text: 'Socks', indent: 1 } },
      { id: 'b5', type: 'checklistItem', data: { text: 'Passport', checked: true, indent: 1 } },
      { id: 'b6', type: 'quote', data: { text: 'Go', caption: 'Me', alignment: 'left' } },
      { id: 'b7', type: 'callout', data: { text: 'Visa', variant: 'warning' } },
      { id: 'b8', type: 'toggle', data: { summary: 'More', content: 'Hidden', defaultCollapsed: true } },
      { id: 'b9', type: 'code', data: { code: 'let a = 1 < 2', language: 'javascript', encoding: 'raw' } },
      { id: 'b10', type: 'table', data: { withHeadings: true, stretched: false, content: [['City', 'Nights'], ['Rome', '']] } },
      { id: 'b11', type: 'delimiter', data: {} },
      { id: 'b12', type: 'header', data: { text: 'Later', level: 3 } }
    ])
    const content = editorContent(blocks, 1700000000000)
    assert.deepEqual(sanitizeEditorContent(content), content)
  })

  it('ranks heading levels per note, largest first, from level 2 to 4', () => {
    const blocks = finishBlocks([2, 5, 3, 6].map(level => ({ kind: 'heading', level, runs: [R(`h${level}`)] })), { newId: ids() })
    assert.deepEqual(blocks.map(b => b.data.level), [2, 4, 3, 4])
  })

  it('never puts a list item more than one level below the item above it', () => {
    const blocks = finishBlocks([item(2, 'a'), item(3, 'b'), item(1, 'c'), para('break'), item(1, 'd'), { kind: 'blank' }, item(1, 'e')], { newId: ids() })
    assert.deepEqual(blocks.map(b => b.data.indent ?? 0), [0, 1, 1, 0, 0, 0, 0])
    assert.deepEqual(blocks.map(b => b.type), ['bulletListItem', 'bulletListItem', 'bulletListItem', 'paragraph', 'bulletListItem', 'paragraph', 'bulletListItem'])
  })

  it('flattens lists nested deeper than eight levels and reports it', () => {
    const reported = []
    const drafts = Array.from({ length: 12 }, (_, level) => item(level, `level ${level}`))
    const blocks = finishBlocks(drafts, { newId: ids(), report: code => reported.push(code) })
    assert.deepEqual(blocks.map(b => b.data.indent ?? 0), [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8])
    assert.deepEqual([...new Set(reported)], ['deep-list'])
  })

  it('keeps one blank line between blocks and drops empty blocks', () => {
    const blocks = finishBlocks([
      { kind: 'blank' }, para('one'), { kind: 'blank' }, { kind: 'blank' }, para('   '),
      { kind: 'heading', level: 1, runs: [] }, item(0, ''), { kind: 'code', code: '\n  \n' },
      { kind: 'table', rows: [[[R(' ')]]] }, para('two'), { kind: 'blank' }
    ], { newId: ids() })
    assert.deepEqual(blocks.map(b => b.data.text), ['one', '', 'two'])
  })

  it('leaves photos and files as placeholders for the commit to fill in', () => {
    const blocks = finishBlocks([
      { kind: 'photo', resource: 'res:1', captionRuns: [R('Beach')] },
      { kind: 'file', resource: 'res:2', name: 'Plan .pdf' }
    ], { newId: ids() })
    assert.deepEqual(blocks, [
      { id: 'b1', type: 'image', data: { importResource: 'res:1', caption: 'Beach' } },
      { id: 'b2', type: 'attachment', data: { importResource: 'res:2', filename: 'Plan .pdf' } }
    ])
  })

  it('makes ids like the ones Editor.js generates', () => {
    assert.match(createBlockId(), /^[A-Za-z0-9_-]{10}$/)
    assert.notEqual(createBlockId(), createBlockId())
  })
})

describe('flattenDrafts', () => {
  it('writes paragraphs and list items as lines, and stops at a block a text field cannot hold', () => {
    const code = { kind: 'code', code: 'x' }
    const { runs, rest } = flattenDrafts([
      para('Intro'),
      item(0, 'One', 'numbered'),
      item(1, 'Sub', 'numbered'),
      item(0, 'Two', 'numbered'),
      { kind: 'list', listType: 'checklist', indent: 0, checked: true, runs: [R('Done')] },
      code,
      para('After')
    ])
    const lines = runs.reduce((out, run) => {
      if (run.br) out.push('')
      else out[out.length - 1] += run.text
      return out
    }, [''])
    assert.deepEqual(lines, ['Intro', '1. One', NBSP.repeat(4) + 'a. Sub', '2. Two', String.fromCharCode(0x2611) + ' Done'])
    assert.deepEqual(rest, [code, para('After')])
  })
})

describe('code blocks', () => {
  it('maps source language names to the ones CodeBlock offers', () => {
    assert.equal(codeLanguage('JS'), 'javascript')
    assert.equal(codeLanguage('Plain Text'), 'plaintext')
    assert.equal(codeLanguage('C++'), 'cpp')
    assert.equal(codeLanguage(''), 'auto')
    assert.equal(codeLanguage('haskell'), 'plaintext')
  })

  it('keeps indentation and drops blank lines at either end', () => {
    assert.equal(cleanCode('\n\n  let a\r\n\tb\n\n'), '  let a\n\tb')
  })
})
