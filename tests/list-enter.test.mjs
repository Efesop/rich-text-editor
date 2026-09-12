/**
 * Enter in a list item: the text after the caret moves to a new item, and
 * the caret moves with it before the key handler returns, so keys typed
 * straight after Enter land in the new item.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { splitAtCaret, splitListItem } from '../lib/listEnter.js'

const { window } = new JSDOM('<!doctype html><body></body>')
const { document } = window

function select (node, start, end = start) {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

// What typing does to the page: the text goes in at the caret, which moves past it.
function type (text) {
  const node = document.createTextNode(text)
  window.getSelection().getRangeAt(0).insertNode(node)
  select(node, text.length)
}

// List items in an editor, with the parts of the Editor.js API that
// splitListItem uses. blocks.insert puts the new block in the page before it
// returns, as Editor.js does. `currentIndex` is the block Editor.js reports
// as current, and `caretMoves` is whether caret.setToBlock moves the caret.
function editorWith (texts, { currentIndex = 0, caretMoves = true } = {}) {
  document.body.innerHTML = '<div class="codex-editor__redactor"></div>'
  const redactor = document.body.firstChild
  const blocks = []
  let current = currentIndex
  let nextId = 1
  const make = (html) => {
    const holder = document.createElement('div')
    holder.className = 'ce-block'
    const input = document.createElement('div')
    input.setAttribute('contenteditable', 'true')
    input.innerHTML = html
    holder.appendChild(input)
    return { id: `block-${nextId++}`, holder, input }
  }
  for (const text of texts) {
    const block = make(text)
    blocks.push(block)
    redactor.appendChild(block.holder)
  }
  const api = {
    blocks: {
      getCurrentBlockIndex: () => current,
      getBlockIndex: (id) => {
        const index = blocks.findIndex(block => block.id === id)
        return index === -1 ? undefined : index
      },
      getBlockByIndex: (index) => blocks[index],
      insert: (tool, data, config, index, needToFocus) => {
        const block = { ...make(data.text), tool, data }
        redactor.insertBefore(block.holder, blocks[index]?.holder || null)
        blocks.splice(index, 0, block)
        if (needToFocus) current = index
        return block
      }
    },
    caret: {
      setToBlock: (index) => {
        if (caretMoves) select(blocks[index].input, 0)
        return caretMoves
      }
    }
  }
  return { api, blocks }
}

const texts = (blocks) => blocks.map(block => block.input.innerHTML)
const bullet = { tool: 'bulletListItem', dataFor: (text) => ({ text }) }

describe('splitListItem', () => {
  it('moves the caret into the new item before it returns, so typing lands there', () => {
    const { api, blocks } = editorWith(['Book flights', 'Pack'])
    select(blocks[0].input.firstChild, 4)
    splitListItem({ api, block: blocks[0], input: blocks[0].input, ...bullet })
    // No timer has run: the next keys already go to the new item
    type('Compare')
    assert.deepEqual(texts(blocks), ['Book', 'Compare flights', 'Pack'])
  })

  it('keeps inline formatting on both sides of the caret', () => {
    const { api, blocks } = editorWith(['<b>bold text</b> and <i>more</i>'])
    select(blocks[0].input.firstChild.firstChild, 5)
    const left = splitListItem({ api, block: blocks[0], input: blocks[0].input, ...bullet })
    assert.equal(left, '<b>bold </b>')
    assert.deepEqual(texts(blocks), ['<b>bold </b>', '<b>text</b> and <i>more</i>'])
  })

  it('inserts below the item Enter was pressed in, whichever block Editor.js calls current', () => {
    const { api, blocks } = editorWith(['one', 'two', 'three'], { currentIndex: 2 })
    select(blocks[0].input.firstChild, 3)
    splitListItem({ api, block: blocks[0], input: blocks[0].input, ...bullet })
    type('new')
    assert.deepEqual(texts(blocks), ['one', 'new', 'two', 'three'])
  })

  it('places the caret itself when Editor.js leaves it where it was', () => {
    const { api, blocks } = editorWith(['Passport'], { caretMoves: false })
    select(blocks[0].input.firstChild, 8)
    splitListItem({ api, block: blocks[0], input: blocks[0].input, tool: 'checklistItem', dataFor: (text) => ({ text, checked: false }) })
    type('Tickets')
    assert.deepEqual(texts(blocks), ['Passport', 'Tickets'])
    assert.deepEqual(blocks[1].data, { text: '', checked: false })
  })

  it('cleans both halves and builds the new item with dataFor', () => {
    const { api, blocks } = editorWith(['left right'])
    select(blocks[0].input.firstChild, 4)
    const left = splitListItem({
      api,
      block: blocks[0],
      input: blocks[0].input,
      tool: 'numberedListItem',
      dataFor: (text) => ({ text, indent: 2 }),
      clean: (html) => html.trim()
    })
    assert.equal(left, 'left')
    assert.equal(blocks[1].tool, 'numberedListItem')
    assert.deepEqual(blocks[1].data, { text: 'right', indent: 2 })
  })
})

describe('splitAtCaret', () => {
  it('drops selected text', () => {
    const { blocks } = editorWith(['abcdefgh'])
    select(blocks[0].input.firstChild, 2, 6)
    assert.deepEqual(splitAtCaret(blocks[0].input), { before: 'ab', after: 'gh' })
  })

  it('moves all the text on when the caret is at the start', () => {
    const { blocks } = editorWith(['all of it'])
    select(blocks[0].input.firstChild, 0)
    assert.deepEqual(splitAtCaret(blocks[0].input), { before: '', after: 'all of it' })
  })

  it('keeps everything before the caret when the caret is in another element', () => {
    const { blocks } = editorWith(['first', 'second'])
    select(blocks[1].input.firstChild, 2)
    assert.deepEqual(splitAtCaret(blocks[0].input), { before: 'first', after: '' })
  })
})
