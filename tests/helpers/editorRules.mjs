/**
 * The rules Editor.js applies to each field on save, for tests that check
 * imported blocks survive an edit unchanged. Merged the way
 * BlockTool.sanitizeConfig merges a tool's field rules over its inline tools'
 * rules. Sources: the built-in bold, italic and link tools; @editorjs/marker,
 * inline-code and underline; Paragraph in components/Editor.js; the list,
 * Callout and Toggle tools; @editorjs/quote and @editorjs/header.
 * tests/import-inline.test.mjs checks the sources still say so.
 */

import { JSDOM } from 'jsdom'

const INLINE_TOOLS = { b: {}, i: {}, a: { href: true, target: '_blank', rel: 'nofollow' }, mark: { class: 'cdx-marker' }, code: { class: 'inline-code' }, u: { class: 'cdx-underline' } }
const RICH = { br: true, b: true, strong: true, i: true, em: true, u: true, s: true, mark: true, code: true, a: { href: true, target: '_blank', rel: 'noopener noreferrer', 'data-page-id': true, class: true } }

export const EDITOR_RULES = {
  paragraph: { ...INLINE_TOOLS, ...RICH },
  callout: { ...INLINE_TOOLS, ...RICH, mark: { class: true }, code: { class: true } },
  quote: { ...INLINE_TOOLS, br: true },
  table: INLINE_TOOLS,
  header: { mark: { class: 'cdx-marker' }, code: { class: 'inline-code' } }
}

const { document } = new JSDOM('<!doctype html><body></body>').window

/** Why HTMLJanitor (inside Editor.js) would change this HTML, or null. */
export function editorWouldChange (html, rules) {
  const root = document.createElement('div')
  root.innerHTML = html
  for (const element of root.querySelectorAll('*')) {
    const rule = rules[element.localName]
    if (rule === undefined || rule === false) return `<${element.localName}> is removed`
    if (rule === true) continue
    for (const attribute of Array.from(element.attributes)) {
      const allowed = rule[attribute.name]
      if (allowed === undefined || allowed === false) return `${attribute.name} is removed from <${element.localName}>`
      if (typeof allowed === 'string' && allowed !== attribute.value) return `${attribute.name}="${attribute.value}" is removed from <${element.localName}>`
    }
  }
  return root.innerHTML === html ? null : `parsing changes it to ${root.innerHTML}`
}

const FIELDS = {
  paragraph: { text: 'paragraph' },
  header: { text: 'header' },
  bulletListItem: { text: 'paragraph' },
  numberedListItem: { text: 'paragraph' },
  checklistItem: { text: 'paragraph' },
  quote: { text: 'quote', caption: 'quote' },
  callout: { text: 'callout' },
  toggle: { summary: 'callout', content: 'callout' },
  image: { caption: 'paragraph' }
}

/** Every field in these blocks that Editor.js would change on save, as messages. */
export function editorChanges (blocks) {
  const changes = []
  for (const block of blocks) {
    const fields = FIELDS[block.type] || {}
    for (const [field, rules] of Object.entries(fields)) {
      const why = editorWouldChange(block.data[field] ?? '', EDITOR_RULES[rules])
      if (why) changes.push(`${block.type}.${field}: ${why}`)
    }
    if (block.type === 'table') {
      for (const cell of block.data.content.flat()) {
        const why = editorWouldChange(cell, EDITOR_RULES.table)
        if (why) changes.push(`table cell: ${why}`)
      }
    }
  }
  return changes
}
