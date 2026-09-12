/**
 * Note templates: the ones Dash comes with, and making a new note's content
 * from any template with its variables filled in.
 *
 * A template is a title and a list of blocks. Text in either can hold
 * {{date}}, {{time}}, {{weekday}} and {{title}}, which are filled in when a
 * note is made from it, in the person's own language. Variables are only
 * filled in text people read (paragraphs, headings, list items, quotes,
 * callouts, captions and table cells), never in code, links or file names.
 *
 * DOM-free so it runs under `node --test`.
 */

import { createBlockId, editorContent } from './import/blocks.js'
import { escapeHtmlText } from './import/inline.js'

export const TEMPLATE_VARIABLES = Object.freeze(['date', 'time', 'weekday', 'title'])

const VARIABLE = /\{\{\s*(date|time|weekday|title)\s*\}\}/gi

// Block data keys whose strings are editor HTML people read, and keys whose
// values are never touched
const TEXT_KEYS = new Set(['text', 'caption', 'summary', 'title', 'content'])
const RAW_KEYS = new Set(['code', 'language', 'url', 'link', 'href', 'file', 'filename', 'attachmentId', 'mimeType', 'id', 'service', 'embed', 'source', 'words'])

/** The values a template's variables take for a note made at `now`. */
export function templateValues ({ now = new Date(), locale, title = '' } = {}) {
  const at = now instanceof Date ? now : new Date(now)
  const format = (options) => new Intl.DateTimeFormat(locale, options).format(at)
  return {
    date: format({ day: 'numeric', month: 'long', year: 'numeric' }),
    time: format({ hour: 'numeric', minute: '2-digit' }),
    weekday: format({ weekday: 'long' }),
    title: String(title || '')
  }
}

/** Fills the variables in plain text, or in editor HTML when `html` is set. */
export function fillVariables (text, values, { html = false } = {}) {
  if (typeof text !== 'string' || !text.includes('{{')) return text
  return text.replace(VARIABLE, (match, name) => {
    const value = values?.[name.toLowerCase()]
    if (typeof value !== 'string') return match
    return html ? escapeHtmlText(value) : value
  })
}

function fillData (value, values, inText) {
  if (typeof value === 'string') return inText ? fillVariables(value, values, { html: true }) : value
  if (Array.isArray(value)) return value.map(item => fillData(item, values, inText))
  if (value && typeof value === 'object') {
    const filled = {}
    for (const [key, item] of Object.entries(value)) {
      filled[key] = RAW_KEYS.has(key) ? item : fillData(item, values, inText || TEXT_KEYS.has(key))
    }
    return filled
  }
  return value
}

/**
 * A new note's title and content from a template. Variables are filled in,
 * and every block gets a new id, so notes made from the same template never
 * share block ids.
 *
 * @param {{title?: string, blocks?: object[]}} template
 * @param {object} [options]
 * @param {Date|number} [options.now]
 * @param {string} [options.locale] - defaults to the device's
 * @param {string} [options.title] - use this title instead of the template's
 * @param {() => string} [options.newId]
 * @returns {{title: string, content: {time: number, blocks: object[], version: string}}}
 */
export function instantiateTemplate (template, { now = new Date(), locale, title, newId = createBlockId } = {}) {
  const at = now instanceof Date ? now : new Date(now)
  const values = templateValues({ now: at, locale })
  const filledTitle = fillVariables(String(title ?? template?.title ?? ''), values).trim() || 'New Page'
  values.title = filledTitle
  const blocks = (Array.isArray(template?.blocks) ? template.blocks : [])
    .filter(block => block && typeof block.type === 'string')
    .map(block => ({
      id: newId(),
      type: block.type,
      data: fillData(block.data ?? {}, values, false),
      ...(block.tunes ? { tunes: block.tunes } : {})
    }))
  return { title: filledTitle, content: editorContent(blocks, at.getTime()) }
}

const header = (text) => ({ type: 'header', data: { text, level: 2 } })
const paragraph = (text = '') => ({ type: 'paragraph', data: { text } })
const bullet = () => ({ type: 'bulletListItem', data: { text: '' } })
const numbered = () => ({ type: 'numberedListItem', data: { text: '' } })
const todo = () => ({ type: 'checklistItem', data: { text: '', checked: false } })

