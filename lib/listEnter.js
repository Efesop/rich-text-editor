/**
 * Enter in a bullet, numbered or checklist item that has text.
 *
 * The HTML after the caret moves into a new item below, and the caret moves
 * into that item before the keydown handler returns. It used to move 50 ms
 * later, so anything typed in between landed in the item Enter was pressed
 * in. Editor.js puts the new block in the page as soon as blocks.insert
 * returns, so there is nothing to wait for.
 *
 * Plain DOM calls on the elements it is given, so it also runs under jsdom
 * in tests.
 */

function rangeHtml (doc, range) {
  const holder = doc.createElement('div')
  holder.appendChild(range.cloneContents())
  return holder.innerHTML
}

/**
 * The HTML before and after the caret in an item's editable element, with
 * inline formatting kept on both sides. Selected text is dropped, and with
 * no caret in the element everything counts as before it.
 *
 * @param {HTMLElement} input
 * @returns {{before: string, after: string}}
 */
export function splitAtCaret (input) {
  const doc = input.ownerDocument
  const selection = doc.defaultView.getSelection()
  const caret = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!caret || !input.contains(caret.startContainer) || !input.contains(caret.endContainer)) {
    return { before: input.innerHTML, after: '' }
  }
  const before = doc.createRange()
  before.selectNodeContents(input)
  before.setEnd(caret.startContainer, caret.startOffset)
  const after = doc.createRange()
  after.selectNodeContents(input)
  after.setStart(caret.endContainer, caret.endOffset)
  return { before: rangeHtml(doc, before), after: rangeHtml(doc, after) }
}

/**
 * Put the caret at the start of the list item at `index`, placing it by hand
 * when Editor.js leaves it anywhere else.
 *
 * @param {object} api - the Editor.js API a tool receives
 * @param {number} index
 */
export function caretToItemStart (api, index) {
  api.caret.setToBlock(index, 'start')
  const input = api.blocks.getBlockByIndex(index)?.holder?.querySelector('[contenteditable="true"]')
  if (!input) return
  const doc = input.ownerDocument
  const selection = doc.defaultView.getSelection()
  if (doc.activeElement === input && selection.rangeCount && input.contains(selection.anchorNode)) return
  input.focus()
  const range = doc.createRange()
  range.selectNodeContents(input)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Split a list item at the caret: the HTML after it goes into a new item
 * below, and the caret moves to the start of that item now.
 *
 * @param {object} options
 * @param {object} options.api - the Editor.js API the tool received
 * @param {object} [options.block] - the tool's BlockAPI, to find where the item is
 * @param {HTMLElement} options.input - the item's editable element
 * @param {string} options.tool - the new item's tool name
 * @param {(html: string) => object} options.dataFor - the new item's data, from the cleaned HTML after the caret
 * @param {(html: string) => string} [options.clean] - cleans HTML before it goes into an item
 * @returns {string} the cleaned HTML left in the item
 */
export function splitListItem ({ api, block, input, tool, dataFor, clean = (html) => html }) {
  const { before, after } = splitAtCaret(input)
  const text = clean(before)
  input.innerHTML = text
  const index = (block?.id ? api.blocks.getBlockIndex(block.id) : undefined) ?? api.blocks.getCurrentBlockIndex()
  api.blocks.insert(tool, dataFor(clean(after)), {}, index + 1, true)
  caretToItemStart(api, index + 1)
  return text
}
