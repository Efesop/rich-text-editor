/**
 * '/' in an empty bullet, numbered or checklist item.
 *
 * The item becomes an empty paragraph with '/' in it, and the block menu
 * opens, as Editor.js does for '/' in an empty paragraph. All of it happens
 * before the keydown handler returns. It used to wait 50 ms and then type the
 * '/' without opening the menu, and a key typed in between landed in the
 * paragraph ahead of the '/'.
 *
 * Plain DOM calls on the elements it is given, so it also runs under jsdom
 * in tests.
 */

import { caretToItemStart } from './listEnter.js'

/**
 * Type '/' at the caret in an editable element.
 *
 * @param {HTMLElement} input
 */
function typeSlash (input) {
  const doc = input.ownerDocument
  if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, '/')) return
  const selection = doc.defaultView.getSelection()
  if (!selection?.rangeCount || !input.contains(selection.anchorNode)) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const slash = doc.createTextNode('/')
  range.insertNode(slash)
  range.setStartAfter(slash)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Turn an empty list item into a paragraph with '/' in it and open the block
 * menu, from the item's '/' keydown.
 *
 * @param {object} options
 * @param {object} options.api - the Editor.js API the tool received
 * @param {object} [options.block] - the tool's BlockAPI, to find where the item is
 * @param {KeyboardEvent} options.event - the '/' keydown
 * @returns {number} the paragraph's index
 */
export function slashInEmptyItem ({ api, block, event }) {
  // The keydown stops here. Editor.js's keydown handler for the item runs
  // after the tool's, and would close the menu this opens.
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const index = (block?.id ? api.blocks.getBlockIndex(block.id) : undefined) ?? api.blocks.getCurrentBlockIndex()
  api.blocks.insert('paragraph', { text: '' }, {}, index + 1, true)
  api.blocks.delete(index)
  caretToItemStart(api, index)
  const input = api.blocks.getBlockByIndex(index)?.holder?.querySelector('[contenteditable="true"]')
  if (input) typeSlash(input)
  // Editor.js opens the menu itself for '/' in an empty paragraph, but it
  // only listens for keys on a new block once the browser is idle
  api.toolbar.toggleToolbox(true)
  return index
}
