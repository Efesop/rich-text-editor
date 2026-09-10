/**
 * Every block type must survive a save.
 *
 * sanitizeEditorContent runs on every save, and again inside
 * validatePageStructure. It rebuilds each block from scratch, so any block
 * type or field it does not know about is lost silently. v1.6.6 shipped
 * callout and toggle blocks the sanitizer did not know, and a toggle was
 * wiped on its first autosave. These tests make that class of bug fail loudly.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Imported directly on purpose: a module that fails to load must fail this
// suite, not quietly skip it the way a try/catch import would.
import { sanitizeEditorContent } from '../utils/securityUtils.js'
import {
  migrateEditorData,
  isLegacyEscapedCode,
  decodeLegacyCodeEscaping,
  inferEmbedService
} from '../utils/migrateBlocks.js'

const readSrc = (file) => readFileSync(resolve(process.cwd(), file), 'utf8')

const SEED_WORDS = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident']

// One valid, representative block for every block tool registered in
// components/Editor.js. Each must come back from the sanitizer unchanged.
const FIXTURES = {
  paragraph: { data: { text: 'Plain <b>bold</b> and <i>italic</i>' }, tunes: { alignment: { alignment: 'center' } } },
  header: { data: { text: 'Host order', level: 2 }, tunes: { alignment: { alignment: 'right' } } },
  bulletListItem: { data: { text: 'A bullet' } },
  numberedListItem: { data: { text: 'A numbered item' } },
  checklistItem: { data: { text: 'A task', checked: true } },
  quote: { data: { text: 'A quote', caption: 'Someone', alignment: 'center' } },
  callout: { data: { text: 'Never call <code class="inline-code">savePagesToStorage([])</code>', variant: 'warning' } },
  toggle: { data: { summary: 'Why the proxy exists', content: 'One phone blocks it.<br>Bodies still pass.', defaultCollapsed: true } },
  code: { data: { code: 'if (a < b && c > "d") { return \'&lt;\' }', language: 'javascript', encoding: 'raw' } },
  table: { data: { withHeadings: true, stretched: false, content: [['Host', 'Transport'], ['deno.net', 'WSS']] } },
  image: { data: { file: { url: 'https://example.com/cat.png' }, caption: 'A cat', withBorder: false, withBackground: true, stretched: false } },
  embed: { data: { service: 'youtube', source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embed: 'https://www.youtube.com/embed/dQw4w9WgXcQ', width: 580, height: 320, caption: 'A video' } },
  delimiter: { data: {} },
  attachment: { data: { attachmentId: '11111111-1111-4111-8111-111111111111', filename: 'report.pdf', mimeType: 'application/pdf', size: 2048, preview: '' } },
  seedPhrase: { data: { words: SEED_WORDS, count: 12 } },
  // Legacy shapes, still registered so old notes render; migrated on load.
  nestedlist: { data: { style: 'unordered', items: [{ content: 'one', items: [] }] } },
  checklist: { data: { items: [{ text: 'legacy task', checked: false }] } }
}

// Registered in components/Editor.js, but never stored as blocks of their own.
const INLINE_TOOLS = new Set(['inlineCode', 'marker', 'pageLink', 'underline', 'aiTool'])
const BLOCK_TUNES = new Set(['alignment', 'aiTune'])
// AIBlockTool deletes itself 50ms after render and saves {}. Whitelisting it
// would let an empty block persist, so it is deliberately left unknown.
const TRANSIENT_BLOCKS = new Set(['ai'])

function block (type) {
  const fixture = FIXTURES[type]
  return {
    id: `id-${type}`,
    type,
    data: structuredClone(fixture.data),
    ...(fixture.tunes ? { tunes: structuredClone(fixture.tunes) } : {})
  }
}

const sanitizeOne = (input) => sanitizeEditorContent({ blocks: [input] }).blocks[0]

function registeredTools () {
  const src = readSrc('components/Editor.js')
  const start = src.indexOf('const tools = {')
  const end = src.indexOf('return { EditorJS, tools, DragDrop }', start)
  assert.ok(start !== -1 && end !== -1, 'could not find the tools object in components/Editor.js — update this scan')
  // Tool keys sit 8 spaces in, or 10 inside the conditional AI spread.
  // `config` is the only nested object at those depths.
  return [...src.slice(start, end).matchAll(/^ {8,10}([A-Za-z]+): *\{/gm)]
    .map(match => match[1])
    .filter(key => key !== 'config')
}

describe('sanitizeEditorContent — every block tool survives a save', () => {
  it('finds the registered tools, so the coverage check cannot pass vacuously', () => {
    const tools = registeredTools()
    assert.ok(tools.length >= 20, `expected at least 20 registered tools, found ${tools.length}: ${tools.join(', ')}`)
  })

  it('covers every registered block tool', () => {
    const uncovered = registeredTools().filter(key =>
      !(key in FIXTURES) && !INLINE_TOOLS.has(key) && !BLOCK_TUNES.has(key) && !TRANSIENT_BLOCKS.has(key)
    )
    assert.deepEqual(uncovered, [],
      `Block tool(s) registered in components/Editor.js without sanitizer coverage: ${uncovered.join(', ')}. ` +
      'Add a case to sanitizeEditorContent in utils/securityUtils.js and a fixture here, or the block is ' +
      'flattened to a paragraph on its next save.')
  })

  it('has no fixture for a tool that is no longer registered', () => {
    const tools = new Set(registeredTools())
    assert.deepEqual(Object.keys(FIXTURES).filter(type => !tools.has(type)), [])
  })

  for (const type of Object.keys(FIXTURES)) {
    it(`keeps a ${type} block exactly as the tool saved it`, () => {
      const input = block(type)
      assert.deepEqual(sanitizeOne(input), input)
    })
  }

  it('keeps empty text and captions instead of dropping the field', () => {
    const blocks = [
      { id: 'q', type: 'quote', data: { text: '', caption: '', alignment: 'left' } },
      { id: 'i', type: 'image', data: { file: { url: 'https://example.com/a.png?w=1&h=2' }, caption: '', withBorder: false, withBackground: false, stretched: false } },
      { id: 'e', type: 'embed', data: { service: 'vimeo', source: 'https://vimeo.com/76979871', embed: 'https://player.vimeo.com/video/76979871?title=0&byline=0', width: 580, height: 320, caption: '' } },
      { id: 'c', type: 'checklistItem', data: { text: '', checked: false } },
      { id: 'b', type: 'bulletListItem', data: { text: '' } }
    ]
    assert.deepEqual(sanitizeEditorContent({ blocks }).blocks, blocks)
  })

  it('is stable when run twice, as validatePageStructure does on every save', () => {
    const once = sanitizeEditorContent({ blocks: Object.keys(FIXTURES).map(block) })
    assert.deepEqual(sanitizeEditorContent(once).blocks, once.blocks)
  })
})

describe('sanitizeEditorContent — what it refuses to keep', () => {
  it('strips script from callout text and toggle bodies', () => {
    const [callout, toggle] = sanitizeEditorContent({
      blocks: [
        { type: 'callout', data: { text: 'hi<script>alert(1)</script>', variant: 'info' } },
        { type: 'toggle', data: { summary: '<img src=x onerror=alert(1)>t', content: 'b<script>x</script>', defaultCollapsed: false } }
      ]
    }).blocks
    assert.ok(!callout.data.text.includes('<script'))
    assert.ok(!toggle.data.summary.includes('onerror'))
    assert.ok(!toggle.data.content.includes('<script'))
  })

  it('falls back to info for a callout variant it does not know', () => {
    assert.equal(sanitizeOne({ type: 'callout', data: { text: 'x', variant: 'banana' } }).data.variant, 'info')
  })

  it('coerces a toggle defaultCollapsed to a boolean', () => {
    assert.equal(sanitizeOne({ type: 'toggle', data: { summary: 's', content: '', defaultCollapsed: 'yes' } }).data.defaultCollapsed, true)
  })

  it('stores code raw no matter how many times it is saved', () => {
    const code = `<b> & "double" 'single' &lt;`
    let content = { blocks: [{ type: 'code', data: { code } }] }
    for (let save = 0; save < 5; save++) content = sanitizeEditorContent(content)
    assert.equal(content.blocks[0].data.code, code)
  })

  it('drops a code language that is not a plain identifier', () => {
    assert.equal(sanitizeOne({ type: 'code', data: { code: 'x', language: '"><img src=x onerror=alert(1)>' } }).data.language, undefined)
    assert.equal(sanitizeOne({ type: 'code', data: { code: 'x', language: 'cpp' } }).data.language, 'cpp')
  })

  it('keeps the raw marker only when it is exactly "raw"', () => {
    assert.equal(sanitizeOne({ type: 'code', data: { code: 'x', encoding: 'base64' } }).data.encoding, undefined)
  })

  it('keeps only the embed services the editor enables', () => {
    assert.equal(sanitizeOne({ type: 'embed', data: { service: 'evil', source: 'https://example.com' } }).data.service, undefined)
    assert.equal(sanitizeOne({ type: 'embed', data: { service: 'vimeo', source: 'https://vimeo.com/1' } }).data.service, 'vimeo')
  })

  it('keeps embed dimensions only when they are positive numbers', () => {
    const { data } = sanitizeOne({ type: 'embed', data: { service: 'youtube', width: -5, height: '320' } })
    assert.equal(data.width, undefined)
    assert.equal(data.height, undefined)
  })

  it('keeps alignment only when it is left, center or right', () => {
    assert.equal(sanitizeOne({ type: 'paragraph', data: { text: 'x' }, tunes: { alignment: { alignment: 'justify' } } }).tunes, undefined)
  })

  it('drops tunes that save nothing, and unknown ones', () => {
    assert.equal(sanitizeOne({ type: 'paragraph', data: { text: 'x' }, tunes: { aiTune: { anything: 1 } } }).tunes, undefined)
  })

  it('still turns a block type it has never heard of into a paragraph', () => {
    assert.equal(sanitizeOne({ type: 'not_a_real_block', data: { text: 'x' } }).type, 'paragraph')
  })
})

describe('code is escaped where it is rendered, not where it is stored', () => {
  it('pages/share.js escapes code before injecting it as HTML', () => {
    const src = readSrc('pages/share.js')
    const at = src.indexOf("case 'code'")
    assert.ok(at !== -1, 'pages/share.js no longer has a code case — re-check how shared code is rendered')
    assert.match(src.slice(at, at + 200), /\.replace\(\/<\/g, '&lt;'\)/)
  })

  it('VersionHistoryModal renders code as text, not HTML', () => {
    const src = readSrc('components/VersionHistoryModal.js')
    const at = src.indexOf("case 'code'")
    assert.ok(at !== -1, 'VersionHistoryModal no longer has a code case — re-check how code previews render')
    const branch = src.slice(at, src.indexOf('case ', at + 12))
    assert.ok(!branch.includes('dangerouslySetInnerHTML'), 'code previews must render as text')
  })

  it('CodeBlock only writes code into the DOM as text or highlight.js output', () => {
    const src = readSrc('components/editor-tools/CodeBlock.js')
    const writes = [...src.matchAll(/innerHTML\s*=\s*([^\n;]+)/g)].map(match => match[1].trim())
    assert.deepEqual(writes, ['result.value'])
  })

  it('both producers of fresh code mark it raw', () => {
    assert.match(readSrc('components/editor-tools/CodeBlock.js'), /encoding: 'raw'/)
    assert.match(readSrc('components/Editor.js'), /type: 'code', data: \{ code: codeLines\.join\('\\n'\), encoding: 'raw' \}/)
  })
})

// The pre-v1.6.7 transform, copied here so these tests keep describing the
// damage even though securityUtils no longer contains it.
const LEGACY_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
const legacyEscape = (text) => text.replace(/[&<>"']/g, ch => LEGACY_ESCAPE[ch])

const CODE_SAMPLES = [
  'if (a < b && c > "d") {}',
  "it's",
  'x &lt; y', // someone genuinely writing an entity
  '&amp;&amp;',
  '<b>&nbsp;</b>',
  'plain text with no specials'
]

describe('migrateEditorData — repairs callouts and toggles the v1.6.6 sanitizer flattened', () => {
  it('restores a toggle, whose title and body had stopped rendering', () => {
    const original = { id: 't', type: 'toggle', data: { summary: 'Title', content: 'Body', defaultCollapsed: true } }
    const flattened = { ...original, type: 'paragraph' }
    assert.deepEqual(migrateEditorData({ blocks: [flattened] }).blocks[0], original)
  })

  it('restores a flattened toggle whose body was empty', () => {
    const flattened = { type: 'paragraph', data: { summary: 'Title', content: '', defaultCollapsed: false } }
    const repaired = migrateEditorData({ blocks: [flattened] }).blocks[0]
    assert.equal(repaired.type, 'toggle')
    assert.equal(repaired.data.summary, 'Title')
  })

  it('restores a callout', () => {
    const original = { id: 'c', type: 'callout', data: { text: 'Careful', variant: 'danger' } }
    assert.deepEqual(migrateEditorData({ blocks: [{ ...original, type: 'paragraph' }] }).blocks[0], original)
  })

  it('keeps the block id and tunes when restoring', () => {
    const flattened = { id: 'keep-me', type: 'paragraph', data: { summary: 's', content: 'c', defaultCollapsed: false }, tunes: { alignment: { alignment: 'center' } } }
    const repaired = migrateEditorData({ blocks: [flattened] }).blocks[0]
    assert.equal(repaired.id, 'keep-me')
    assert.deepEqual(repaired.tunes, { alignment: { alignment: 'center' } })
  })

  it('leaves genuine paragraphs alone and returns the same object when nothing needs repair', () => {
    const data = { blocks: [{ type: 'paragraph', data: { text: 'hi' } }, { type: 'paragraph', data: { text: 'x', variant: 'banana' } }] }
    assert.equal(migrateEditorData(data), data)
  })

  it('never mutates its input', () => {
    const data = { blocks: [{ type: 'paragraph', data: { summary: 'x', content: 'y', defaultCollapsed: false } }] }
    const before = structuredClone(data)
    migrateEditorData(data)
    assert.deepEqual(data, before)
  })
})

describe('migrateEditorData — repairs code the old sanitizer escaped', () => {
  it('decodes exactly one level of the old escaping', () => {
    for (const sample of CODE_SAMPLES) {
      assert.equal(decodeLegacyCodeEscaping(legacyEscape(sample)), sample, sample)
    }
  })

  it('recognises the old escaping, and nothing containing raw < > quotes or a bare &', () => {
    for (const sample of CODE_SAMPLES) {
      const escaped = legacyEscape(sample)
      assert.equal(isLegacyEscapedCode(escaped), escaped.includes('&'), sample)
    }
    for (const raw of ['a < b', 'say "hi"', "it's", 'a && b', 'x &nbsp y', undefined, 42]) {
      assert.equal(isLegacyEscapedCode(raw), false, String(raw))
    }
  })

  it('restores code stored by the old sanitizer, keeping its language', () => {
    for (const sample of CODE_SAMPLES) {
      const stored = { type: 'code', data: { code: legacyEscape(sample), language: 'auto' } }
      const repaired = migrateEditorData({ blocks: [stored] }).blocks[0]
      assert.equal(repaired.data.code, sample, sample)
      assert.equal(repaired.data.language, 'auto')
    }
  })

  it('marks repaired code raw so it is never decoded twice', () => {
    const once = migrateEditorData({ blocks: [{ type: 'code', data: { code: legacyEscape('a < b') } }] })
    assert.equal(once.blocks[0].data.encoding, 'raw')
    assert.equal(migrateEditorData(once), once)
  })

  it('never decodes code already marked raw', () => {
    const data = { blocks: [{ type: 'code', data: { code: 'x &lt; y', encoding: 'raw' } }] }
    assert.equal(migrateEditorData(data), data)
  })

  it('recovers exactly when a device still on v1.6.6 re-saved raw code', () => {
    // That device escapes once and its sanitizer drops the marker.
    const raw = 'x &lt; y'
    const fromOldDevice = { type: 'code', data: { code: legacyEscape(raw) } }
    assert.equal(migrateEditorData({ blocks: [fromOldDevice] }).blocks[0].data.code, raw)
  })

  it('undoes one level of repeated escaping and never over-decodes', () => {
    // Code edited after a reload was escaped again on each save. Beyond one
    // level, damage and genuinely typed entities cannot be told apart.
    const sample = 'if (a < b && c > "d") {}'
    const twice = { type: 'code', data: { code: legacyEscape(legacyEscape(sample)) } }
    assert.equal(migrateEditorData({ blocks: [twice] }).blocks[0].data.code, legacyEscape(sample))
  })
})

describe('migrateEditorData — repairs embeds that lost their service', () => {
  it('identifies each enabled service from its source URL', () => {
    assert.equal(inferEmbedService('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube')
    assert.equal(inferEmbedService('https://youtu.be/dQw4w9WgXcQ'), 'youtube')
    assert.equal(inferEmbedService('https://vimeo.com/76979871'), 'vimeo')
    assert.equal(inferEmbedService('https://gist.github.com/someone/0123456789abcdef'), 'github')
    assert.equal(inferEmbedService('https://twitter.com/someone/status/1234567890'), 'twitter')
    assert.equal(inferEmbedService('https://x.com/someone/status/1234567890'), 'twitter')
    assert.equal(inferEmbedService('https://example.com/video'), null)
    assert.equal(inferEmbedService(null), null)
  })

  it('restores the service and default size, so the embed renders again', () => {
    const stored = { type: 'embed', data: { source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embed: 'https://www.youtube.com/embed/dQw4w9WgXcQ', caption: '' } }
    const { data } = migrateEditorData({ blocks: [stored] }).blocks[0]
    assert.equal(data.service, 'youtube')
    assert.equal(data.width, 580)
    assert.equal(data.height, 320)
  })

  it('keeps dimensions an embed already has', () => {
    const stored = { type: 'embed', data: { source: 'https://twitter.com/someone/status/1', width: 400, height: 500 } }
    const { data } = migrateEditorData({ blocks: [stored] }).blocks[0]
    assert.equal(data.service, 'twitter')
    assert.equal(data.width, 400)
    assert.equal(data.height, 500)
  })

  it('leaves an embed alone when it has a service or cannot be identified', () => {
    const data = { blocks: [
      { type: 'embed', data: { service: 'vimeo', source: 'https://vimeo.com/1' } },
      { type: 'embed', data: { source: 'https://example.com/video' } }
    ] }
    assert.equal(migrateEditorData(data), data)
  })
})

describe('repair and sanitizer agree', () => {
  it('keeps a repaired note intact through the fixed sanitizer', () => {
    const damaged = {
      blocks: [
        { id: 't', type: 'paragraph', data: { summary: 'T', content: 'B', defaultCollapsed: false } },
        { id: 'c', type: 'paragraph', data: { text: 'Careful', variant: 'danger' } },
        { id: 'k', type: 'code', data: { code: legacyEscape('a < b'), language: 'python' } },
        { id: 'e', type: 'embed', data: { source: 'https://vimeo.com/76979871', embed: 'https://player.vimeo.com/video/76979871?title=0&byline=0', caption: '' } }
      ]
    }
    const repaired = migrateEditorData(damaged)
    assert.deepEqual(sanitizeEditorContent(repaired).blocks, repaired.blocks)
  })
})
