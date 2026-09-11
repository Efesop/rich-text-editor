/**
 * Nested lists — the pure half.
 *
 * Bullet, numbered and checklist items are separate Editor.js blocks. Nesting
 * is an `indent` level on each item's data: 0 is the top level and is never
 * stored, so an unindented item saves exactly as it did before nesting
 * existed. Apps from 1.6.8 and earlier don't know `indent` and drop it when
 * they save a note.
 *
 * DOM-free so it runs under `node --test`. The editor, the share page,
 * version history and every exporter number and nest lists through these
 * helpers, so they can't disagree about what a list looks like.
 */

// Matches Word and Google Docs. Hard to raise later: older copies of these
// helpers clamp anything deeper back to this.
export const MAX_LIST_INDENT = 8

export const LIST_ITEM_TYPES = Object.freeze(['bulletListItem', 'numberedListItem', 'checklistItem'])

export function isListItemType (type) {
  return LIST_ITEM_TYPES.includes(type)
}

/** A stored indent as a whole level from 0 to MAX_LIST_INDENT. Anything that isn't a number is 0. */
export function clampListIndent (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(MAX_LIST_INDENT, Math.max(0, Math.trunc(value)))
}

/** The indent of a saved block: 0 for anything that isn't a list item. */
export function listIndentOf (block) {
  return isListItemType(block?.type) ? clampListIndent(block.data?.indent) : 0
}

/**
 * `data` with its indent set. Level 0 leaves `indent` out and any other level
 * goes last, so saved JSON keeps one key order.
 */
export function withIndent (data, indent) {
  const rest = { ...data }
  delete rest.indent
  const level = clampListIndent(indent)
  return level > 0 ? { ...rest, indent: level } : rest
}

/**
 * The number each numbered item shows, or null for any other block.
 *
 * Counting runs per level. Items nested deeper never interrupt their parent's
 * count; a bullet or checklist item at the same level restarts it; coming back
 * up a level restarts every deeper count; and any block that isn't a list item
 * ends the list.
 *
 * @param {Array<{type: string, data?: object}>} blocks
 * @returns {Array<number|null>}
 */
export function numberListItems (blocks) {
  const numbers = []
  // counts[level] is the last number used at that level, or null when the
  // latest item there wasn't numbered.
  let counts = []
  for (const block of blocks || []) {
    if (!isListItemType(block?.type)) {
      counts = []
      numbers.push(null)
      continue
    }
    const level = listIndentOf(block)
    if (counts.length > level + 1) counts.length = level + 1
    if (block.type === 'numberedListItem') {
      counts[level] = (counts[level] || 0) + 1
      numbers.push(counts[level])
    } else {
      counts[level] = null
      numbers.push(null)
    }
  }
  return numbers
}

const NUMBER_STYLES = ['decimal', 'lower-alpha', 'lower-roman']

/** The counter style numbered items use at an indent: 1, a, i, then round again. */
export function listNumberStyle (indent) {
  return NUMBER_STYLES[clampListIndent(indent) % NUMBER_STYLES.length]
}

/** A numbered item's label without its dot: "3", "c" or "iii". */
export function formatListNumber (number, indent) {
  const style = listNumberStyle(indent)
  if (style === 'lower-alpha') return toAlpha(number)
  if (style === 'lower-roman') return toRoman(number)
  return String(number)
}

// Like CSS lower-alpha: z is followed by aa.
function toAlpha (number) {
  let n = number
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(97 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label || String(number)
}

const ROMAN_NUMERALS = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
]

// Like CSS lower-roman, which falls back to digits past 3999.
function toRoman (number) {
  if (number < 1 || number > 3999) return String(number)
  let n = number
  let label = ''
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (n >= value) {
      label += numeral
      n -= value
    }
  }
  return label
}

/** The index just past the run of list blocks that starts at `start`. */
export function listRunEnd (blocks, start) {
  let end = start
  while (end < blocks.length && isListItemType(blocks[end]?.type)) end++
  return end
}

/**
 * Nest consecutive list blocks into a tree, for output that has to nest
 * (HTML, DOCX, Markdown).
 *
 * An item's parent is the nearest earlier item with a smaller indent, so a
 * jump of several levels nests one level down instead of inventing empty
 * items; the stored indents aren't touched. Siblings split into separate
 * lists wherever the block type or the stored indent changes. Those are the
 * boundaries numberListItems counts across, so an HTML <ol> built from this
 * numbers exactly as the editor does.
 *
 * @param {Array<{type: string, data?: object}>} items - consecutive list blocks
 * @returns {ListGroup[]} the top-level lists
 *
 * @typedef {{ type: string, indent: number, items: ListNode[] }} ListGroup
 * @typedef {{ block: object, index: number, children: ListGroup[] }} ListNode
 */
export function nestListItems (items) {
  const top = []
  const open = []
  const list = items || []
  for (let index = 0; index < list.length; index++) {
    const block = list[index]
    const indent = listIndentOf(block)
    while (open.length && open[open.length - 1].indent >= indent) open.pop()
    const siblings = open.length ? open[open.length - 1].node.children : top
    const node = { block, index, children: [] }
    const group = siblings[siblings.length - 1]
    if (group && group.type === block.type && group.indent === indent) {
      group.items.push(node)
    } else {
      siblings.push({ type: block.type, indent, items: [node] })
    }
    open.push({ indent, node })
  }
  return top
}

/**
 * Plan Tab (direction 1) or Shift+Tab (direction -1) on the list items at
 * `indices`.
 *
 * - An item takes its sub-items with it: the list items straight after it
 *   with a deeper indent.
 * - Indenting never puts an item more than one level below the list item
 *   above it, or anything in its subtree past MAX_LIST_INDENT. A subtree that
 *   can't move stays put.
 * - Outdenting stops at the top level.
 * - Items are planned top to bottom, each against the new indent of the item
 *   above it. Nothing else changes, including stored jumps elsewhere.
 *
 * @param {Array<{type: string, data?: object}>} blocks
 * @param {number[]} indices
 * @param {1|-1} direction
 * @returns {Array<{index: number, from: number, to: number}>} in document order; empty when nothing can move
 */
export function planIndentChange (blocks, indices, direction) {
  if (!Array.isArray(blocks) || !Array.isArray(indices) || (direction !== 1 && direction !== -1)) return []
  const levels = blocks.map(listIndentOf)
  const next = levels.slice()
  const roots = [...new Set(indices)]
    .filter(i => Number.isInteger(i) && i >= 0 && i < blocks.length && isListItemType(blocks[i]?.type))
    .sort((a, b) => a - b)

  let coveredUntil = -1
  for (const root of roots) {
    if (root <= coveredUntil) continue
    let end = root
    while (end + 1 < blocks.length && isListItemType(blocks[end + 1]?.type) && levels[end + 1] > levels[root]) end++
    coveredUntil = end

    if (direction === 1) {
      const above = root - 1
      if (above < 0 || !isListItemType(blocks[above]?.type)) continue
      if (next[root] > next[above]) continue
      let fits = true
      for (let i = root; i <= end; i++) {
        if (next[i] + 1 > MAX_LIST_INDENT) { fits = false; break }
      }
      if (!fits) continue
      for (let i = root; i <= end; i++) next[i] += 1
    } else {
      if (next[root] === 0) continue
      for (let i = root; i <= end; i++) next[i] = Math.max(0, next[i] - 1)
    }
  }

  const changes = []
  for (let i = 0; i < blocks.length; i++) {
    if (next[i] !== levels[i]) changes.push({ index: i, from: levels[i], to: next[i] })
  }
  return changes
}
