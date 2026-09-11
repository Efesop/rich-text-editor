/**
 * Notion workspaces exported as HTML (Settings, Export, HTML, with subpages).
 *
 * The export is a zip, in parts for big workspaces: one HTML file per page,
 * named "Title <32-character id>.html", with the page's subpages and files in
 * a folder of the same name. Links between pages are relative paths; links to
 * pages elsewhere carry the page's id in a notion.so address.
 *
 * DOM-free so it runs under `node --test`.
 */

import { htmlToDrafts, nodeText, parseHtml } from '../htmlToBlocks.js'
import { finishBlocks } from '../blocks.js'
import { noteDates, parseAnyDate } from '../dates.js'
import { safeHref } from '../inline.js'
import { propertiesTable } from '../markdownToBlocks.js'
import { basename, resolveRelative } from '../paths.js'
import { dataUrlResource, isPhotoType, mimeTypeFor } from '../resources.js'
import { cleanTitle, titleFromFilename } from '../titles.js'

const isTag = (node) => node?.type === 'tag'
const hasClass = (node, name) => ` ${node?.attribs?.class || ''} `.includes(` ${name} `)

function find (nodes, predicate) {
  for (const node of nodes || []) {
    if (isTag(node) && predicate(node)) return node
    const found = find(node?.children, predicate)
    if (found) return found
  }
  return null
}

function findAll (nodes, predicate, out = []) {
  for (const node of nodes || []) {
    if (isTag(node) && predicate(node)) out.push(node)
    findAll(node?.children, predicate, out)
  }
  return out
}

const PAGE_ID = /(?:^|[\s-])([0-9a-f]{32})$/i

/** The Notion page id at the end of a page's file or folder name, or null. */
export function notionPageId (path) {
  const match = PAGE_ID.exec(basename(path).replace(/\.html?$/i, ''))
  return match ? match[1].toLowerCase() : null
}

const withoutId = (segment) => segment.replace(/\.html?$/i, '').replace(/\s+[0-9a-f]{32}$/i, '')

const cp = (...codes) => codes.map(code => String.fromCodePoint(code))
const CALLOUT_ICONS = [
  ['warning', cp(0x26A0, 0x1F6A7, 0x2757, 0x203C, 0x1F525)],
  ['danger', cp(0x274C, 0x1F6AB, 0x26D4, 0x1F6D1, 0x2620)],
  ['done', cp(0x2705, 0x2714, 0x2611, 0x1F389)],
  ['tip', cp(0x1F4A1, 0x2728, 0x1F4CC, 0x2B50)]
]

function calloutVariant (icon) {
  for (const [variant, emoji] of CALLOUT_ICONS) {
    if (emoji.some(e => icon.includes(e))) return variant
  }
  return 'info'
}

function texOf (node) {
  const annotation = find(node?.children, n => n.name === 'annotation')
  return annotation ? nodeText(annotation).trim() : nodeText(node).trim()
}

function readProperties (header) {
  const table = find(header?.children, n => n.name === 'table' && hasClass(n, 'properties'))
  const entries = []
  const tags = []
  let created = null
  let updated = null
  for (const row of findAll(table?.children, n => n.name === 'tr')) {
    const type = /property-row-(\S+)/.exec(row.attribs.class || '')?.[1] || ''
    const cells = (row.children || []).filter(n => isTag(n) && (n.name === 'th' || n.name === 'td'))
    const name = nodeText(cells[0]).replace(/\s+/g, ' ').trim()
    if (!name || !cells[1]) continue
    const selected = findAll(cells[1].children, n => hasClass(n, 'selected-value')).map(n => nodeText(n).trim()).filter(Boolean)
    const checkbox = find(cells[1].children, n => hasClass(n, 'checkbox'))
    const value = selected.length > 0
      ? selected.join(', ')
      : checkbox ? (hasClass(checkbox, 'checkbox-on') ? 'Yes' : 'No') : nodeText(cells[1]).replace(/@/g, '').replace(/\s+/g, ' ').trim()
    if (type === 'created_time') {
      created = parseAnyDate(value) ?? created
    } else if (type === 'last_edited_time') {
      updated = parseAnyDate(value) ?? updated
    } else if (/^tags?$/i.test(name) && selected.length > 0) {
      tags.push(...selected)
    } else {
      entries.push([name, value])
    }
  }
  return { entries, tags, created, updated }
}

