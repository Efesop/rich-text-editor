/**
 * Pasted HTML lists to list blocks, keeping nesting as indent.
 *
 * Editor.js hands BulletListItem.onPaste the pasted <ul>, <ol> or <li>,
 * already cleaned down to list tags, inline formatting, checkbox inputs and
 * aria-checked. This walks it with plain DOM calls, so it also runs under
 * jsdom in tests.
 */

import { MAX_LIST_INDENT, withIndent } from './listIndent.js'

const isList = (element) => element?.tagName === 'UL' || element?.tagName === 'OL'

function hasVisibleText (html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;| /g, ' ').trim() !== ''
}

/**
 * @param {Element} element - the pasted <ul>, <ol> or <li>
 * @param {(html: string) => string} [cleanHtml] - cleans one item's inline HTML
 * @returns {Array<{tool: string, data: object}>} blocks in document order
 */
export function listBlocksFromPaste (element, cleanHtml = (html) => html) {
  const blocks = []

  const readList = (list, indent) => {
    const ordered = list.tagName === 'OL'
    let previousItemKept = false
    for (const child of Array.from(list.children)) {
      if (child.tagName === 'LI') {
        previousItemKept = readItem(child, indent, ordered)
      } else if (isList(child)) {
        // A list straight inside a list (<ul><li>a</li><ul>…</ul></ul>), as
        // Evernote and older editors write it, belongs to the item before it.
        readList(child, previousItemKept ? indent + 1 : indent)
      }
    }
  }

  // Returns whether the item became a block.
  const readItem = (li, indent, ordered) => {
    const clone = li.cloneNode(true)
    // Sub-lists wherever they sit in the item, but not the lists inside them.
    const subLists = Array.from(clone.querySelectorAll('ul, ol'))
      .filter(list => !list.parentElement?.closest('ul, ol'))
    subLists.forEach(list => list.remove())

    const checkbox = clone.querySelector('input[type="checkbox"]')
    let checklist = Boolean(checkbox) || clone.hasAttribute('aria-checked')
    let checked = checkbox
      ? checkbox.checked || checkbox.hasAttribute('checked')
      : clone.getAttribute('aria-checked') === 'true'
    clone.querySelectorAll('input').forEach(input => input.remove())

    let html = clone.innerHTML.trim()
    // Checkboxes typed as text: [x], [X] or [ ] at the start
    if (!checklist) {
      const marker = html.match(/^\[([xX ])\]\s*/)
      if (marker) {
        checklist = true
        checked = marker[1] !== ' '
        html = html.slice(marker[0].length)
      }
    }

    const text = cleanHtml(html)
    const kept = hasVisibleText(text)
    if (kept) {
      const tool = checklist ? 'checklistItem' : ordered ? 'numberedListItem' : 'bulletListItem'
      const data = checklist ? { text, checked } : { text }
      blocks.push({ tool, data: withIndent(data, Math.min(indent, MAX_LIST_INDENT)) })
    }
    // An item with no text of its own doesn't add a level for its sub-items.
    for (const list of subLists) readList(list, kept ? indent + 1 : indent)
    return kept
  }

  if (isList(element)) readList(element, 0)
  else if (element?.tagName === 'LI') readItem(element, 0, element.parentElement?.tagName === 'OL')
  return blocks
}