/** The templates Dash comes with. `icon` names a lucide-react icon. */
export const BUILT_IN_TEMPLATES = Object.freeze([
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    icon: 'Users',
    title: 'Meeting notes {{date}}',
    blocks: [paragraph('{{weekday}} {{date}}, {{time}}'), header('Attendees'), bullet(), header('Agenda'), numbered(), header('Notes'), paragraph(), header('Actions'), todo()]
  },
  {
    id: 'daily-journal',
    name: 'Daily journal',
    icon: 'BookOpen',
    title: '{{weekday}} {{date}}',
    blocks: [header('Top three'), todo(), todo(), todo(), header('Grateful for'), bullet(), header('Notes'), paragraph()]
  },
  {
    id: 'to-do-list',
    name: 'To-do list',
    icon: 'ListChecks',
    title: 'To-do',
    blocks: [header('Today'), todo(), header('This week'), todo(), header('Later'), todo()]
  },
  {
    id: 'project-plan',
    name: 'Project plan',
    icon: 'Target',
    title: 'Project plan',
    blocks: [
      header('Goal'), paragraph(),
      header('Milestones'), { type: 'table', data: { withHeadings: true, stretched: false, content: [['Milestone', 'Owner', 'Due'], ['', '', '']] } },
      header('Risks'), bullet(),
      header('Next steps'), todo()
    ]
  },
  {
    id: 'weekly-review',
    name: 'Weekly review',
    icon: 'CalendarCheck',
    title: 'Week of {{date}}',
    blocks: [header('What went well'), bullet(), header('What didn’t'), bullet(), header('Next week'), todo()]
  }
])

/** The folder holding your own templates, if there is one. It is marked by a flag, not its name. */
export function templatesFolder (pages) {
  return (Array.isArray(pages) ? pages : []).find(item => item?.type === 'folder' && item.templates === true && !item.trashed) || null
}

/** The ids of the notes in the templates folder. */
export function templateNoteIds (pages) {
  const list = Array.isArray(pages) ? pages : []
  const folder = templatesFolder(list)
  if (!folder) return new Set()
  const ids = new Set(Array.isArray(folder.pages) ? folder.pages : [])
  for (const page of list) if (page?.type !== 'folder' && page?.folderId === folder.id) ids.add(page.id)
  return ids
}

/** Whether a note is one of your templates. */
export function isTemplateNote (page, pages) {
  return Boolean(page && page.type !== 'folder' && templateNoteIds(pages).has(page.id))
}

/** Your templates, in the folder's order. Notes whose content can't be read (locked) are left out. */
export function userTemplates (pages) {
  const list = Array.isArray(pages) ? pages : []
  const folder = templatesFolder(list)
  if (!folder) return []
  const byId = new Map(list.map(page => [page?.id, page]))
  const listed = (Array.isArray(folder.pages) ? folder.pages : []).map(id => byId.get(id))
  const extra = list.filter(page => page?.type !== 'folder' && page?.folderId === folder.id && !listed.includes(page))
  return [...listed, ...extra].filter(page => page && page.type !== 'folder' && !page.trashed && Array.isArray(page.content?.blocks))
}

/** What the new-note dialog offers: Blank, the built-in templates, then yours. */
export function templateChoices (pages) {
  return [
    { id: 'blank', name: 'Blank', icon: 'FileText', kind: 'blank', template: null },
    ...BUILT_IN_TEMPLATES.map(template => ({ id: template.id, name: template.name, icon: template.icon, kind: 'built-in', template })),
    ...userTemplates(pages).map(page => ({ id: `note:${page.id}`, name: page.title || 'Untitled', icon: 'LayoutTemplate', kind: 'yours', template: { title: page.title || '', blocks: page.content.blocks } }))
  ]
}

/** The name a template suggests for a note made from it at `now`. */
export function suggestedTitle (template, { now = new Date(), locale } = {}) {
  return fillVariables(String(template?.title ?? ''), templateValues({ now, locale })).trim()
}