/**
 * One Notion page as an import note.
 *
 * @param {import('../source.js').SourceFile} file
 * @param {object} context - from notionNotes
 */
export async function convertNotionPage (file, { byPath, pagePaths, pageById, folders, exportRoot, newId, pageRefFor }) {
  const issues = {}
  const report = (code, count = 1) => {
    issues[code] = (issues[code] || 0) + count
  }
  const dom = parseHtml(await file.text())
  const article = find(dom.children, n => n.name === 'article')
  const header = find(article ? article.children : dom.children, n => n.name === 'header')
  const title = cleanTitle(
    nodeText(find(header?.children, n => n.name === 'h1' && hasClass(n, 'page-title'))) ||
    nodeText(find(dom.children, n => n.name === 'title')),
    { fallback: withoutId(file.name) || titleFromFilename(file.name) }
  )

  const resources = new Map()
  const resourceFor = (path) => {
    if (!resources.has(path)) {
      const source = byPath.get(path)
      resources.set(path, { key: path, name: source.name, mimeType: mimeTypeFor(source.name), size: source.size, file: source })
    }
    return path
  }
  const pageByUrlId = (url) => {
    const id = /([0-9a-f]{32})(?:[?#/]|$)/i.exec(url)?.[1]?.toLowerCase()
    return id && pageById.has(id) ? pageById.get(id) : null
  }
  const resolveLink = (href) => {
    if (href.startsWith('#')) return null
    const safe = safeHref(href)
    if (safe) {
      const page = /^https?:\/\/([a-z0-9-]+\.)*notion\.(so|site)\//i.test(safe) ? pageByUrlId(safe) : null
      return page ? { pageRef: pageRefFor(page) } : { href: safe }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
    const path = resolveRelative(file.path, href)
    if (/\.html?$/i.test(path)) {
      const page = pagePaths.has(path) ? path : pageById.get(notionPageId(path))
      return page ? { pageRef: pageRefFor(page) } : null
    }
    return byPath.has(path) ? { file: resourceFor(path), name: basename(path) } : null
  }
  const resolveImage = (src) => {
    const inline = dataUrlResource(src, `${file.path}/inline-${resources.size + 1}`)
    if (inline) {
      resources.set(inline.key, inline)
      return { resource: inline.key }
    }
    if (safeHref(src) || /^[a-z][a-z0-9+.-]*:/i.test(src)) return null
    const path = resolveRelative(file.path, src)
    if (!byPath.has(path)) return null
    return isPhotoType(mimeTypeFor(path)) ? { resource: resourceFor(path) } : null
  }

  const drafts = []
  const cover = find(header?.children, n => n.name === 'img' && hasClass(n, 'page-cover-image'))
  if (cover) {
    const image = resolveImage(cover.attribs.src || '')
    if (image) drafts.push({ kind: 'photo', resource: image.resource, captionRuns: [] })
    else report('cover-skipped')
  }
  const description = nodeText(find(header?.children, n => n.name === 'p' && hasClass(n, 'page-description'))).trim()
  if (description) drafts.push({ kind: 'paragraph', runs: [{ text: description, i: true }] })
  const properties = readProperties(header)
  const table = propertiesTable(properties.entries)
  if (table) drafts.push(table)

  const body = find(article ? article.children : dom.children, n => n.name === 'div' && hasClass(n, 'page-body'))
  const converted = htmlToDrafts(body ? body.children : (article || dom).children, {
    resolveLink,
    resolveImage,
    checkbox: node => (node.name === 'div' && hasClass(node, 'checkbox') ? { checked: hasClass(node, 'checkbox-on') } : null),
    handleElement (node, walker) {
      switch (node.name) {
        case 'header':
        case 'title':
          return true
        case 'nav':
          if (!hasClass(node, 'table_of_contents')) return false
          walker.report('table-of-contents-skipped')
          return true
        case 'figure':
        case 'a':
          if (hasClass(node, 'callout')) {
            const children = (node.children || []).filter(isTag)
            const icon = children.length > 1 ? nodeText(children[0]) : ''
            walker.callout(walker.collect(children.length > 0 ? [children[children.length - 1]] : []), calloutVariant(icon))
            return true
          }
          if (hasClass(node, 'equation')) {
            walker.block({ kind: 'code', code: `$$\n${texOf(node)}\n$$`, language: 'plaintext' })
            return true
          }
          if (hasClass(node, 'bookmark')) {
            const link = node.name === 'a' ? node : find(node.children, n => n.name === 'a')
            const href = link?.attribs.href || ''
            const bookmarkTitle = nodeText(find(link?.children, n => hasClass(n, 'bookmark-title'))).trim()
            const about = nodeText(find(link?.children, n => hasClass(n, 'bookmark-description'))).trim()
            walker.block({ kind: 'paragraph', runs: [{ text: bookmarkTitle || href, href }] })
            if (about) walker.block({ kind: 'paragraph', runs: [{ text: about, i: true }] })
            return true
          }
          return false
        case 'span':
          if (hasClass(node, 'icon')) return true
          if (hasClass(node, 'notion-text-equation-token')) {
            walker.inline([{ text: `$${texOf(node)}$` }])
            return true
          }
          if (hasClass(node, 'selected-value')) {
            walker.walk(node.children)
            let next = node.next
            while (next && next.type === 'text' && !next.data.trim()) next = next.next
            if (isTag(next) && hasClass(next, 'selected-value')) walker.inline([{ text: ', ' }])
            return true
          }
          if (/border-bottom:\s*0\.05em solid/i.test(node.attribs.style || '')) {
            const saved = walker.style
            walker.style = { ...saved, u: true }
            walker.walk(node.children)
            walker.style = saved
            return true
          }
          return false
        case 'mark': {
          const className = node.attribs.class || ''
          // highlight-<colour> is a text colour; highlight-<colour>_background is a highlight
          if (!/highlight-/.test(className) || /_background/.test(className)) return false
          walker.report('colours-dropped')
          walker.walk(node.children)
          return true
        }
        case 'img':
          return hasClass(node, 'icon') || hasClass(node, 'bookmark-icon') || hasClass(node, 'bookmark-image')
        case 'div':
          return hasClass(node, 'page-header-icon')
        case 'time':
          walker.inline([{ text: nodeText(node).replace(/^@/, '') }])
          return true
        default:
          return false
      }
    }
  })
  drafts.push(...converted.drafts)
  for (const [code, count] of Object.entries(converted.issues)) report(code, count)

  const blocks = finishBlocks(drafts, { newId, report })
  const dates = noteDates({ created: properties.created, updated: properties.updated, fileTime: file.lastModified })
  const segments = file.path.split('/').slice(exportRoot ? 1 : 0)
  const ownFolder = file.path.replace(/\.html?$/i, '')
  const topPage = segments.length > 1 ? withoutId(segments[0]) : folders.has(ownFolder) ? title : ''
  return {
    key: file.path,
    title,
    createdAt: dates.createdAt,
    lastEdited: dates.lastEdited,
    tags: [...(topPage ? [topPage] : []), ...properties.tags],
    blocks,
    issues,
    resources: [...resources.values()],
    source: { path: file.path, container: file.container ?? null, label: title }
  }
}

/**
 * Import notes from the files of a Notion HTML export, one page at a time.
 * A page that can't be converted comes back as { failed: true } with the reason.
 *
 * @param {import('../source.js').SourceFile[]} files
 * @param {{signal?: AbortSignal, newId?: () => string, pageRefFor?: (path: string) => string}} [options]
 */
export async function * notionNotes (files, { signal, newId, pageRefFor = path => path } = {}) {
  const byPath = new Map(files.map(file => [file.path, file]))
  const pages = files.filter(file => /\.html?$/i.test(file.path) && !/^index\.html?$/i.test(file.name))
  const pagePaths = new Set(pages.map(page => page.path))
  const pageById = new Map()
  for (const page of pages) {
    const id = notionPageId(page.path)
    if (id && !pageById.has(id)) pageById.set(id, page.path)
  }
  const folders = new Set(files.flatMap(file => {
    const parts = file.path.split('/')
    return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'))
  }))
  const roots = new Set(pages.map(page => page.path.split('/')[0]))
  const exportRoot = roots.size === 1 && pages.every(page => page.path.includes('/')) && /^Export-[0-9a-f-]+$/i.test([...roots][0])
  const context = { byPath, pagePaths, pageById, folders, exportRoot, newId, pageRefFor }

  for (const file of pages) {
    if (signal?.aborted) throw signal.reason ?? new Error('Import cancelled')
    try {
      yield await convertNotionPage(file, context)
    } catch (error) {
      const title = cleanTitle(withoutId(file.name))
      yield { key: file.path, failed: true, title, reason: error?.message || String(error), source: { path: file.path, container: file.container ?? null, label: title } }
    }
  }
}
