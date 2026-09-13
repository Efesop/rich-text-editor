/**
 * '/' in an empty list item: the item becomes a paragraph with '/' in it and
 * the block menu opens, all before the key handler returns, so keys typed
 * straight after '/' come after it.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { slashInEmptyItem } from '../lib/listSlash.js'

const { window } = new JSDOM('<!doctype html><body></body>')
const { document } = window

function select (node, offset) {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
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

// Blocks in an editor, with the parts of the Editor.js API that
// slashInEmptyItem uses. Blocks already on the page have Editor.js's keydown
// handling, which closes the block menu on a key; a block that insert adds
// doesn't have it yet, as Editor.js binds it only once the browser is idle.
// The list tool's own handler sits on the item's editable element, as in the
// app.
function editorWith (items, { currentIndex = 0, caretMoves = true } = {}) {
  document.body.innerHTML = '<div class="codex-editor__redactor"></div>'
  const redactor = document.body.firstChild
  const blocks = []
  const editor = { current: currentIndex, menuFor: null }
  let nextId = 1

  const make = (tool, text, { onPage = false } = {}) => {
    const holder = document.createElement('div')
    holder.className = 'ce-block'
    const input = document.createElement('div')
    input.setAttribute('contenteditable', 'true')
    input.textContent = text
    holder.appendChild(input)
    const block = { id: `block-${nextId++}`, tool, holder, input }
    if (onPage) holder.addEventListener('keydown', () => { editor.menuFor = null })
    if (tool !== 'paragraph') {
      input.addEventListener('keydown', (event) => {
        if (event.key === '/' && input.textContent.trim() === '') slashInEmptyItem({ api, block, event })
      })
    }
    return block
  }

  for (const [tool, text] of items) {
    const block = make(tool, text, { onPage: true })
    blocks.push(block)
    redactor.appendChild(block.holder)
  }

  const api = {
    blocks: {
      getCurrentBlockIndex: () => editor.current,
      getBlockIndex: (id) => {
        const index = blocks.findIndex(block => block.id === id)
        return index === -1 ? undefined : index
      },
      getBlockByIndex: (index) => blocks[index],
      insert: (tool, data, config, index, needToFocus) => {
        const block = make(tool, data.text)
        redactor.insertBefore(block.holder, blocks[index]?.holder || null)
        blocks.splice(index, 0, block)
        if (needToFocus) editor.current = index
        return block
      },
      delete: (index) => {
        const [block] = blocks.splice(index, 1)
        block.holder.remove()
        if (editor.current >= index) editor.current--
      }
    },
    caret: {
      setToBlock: (index) => {
        if (caretMoves) select(blocks[index].input, 0)
        return caretMoves
      }
    },
    toolbar: {
      toggleToolbox: (open) => { editor.menuFor = open ? blocks[editor.current] : null }
    }
  }
  return { api, blocks, editor, redactor }
}

// The '/' keydown the keyboard sends to an item
function pressSlash (input) {
  return input.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', code: 'Slash', bubbles: true, cancelable: true }))
}

const texts = (blocks) => blocks.map(block => block.input.textContent)
const tools = (blocks) => blocks.map(block => block.tool)

describe('slashInEmptyItem', () => {
  it('puts "/" in a paragraph in place of the item and opens the menu for it before returning', () => {
    const { blocks, editor } = editorWith([['paragraph', 'Groceries'], ['bulletListItem', 'Milk'], ['bulletListItem', '']], { currentIndex: 2 })
    select(blocks[2].input, 0)
    pressSlash(blocks[2].input)
    assert.deepEqual(tools(blocks), ['paragraph', 'bulletListItem', 'paragraph'])
    assert.deepEqual(texts(blocks), ['Groceries', 'Milk', '/'])
    assert.equal(editor.menuFor, blocks[2])
    // No timer has run: the caret is already after the '/'
    type('h')
    assert.deepEqual(texts(blocks), ['Groceries', 'Milk', '/h'])
  })

  it('stops the keydown, so Editor.js does not close the menu or handle the item that went away', () => {
    const { blocks, editor, redactor } = editorWith([['checklistItem', '']])
    let reachedEditor = 0
    redactor.addEventListener('keydown', () => { reachedEditor++ })
    select(blocks[0].input, 0)
    const notCancelled = pressSlash(blocks[0].input)
    assert.equal(notCancelled, false)
    assert.equal(reachedEditor, 0)
    assert.equal(editor.menuFor, blocks[0])
  })

  it('replaces the item the key was pressed in, whichever block Editor.js calls current', () => {
    const { blocks, editor } = editorWith([['numberedListItem', ''], ['numberedListItem', 'Second'], ['paragraph', 'Notes']], { currentIndex: 2 })
    select(blocks[0].input, 0)
    pressSlash(blocks[0].input)
    assert.deepEqual(tools(blocks), ['paragraph', 'numberedListItem', 'paragraph'])
    assert.deepEqual(texts(blocks), ['/', 'Second', 'Notes'])
    assert.equal(editor.menuFor, blocks[0])
  })

  it('places the caret itself when Editor.js leaves it where it was', () => {
    const { blocks, editor } = editorWith([['bulletListItem', 'One'], ['bulletListItem', '']], { currentIndex: 1, caretMoves: false })
    select(blocks[1].input, 0)
    pressSlash(blocks[1].input)
    type('c')
    assert.deepEqual(texts(blocks), ['One', '/c'])
    assert.equal(editor.menuFor, blocks[1])
  })
})
