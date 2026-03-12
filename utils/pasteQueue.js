/**
 * Deferred paste queue for Editor.js list tools.
 *
 * When pasting a <ul> or <ol> with multiple <li> items, Editor.js calls
 * onPaste once per list element. If we insert extra blocks immediately
 * during onPaste, Editor.js is still creating blocks from the rest of
 * the clipboard HTML, causing ordering conflicts.
 *
 * Instead, tools push their extra items here and we flush them all
 * in one batch after Editor.js finishes paste processing.
 */

let _queue = []
let _timer = null

/**
 * Queue extra list items to be inserted after paste completes.
 *
 * @param {object} api - Editor.js blocks API
 * @param {object} toolInstance - the tool instance (we read ._element at flush time)
 * @param {string[]} items - HTML strings for each additional list item
 * @param {string} tool - tool name ('bulletListItem' or 'numberedListItem')
 */
export function queuePasteItems(api, toolInstance, items, tool) {
  _queue.push({ api, toolInstance, items, tool })
  clearTimeout(_timer)
  _timer = setTimeout(flushQueue, 200)
}

function flushQueue() {
  let inserted = 0

  for (const entry of _queue) {
    // Read _element NOW (after render() has been called)
    const element = entry.toolInstance._element
    if (!element) continue

    const allBlocks = document.querySelectorAll('.ce-block')
    let idx = -1
    for (let i = 0; i < allBlocks.length; i++) {
      if (allBlocks[i].contains(element)) {
        idx = i
        break
      }
    }
    if (idx === -1) continue

    for (let i = 0; i < entry.items.length; i++) {
      entry.api.insert(entry.tool, { text: entry.items[i] }, {}, idx + 1 + i, true)
      inserted++
    }
  }

  _queue = []

  if (inserted > 0 && typeof window !== 'undefined' && window._renumberListItems) {
    window._renumberListItems()
  }
}
