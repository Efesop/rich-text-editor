/**
 * Keys an input method is using stay with it: a list item doesn't act on the
 * Enter that confirms a Japanese, Chinese or Korean composition, or the
 * Backspace that edits one, in Chrome's order or in Safari's, where the
 * confirming Enter's keydown comes after compositionend.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { isComposingKey } from '../lib/listComposition.js'
import { splitListItem } from '../lib/listEnter.js'

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

function caretAtStart (input) {
  const selection = window.getSelection()
  if (!selection.rangeCount || !input.contains(selection.anchorNode)) return false
  const before = document.createRange()
  before.selectNodeContents(input)
  before.setEnd(selection.anchorNode, selection.anchorOffset)
  return before.toString() === ''
}

// List items in an editor, with the parts of the Editor.js API the list
// tools use for Enter and Backspace. Each item's editable element gets the
// start of the tools' keydown handler: keys an input method is using are
// left alone, Enter splits the item (lib/listEnter.js), and Backspace at the
// start of an item removes it.
function editorWith (texts) {
  document.body.innerHTML = '<div class="codex-editor__redactor"></div>'
  const redactor = document.body.firstChild
  const blocks = []
  let current = 0
  let nextId = 1

  const make = (text) => {
    const holder = document.createElement('div')
    holder.className = 'ce-block'
    const input = document.createElement('div')
    input.setAttribute('contenteditable', 'true')
    input.textContent = text
    holder.appendChild(input)
    const block = { id: `block-${nextId++}`, holder, input }
    input.addEventListener('keydown', (event) => {
      if (isComposingKey(event)) return
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        splitListItem({ api, block, input, tool: 'bulletListItem', dataFor: (html) => ({ text: html }) })
      }
      if (event.key === 'Backspace' && caretAtStart(input)) {
        event.preventDefault()
        api.blocks.delete(api.blocks.getBlockIndex(block.id))
      }
    })
    return block
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
        const block = make('')
        block.input.innerHTML = data.text
        redactor.insertBefore(block.holder, blocks[index]?.holder || null)
        blocks.splice(index, 0, block)
        if (needToFocus) current = index
        return block
      },
      delete: (index) => {
        const [block] = blocks.splice(index, 1)
        block.holder.remove()
      }
    },
    caret: {
      setToBlock: (index) => select(blocks[index].input, 0)
    }
  }

  for (const text of texts) {
    const block = make(text)
    blocks.push(block)
    redactor.appendChild(block.holder)
  }
  return { blocks }
}

// A keydown as a browser sends it. jsdom leaves keyCode at 0, and input
// methods send 229.
function keydown (target, { keyCode, ...init }) {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'keyCode', { value: keyCode })
  target.dispatchEvent(event)
  return event
}

const texts = (blocks) => blocks.map(block => block.input.textContent)

describe('list items and input method keys', () => {
  it('Chrome: the Enter that confirms a composition leaves the item whole', () => {
    // The composed text is in the item when the input method's Enter arrives
    const { blocks } = editorWith(['Milkにほん'])
    select(blocks[0].input.firstChild, 7)
    const event = keydown(blocks[0].input, { key: 'Enter', keyCode: 229, isComposing: true })
    assert.deepEqual(texts(blocks), ['Milkにほん'])
    assert.equal(event.defaultPrevented, false)
  })

  it('an input method that sends the confirming Enter as keyCode 13 leaves the item whole', () => {
    const { blocks } = editorWith(['Milkにほん'])
    select(blocks[0].input.firstChild, 7)
    keydown(blocks[0].input, { key: 'Enter', keyCode: 13, isComposing: true })
    assert.deepEqual(texts(blocks), ['Milkにほん'])
  })

  it('Safari: the confirming Enter that arrives after compositionend leaves the item whole', () => {
    const { blocks } = editorWith(['Milkにほん'])
    select(blocks[0].input.firstChild, 7)
    keydown(blocks[0].input, { key: 'Enter', keyCode: 229, isComposing: false })
    assert.deepEqual(texts(blocks), ['Milkにほん'])
  })

  it('Backspace editing a composition at the start of an item leaves the item', () => {
    const { blocks } = editorWith(['Milk', 'にほん'])
    select(blocks[1].input.firstChild, 0)
    keydown(blocks[1].input, { key: 'Backspace', keyCode: 229, isComposing: true })
    assert.deepEqual(texts(blocks), ['Milk', 'にほん'])
  })

  it('once the composition is confirmed, Enter splits the item and Backspace removes an empty one', () => {
    const { blocks } = editorWith(['Milkにほん', 'Eggs'])
    select(blocks[0].input.firstChild, 4)
    keydown(blocks[0].input, { key: 'Enter', keyCode: 13, isComposing: false })
    assert.deepEqual(texts(blocks), ['Milk', 'にほん', 'Eggs'])
    blocks[1].input.textContent = ''
    select(blocks[1].input, 0)
    keydown(blocks[1].input, { key: 'Backspace', keyCode: 8, isComposing: false })
    assert.deepEqual(texts(blocks), ['Milk', 'Eggs'])
  })
})

describe('isComposingKey', () => {
  it('is true for a keydown marked isComposing or with keyCode 229, and false otherwise', () => {
    assert.equal(isComposingKey({ key: 'Enter', keyCode: 229, isComposing: true }), true)
    assert.equal(isComposingKey({ key: 'Enter', keyCode: 13, isComposing: true }), true)
    assert.equal(isComposingKey({ key: 'Enter', keyCode: 229, isComposing: false }), true)
    assert.equal(isComposingKey({ key: 'Enter', keyCode: 13, isComposing: false }), false)
    assert.equal(isComposingKey({ key: 'Backspace', keyCode: 8 }), false)
    assert.equal(isComposingKey(null), false)
  })
})
