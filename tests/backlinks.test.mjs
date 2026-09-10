/**
 * Backlinks tests — the scan that finds notes linking to a page.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const { findBacklinks, snippetsFor, collectStrings, htmlToText } = await import('../lib/backlinks.js')

const TARGET = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const link = (id, text) => `<a data-page-id="${id}" class="page-link" href="#">${text}</a>`

function page (overrides = {}) {
  return {
    id: randomUUID(),
    title: 'Untitled',
    content: { time: 1000, blocks: [], version: '2.30.6' },
    createdAt: '2026-01-01T00:00:00.000Z',
    password: null,
    ...overrides
  }
}

function para (html) {
  return { id: 'b1', type: 'paragraph', data: { text: html } }
}

describe('htmlToText', () => {
  it('strips tags and decodes entities', () => {
    assert.equal(htmlToText('<b>a</b> &amp; <i>b</i>'), 'a & b')
  })

  it('decodes numeric and hex entities', () => {
    assert.equal(htmlToText('&#39;q&#x27;'), "'q'")
  })

  it('leaves unknown entities alone rather than mangling them', () => {
    assert.equal(htmlToText('&notreal; x'), '&notreal; x')
  })

  it('collapses whitespace without trimming the edges', () => {
    assert.equal(htmlToText('  a\n\n  b  '), ' a b ')
  })

  it('is safe on non-strings', () => {
    assert.equal(htmlToText(null), '')
    assert.equal(htmlToText(undefined), '')
    assert.equal(htmlToText(42), '')
  })
})

describe('collectStrings', () => {
  it('finds text in paragraphs, list items, checklist items and table cells', () => {
    assert.deepEqual(collectStrings({ text: 'a' }), ['a'])
    assert.deepEqual(collectStrings({ items: ['a', 'b'] }), ['a', 'b'])
    assert.deepEqual(collectStrings({ items: [{ content: 'a', items: ['b'] }] }), ['a', 'b'])
    assert.deepEqual(collectStrings({ items: [{ text: 'a', checked: true }] }), ['a'])
    assert.deepEqual(collectStrings({ content: [['a', 'b'], ['c']] }), ['a', 'b', 'c'])
  })

  it('skips empty strings and non-string leaves', () => {
    assert.deepEqual(collectStrings({ a: '', b: 3, c: null, d: true, e: 'x' }), ['x'])
  })

  it('does not recurse forever on a cyclic object', () => {
    const cyclic = { text: 'a' }
    cyclic.self = cyclic
    assert.doesNotThrow(() => collectStrings(cyclic))
  })
})

describe('snippetsFor', () => {
  it('splits the surrounding text around the mention', () => {
    const html = `falls back through the hosts in ${link(TARGET, 'Relay alias fallback')} before giving up.`
    const [snippet] = snippetsFor(html, TARGET)
    assert.equal(snippet.before, 'falls back through the hosts in ')
    assert.equal(snippet.linkText, 'Relay alias fallback')
    assert.equal(snippet.after, ' before giving up.')
  })

  it('ignores links to other pages', () => {
    assert.deepEqual(snippetsFor(`x ${link(OTHER, 'Other')} y`, TARGET), [])
  })

  it('matches when data-page-id is not the first attribute', () => {
    const html = `see <a class="page-link" href="#" data-page-id="${TARGET}">T</a> now`
    assert.equal(snippetsFor(html, TARGET).length, 1)
  })

  it('matches single-quoted attributes', () => {
    const html = `see <a data-page-id='${TARGET}'>T</a>`
    assert.equal(snippetsFor(html, TARGET).length, 1)
  })

  it('finds every mention in one block', () => {
    const html = `${link(TARGET, 'A')} and ${link(TARGET, 'B')}`
    assert.deepEqual(snippetsFor(html, TARGET).map(s => s.linkText), ['A', 'B'])
  })

  it('strips markup inside the link text', () => {
    const html = `x <a data-page-id="${TARGET}"><b>Bold</b> title</a> y`
    assert.equal(snippetsFor(html, TARGET)[0].linkText, 'Bold title')
  })

  it('returns plain strings, never markup, so the UI never needs to inject HTML', () => {
    const html = `<b>bold</b> ${link(TARGET, 'T')} <i>italic</i>`
    const [snippet] = snippetsFor(html, TARGET)
    for (const part of [snippet.before, snippet.linkText, snippet.after]) {
      assert.equal(part.includes('<'), false, `unexpected markup in ${JSON.stringify(part)}`)
    }
  })

  it('clips long context on a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(60)
    const [snippet] = snippetsFor(`${long}${link(TARGET, 'T')}${long}`, TARGET)
    assert.equal(snippet.before.startsWith('…'), true)
    assert.equal(snippet.after.endsWith('…'), true)
    assert.ok(snippet.before.length <= 92, `before too long: ${snippet.before.length}`)
    assert.ok(snippet.after.length <= 92, `after too long: ${snippet.after.length}`)
  })

  it('does not clip short context', () => {
    const [snippet] = snippetsFor(`short ${link(TARGET, 'T')} tail`, TARGET)
    assert.equal(snippet.before, 'short ')
    assert.equal(snippet.after, ' tail')
  })

  it('is safe on a string with no links at all', () => {
    assert.deepEqual(snippetsFor('plain text', TARGET), [])
  })

  it('treats a regex-special page id literally', () => {
    const weird = 'a.b*c'
    assert.equal(snippetsFor(`x ${link(weird, 'T')}`, weird).length, 1)
    assert.equal(snippetsFor(`x ${link('axbxc', 'T')}`, weird).length, 0)
  })
})

describe('findBacklinks', () => {
  it('finds a linking page and returns its snippet', () => {
    const source = page({ title: 'Sync architecture', content: { time: 1, blocks: [para(`in ${link(TARGET, 'Relay')} before`)] } })
    const results = findBacklinks([source], TARGET)
    assert.equal(results.length, 1)
    assert.equal(results[0].title, 'Sync architecture')
    assert.equal(results[0].pageId, source.id)
    assert.equal(results[0].count, 1)
    assert.equal(results[0].snippets[0].linkText, 'Relay')
  })

  it('returns nothing when no page links in', () => {
    assert.deepEqual(findBacklinks([page({ content: { time: 1, blocks: [para('no links')] } })], TARGET), [])
  })

  it('never counts a page linking to itself', () => {
    const self = page({ id: TARGET, content: { time: 1, blocks: [para(link(TARGET, 'me'))] } })
    assert.deepEqual(findBacklinks([self], TARGET), [])
  })

  it('skips folders and trashed pages', () => {
    const folder = page({ type: 'folder', title: 'F', content: { time: 1, blocks: [para(link(TARGET, 'T'))] } })
    const binned = page({ trashed: true, title: 'B', content: { time: 1, blocks: [para(link(TARGET, 'T'))] } })
    assert.deepEqual(findBacklinks([folder, binned], TARGET), [])
  })

  it('counts several mentions in one page once, as one row', () => {
    const source = page({ title: 'Many', content: { time: 1, blocks: [para(`${link(TARGET, 'A')} ${link(TARGET, 'B')}`), para(link(TARGET, 'C'))] } })
    const [result] = findBacklinks([source], TARGET)
    assert.equal(result.count, 3)
    assert.equal(result.snippets.length, 3)
  })

  it('caps stored snippets but keeps the true count', () => {
    const blocks = Array.from({ length: 6 }, () => para(link(TARGET, 'T')))
    const source = page({ title: 'Lots', content: { time: 1, blocks } })
    const [result] = findBacklinks([source], TARGET, { maxSnippetsPerPage: 2 })
    assert.equal(result.count, 6)
    assert.equal(result.snippets.length, 2)
  })

  it('finds links inside list items, checklists and table cells', () => {
    const source = page({
      title: 'Everywhere',
      content: {
        time: 1,
        blocks: [
          { id: 'l', type: 'list', data: { items: [{ content: link(TARGET, 'in a list'), items: [] }] } },
          { id: 'c', type: 'checklist', data: { items: [{ text: link(TARGET, 'in a checklist'), checked: false }] } },
          { id: 't', type: 'table', data: { content: [['cell', link(TARGET, 'in a table')]] } }
        ]
      }
    })
    const [result] = findBacklinks([source], TARGET)
    assert.equal(result.count, 3)
    assert.deepEqual(result.snippets.map(s => s.linkText), ['in a list', 'in a checklist', 'in a table'])
  })

  describe('locked pages', () => {
    it('contributes a title row but no snippet when temp-unlocked and readable', () => {
      const locked = page({
        title: 'Recovery phrase',
        password: { hash: 'x' },
        content: { time: 1, blocks: [para(`secret context ${link(TARGET, 'T')} more secrets`)] }
      })
      const [result] = findBacklinks([locked], TARGET)
      assert.equal(result.isLocked, true)
      assert.equal(result.count, 1)
      assert.deepEqual(result.snippets, [], 'a locked page must never leak a snippet')
    })

    it('contributes nothing at all when its content is encrypted on disk', () => {
      const encrypted = page({
        title: 'Recovery phrase',
        password: { hash: 'x' },
        content: null,
        encryptedContent: { v: 1, cipher: 'AES-GCM-256', salt: [1], iv: [2], data: [3] }
      })
      assert.deepEqual(findBacklinks([encrypted], TARGET), [])
    })
  })

  it('orders the most recently edited linking page first', () => {
    const old = page({ title: 'Old', content: { time: 100, blocks: [para(link(TARGET, 'T'))] } })
    const recent = page({ title: 'Recent', content: { time: 900, blocks: [para(link(TARGET, 'T'))] } })
    assert.deepEqual(findBacklinks([old, recent], TARGET).map(r => r.title), ['Recent', 'Old'])
  })

  it('falls back to createdAt when a page has no content timestamp', () => {
    const a = page({ title: 'A', createdAt: '2026-01-01T00:00:00.000Z', content: { blocks: [para(link(TARGET, 'T'))] } })
    const b = page({ title: 'B', createdAt: '2026-05-01T00:00:00.000Z', content: { blocks: [para(link(TARGET, 'T'))] } })
    assert.deepEqual(findBacklinks([a, b], TARGET).map(r => r.title), ['B', 'A'])
  })

  it('breaks ties on title so ordering is stable', () => {
    const b = page({ title: 'Beta', content: { time: 5, blocks: [para(link(TARGET, 'T'))] } })
    const a = page({ title: 'Alpha', content: { time: 5, blocks: [para(link(TARGET, 'T'))] } })
    assert.deepEqual(findBacklinks([b, a], TARGET).map(r => r.title), ['Alpha', 'Beta'])
  })

  it('titles an untitled page rather than showing an empty row', () => {
    const source = page({ title: '', content: { time: 1, blocks: [para(link(TARGET, 'T'))] } })
    assert.equal(findBacklinks([source], TARGET)[0].title, 'Untitled')
  })

  it('survives malformed pages without throwing', () => {
    const junk = [null, undefined, {}, { content: 'not an object' }, { content: { blocks: 'nope' } }, { content: { blocks: [null, { data: null }] } }]
    assert.doesNotThrow(() => findBacklinks(junk, TARGET))
    assert.deepEqual(findBacklinks(junk, TARGET), [])
  })

  it('returns an empty list for a missing id or a non-array of pages', () => {
    assert.deepEqual(findBacklinks([page()], ''), [])
    assert.deepEqual(findBacklinks(null, TARGET), [])
  })
})
