/**
 * Lexical editor states (Standard Notes' Super notes) to note drafts.
 *
 * A Super note stores its content as the JSON of a Lexical editor state: a
 * tree of paragraphs, headings, lists, tables and so on, with text formatting
 * as bit flags. Standard Notes adds its own nodes for files, links to other
 * notes (bubbles), images and embeds.
 *
 * DOM-free so it runs under `node --test`.
 */

import { flattenDrafts } from '../blocks.js'
import { safeHref } from '../inline.js'

/** A Lexical editor state from a note's text, or null when it isn't one. */
export function parseLexicalState (text) {
  if (typeof text !== 'string' || !/^\s*\{/.test(text)) return null
  try {
    const state = JSON.parse(text)
    return state?.root?.type === 'root' ? state : null
  } catch {
    return null
  }
}

// Lexical's text format bits
const BOLD = 1
const ITALIC = 2
const STRIKETHROUGH = 4
const UNDERLINE = 8
const CODE = 16
const HIGHLIGHT = 128

function textRun (node, style) {
  const format = Number(node.format) || 0
  const run = { ...style, text: typeof node.text === 'string' ? node.text : '' }
  if (format & BOLD) run.b = true
  if (format & ITALIC) run.i = true
  if (format & STRIKETHROUGH) run.s = true
  if (format & UNDERLINE) run.u = true
  if (format & CODE) run.code = true
  if (format & HIGHLIGHT) run.mark = true
  return run
}

function inline (nodes, style, context, out = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    switch (node?.type) {
      case 'text':
      case 'hashtag':
      case 'code-highlight':
        out.push(textRun(node, style))
        break
      case 'linebreak':
        out.push({ br: true })
        break
      case 'tab':
        out.push({ ...style, text: ' ' })
        break
      case 'link':
      case 'autolink':
        inline(node.children, { ...style, href: node.url }, context, out)
        break
      case 'snbubble': {
        const target = context.noteLink?.(node.itemUuid)
        if (!target?.pageRef) context.report('link-kept-as-text')
        out.push({ ...style, text: target?.title || 'Linked note', ...(target?.pageRef ? { pageRef: target.pageRef } : {}) })
        break
      }
      default:
        if (Array.isArray(node?.children)) inline(node.children, style, context, out)
        else if (typeof node?.text === 'string') out.push({ ...style, text: node.text })
        else if (node) context.report('unsupported-content')
    }
  }
  return out
}

function codeOf (nodes) {
  return (Array.isArray(nodes) ? nodes : []).map(node => {
    if (node?.type === 'linebreak') return '\n'
    if (node?.type === 'tab') return '\t'
    if (typeof node?.text === 'string') return node.text
    return codeOf(node?.children)
  }).join('')
}

function listItems (list, context, drafts, depth) {
  const listType = list.listType === 'number' ? 'numbered' : list.listType === 'check' ? 'checklist' : 'bullet'
  for (const item of Array.isArray(list.children) ? list.children : []) {
    if (item?.type !== 'listitem') {
      blocks([item], context, drafts, depth)
      continue
    }
    const children = Array.isArray(item.children) ? item.children : []
    const content = children.filter(child => child?.type !== 'list')
    // Lexical nests a sub-list inside an item of its own, with no text
    if (content.length > 0) {
      const draft = { kind: 'list', listType, indent: depth, runs: inline(content, {}, context) }
      if (listType === 'checklist') draft.checked = Boolean(item.checked)
      drafts.push(draft)
    }
    for (const sub of children.filter(child => child?.type === 'list')) listItems(sub, context, drafts, depth + 1)
  }
}

function table (node, context, drafts) {
  const after = []
  const rows = (node.children || []).filter(row => row?.type === 'tablerow').map(row =>
    (row.children || []).filter(cell => cell?.type === 'tablecell').map(cell => {
      const { runs, rest } = flattenDrafts(blocks(cell.children, context, []))
      if (rest.length > 0) {
        context.report('table-content-moved')
        after.push(...rest)
      }
      return runs
    }))
  const first = (node.children || [])[0]?.children || []
  const withHeadings = first.length > 0 && first.every(cell => (Number(cell?.headerState) & 1) === 1)
  drafts.push({ kind: 'table', rows, withHeadings }, ...after)
}

