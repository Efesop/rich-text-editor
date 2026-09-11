/**
 * Markdown to blocks: what pasted markdown and AI replies turn into.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseMarkdownToBlocks } from '../lib/markdownBlocks.js'
import { MAX_LIST_INDENT, listIndentOf } from '../lib/listIndent.js'
import { sanitizeEditorContent } from '../utils/securityUtils.js'

const readSrc = (file) => readFileSync(resolve(process.cwd(), file), 'utf8')
const levels = (markdown) => parseMarkdownToBlocks(markdown).map(listIndentOf)

describe('parseMarkdownToBlocks — nested lists', () => {
  it('turns two-space nesting into indent', () => {
    assert.deepEqual(
      parseMarkdownToBlocks('- a\n  - b\n    - c\n- d').map(b => [b.type, b.data.text, listIndentOf(b)]),
      [['bulletListItem', 'a', 0], ['bulletListItem', 'b', 1], ['bulletListItem', 'c', 2], ['bulletListItem', 'd', 0]]
    )
  })

  it('turns four-space and tab nesting into indent', () => {
    assert.deepEqual(levels('1. a\n    1. b\n\t\t- c'), [0, 1, 2])
  })

  it('nests checklist and numbered items the same way', () => {
    assert.deepEqual(
      parseMarkdownToBlocks('1. Plan\n   - [x] Book\n   - [ ] Pack').map(b => [b.type, listIndentOf(b), b.data.checked]),
      [['numberedListItem', 0, undefined], ['checklistItem', 1, true], ['checklistItem', 1, false]]
    )
  })

  it('steps back out to the level the indentation returns to', () => {
    assert.deepEqual(levels('- a\n    - b\n        - c\n    - d\n- e'), [0, 1, 2, 1, 0])
    assert.deepEqual(levels('- a\n    - b\n  - c'), [0, 1, 1])
  })

  it('never nests an item more than one level below the item above it', () => {
    assert.deepEqual(levels('- a\n          - b'), [0, 1])
    assert.deepEqual(levels('    - starts indented\n- then not'), [0, 0])
  })

  it('keeps nesting across a blank line inside a list', () => {
    assert.deepEqual(levels('- a\n\n  - b'), [0, 1])
  })

  it('starts a new list after anything that is not a list item', () => {
    assert.deepEqual(levels('- a\n  - b\nText\n  - c'), [0, 1, 0, 0])
  })

  it('stops at MAX_LIST_INDENT', () => {
    const markdown = Array.from({ length: 12 }, (_, depth) => '  '.repeat(depth) + '- level').join('\n')
    assert.deepEqual(levels(markdown), [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8])
    assert.equal(MAX_LIST_INDENT, 8)
  })

  it('parses an unnested list exactly as it did before nesting existed', () => {
    assert.deepEqual(parseMarkdownToBlocks('- a\n- [ ] b\n1. c'), [
      { type: 'bulletListItem', data: { text: 'a' } },
      { type: 'checklistItem', data: { text: 'b', checked: false } },
      { type: 'numberedListItem', data: { text: 'c' } }
    ])
  })
})

describe('parseMarkdownToBlocks — inline formatting', () => {
  it('italicises _words_ but leaves snake_case alone', () => {
    const [block] = parseMarkdownToBlocks('call snake_case_name or _this_ and (_that_)')
    assert.equal(block.data.text, 'call snake_case_name or <i>this</i> and (<i>that</i>)')
  })

  it('italicises underscores at the very start of a line', () => {
    assert.equal(parseMarkdownToBlocks('_start_ here')[0].data.text, '<i>start</i> here')
  })

  it('contains no regex lookbehind, which Safari before 16.4 cannot parse', () => {
    assert.equal(/\(\?<[=!]/.test(readSrc('lib/markdownBlocks.js')), false)
  })
})

describe('parseMarkdownToBlocks — output survives a save', () => {
  it('produces list blocks the sanitizer keeps exactly', () => {
    const markdown = '- one\n  - two\n    - [x] three\n1. first\n   1. nested\n   - [ ] task'
    const blocks = parseMarkdownToBlocks(markdown).map((block, i) => ({ id: `b${i}`, ...block }))
    assert.deepEqual(sanitizeEditorContent({ blocks }).blocks, blocks)
  })
})
