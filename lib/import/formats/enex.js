/**
 * Evernote exports (.enex).
 *
 * ENEX is XML: note after note, each with its title, dates, tags, content
 * (ENML, Evernote's XHTML) and resources, the note's photos and files in
 * base64. Exports reach gigabytes, so the XML is streamed and each note handed
 * on as soon as it closes. A resource is decoded chunk by chunk and hashed on
 * the way, because ENML refers to resources by their MD5.
 *
 * Evernote 10 keeps tasks beside the content and marks where each group of
 * them goes with a placeholder div; tasks go there as checklist items. Remote
 * images are never fetched.
 *
 * DOM-free so it runs under `node --test`.
 */

import { Parser } from 'htmlparser2'
import SparkMD5 from 'spark-md5'
import { codeText, htmlToDrafts, nodeText, parseHtml, parseStyle } from '../htmlToBlocks.js'
import { finishBlocks } from '../blocks.js'
import { noteDates, parseEnexDate } from '../dates.js'
import { runsText } from '../inline.js'
import { cleanTitle, titleFromFilename } from '../titles.js'
import { dataUrlResource, extensionFor, isPhotoType } from '../resources.js'

// Base64 decoded as it arrives, with the MD5 of the bytes.
function base64Stream () {
  const md5 = new SparkMD5.ArrayBuffer()
  const chunks = []
  let carry = ''
  let size = 0
  let invalid = false
  const decode = (text) => {
    if (!text || invalid) return
    let binary
    try {
      binary = atob(text)
    } catch {
      invalid = true
      return
    }
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    md5.append(bytes.buffer)
    chunks.push(bytes)
    size += bytes.length
  }
  return {
    write (piece) {
      const text = carry + piece.replace(/\s+/g, '')
      const usable = text.length - (text.length % 4)
      decode(text.slice(0, usable))
      carry = text.slice(usable)
    },
    end () {
      if (carry) decode(carry.padEnd(carry.length + (4 - (carry.length % 4)) % 4, '='))
      return invalid ? { chunks: [], size: 0, md5: '', invalid: true } : { chunks, size, md5: md5.end(), invalid: false }
    }
  }
}

/**
 * The notes in an ENEX file, read as a stream.
 *
 * @param {import('../source.js').SourceFile} file
 * @param {{signal?: AbortSignal}} [options]
 * @returns {AsyncGenerator<object>} raw notes: title, content, created, updated,
 *   tags, attributes, resources and tasks; `truncated` when the file ended inside one
 */
export async function * readEnexNotes (file, { signal } = {}) {
  const ready = []
  const stack = []
  let note = null
  let resource = null
  let task = null
  let data = null
  let text = ''
  let ending = false

  const parser = new Parser({
    onopentag (tag) {
      const name = tag.toLowerCase()
      const parent = stack[stack.length - 1]
      stack.push(name)
      text = ''
      if (name === 'note' && !note) {
        note = { title: '', content: '', created: '', updated: '', tags: [], attributes: {}, resources: [], tasks: [] }
      } else if (note && !resource && name === 'resource' && parent === 'note') {
        resource = { data: null, mime: '', attributes: {} }
      } else if (resource && name === 'data' && parent === 'resource') {
        data = base64Stream()
      } else if (note && !resource && name === 'task' && parent === 'note') {
        task = {}
      }
    },
    ontext (piece) {
      if (data) data.write(piece)
      else text += piece
    },
    onclosetag (tag) {
      const name = tag.toLowerCase()
      stack.pop()
      const parent = stack[stack.length - 1]
      if (!note) return
      if (data && name === 'data') {
        resource.data = data.end()
        data = null
      } else if (resource) {
        if (name === 'resource') {
          note.resources.push(resource)
          resource = null
        } else if (parent === 'resource' && name === 'mime') {
          resource.mime = text.trim()
        } else if (parent === 'resource-attributes') {
          resource.attributes[name] = text.trim()
        }
      } else if (task) {
        if (name === 'task') {
          note.tasks.push(task)
          task = null
        } else if (parent === 'task') {
          task[name] = text.trim()
        }
      } else if (name === 'note') {
        ready.push(ending ? { ...note, truncated: true } : note)
        note = null
      } else if (parent === 'note') {
        if (name === 'title') note.title = text
        else if (name === 'content') note.content = text
        else if (name === 'created') note.created = text.trim()
        else if (name === 'updated') note.updated = text.trim()
        else if (name === 'tag') note.tags.push(text)
      } else if (parent === 'note-attributes') {
        note.attributes[name] = text.trim()
      }
      text = ''
    }
  }, { xmlMode: true, decodeEntities: true, recognizeCDATA: true })

  for await (const piece of file.textChunks()) {
    if (signal?.aborted) throw signal.reason ?? new Error('Import cancelled')
    parser.write(piece)
    while (ready.length > 0) yield ready.shift()
  }
  // Closing a file that stopped inside a note closes its tags too
  ending = true
  if (data) {
    resource.data = data.end()
    data = null
  }
  parser.end()
  while (ready.length > 0) yield ready.shift()
}

