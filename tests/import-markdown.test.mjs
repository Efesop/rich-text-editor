/**
 * Importers: Markdown (with Obsidian's syntax) to note blocks.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { markdownToDrafts, splitFrontmatter, propertiesTable, frontmatterTags, dropTitleHeading, propertyText } = await import('../lib/import/markdownToBlocks.js')
const { finishBlocks, editorContent } = await import('../lib/import/blocks.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

const BULLET = String.fromCharCode(0x2022)

function convert (markdown, options = {}) {
  const { drafts, issues, tags } = markdownToDrafts(markdown, options)
  let n = 0
  const blocks = finishBlocks(drafts, { newId: () => `b${++n}` })
  const storable = blocks.filter(block => !block.data.importResource)
  const content = editorContent(storable, 1)
  assert.deepEqual(sanitizeEditorContent(content), content, 'the app sanitizer changes nothing')
  assert.deepEqual(editorChanges(storable), [], 'Editor.js changes nothing on save')
  return { blocks: blocks.map(({ type, data }) => [type, data]), issues, tags, drafts }
}

describe('splitFrontmatter', () => {
  it('reads YAML frontmatter and returns the body after it', () => {
    const { properties, body } = splitFrontmatter('---\ntitle: "Trip: Rome"\ntags: [travel, italy]\ncreated: 2023-01-15\n---\n# Heading\nText')
    assert.deepEqual(properties, { title: 'Trip: Rome', tags: ['travel', 'italy'], created: '2023-01-15' })
    assert.equal(body, '# Heading\nText')
  })

  it('handles empty frontmatter, none at all, and a byte order mark', () => {
    assert.deepEqual(splitFrontmatter('---\n---\nBody'), { properties: {}, raw: '', body: 'Body' })
    assert.deepEqual(splitFrontmatter('No frontmatter\n---\n'), { properties: null, raw: null, body: 'No frontmatter\n---\n' })
    assert.equal(splitFrontmatter(String.fromCharCode(0xFEFF) + '---\na: 1\n---\nBody').body, 'Body')
  })

  it('reads frontmatter the YAML parser refuses line by line, and says so', () => {
    const result = splitFrontmatter('---\ntitle: Notes: part 2\n\tbad: [\ntags: a, b\n---\nBody')
    assert.equal(result.unreadable, true)
    assert.equal(result.properties.title, 'Notes: part 2')
    assert.equal(result.properties.tags, 'a, b')
    assert.equal(result.body, 'Body')
  })
})

describe('frontmatter helpers', () => {
  it('reads tags from lists and from comma or space separated strings', () => {
    assert.deepEqual(frontmatterTags(['a', 'b c']), ['a', 'b c'])
    assert.deepEqual(frontmatterTags('work, home office'), ['work', 'home office'])
    assert.deepEqual(frontmatterTags('#one #two'), ['#one', '#two'])
    assert.deepEqual(frontmatterTags(null), [])
  })

  it('shows other properties as a table', () => {
    const table = propertiesTable([['status', 'draft'], ['rating', 4], ['empty', ''], ['authors', ['Ann', 'Bo']], ['meta', { a: 1 }]])
    const blocks = finishBlocks([table], { newId: () => 'b' })
    assert.deepEqual(blocks[0].data.content, [['Property', 'Value'], ['status', 'draft'], ['rating', '4'], ['authors', 'Ann, Bo'], ['meta', '{"a":1}']])
    assert.equal(propertiesTable([['empty', null]]), null)
    assert.equal(propertyText(new Date(Date.UTC(2023, 0, 1))), '2023-01-01T00:00:00.000Z')
  })
})

describe('markdownToDrafts', () => {
  it('converts GitHub-flavoured Markdown, keeping single line breaks', () => {
    const { blocks } = convert([
      '# Title', '', 'Line one', 'line two with **bold**, _it_, ~~gone~~ and `code`', '',
      '- [ ] open', '- [x] done', '  - nested', '', '3. three', '4. four', '',
      '| a | b |', '|---|---|', '| x \\| y | [[Note\\|alias]] |', '',
      '```js title', 'let a = 1 < 2', '```', '', '---', '', '<div>raw <b>html</b></div>'
    ].join('\n'), { resolveWikiLink: target => (target === 'Note' ? { pageRef: 'P-note' } : null) })
    assert.deepEqual(blocks, [
      ['header', { text: 'Title', level: 2 }],
      ['paragraph', { text: 'Line one<br>line two with <b>bold</b>, <i>it</i>, <s>gone</s> and <code class="inline-code">code</code>' }],
      ['checklistItem', { text: 'open', checked: false }],
      ['checklistItem', { text: 'done', checked: true }],
      ['bulletListItem', { text: 'nested', indent: 1 }],
      ['numberedListItem', { text: 'three' }],
      ['numberedListItem', { text: 'four' }],
      ['table', { withHeadings: true, stretched: false, content: [['a', 'b'], ['x | y', 'alias']] }],
      ['code', { code: 'let a = 1 < 2', language: 'javascript', encoding: 'raw' }],
      ['delimiter', {}],
      ['paragraph', { text: 'raw <b>html</b>' }]
    ])
  })

  it('links [[wikilinks]] to notes and embeds photos, files and notes', () => {
    const { blocks, issues } = convert('See [[Trip plan#Day 1|the plan]] and [[Missing]].\n\n![[beach.jpg|300]]\n\n![[Plan.pdf]]\n\n![[Trip plan]] ![[gone.png]]', {
      resolveWikiLink: target => (target.startsWith('Trip plan') ? { pageRef: 'P-trip' } : null),
      resolveEmbed: target => ({ 'beach.jpg': { resource: 'res:beach' }, 'Plan.pdf': { file: 'res:plan' }, 'Trip plan': { pageRef: 'P-trip' } })[target] || null
    })
    assert.deepEqual(blocks, [
      ['paragraph', { text: 'See <a data-page-id="P-trip" class="page-link" href="#">the plan</a> and Missing.' }],
      ['image', { importResource: 'res:beach', caption: '' }],
      ['attachment', { importResource: 'res:plan', filename: 'Plan.pdf' }],
      ['paragraph', { text: '<a data-page-id="P-trip" class="page-link" href="#">Trip plan</a> <i>[Not found: gone.png]</i>' }]
    ])
    assert.deepEqual(issues, { 'wikilink-unresolved': 1, 'embed-missing': 1 })
  })

  it('reads ==highlights==, maths and #tags, but not tags in code, numbers or links', () => {
    const { blocks, tags } = convert('A ==bright *idea*== with $x^2 *not em*$ and #project/alpha #2024 `#code` [link](https://a.example/#frag) #todo\n\n$$\na*b*c\n$$')
    assert.deepEqual(blocks, [
      ['paragraph', {
        // Formatting nests in one fixed order, so italic wraps the highlight
        text: 'A <mark class="cdx-marker">bright </mark><i><mark class="cdx-marker">idea</mark></i> with $x^2 *not em*$ and #project/alpha #2024 ' +
          '<code class="inline-code">#code</code> <a href="https://a.example/#frag" target="_blank" rel="noopener noreferrer">link</a> #todo'
      }],
      ['code', { code: '$$\na*b*c\n$$', language: 'plaintext', encoding: 'raw' }]
    ])
    assert.deepEqual(tags, ['project/alpha', 'todo'])
  })

  it('turns > [!callouts] into callouts, and folding ones into toggles', () => {
    const { blocks, issues } = convert([
      '> [!warning] Hot', '> Do not touch', '', '> [!question]', '> Why?', '',
      '> [!tip]- Hidden tip', '> secret', '> - point', '', '> [!note]', '> text', '> ```', '> code', '> ```', '',
      '> plain quote'
    ].join('\n'))
    assert.deepEqual(blocks, [
      ['callout', { text: '<b>Hot</b><br>Do not touch', variant: 'warning' }],
      ['callout', { text: '<b>Question</b><br>Why?', variant: 'info' }],
      ['toggle', { summary: 'Hidden tip', content: `secret<br>${BULLET} point`, defaultCollapsed: true }],
      ['callout', { text: '<b>Note</b><br>text', variant: 'info' }],
      ['code', { code: 'code', language: 'auto', encoding: 'raw' }],
      ['quote', { text: 'plain quote', caption: '', alignment: 'left' }]
    ])
    assert.deepEqual(issues, { 'callout-content-moved': 1 })
  })

  it('resolves Markdown links and images through the importer', () => {
    const { blocks } = convert('[Other](Other%20note.md) ![shot](img/a%20b.png) [site](https://example.com)', {
      resolveLink: href => (href === 'Other%20note.md' ? { pageRef: 'P-other' } : null),
      resolveImage: src => (src === 'img/a%20b.png' ? { resource: 'res:ab' } : null)
    })
    assert.deepEqual(blocks, [
      ['paragraph', { text: '<a data-page-id="P-other" class="page-link" href="#">Other</a>' }],
      ['image', { importResource: 'res:ab', caption: '' }],
      ['paragraph', { text: 'site' }]
    ])
  })
})

describe('dropTitleHeading', () => {
  it('drops a first heading that repeats the title, and nothing else', () => {
    const { drafts } = markdownToDrafts('# Trip Plan\n\nText')
    assert.equal(dropTitleHeading(drafts, 'trip plan').length, 1)
    assert.equal(dropTitleHeading(drafts, 'Other').length, 2)
  })
})
