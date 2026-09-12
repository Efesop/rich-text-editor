/**
 * Note templates: variables, new block ids, and built-in templates that
 * survive the editor's save unchanged.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const { BUILT_IN_TEMPLATES, TEMPLATE_VARIABLES, fillVariables, instantiateTemplate, isTemplateNote, suggestedTitle, templateChoices, templateNoteIds, templatesFolder, templateValues, userTemplates } = await import('../lib/templates.js')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { sameData } = await import('../lib/import/commit.js')
const { editorChanges } = await import('./helpers/editorRules.mjs')

// Friday 11 September 2026, 14:30 on this machine's clock
const NOW = new Date(2026, 8, 11, 14, 30)

describe('templateValues', () => {
  it('formats the date, time and weekday in the given language', () => {
    assert.deepEqual(templateValues({ now: NOW, locale: 'en-GB', title: 'Standup' }), { date: '11 September 2026', time: '14:30', weekday: 'Friday', title: 'Standup' })
    assert.equal(templateValues({ now: NOW, locale: 'en-US' }).date, 'September 11, 2026')
    assert.deepEqual(TEMPLATE_VARIABLES, ['date', 'time', 'weekday', 'title'])
  })
})

describe('fillVariables', () => {
  const values = { date: '11 September 2026', time: '14:30', weekday: 'Friday', title: 'Q&A <draft>' }

  it('fills known variables, in any case and spacing, and leaves others as typed', () => {
    assert.equal(fillVariables('{{ Weekday }} {{date}} at {{TIME}}', values), 'Friday 11 September 2026 at 14:30')
    assert.equal(fillVariables('Hello {{name}} {{date', values), 'Hello {{name}} {{date')
  })

  it('escapes values going into editor HTML, not into plain text', () => {
    assert.equal(fillVariables('<b>{{title}}</b>', values, { html: true }), '<b>Q&amp;A &lt;draft&gt;</b>')
    assert.equal(fillVariables('{{title}}', values), 'Q&A <draft>')
  })
})

describe('instantiateTemplate', () => {
  it('fills text people read, never code or links, and gives every block a new id', () => {
    let n = 0
    const template = {
      title: 'Call {{date}}',
      blocks: [
        { id: 'keep-1', type: 'paragraph', data: { text: '{{weekday}} — <i>{{title}}</i>' } },
        { id: 'keep-2', type: 'code', data: { code: 'echo {{date}}', language: 'bash' } },
        { id: 'keep-3', type: 'table', data: { withHeadings: false, stretched: false, content: [['{{time}}', 'x']] } },
        { id: 'keep-4', type: 'embed', data: { service: 'youtube', source: 'https://example.com/{{date}}', caption: 'On {{date}}' } }
      ]
    }
    const note = instantiateTemplate(template, { now: NOW, locale: 'en-GB', newId: () => `new-${++n}` })
    assert.equal(note.title, 'Call 11 September 2026')
    assert.deepEqual(note.content.blocks.map(block => block.id), ['new-1', 'new-2', 'new-3', 'new-4'])
    assert.equal(note.content.blocks[0].data.text, 'Friday — <i>Call 11 September 2026</i>')
    assert.equal(note.content.blocks[1].data.code, 'echo {{date}}')
    assert.deepEqual(note.content.blocks[2].data.content, [['14:30', 'x']])
    assert.equal(note.content.blocks[3].data.source, 'https://example.com/{{date}}')
    assert.equal(note.content.blocks[3].data.caption, 'On 11 September 2026')
    assert.equal(note.content.time, NOW.getTime())
    assert.equal(template.blocks[0].data.text, '{{weekday}} — <i>{{title}}</i>', 'the template itself is unchanged')
  })

  it('uses a title given for the note, and New Page when there is none', () => {
    assert.equal(instantiateTemplate({ title: 'Plan', blocks: [] }, { title: 'Launch plan', now: NOW }).title, 'Launch plan')
    assert.equal(instantiateTemplate({ blocks: [] }, { now: NOW }).title, 'New Page')
  })

  it('makes built-in notes the editor and the sanitizer keep exactly as they are', () => {
    assert.deepEqual(BUILT_IN_TEMPLATES.map(template => template.name), ['Meeting notes', 'Daily journal', 'To-do list', 'Project plan', 'Weekly review'])
    for (const template of BUILT_IN_TEMPLATES) {
      const note = instantiateTemplate(template, { now: NOW, locale: 'en-GB' })
      assert.ok(note.content.blocks.length > 0, template.name)
      assert.ok(!JSON.stringify(note).includes('{{'), `${template.name} has no unfilled variables`)
      assert.ok(sameData(sanitizeEditorContent(note.content), note.content), `${template.name} survives the sanitizer`)
      assert.deepEqual(editorChanges(note.content.blocks), [], `${template.name} survives the editor's save`)
    }
  })
})

describe('your templates', () => {
  const pages = [
    { id: 'n1', title: 'Note', content: { blocks: [] } },
    { id: 'tf', type: 'folder', title: 'Templates', templates: true, pages: ['t2', 't1'] },
    { id: 't1', title: 'Client call · {{date}}', folderId: 'tf', content: { blocks: [{ id: 'b', type: 'paragraph', data: { text: '{{weekday}}' } }] } },
    { id: 't2', title: 'Standup', folderId: 'tf', content: { blocks: [] } },
    { id: 't3', title: 'Locked', folderId: 'tf', content: null, encryptedContent: { data: [1], iv: [1] } },
    { id: 'other', type: 'folder', title: 'Templates', pages: ['n1'] }
  ]

  it('finds the templates folder by its flag, not its name, and the notes in it', () => {
    assert.equal(templatesFolder(pages).id, 'tf')
    assert.deepEqual([...templateNoteIds(pages)].sort(), ['t1', 't2', 't3'])
    assert.equal(isTemplateNote(pages[2], pages), true)
    assert.equal(isTemplateNote(pages[0], pages), false)
    assert.equal(templatesFolder([{ id: 'x', type: 'folder', title: 'Templates', pages: [] }]), null)
  })

  it('offers Blank, the built-in templates, then your readable templates in the folder order', () => {
    const choices = templateChoices(pages)
    assert.deepEqual(choices.map(choice => choice.id), ['blank', 'meeting-notes', 'daily-journal', 'to-do-list', 'project-plan', 'weekly-review', 'note:t2', 'note:t1'])
    assert.deepEqual(userTemplates(pages).map(page => page.id), ['t2', 't1'])
    assert.equal(suggestedTitle(choices.at(-1).template, { now: NOW, locale: 'en-GB' }), 'Client call · 11 September 2026')
    assert.equal(suggestedTitle(null), '')
  })
})
