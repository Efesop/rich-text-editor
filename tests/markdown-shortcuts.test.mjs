/**
 * Markdown input shortcut matching.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { matchBlockShortcut, matchInlineShortcut } = await import('../lib/markdownShortcuts.js')

const m = (text) => matchBlockShortcut(text)

describe('matchBlockShortcut — headings', () => {
  it('maps # to Dash\'s biggest heading, which is level 2', () => {
    assert.deepEqual(m('# Title'), { tool: 'header', data: { level: 2 }, consume: 2 })
  })

  it('gives ## the same level as #, so a lone # is never a dead keystroke', () => {
    assert.equal(m('## Two').data.level, 2)
  })

  it('clamps deeper hashes to the smallest heading Dash offers', () => {
    assert.equal(m('### Three').data.level, 3)
    assert.equal(m('#### Four').data.level, 4)
    assert.equal(m('###### Six').data.level, 4)
  })

  // Typing markdown and pasting it must land on the same block, so this
  // mirrors the clamp in parseMarkdownToBlocks (components/Editor.js).
  it('matches the level clamp the markdown paste handler already uses', () => {
    const pasteLevel = (hashes) => Math.min(Math.max(hashes, 2), 4)
    for (let hashes = 1; hashes <= 6; hashes++) {
      const typed = m('#'.repeat(hashes) + ' Heading')
      assert.equal(typed.data.level, pasteLevel(hashes), `${hashes} hashes`)
    }
  })

  it('needs a space, so a hashtag is left alone', () => {
    assert.equal(m('#hashtag'), null)
    assert.equal(m('#'), null)
  })
})

describe('matchBlockShortcut — lists', () => {
  it('converts -, * and + to a bullet item', () => {
    for (const trigger of ['- item', '* item', '+ item']) {
      assert.equal(m(trigger)?.tool, 'bulletListItem', trigger)
    }
  })

  it('converts 1. and 1) to a numbered item', () => {
    assert.equal(m('1. item')?.tool, 'numberedListItem')
    assert.equal(m('3) item')?.tool, 'numberedListItem')
  })

  it('converts [] and [ ] to an unchecked checklist item', () => {
    assert.deepEqual(m('[] task'), { tool: 'checklistItem', data: { checked: false }, consume: 3 })
    assert.equal(m('[ ] task')?.data.checked, false)
  })

  it('converts [x] to a checked item, either case', () => {
    assert.equal(m('[x] done')?.data.checked, true)
    assert.equal(m('[X] done')?.data.checked, true)
  })

  it('reads "- [ ] " as a checklist, not a bullet holding a bracket', () => {
    const result = m('- [ ] task')
    assert.equal(result.tool, 'checklistItem')
    assert.equal(result.consume, 6)
  })

  it('leaves a bare number alone', () => {
    assert.equal(m('1984 was a year'), null)
    assert.equal(m('1.5 litres'), null)
  })
})

describe('matchBlockShortcut — quote, code, delimiter', () => {
  it('converts "> " to a quote', () => {
    assert.equal(m('> quoted')?.tool, 'quote')
  })

  it('converts ``` to a code block with no trailing space needed', () => {
    assert.deepEqual(m('```'), { tool: 'code', data: {}, consume: 3 })
    assert.equal(m('```js')?.tool, 'code')
  })

  it('converts a full line of --- to a delimiter', () => {
    assert.equal(m('---')?.tool, 'delimiter')
    assert.equal(m('***')?.tool, 'delimiter')
    assert.equal(m('___')?.tool, 'delimiter')
  })

  it('does not fire the delimiter mid-sentence', () => {
    assert.equal(m('--- and more'), null)
  })
})

describe('matchBlockShortcut — callouts and toggles', () => {
  it('maps each callout keyword to its variant', () => {
    assert.equal(m('[!info] x')?.data.variant, 'info')
    assert.equal(m('[!tip] x')?.data.variant, 'tip')
    assert.equal(m('[!done] x')?.data.variant, 'done')
    assert.equal(m('[!warning] x')?.data.variant, 'warning')
    assert.equal(m('[!danger] x')?.data.variant, 'danger')
  })

  it('accepts the common aliases people actually type', () => {
    assert.equal(m('[!note] x')?.data.variant, 'info')
    assert.equal(m('[!success] x')?.data.variant, 'done')
    assert.equal(m('[!caution] x')?.data.variant, 'warning')
    assert.equal(m('[!error] x')?.data.variant, 'danger')
  })

  it('is case-insensitive, matching GitHub\'s [!NOTE] style', () => {
    assert.equal(m('[!INFO] x')?.data.variant, 'info')
  })

  it('ignores an unknown keyword instead of guessing', () => {
    assert.equal(m('[!banana] x'), null)
  })

  it('converts [!toggle] and its aliases', () => {
    assert.equal(m('[!toggle] x')?.tool, 'toggle')
    assert.equal(m('[!fold] x')?.tool, 'toggle')
    assert.equal(m('[!details] x')?.tool, 'toggle')
  })

  it('matches a callout ahead of the checklist rule, so [!info] is not a checkbox', () => {
    assert.equal(m('[!info] x')?.tool, 'callout')
  })
})

describe('matchBlockShortcut — safety', () => {
  it('returns null for plain text and rubbish input', () => {
    assert.equal(m('just typing'), null)
    assert.equal(m(''), null)
    assert.equal(m(null), null)
    assert.equal(m(undefined), null)
    assert.equal(m(42), null)
  })

  it('reports how many characters the trigger ate', () => {
    assert.equal(m('## Heading').consume, 3)
    assert.equal(m('- item').consume, 2)
    assert.equal(m('[!warning] hi').consume, 11)
  })

  it('accepts a non-breaking space, which contenteditable inserts for a trailing space', () => {
    const NB = '\u00a0'
    assert.equal(m(`#${NB}Title`)?.tool, 'header')
    assert.equal(m(`-${NB}item`)?.tool, 'bulletListItem')
    assert.equal(m(`>${NB}quoted`)?.tool, 'quote')
    assert.equal(m(`1.${NB}item`)?.tool, 'numberedListItem')
    assert.equal(m(`[!info]${NB}x`)?.data.variant, 'info')
  })
})

describe('matchInlineShortcut', () => {
  const at = (text) => matchInlineShortcut(text)

  it('wraps **bold** when the closing pair is typed', () => {
    const r = at('say **hello**')
    assert.equal(r.tag, 'b')
    assert.equal(r.content, 'hello')
    assert.equal(r.start, 4)
    assert.equal(r.end, 13)
  })

  it('wraps *italic*, ~~strike~~, ==highlight== and `code`', () => {
    assert.equal(at('a *b*').tag, 'i')
    assert.equal(at('a ~~b~~').tag, 's')
    assert.equal(at('a ==b==').tag, 'mark')
    assert.equal(at('a `b`').tag, 'code')
  })

  it('carries the class Dash\'s marker and inline-code tools use', () => {
    assert.equal(at('a ==b==').className, 'cdx-marker')
    assert.equal(at('a `b`').className, 'inline-code')
  })

  it('prefers ** over *, so bold never resolves as nested italics', () => {
    const r = at('**bold**')
    assert.equal(r.tag, 'b')
    assert.equal(r.content, 'bold')
  })

  // Regression: typing "**bold**" passes through "**bold*", and a naive
  // single-* rule wrapped "bold" in italics before the last asterisk landed.
  it('stays quiet on the half-typed states of a double delimiter', () => {
    for (const partial of ['**bold*', '__bold_', '~~x~', '==x=']) {
      assert.equal(at(partial), null, partial)
    }
  })

  it('still wraps a genuine single-delimiter pair', () => {
    assert.equal(at('*italic*').tag, 'i')
    assert.equal(at('_italic_').tag, 'i')
    assert.equal(at('say *it* now'.slice(0, 8)).content, 'it')
  })

  it('survives the whole character-by-character run of **bold**', () => {
    const target = '**bold**'
    const fired = []
    for (let i = 1; i <= target.length; i++) {
      const r = at(target.slice(0, i))
      if (r) fired.push({ at: i, tag: r.tag, content: r.content })
    }
    assert.deepEqual(fired, [{ at: 8, tag: 'b', content: 'bold' }])
  })

  it('ignores an empty or whitespace-only body', () => {
    assert.equal(at('****'), null)
    assert.equal(at('``'), null)
    assert.equal(at('** **'), null)
  })

  it('does nothing until the closing delimiter is typed', () => {
    assert.equal(at('**bold'), null)
    assert.equal(at('a ~~b'), null)
  })

  it('only fires at the caret, not on an earlier pair', () => {
    assert.equal(at('**done** and more'), null)
  })

  it('is safe on short or non-string input', () => {
    assert.equal(at('*'), null)
    assert.equal(at(''), null)
    assert.equal(at(null), null)
  })

  it('wraps only the nearest pair when several are present', () => {
    const r = at('*one* and *two*')
    assert.equal(r.content, 'two')
    assert.equal(r.start, 10)
  })
})