function taskGroups (tasks) {
  const groups = new Map()
  for (const task of tasks) {
    const group = task.taskgroupnotelevelid || ''
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(task)
  }
  const weight = task => String(task.sortweight || '')
  for (const list of groups.values()) list.sort((a, b) => (weight(a) < weight(b) ? -1 : weight(a) > weight(b) ? 1 : 0))
  return groups
}

const pad = (n) => String(n).padStart(2, '0')

function taskDraft (task) {
  const runs = [{ text: task.title || '' }]
  const due = parseEnexDate(task.duedate)
  if (due !== null) {
    const date = new Date(due)
    runs.push({ text: ' ' }, { text: `(due ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())})`, i: true })
  }
  return { kind: 'list', listType: 'checklist', checked: /^(completed|closed|done)$/i.test(task.taskstatus || ''), indent: 0, runs }
}

function firstLine (drafts) {
  for (const draft of drafts) {
    const runs = draft.runs || draft.summaryRuns
    const line = runs ? runsText(runs).split('\n').find(part => part.trim()) : ''
    if (line) return line
  }
  return ''
}

/**
 * A raw ENEX note as an import note.
 *
 * @param {object} raw - from readEnexNotes
 * @param {{key: string, file?: object, notebook?: string, newId?: () => string}} context
 */
