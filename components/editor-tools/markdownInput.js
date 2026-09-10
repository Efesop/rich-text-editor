import { matchBlockShortcut, matchInlineShortcut } from '@/lib/markdownShortcuts'

// Runtime half of the markdown input shortcuts. The matching itself is pure
// and lives in lib/markdownShortcuts.js; this file only does DOM and the
// Editor.js API.
//
// Conversion is insert-then-delete rather than api.blocks.convert(), because
// convert() round-trips through conversionConfig, which is plain-text only and
// would drop any formatting already in the line. ChecklistItem's Enter handler
// uses the same insert/delete pattern.

// Where each tool keeps its text, and which blocks a trigger may fire from.
const TEXT_KEY = {
  paragraph: 'text',
  header: 'text',
  quote: 'text',
  bulletListItem: 'text',
  numberedListItem: 'text',
  checklistItem: 'text',
  callout: 'text',
  toggle: 'summary',
  code: 'code',
  delimiter: null
}

const SOURCE_TYPES = new Set(['paragraph', 'quote'])

/** Walk text nodes to build a Range spanning [start, end) character offsets. */
function rangeForOffsets (root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const range = document.createRange()
  let offset = 0
  let startDone = false
  let node

  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length
    if (!startDone && offset + len >= start) {
      range.setStart(node, start - offset)
      startDone = true
    }
    if (startDone && offset + len >= end) {
      range.setEnd(node, end - offset)
      return range
    }
    offset += len
  }

  if (!startDone) return null
  range.setEnd(root, root.childNodes.length)
  return range
}

/** Plain-text offset of the caret within `root`. */
function caretOffset (root) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return -1
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return -1
  const pre = document.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

function placeCaretAtEnd (el) {
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * @param {object} editor - the Editor.js instance
 * @param {HTMLElement} holder - the editor's holder element
 * @returns {() => void} detach
 */
export function attachMarkdownShortcuts (editor, holder) {
  if (!editor || !holder) return () => {}

  let composing = false
  let busy = false
  const onCompositionStart = () => { composing = true }
  const onCompositionEnd = () => { composing = false }

  // Characters that can complete a block trigger. Handling these on keydown
  // (rather than after the character lands) lets us preventDefault, so nothing
  // else is typed into a block that is about to be replaced.
  const COMPLETING = new Set([' ', '`', '-', '*', '_'])

  const editableFor = (event) => {
    const el = event.target
    if (!el || !el.isContentEditable) return null
    // Never rewrite what someone is typing into a code block.
    if (el.closest('.dash-code-block, .ce-code, pre')) return null
    return el
  }

  const onKeyDown = (event) => {
    if (composing || event.isComposing || busy) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (!COMPLETING.has(event.key)) return

    const el = editableFor(event)
    if (!el) return
    const blockEl = el.closest('.ce-block')
    if (!blockEl) return

    const offset = caretOffset(el)
    if (offset < 0) return

    // What the line would say once this character lands.
    const text = el.textContent || ''
    const prospective = text.slice(0, offset) + event.key + text.slice(offset)
    const match = matchBlockShortcut(prospective)
    if (!match || match.consume !== offset + 1) return

    // The completing character never lands, so strip one less than it ate.
    if (tryBlockShortcut(el, blockEl, match, match.consume - 1)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const onInput = (event) => {
    if (composing || event.isComposing || busy) return
    const el = editableFor(event)
    if (!el) return
    const offset = caretOffset(el)
    if (offset < 0) return
    tryInlineShortcut(el, offset)
  }

  function tryBlockShortcut (el, blockEl, match, stripCount) {
    const index = Array.prototype.indexOf.call(holder.querySelectorAll('.ce-block'), blockEl)
    if (index < 0) return false

    // Ask the API rather than sniffing the DOM — Editor.js puts no type
    // attribute on .ce-block. Only fire from a plain paragraph or a quote; a
    // quote is what you get after typing "> ", which is how "> [!info] "
    // reaches the callout rule.
    let currentType
    try {
      currentType = editor.blocks.getBlockByIndex(index)?.name
    } catch {
      return false
    }
    if (!SOURCE_TYPES.has(currentType)) return false

    const targetKey = TEXT_KEY[match.tool]
    if (targetKey === undefined) return false

    // Strip the trigger characters, keeping any formatting in the rest.
    if (stripCount > 0) {
      const stripRange = rangeForOffsets(el, 0, stripCount)
      if (stripRange) stripRange.deleteContents()
    }
    const remainder = el.innerHTML

    const data = { ...match.data }
    if (targetKey) data[targetKey] = remainder

    // Async, but the DOM edit above already happened so there is no flicker.
    busy = true
    Promise.resolve()
      .then(() => editor.blocks.insert(match.tool, data, {}, index + 1, true))
      .then(() => editor.blocks.delete(index))
      .then(() => {
        const blocks = holder.querySelectorAll('.ce-block')
        const target = blocks[index]?.querySelector('[contenteditable="true"]')
        if (target) placeCaretAtEnd(target)
      })
      .catch(() => { /* a failed conversion just leaves the text as typed */ })
      .finally(() => { busy = false })

    return true
  }

  function tryInlineShortcut (el, offset) {
    const before = (el.textContent || '').slice(0, offset)
    const match = matchInlineShortcut(before)
    if (!match) return

    const range = rangeForOffsets(el, match.start, match.end)
    if (!range) return

    const wrapper = document.createElement(match.tag)
    if (match.className) wrapper.className = match.className
    wrapper.textContent = match.content

    busy = true
    try {
      range.deleteContents()
      range.insertNode(wrapper)

      // Drop the caret immediately after the wrapper so the next character
      // typed is not bold as well. No filler character — a zero-width space
      // would end up in the saved HTML and in exports.
      const caret = document.createRange()
      caret.setStartAfter(wrapper)
      caret.collapse(true)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(caret)
    } finally {
      busy = false
    }
  }

  holder.addEventListener('keydown', onKeyDown, true)
  holder.addEventListener('input', onInput, true)
  holder.addEventListener('compositionstart', onCompositionStart, true)
  holder.addEventListener('compositionend', onCompositionEnd, true)

  return () => {
    holder.removeEventListener('keydown', onKeyDown, true)
    holder.removeEventListener('input', onInput, true)
    holder.removeEventListener('compositionstart', onCompositionStart, true)
    holder.removeEventListener('compositionend', onCompositionEnd, true)
  }
}
