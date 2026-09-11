/**
 * Nested lists in the editor: the DOM half of lib/listIndent.js.
 *
 * - Tab and Shift+Tab nest list items, at the caret or across a block
 *   selection, before Editor.js turns Tab into moving to the next block.
 * - Indent and Outdent in a list item's block menu, the way to nest on a phone.
 * - renumberLists labels numbered items and writes only labels that changed.
 *   Every write is a DOM mutation Editor.js reports as an edit, so rewriting
 *   every label on every change kept change events coming.
 * - Converting an item to another block type keeps its indent.
 */

import {
  clampListIndent,
  formatListNumber,
  isListItemType,
  numberListItems,
  planIndentChange,
  withIndent
} from '../../lib/listIndent.js'

const ITEM_CLASSES = {
  bulletListItem: 'dash-bullet-item',
  numberedListItem: 'dash-numbered-item',
  checklistItem: 'dash-checklist-item'
}
const ITEM_SELECTOR = Object.values(ITEM_CLASSES).map(name => `.${name}`).join(', ')

const INDENT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7h8M12 12h8M4 17h16"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7l3.5 2.5L4 12"/></svg>'
const OUTDENT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7h8M12 12h8M4 17h16"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.5 7L4 9.5 7.5 12"/></svg>'

function itemType (element) {
  for (const [type, name] of Object.entries(ITEM_CLASSES)) {
    if (element.classList.contains(name)) return type
  }
  return null
}

function readIndent (element) {
  return element ? clampListIndent(Number(element.dataset.indent || 0)) : 0
}

/** Show `indent` on a list item's root element, touching the DOM only when it changes. */
export function applyIndent (element, indent) {
  if (!element) return
  const level = clampListIndent(indent)
  if (level > 0) {
    if (element.dataset.indent !== String(level)) element.dataset.indent = String(level)
  } else if (element.dataset.indent !== undefined) {
    delete element.dataset.indent
  }
}

// The note's blocks as { type, data: { indent } }, read from the editor.
function readBlocks (api) {
  const blocks = []
  const count = api.blocks.getBlocksCount()
  for (let i = 0; i < count; i++) {
    const block = api.blocks.getBlockByIndex(i)
    const type = block?.name
    const element = isListItemType(type) ? block.holder?.querySelector(ITEM_SELECTOR) : null
    blocks.push({ type, data: { indent: readIndent(element) } })
  }
  return blocks
}

/**
 * Indent (1) or outdent (-1) the list items at `indices`, with their
 * sub-items. Returns whether anything moved.
 *
 * @param {object} api - the Editor.js instance, or the API a tool receives
 * @param {number[]} indices
 * @param {1|-1} direction
 */
export function changeListIndent (api, indices, direction) {
  const changes = planIndentChange(readBlocks(api), indices, direction)
  for (const { index, to } of changes) {
    api.blocks.getBlockByIndex(index)?.call('setIndent', to)
  }
  if (changes.length) renumberLists()
  return changes.length > 0
}

/** Label the numbered items in every editor on the page, writing only labels that changed. */
export function renumberLists () {
  if (typeof document === 'undefined') return
  for (const redactor of document.querySelectorAll('.codex-editor__redactor')) {
    const elements = []
    const blocks = []
    for (const blockEl of redactor.children) {
      if (!blockEl.classList.contains('ce-block')) continue
      const element = blockEl.querySelector(ITEM_SELECTOR)
      elements.push(element)
      blocks.push({ type: element ? itemType(element) : null, data: { indent: readIndent(element) } })
    }
    numberListItems(blocks).forEach((number, i) => {
      if (number === null) return
      const label = formatListNumber(number, blocks[i].data.indent)
      if (elements[i].dataset.number !== label) elements[i].dataset.number = label
    })
  }
}

/**
 * Tab and Shift+Tab on list items. Listens on window in the capture phase,
 * because Editor.js listens on document in the capture phase too and would
 * move the caret to the next block first.
 *
 * @param {object} editor - the Editor.js instance
 * @param {HTMLElement} holder - the element the editor renders into
 * @returns {() => void} detach
 */
export function attachListIndentKeys (editor, holder) {
  if (!editor || !holder || typeof window === 'undefined') return () => {}

  const onKeyDown = (event) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
    if (!holder.isConnected || editor.readOnly?.isEnabled) return
    // An open menu, toolbar or page-link picker uses Tab for its own items.
    if (document.querySelector('.ce-popover--opened, #page-link-dropdown')) return

    const target = event.target instanceof Element ? event.target : null
    const inEditor = Boolean(target && holder.contains(target))
    // A field outside the editor, such as the title, keeps its own Tab.
    if (!inEditor && target?.closest('input, textarea, select, [contenteditable="true"]')) return

    const blockEls = Array.from(holder.querySelectorAll('.ce-block'))
    let indices = blockEls.flatMap((el, i) => el.classList.contains('ce-block--selected') ? [i] : [])
    if (indices.length === 0 && inEditor) {
      const blockEl = target.closest('.ce-block')
      if (blockEl) indices = [blockEls.indexOf(blockEl)]
    }
    if (indices.length === 0) return

    let blocks
    try {
      blocks = readBlocks(editor)
    } catch {
      return
    }
    if (!indices.some(i => isListItemType(blocks[i]?.type))) return

    event.preventDefault()
    event.stopPropagation()
    changeListIndent(editor, indices, event.shiftKey ? -1 : 1)
  }

  window.addEventListener('keydown', onKeyDown, true)
  return () => window.removeEventListener('keydown', onKeyDown, true)
}

/**
 * Indent and Outdent entries for a list item's block menu.
 *
 * @param {object} api - the API the tool received
 * @param {object} block - the tool's BlockAPI
 * @param {number} indent - the item's indent now
 */
export function listIndentMenu (api, block, indent) {
  const indexNow = () => (block?.id ? api.blocks.getBlockIndex(block.id) : undefined) ?? api.blocks.getCurrentBlockIndex()
  const canIndent = planIndentChange(readBlocks(api), [indexNow()], 1).length > 0
  return [
    {
      icon: INDENT_ICON,
      label: 'Indent',
      isDisabled: !canIndent,
      closeOnActivate: true,
      onActivate: () => changeListIndent(api, [indexNow()], 1)
    },
    {
      icon: OUTDENT_ICON,
      label: 'Outdent',
      isDisabled: clampListIndent(indent) === 0,
      closeOnActivate: true,
      onActivate: () => changeListIndent(api, [indexNow()], -1)
    }
  ]
}

// Editor.js converts a block through plain text: the old tool's
// conversionConfig.export, then the new tool's import. The item's indent would
// be lost on the way, so export parks it and import collects it. Both run
// inside one conversion; the time limit only stops a parked level reaching a
// later, unrelated conversion.
let parkedIndent = null

/** conversionConfig for a list tool. `dataFor` builds the tool's data from text. */
export function listConversionConfig (dataFor) {
  return {
    export: (data) => {
      parkedIndent = { level: clampListIndent(data?.indent), at: Date.now() }
      return data?.text || ''
    },
    import: (text) => {
      const parked = parkedIndent
      parkedIndent = null
      const level = parked && Date.now() - parked.at < 1000 ? parked.level : 0
      return withIndent(dataFor(text), level)
    }
  }
}

// utils/pasteQueue.js renumbers through this after a paste.
if (typeof window !== 'undefined') {
  window._renumberListItems = renumberLists
}