export function convertEnexNote (raw, { key, file = null, notebook = '', newId } = {}) {
  const issues = {}
  const report = (code, count = 1) => {
    issues[code] = (issues[code] || 0) + count
  }
  if (raw.truncated) report('truncated-note')

  const resources = []
  const byHash = new Map()
  raw.resources.forEach((resource, index) => {
    const data = resource.data
    if (!data || data.invalid) {
      report('unreadable-attachment')
      return
    }
    if (byHash.has(data.md5)) return
    const mimeType = (resource.mime || 'application/octet-stream').toLowerCase()
    const entry = {
      key: `${key}/resource-${index + 1}`,
      name: resource.attributes['file-name'] || `file${index + 1}${extensionFor(mimeType)}`,
      mimeType,
      size: data.size,
      md5: data.md5,
      blob: new Blob(data.chunks, { type: mimeType })
    }
    resources.push(entry)
    byHash.set(data.md5, entry)
  })

  const used = new Set()
  const placed = new Set()
  const groups = taskGroups(raw.tasks)
  const resourceDraft = (resource) => {
    used.add(resource.key)
    return isPhotoType(resource.mimeType)
      ? { kind: 'photo', resource: resource.key, captionRuns: [] }
      : { kind: 'file', resource: resource.key, name: resource.name }
  }

  const { drafts, issues: found } = htmlToDrafts(parseHtml(raw.content), {
    checkbox: node => (node.name === 'en-todo' ? { checked: String(node.attribs.checked).toLowerCase() === 'true' } : null),
    resolveImage: src => {
      const resource = dataUrlResource(src, `${key}/inline-${resources.length + 1}`)
      if (!resource) return null
      resources.push(resource)
      used.add(resource.key)
      return { resource: resource.key }
    },
    handleElement (node, walker) {
      if (node.name === 'en-media') {
        const resource = byHash.get(String(node.attribs.hash || '').toLowerCase())
        if (resource) {
          walker.block(resourceDraft(resource))
        } else {
          walker.report('missing-attachment')
          walker.inline([{ text: '[Attachment missing from the export]', i: true }])
        }
        return true
      }
      if (node.name === 'en-crypt') {
        walker.report('encrypted-text')
        const hint = String(node.attribs.hint || '').trim()
        walker.block({ kind: 'paragraph', runs: [{ text: hint ? `Encrypted text (hint: ${hint})` : 'Encrypted text', i: true }] })
        walker.block({ kind: 'code', code: nodeText(node).trim(), language: 'plaintext' })
        return true
      }
      if (node.name === 'div' || node.name === 'pre') {
        const css = parseStyle(node.attribs.style)
        if (css.get('--en-codeblock') === 'true' || css.get('-en-codeblock') === 'true') {
          const language = css.get('-en-syntaxlanguage') || css.get('--en-syntaxlanguage') || css.get('-en-codeblocklanguage') || ''
          walker.block({ kind: 'code', code: codeText(node), language })
          return true
        }
        if (css.get('--en-task-group') === 'true') {
          const group = css.get('--en-id') || ''
          placed.add(group)
          for (const task of groups.get(group) || []) walker.block(taskDraft(task))
          return true
        }
      }
      return false
    }
  })
  for (const [code, count] of Object.entries(found)) report(code, count)

  for (const [group, tasks] of groups) {
    if (!placed.has(group)) drafts.push(...tasks.map(taskDraft))
  }
  const unused = resources.filter(resource => !used.has(resource.key))
  if (unused.length > 0) {
    report('unreferenced-attachment', unused.length)
    drafts.push(...unused.map(resourceDraft))
  }
  const sourceUrl = raw.attributes['source-url']
  if (sourceUrl) drafts.push({ kind: 'paragraph', runs: [{ text: 'Source:', i: true }, { text: ' ' }, { text: sourceUrl, href: sourceUrl }] })
  if (raw.attributes.author) drafts.push({ kind: 'paragraph', runs: [{ text: 'Author:', i: true }, { text: ' ' + raw.attributes.author }] })
  if (raw.attributes['reminder-time'] || raw.attributes['reminder-order']) report('reminder-dropped')

  const blocks = finishBlocks(drafts, { newId, report })
  const title = cleanTitle(raw.title, { fallbackText: firstLine(drafts) })
  const dates = noteDates({ created: parseEnexDate(raw.created), updated: parseEnexDate(raw.updated), fileTime: file?.lastModified ?? null })
  const tags = [...(notebook ? [notebook] : []), ...raw.tags.map(tag => tag.trim()).filter(Boolean)]
  return {
    key,
    title,
    createdAt: dates.createdAt,
    lastEdited: dates.lastEdited,
    tags,
    blocks,
    issues,
    resources,
    source: { path: file?.path ?? '', container: file?.container ?? null, label: title }
  }
}

/**
 * Import notes from an ENEX file, one at a time. A note that can't be
 * converted comes back as { failed: true } with the reason.
 */
export async function * enexNotes (file, { signal, newId } = {}) {
  const notebook = titleFromFilename(file.name)
  let index = 0
  for await (const raw of readEnexNotes(file, { signal })) {
    index++
    const key = `${file.path}#${index}`
    try {
      yield convertEnexNote(raw, { key, file, notebook, newId })
    } catch (error) {
      const title = cleanTitle(raw.title)
      yield { key, failed: true, title, reason: error?.message || String(error), source: { path: file.path, container: file.container ?? null, label: title } }
    }
  }
}