function linkParagraph (href, text) {
  return { kind: 'paragraph', runs: [{ text, href }] }
}

function blocks (nodes, context, drafts, depth = 0) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    switch (node?.type) {
      case 'paragraph':
        drafts.push({ kind: 'paragraph', runs: inline(node.children, {}, context) })
        break
      case 'heading':
        drafts.push({ kind: 'heading', level: Number(String(node.tag || '').slice(1)) || 1, runs: inline(node.children, {}, context) })
        break
      case 'quote':
        drafts.push({ kind: 'quote', runs: inline(node.children, {}, context) })
        break
      case 'list':
        listItems(node, context, drafts, depth)
        break
      case 'code':
        drafts.push({ kind: 'code', code: codeOf(node.children), language: node.language || '' })
        break
      case 'horizontalrule':
        drafts.push({ kind: 'divider' })
        break
      case 'table':
        table(node, context, drafts)
        break
      case 'collapsible-container': {
        const children = Array.isArray(node.children) ? node.children : []
        const title = children.find(child => child?.type === 'collapsible-title')
        const content = children.find(child => child?.type === 'collapsible-content')
        const summary = flattenDrafts([{ kind: 'paragraph', runs: inline(title?.children, {}, context) }])
        const body = flattenDrafts(blocks(content?.children, context, []))
        drafts.push({ kind: 'toggle', summaryRuns: summary.runs, contentRuns: body.runs, collapsed: node.open === false })
        if (body.rest.length > 0) {
          context.report('toggle-content-moved')
          drafts.push(...body.rest)
        }
        break
      }
      case 'snfile':
        context.report('file-not-in-backup')
        drafts.push({ kind: 'paragraph', runs: [{ text: `[File not included in the backup: ${context.fileName?.(node.fileUuid) || 'file'}]`, i: true }] })
        break
      case 'inline-file':
      case 'unencrypted-image': {
        const name = node.fileName || node.alt || ''
        const resource = context.dataResource?.(node.src, name)
        if (resource) {
          drafts.push(resource.photo
            ? { kind: 'photo', resource: resource.key, captionRuns: [] }
            : { kind: 'file', resource: resource.key, name: name || 'File' })
        } else if (safeHref(node.src)) {
          context.report('remote-photo')
          drafts.push(linkParagraph(node.src, name || node.src))
        } else {
          context.report('missing-photo')
          drafts.push({ kind: 'paragraph', runs: [{ text: `[Photo not found: ${name || 'photo'}]`, i: true }] })
        }
        break
      }
      case 'youtube':
        context.report('embedded-media')
        drafts.push(linkParagraph(`https://www.youtube.com/watch?v=${encodeURIComponent(node.videoID || '')}`, 'YouTube video'))
        break
      case 'tweet':
        context.report('embedded-media')
        drafts.push(linkParagraph(`https://twitter.com/i/web/status/${encodeURIComponent(node.id || '')}`, 'Post on X'))
        break
      case 'snbubble':
        drafts.push({ kind: 'paragraph', runs: inline([node], {}, context) })
        break
      default:
        if (Array.isArray(node?.children)) blocks(node.children, context, drafts, depth)
        else if (typeof node?.text === 'string') drafts.push({ kind: 'paragraph', runs: [{ text: node.text }] })
        else if (node) context.report('unsupported-content')
    }
  }
  return drafts
}

/**
 * Drafts from a Lexical editor state.
 *
 * @param {object} state - {root: {...}}
 * @param {object} [options]
 * @param {(uuid: string) => {pageRef?: string, title?: string}|null} [options.noteLink] - a linked note
 * @param {(uuid: string) => string|null} [options.fileName] - a file's name, for files a backup doesn't hold
 * @param {(src: string, name: string) => {key: string, photo: boolean}|null} [options.dataResource] - an embedded data URL as a resource
 * @returns {{drafts: Array, issues: object}}
 */
export function lexicalToDrafts (state, options = {}) {
  const issues = {}
  const context = {
    ...options,
    report: (code) => {
      issues[code] = (issues[code] || 0) + 1
    }
  }
  const drafts = blocks(state?.root?.children, context, [])
  return { drafts, issues }
}
