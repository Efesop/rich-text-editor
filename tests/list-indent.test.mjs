/**
 * Nested lists: indent levels, numbering, nesting and Tab planning.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_LIST_INDENT,
  isListItemType,
  clampListIndent,
  listIndentOf,
  withIndent,
  numberListItems,
  listNumberStyle,
  formatListNumber,
  listRunEnd,
  nestListItems,
  planIndentChange
} from '../lib/listIndent.js'

const bullet = (indent) => ({ type: 'bulletListItem', data: withIndent({ text: 'b' }, indent) })
const numbered = (indent) => ({ type: 'numberedListItem', data: withIndent({ text: 'n' }, indent) })
const task = (indent) => ({ type: 'checklistItem', data: withIndent({ text: 't', checked: false }, indent) })
const para = () => ({ type: 'paragraph', data: { text: 'p' } })

// mulberry32, so the generated cases are the same on every run.
function seeded (seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const describeLevels = (blocks) => JSON.stringify(blocks.map(b => `${b.type[0]}${listIndentOf(b)}`))

describe('clampListIndent', () => {
  it('keeps whole levels from 0 to MAX_LIST_INDENT', () => {
    for (let level = 0; level <= MAX_LIST_INDENT; level++) assert.equal(clampListIndent(level), level)
  })

  it('clamps levels outside that range', () => {
    assert.equal(clampListIndent(-3), 0)
    assert.equal(clampListIndent(MAX_LIST_INDENT + 5), MAX_LIST_INDENT)
  })

  it('drops fractions', () => {
    assert.equal(clampListIndent(2.9), 2)
  })

  it('treats anything that is not a finite number as the top level', () => {
    for (const value of [undefined, null, '2', NaN, Infinity, {}, [1], true]) {
      assert.equal(clampListIndent(value), 0, String(value))
    }
  })
})

describe('withIndent', () => {
  it('leaves indent out at the top level, so unindented items save as they always have', () => {
    assert.deepEqual(withIndent({ text: 'a' }, 0), { text: 'a' })
    assert.equal('indent' in withIndent({ text: 'a', indent: 3 }, 0), false)
  })

  it('puts indent last, so saved JSON keeps one key order', () => {
    assert.equal(JSON.stringify(withIndent({ indent: 1, text: 'a', checked: true }, 2)), '{"text":"a","checked":true,"indent":2}')
  })

  it('clamps the level it stores', () => {
    assert.equal(withIndent({ text: 'a' }, 99).indent, MAX_LIST_INDENT)
  })

  it('leaves the object it was given alone', () => {
    const data = { text: 'a', indent: 1 }
    withIndent(data, 4)
    assert.deepEqual(data, { text: 'a', indent: 1 })
  })
})

describe('listIndentOf', () => {
  it('reads the indent of every list item type', () => {
    assert.deepEqual([bullet(2), numbered(3), task(4)].map(listIndentOf), [2, 3, 4])
  })

  it('is 0 for anything that is not a list item, whatever it carries', () => {
    assert.equal(listIndentOf({ type: 'paragraph', data: { indent: 3 } }), 0)
    assert.equal(listIndentOf(null), 0)
    assert.equal(listIndentOf({ type: 'bulletListItem' }), 0)
  })
})

describe('numberListItems', () => {
  it('counts a flat list from 1', () => {
    assert.deepEqual(numberListItems([numbered(0), numbered(0), numbered(0)]), [1, 2, 3])
  })

  it('restarts after a block that is not a list item', () => {
    assert.deepEqual(numberListItems([numbered(0), numbered(0), para(), numbered(0)]), [1, 2, null, 1])
  })

  it('restarts after a bullet or checklist item at the same level', () => {
    assert.deepEqual(numberListItems([numbered(0), bullet(0), numbered(0), task(0), numbered(0)]), [1, null, 1, null, 1])
  })

  it('keeps counting past items nested under it', () => {
    assert.deepEqual(numberListItems([numbered(0), bullet(1), task(1), numbered(0)]), [1, null, null, 2])
  })

  it('counts each level on its own', () => {
    assert.deepEqual(numberListItems([numbered(0), numbered(1), numbered(1), numbered(0), numbered(1)]), [1, 1, 2, 2, 1])
  })

  it('restarts deeper counts when the list comes back up a level', () => {
    assert.deepEqual(numberListItems([numbered(0), numbered(1), numbered(2), numbered(0), numbered(2)]), [1, 1, 1, 2, 1])
  })

  it('numbers items after a jump of several levels', () => {
    assert.deepEqual(numberListItems([numbered(0), numbered(3), numbered(3), numbered(0)]), [1, 1, 2, 2])
  })

  it('numbers every unindented list the way the editor did before nesting', () => {
    // NumberedListItem.renumberAll counted consecutive numbered blocks and
    // reset on anything else.
    const before = (blocks) => {
      let counter = 0
      return blocks.map(block => {
        if (block.type === 'numberedListItem') return ++counter
        counter = 0
        return null
      })
    }
    const random = seeded(7)
    const makers = [numbered, bullet, task, para]
    for (let run = 0; run < 200; run++) {
      const blocks = Array.from({ length: 12 }, () => makers[Math.floor(random() * makers.length)](0))
      assert.deepEqual(numberListItems(blocks), before(blocks), describeLevels(blocks))
    }
  })
})

describe('formatListNumber', () => {
  it('uses digits, then letters, then roman numerals, then digits again', () => {
    const labels = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(level => formatListNumber(4, level))
    assert.deepEqual(labels, ['4', 'd', 'iv', '4', 'd', 'iv', '4', 'd', 'iv'])
  })

  it('carries on past z the way CSS lower-alpha does', () => {
    assert.deepEqual([1, 26, 27, 52, 53, 702, 703].map(n => formatListNumber(n, 1)), ['a', 'z', 'aa', 'az', 'ba', 'zz', 'aaa'])
  })

  it('writes roman numerals up to 3999 and digits beyond, like CSS lower-roman', () => {
    assert.deepEqual(
      [1, 9, 14, 40, 90, 400, 1994, 3999, 4000].map(n => formatListNumber(n, 2)),
      ['i', 'ix', 'xiv', 'xl', 'xc', 'cd', 'mcmxciv', 'mmmcmxcix', '4000']
    )
  })

  it('names the CSS counter style for each level', () => {
    assert.deepEqual([0, 1, 2, 3].map(listNumberStyle), ['decimal', 'lower-alpha', 'lower-roman', 'decimal'])
  })
})

describe('listRunEnd', () => {
  it('stops at the first block that is not a list item', () => {
    const blocks = [para(), bullet(0), numbered(1), task(0), para(), bullet(0)]
    assert.equal(listRunEnd(blocks, 1), 4)
    assert.equal(listRunEnd(blocks, 5), 6)
    assert.equal(listRunEnd(blocks, 0), 0)
  })
})

// A compact picture of a tree: each list as type@indent, each item as its
// index, or [index, sub-lists] when it has sub-items.
function shape (groups) {
  return groups.map(group => ({
    list: `${group.type}@${group.indent}`,
    items: group.items.map(node => node.children.length ? [node.index, shape(node.children)] : node.index)
  }))
}

describe('nestListItems', () => {
  it('nests sub-items under the item above them', () => {
    assert.deepEqual(shape(nestListItems([bullet(0), bullet(1), bullet(1), bullet(0)])), [
      { list: 'bulletListItem@0', items: [[0, [{ list: 'bulletListItem@1', items: [1, 2] }]], 3] }
    ])
  })

  it('nests a jump of several levels one level down', () => {
    assert.deepEqual(shape(nestListItems([bullet(0), bullet(3)])), [
      { list: 'bulletListItem@0', items: [[0, [{ list: 'bulletListItem@3', items: [1] }]]] }
    ])
  })

  it('starts a new list where the item type changes', () => {
    assert.deepEqual(shape(nestListItems([numbered(0), bullet(0), numbered(0)])), [
      { list: 'numberedListItem@0', items: [0] },
      { list: 'bulletListItem@0', items: [1] },
      { list: 'numberedListItem@0', items: [2] }
    ])
  })

  it('starts a new list where the stored indent changes between siblings', () => {
    assert.deepEqual(shape(nestListItems([numbered(0), numbered(2), numbered(1)])), [
      { list: 'numberedListItem@0', items: [[0, [{ list: 'numberedListItem@2', items: [1] }, { list: 'numberedListItem@1', items: [2] }]]] }
    ])
  })

  it('keeps a run that starts indented at the top', () => {
    assert.deepEqual(shape(nestListItems([bullet(2), bullet(2), bullet(0)])), [
      { list: 'bulletListItem@2', items: [0, 1] },
      { list: 'bulletListItem@0', items: [2] }
    ])
  })

  it('places every item exactly once, in order', () => {
    const random = seeded(3)
    const makers = [numbered, bullet, task]
    for (let run = 0; run < 200; run++) {
      const items = Array.from({ length: 1 + Math.floor(random() * 14) }, () => makers[Math.floor(random() * 3)](Math.floor(random() * 5)))
      const seen = []
      const walk = (groups) => groups.forEach(group => group.items.forEach(node => { seen.push(node.index); walk(node.children) }))
      walk(nestListItems(items))
      assert.deepEqual(seen, items.map((_, index) => index), describeLevels(items))
    }
  })

  it('numbers an HTML <ol> built from it exactly as the editor numbers items', () => {
    const random = seeded(42)
    const makers = [numbered, numbered, bullet, task]
    for (let run = 0; run < 500; run++) {
      const items = Array.from({ length: 1 + Math.floor(random() * 14) }, () => makers[Math.floor(random() * makers.length)](Math.floor(random() * 5)))
      const htmlNumbers = items.map(() => null)
      const walk = (groups) => {
        for (const group of groups) {
          group.items.forEach((node, position) => {
            if (group.type === 'numberedListItem') htmlNumbers[node.index] = position + 1
            walk(node.children)
          })
        }
      }
      walk(nestListItems(items))
      assert.deepEqual(htmlNumbers, numberListItems(items), describeLevels(items))
    }
  })
})

// Applies a plan, checking each change starts from the level it claims.
function levelsAfter (blocks, indices, direction) {
  const levels = blocks.map(listIndentOf)
  for (const change of planIndentChange(blocks, indices, direction)) {
    assert.equal(change.from, levels[change.index])
    levels[change.index] = change.to
  }
  return levels
}

// No list item sits more than one level below the item above it, and every
// list starts at the top level.
function assertWellFormed (blocks) {
  blocks.forEach((block, i) => {
    if (!isListItemType(block.type)) return
    const above = blocks[i - 1]
    const limit = above && isListItemType(above.type) ? listIndentOf(above) + 1 : 0
    assert.ok(listIndentOf(block) <= limit, `item ${i} is too deep: ${describeLevels(blocks)}`)
  })
}

describe('planIndentChange', () => {
  it('indents an item under the item above it', () => {
    assert.deepEqual(levelsAfter([bullet(0), bullet(0)], [1], 1), [0, 1])
  })

  it('will not indent the first item of a list', () => {
    assert.deepEqual(planIndentChange([bullet(0)], [0], 1), [])
    assert.deepEqual(planIndentChange([para(), bullet(0), bullet(0)], [1], 1), [])
  })

  it('never puts an item more than one level below the item above it', () => {
    assert.deepEqual(planIndentChange([bullet(0), bullet(1)], [1], 1), [])
  })

  it('moves sub-items with their item', () => {
    assert.deepEqual(levelsAfter([bullet(0), bullet(0), bullet(1), task(2), numbered(0)], [1], 1), [0, 1, 2, 3, 0])
  })

  it('leaves a subtree where it is when any of it would pass MAX_LIST_INDENT', () => {
    assert.deepEqual(planIndentChange([bullet(6), bullet(6), bullet(7), bullet(8)], [1], 1), [])
    assert.deepEqual(levelsAfter([bullet(6), bullet(6), bullet(7)], [1], 1), [6, 7, 8])
  })

  it('outdents an item together with its sub-items', () => {
    assert.deepEqual(levelsAfter([bullet(0), bullet(1), bullet(2), bullet(1)], [1], -1), [0, 0, 1, 1])
  })

  it('does nothing when outdenting an item already at the top level', () => {
    assert.deepEqual(planIndentChange([bullet(0), bullet(1)], [0], -1), [])
  })

  it('plans a selection top to bottom, against the new indent above each item', () => {
    // The first item is already one level below its parent, so only the
    // second moves, and it goes under the first.
    assert.deepEqual(levelsAfter([bullet(0), bullet(1), bullet(1)], [1, 2], 1), [0, 1, 2])
    assert.deepEqual(levelsAfter([bullet(0), bullet(0), bullet(0)], [1, 2], 1), [0, 1, 1])
  })

  it('moves an item once when its parent is selected as well', () => {
    assert.deepEqual(levelsAfter([bullet(0), bullet(0), bullet(1)], [1, 2], 1), [0, 1, 2])
    assert.deepEqual(levelsAfter([bullet(0), bullet(1), bullet(2)], [1, 2], -1), [0, 0, 1])
  })

  it('ignores indices that are not list items or not in the note', () => {
    assert.deepEqual(levelsAfter([bullet(0), para(), bullet(0), bullet(0)], [1, 3, 7, -1, 2.5], 1), [0, 0, 0, 1])
  })

  it('treats a block that is not a list item above as the start of a new list', () => {
    assert.deepEqual(planIndentChange([bullet(0), para(), bullet(0)], [2], 1), [])
  })

  it('leaves stored jumps it was not asked to move alone', () => {
    assert.deepEqual(levelsAfter([bullet(0), bullet(3), para(), bullet(0), bullet(0)], [4], 1), [0, 3, 0, 0, 1])
  })

  it('refuses a direction other than 1 or -1', () => {
    assert.deepEqual(planIndentChange([bullet(0), bullet(0)], [1], 2), [])
  })

  it('keeps a well-formed list well-formed through any run of Tab and Shift+Tab', () => {
    const random = seeded(99)
    const makers = [bullet, numbered, task]
    for (let run = 0; run < 300; run++) {
      let blocks = []
      let previous = -1
      for (let i = 0; i < 10; i++) {
        if (random() < 0.15) {
          blocks.push(para())
          previous = -1
          continue
        }
        const level = Math.min(Math.floor(random() * (previous + 2)), MAX_LIST_INDENT)
        blocks.push(makers[Math.floor(random() * 3)](level))
        previous = level
      }
      assertWellFormed(blocks)
      for (let step = 0; step < 20; step++) {
        const picks = Array.from({ length: 1 + Math.floor(random() * 3) }, () => Math.floor(random() * blocks.length))
        const changes = new Map(planIndentChange(blocks, picks, random() < 0.5 ? 1 : -1).map(c => [c.index, c.to]))
        blocks = blocks.map((block, index) => changes.has(index) ? { ...block, data: withIndent(block.data, changes.get(index)) } : block)
        assertWellFormed(blocks)
      }
    }
  })
})
