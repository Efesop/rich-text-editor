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
 * @param {Array} items - Items to insert. Each can be:
 *   - a string (text for the block)
 *   - {text, checked} for checklist items
 *   - {tool, data} for mixed-tool mode (each item specifies its own tool)
 * @param {string|null} tool - tool name, or null if items use mixed-tool format
 * @param {boolean} replaceFirst - if true, replace the source block with the first item
 */
export function queuePasteItems(api, toolInstance, items, tool, replaceFirst = false) {
  _queue.push({ api, toolInstance, items, tool, replaceFirst })
  clearTimeout(_timer)
  _timer = setTimeout(flushQueue, 200)
}

function resolveItem(item, defaultTool) {
  // Mixed-tool format: {tool, data}
  if (item && typeof item === 'object' && item.tool && item.data) {
    return { tool: item.tool, data: item.data }
  }
  // Object data (e.g. {text, checked})
  if (item && typeof item === 'object') {
    return { tool: defaultTool, data: item }
  }
  // Plain string
  return { tool: defaultTool, data: { text: item } }
}

function flushQueue() {
  let inserted = 0

  for (const entry of _queue) {
    // Read _element NOW (after render() has been called)
    // ChecklistItem uses _wrapper, BulletListItem/NumberedListItem use _element
    const element = entry.toolInstance._wrapper || entry.toolInstance._element
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

    if (entry.replaceFirst && entry.items.length > 0) {
      const first = resolveItem(entry.items[0], entry.tool)
      entry.api.insert(first.tool, first.data, {}, idx + 1, true)
      entry.api.delete(idx)
      for (let i = 1; i < entry.items.length; i++) {
        const resolved = resolveItem(entry.items[i], entry.tool)
        entry.api.insert(resolved.tool, resolved.data, {}, idx + i, true)
        inserted++
      }
      inserted++
      continue
    }

    for (let i = 0; i < entry.items.length; i++) {
      const resolved = resolveItem(entry.items[i], entry.tool)
      entry.api.insert(resolved.tool, resolved.data, {}, idx + 1 + i, true)
      inserted++
    }
  }

  _queue = []

  if (inserted > 0 && typeof window !== 'undefined' && window._renumberListItems) {
    window._renumberListItems()
  }
}
