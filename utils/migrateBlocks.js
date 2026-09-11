import { CALLOUT_ORDER } from '../lib/markdownShortcuts.js'
import { withIndent } from '../lib/listIndent.js'
import { attachmentIdFromStub, isAttachmentId } from '../lib/attachmentRefs.js'

/**
 * Bring stored Editor.js data up to the shapes the current tools expect.
 *
 * Runs on page data before it is handed to Editor.js — on render, never on
 * save — so a repair here is written back by the next save. Returns a new
 * data object (never mutates input), or the input itself when nothing needed
 * migrating.
 *
 * Migrations:
 *   - nestedlist / checklist blocks → individual item blocks, with a nested
 *     item's depth kept as its indent
 *   - callout and toggle blocks the v1.6.6 sanitizer flattened into
 *     paragraphs (a toggle rendered empty, since a paragraph has no `text`)
 *   - code the pre-v1.6.7 sanitizer HTML-escaped, which compounded on every
 *     save because CodeBlock reads code back out of a textarea
 *   - embeds whose `service` that sanitizer dropped, which render blank
 *   - photos an app from 1.6.8 or earlier saved: it drops `attachmentId` but
 *     keeps the stub URL that names the attachment
 */
export function migrateEditorData(data) {
  if (!data || !Array.isArray(data.blocks)) return data

  let needsMigration = false
  const newBlocks = []

  for (const block of data.blocks) {
    if (block.type === 'nestedlist') {
      needsMigration = true
      const style = block.data?.style || 'unordered'
      const toolType = style === 'ordered' ? 'numberedListItem' : 'bulletListItem'
      flattenNestedItems(block.data?.items || [], newBlocks, toolType)
    } else if (block.type === 'checklist') {
      needsMigration = true
      const items = block.data?.items || []
      for (const item of items) {
        newBlocks.push({
          type: 'checklistItem',
          data: {
            text: item.text || item.content || '',
            checked: Boolean(item.checked)
          }
        })
      }
    } else {
      const repaired = repairBlock(block)
      if (repaired !== block) needsMigration = true
      newBlocks.push(repaired)
    }
  }

  if (!needsMigration) return data

  return {
    ...data,
    blocks: newBlocks
  }
}

function flattenNestedItems(items, result, toolType, depth = 0) {
  for (const item of items) {
    const text = item.content || item.text || ''
    const hasChildren = Boolean(item.items && item.items.length > 0)
    if (text || hasChildren) {
      result.push({
        type: toolType,
        data: withIndent({ text }, depth)
      })
    }
    if (hasChildren) {
      flattenNestedItems(item.items, result, toolType, depth + 1)
    }
  }
}

/** Returns a repaired copy of `block`, or `block` itself when it is fine. */
function repairBlock(block) {
  const data = block?.data
  if (!data || typeof data !== 'object') return block

  if (block.type === 'paragraph') {
    // A flattened toggle kept summary/content beside no `text`. No genuine
    // paragraph carries a `summary`.
    if (typeof data.summary === 'string' && !('text' in data)) {
      return {
        ...block,
        type: 'toggle',
        data: {
          summary: data.summary,
          content: typeof data.content === 'string' ? data.content : '',
          defaultCollapsed: Boolean(data.defaultCollapsed)
        }
      }
    }
    // A flattened callout kept its variant beside the text.
    if (CALLOUT_ORDER.includes(data.variant) && typeof data.text === 'string') {
      return { ...block, type: 'callout', data: { text: data.text, variant: data.variant } }
    }
    return block
  }

  if (block.type === 'code') {
    if (data.encoding === 'raw' || !isLegacyEscapedCode(data.code)) return block
    return {
      ...block,
      data: { ...data, code: decodeLegacyCodeEscaping(data.code), encoding: 'raw' }
    }
  }

  if (block.type === 'image') {
    if (isAttachmentId(data.attachmentId)) return block
    const attachmentId = attachmentIdFromStub(data.file?.url)
    if (!attachmentId) return block
    return { ...block, data: { attachmentId, ...data } }
  }

  if (block.type === 'embed') {
    if (data.service) return block
    const service = inferEmbedService(data.source)
    if (!service) return block
    const { width, height } = EMBED_SERVICES[service]
    return {
      ...block,
      data: {
        ...data,
        service,
        width: typeof data.width === 'number' ? data.width : width,
        height: typeof data.height === 'number' ? data.height : height
      }
    }
  }

  return block
}

// The escaping the pre-v1.6.7 sanitizer applied to code: & < > " '.
const LEGACY_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'" }

/**
 * True when `code` could have come out of that escaping: it contains an &,
 * no raw < > " or ' (which the escaping always replaced), and every & begins
 * one of its five entities. Anything else is provably raw and never decoded.
 */
export function isLegacyEscapedCode(code) {
  if (typeof code !== 'string' || !code.includes('&')) return false
  if (/[<>"']/.test(code)) return false
  return !/&(?!(?:amp|lt|gt|quot|#039);)/.test(code)
}

/**
 * Undo exactly one level of that escaping, in a single pass so "&amp;lt;"
 * becomes "&lt;" rather than "<". One level is all that can be undone safely:
 * beyond that, escaping damage and entities someone genuinely typed look alike.
 */
export function decodeLegacyCodeEscaping(code) {
  return code.replace(/&(amp|lt|gt|quot|#039);/g, (match, entity) => LEGACY_ENTITIES[entity])
}

// The services enabled in components/Editor.js, with the URL patterns and
// default sizes @editorjs/embed uses for them. Restoring `service` on a GitHub
// gist does not bring it back: its embed URL is a data: URL, which the
// sanitizer rejects.
const EMBED_SERVICES = {
  youtube: { pattern: /(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch))/, width: 580, height: 320 },
  vimeo: { pattern: /(?:https?:\/\/)?(?:www\.)?(?:player\.)?vimeo\.co(?:.+\/[^/]\d+(?:#t=\d+)?s?$)/, width: 580, height: 320 },
  github: { pattern: /https?:\/\/gist\.github\.com\/[^/?&]*\/[^/?&]*/, width: 600, height: 300 },
  twitter: { pattern: /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/.+\/status\/\d+/, width: 600, height: 300 }
}

/** Which enabled embed service a source URL belongs to, or null. */
export function inferEmbedService(source) {
  if (typeof source !== 'string') return null
  for (const [service, { pattern }] of Object.entries(EMBED_SERVICES)) {
    if (pattern.test(source)) return service
  }
  return null
}
