/**
 * Pasted HTML lists: nesting, list types and checkboxes.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { listBlocksFromPaste } from '../lib/listPaste.js'

const { document } = new JSDOM('<!doctype html><body></body>').window

// The first element of some HTML, attached to a wrapper the way Editor.js
// leaves pasted nodes.
function pasted (html) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  return wrapper.firstElementChild
}

const summary = (blocks) => blocks.map(({ tool, data }) => {
  const row = [tool, data.text, data.indent || 0]
  if ('checked' in data) row.push(data.checked)
  return row
})

describe('listBlocksFromPaste', () => {
  it('keeps nested items, one level per nested list', () => {
    const blocks = listBlocksFromPaste(pasted('<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>'))
    assert.deepEqual(summary(blocks), [
      ['bulletListItem', 'a', 0],
      ['bulletListItem', 'b', 1],
      ['bulletListItem', 'c', 2],
      ['bulletListItem', 'd', 0]
    ])
  })

  it('pastes an ordered list as numbered items', () => {
    assert.deepEqual(summary(listBlocksFromPaste(pasted('<ol><li>one</li><li>two</li></ol>'))), [
      ['numberedListItem', 'one', 0],
      ['numberedListItem', 'two', 0]
    ])
  })

  it('keeps the type of each nested list', () => {
    assert.deepEqual(summary(listBlocksFromPaste(pasted('<ol><li>step<ul><li>detail</li></ul></li><li>next</li></ol>'))), [
      ['numberedListItem', 'step', 0],
      ['bulletListItem', 'detail', 1],
      ['numberedListItem', 'next', 0]
    ])
  })

  it('keeps inline formatting and leaves sub-list text out of the parent', () => {
    const blocks = listBlocksFromPaste(pasted('<ul><li><b>bold</b> text<br>more<ul><li>child</li></ul></li></ul>'))
    assert.deepEqual(summary(blocks), [
      ['bulletListItem', '<b>bold</b> text<br>more', 0],
      ['bulletListItem', 'child', 1]
    ])
  })

  it('gives a list placed straight inside a list to the item before it', () => {
    assert.deepEqual(summary(listBlocksFromPaste(pasted('<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>'))), [
      ['bulletListItem', 'a', 0],
      ['bulletListItem', 'b', 1],
      ['bulletListItem', 'c', 0]
    ])
  })

  it('adds no level for an item with no text of its own', () => {
    assert.deepEqual(summary(listBlocksFromPaste(pasted('<ul><li><ul><li>b</li></ul></li></ul>'))), [
      ['bulletListItem', 'b', 0]
    ])
  })

  it('reads checkbox inputs and whether they are ticked', () => {
    const html = '<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> to do</li></ul>'
    assert.deepEqual(summary(listBlocksFromPaste(pasted(html))), [
      ['checklistItem', 'done', 0, true],
      ['checklistItem', 'to do', 0, false]
    ])
  })

  it('reads checklist items marked with aria-checked, as Google Docs copies them', () => {
    const html = '<ul><li aria-checked="true">yes</li><li aria-checked="false">no</li></ul>'
    assert.deepEqual(summary(listBlocksFromPaste(pasted(html))), [
      ['checklistItem', 'yes', 0, true],
      ['checklistItem', 'no', 0, false]
    ])
  })

  it('reads [x] and [ ] typed at the start of an item', () => {
    assert.deepEqual(summary(listBlocksFromPaste(pasted('<ul><li>[x] a</li><li>[ ] b</li></ul>'))), [
      ['checklistItem', 'a', 0, true],
      ['checklistItem', 'b', 0, false]
    ])
  })

  it('nests checklist items like any other item', () => {
    const html = '<ul><li><input type="checkbox"> parent<ul><li><input type="checkbox" checked> child</li></ul></li></ul>'
    assert.deepEqual(summary(listBlocksFromPaste(pasted(html))), [
      ['checklistItem', 'parent', 0, false],
      ['checklistItem', 'child', 1, true]
    ])
  })

  it('skips items with no visible text', () => {
    assert.deepEqual(summary(listBlocksFromPaste(pasted('<ul><li> </li><li><br></li><li>&nbsp;</li><li>kept</li></ul>'))), [
      ['bulletListItem', 'kept', 0]
    ])
  })

  it('takes a lone <li> type from the list it came from', () => {
    const list = pasted('<ol><li>x</li></ol>')
    assert.deepEqual(summary(listBlocksFromPaste(list.firstElementChild)), [['numberedListItem', 'x', 0]])
  })

  it('stops nesting at the deepest level', () => {
    let html = 'deepest'
    for (let depth = 11; depth >= 0; depth--) html = `<ul><li>level ${depth}${depth === 11 ? '' : html}</li></ul>`
    const indents = listBlocksFromPaste(pasted(html)).map(block => block.data.indent || 0)
    assert.deepEqual(indents, [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8])
  })

  it('passes each item through cleanHtml', () => {
    const blocks = listBlocksFromPaste(pasted('<ul><li><b>x</b></li></ul>'), html => html.toUpperCase())
    assert.equal(blocks[0].data.text, '<B>X</B>')
  })

  it('returns nothing for a pasted element that is not a list', () => {
    assert.deepEqual(listBlocksFromPaste(pasted('<input type="checkbox">')), [])
  })
})
