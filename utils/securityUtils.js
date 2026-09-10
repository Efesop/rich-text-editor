import DOMPurify from 'isomorphic-dompurify'
import { CALLOUT_ORDER } from '../lib/markdownShortcuts.js'

const ALIGNMENTS = ['left', 'center', 'right']
const QUOTE_ALIGNMENTS = ['left', 'center']
// The services enabled in the embed tool's config (components/Editor.js).
const EMBED_SERVICES = ['youtube', 'vimeo', 'github', 'twitter']
// A code block's language is only compared and handed to highlight.js, never
// written into HTML, so an identifier shape is enough to keep it safe.
const CODE_LANGUAGE = /^[a-z0-9+#-]{1,24}$/i

// Configure DOMPurify for Editor.js content
const sanitizerConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'code', 'a',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'class', 'id', 'data-*',
    'contenteditable', 'spellcheck'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['target'],
  ADD_DATA_URI_TAGS: ['img'],
  FORBID_CONTENTS: ['script', 'style'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit']
}

// Sanitize Editor.js content blocks
export function sanitizeEditorContent(content) {
  if (!content || typeof content !== 'object') {
    return {
      time: Date.now(),
      blocks: [],
      version: '2.30.6'
    }
  }

  const sanitizedBlocks = (content.blocks || []).map(block => {
    if (!block || typeof block !== 'object') return null

    const sanitizedBlock = {
      id: sanitizeString(block.id),
      type: sanitizeBlockType(block.type),
      data: {}
    }

    // Tunes ride beside data. Alignment is the only tune that saves anything
    // (AIBlockTune.save() returns undefined), so it is the only one kept.
    const alignment = block.tunes?.alignment?.alignment
    if (ALIGNMENTS.includes(alignment)) {
      sanitizedBlock.tunes = { alignment: { alignment } }
    }

    // Sanitize block data based on type
    switch (block.type) {
      // String fields are kept even when empty, so every block comes back
      // exactly as its tool saved it.
      case 'paragraph':
      case 'header':
        if (typeof block.data?.text === 'string') {
          sanitizedBlock.data.text = DOMPurify.sanitize(block.data.text, sanitizerConfig)
        }
        if (block.data?.level && typeof block.data.level === 'number') {
          sanitizedBlock.data.level = Math.min(Math.max(block.data.level, 1), 6)
        }
        break

      case 'list':
      case 'checklist':
        if (Array.isArray(block.data?.items)) {
          sanitizedBlock.data.items = block.data.items.map(item => {
            if (typeof item === 'string') {
              return DOMPurify.sanitize(item, sanitizerConfig)
            }
            if (item && typeof item === 'object') {
              return {
                text: DOMPurify.sanitize(item.text || '', sanitizerConfig),
                checked: Boolean(item.checked)
              }
            }
            return ''
          })
        }
        if (block.data?.style && ['ordered', 'unordered'].includes(block.data.style)) {
          sanitizedBlock.data.style = block.data.style
        }
        break

      case 'quote':
        if (typeof block.data?.text === 'string') {
          sanitizedBlock.data.text = DOMPurify.sanitize(block.data.text, sanitizerConfig)
        }
        if (typeof block.data?.caption === 'string') {
          sanitizedBlock.data.caption = DOMPurify.sanitize(block.data.caption, sanitizerConfig)
        }
        if (QUOTE_ALIGNMENTS.includes(block.data?.alignment)) {
          sanitizedBlock.data.alignment = block.data.alignment
        }
        break

      case 'code':
        // Stored raw. Escaping here compounded on every save: CodeBlock loads
        // code into a textarea via .value, so "&lt;" came back literally and
        // was escaped again. Everywhere code is rendered escapes on its own —
        // CodeBlock (textarea, textContent, highlight.js), pages/share.js and
        // VersionHistoryModal (React text).
        if (typeof block.data?.code === 'string') {
          sanitizedBlock.data.code = block.data.code
        }
        if (typeof block.data?.language === 'string' && CODE_LANGUAGE.test(block.data.language)) {
          sanitizedBlock.data.language = block.data.language
        }
        // Set by CodeBlock.save() and parseMarkdownToBlocks. Tells
        // utils/migrateBlocks.js the code was never escaped, so the one-time
        // repair of the old escaping must leave it alone.
        if (block.data?.encoding === 'raw') {
          sanitizedBlock.data.encoding = 'raw'
        }
        break

      case 'table':
        if (Array.isArray(block.data?.content)) {
          sanitizedBlock.data.content = block.data.content.map(row =>
            Array.isArray(row) ? row.map(cell => 
              DOMPurify.sanitize(cell || '', sanitizerConfig)
            ) : []
          )
        }
        if (block.data?.withHeadings !== undefined) {
          sanitizedBlock.data.withHeadings = Boolean(block.data.withHeadings)
        }
        if (block.data?.stretched !== undefined) {
          sanitizedBlock.data.stretched = Boolean(block.data.stretched)
        }
        break

      case 'linkTool':
        if (block.data?.link && isValidUrl(block.data.link)) {
          sanitizedBlock.data.link = sanitizeUrl(block.data.link)
        }
        if (block.data?.meta) {
          sanitizedBlock.data.meta = {
            title: DOMPurify.sanitize(block.data.meta.title || '', sanitizerConfig),
            description: DOMPurify.sanitize(block.data.meta.description || '', sanitizerConfig),
            image: block.data.meta.image && isValidUrl(block.data.meta.image) 
              ? sanitizeUrl(block.data.meta.image) : ''
          }
        }
        break

      case 'image':
        if (block.data?.file?.url && isValidImageUrl(block.data.file.url)) {
          sanitizedBlock.data.file = {
            url: sanitizeImageUrl(block.data.file.url)
          }
        }
        if (typeof block.data?.caption === 'string') {
          sanitizedBlock.data.caption = DOMPurify.sanitize(block.data.caption, sanitizerConfig)
        }
        for (const flag of ['withBorder', 'withBackground', 'stretched']) {
          if (block.data?.[flag] !== undefined) {
            sanitizedBlock.data[flag] = Boolean(block.data[flag])
          }
        }
        break

      case 'embed':
        if (block.data?.source && isValidUrl(block.data.source)) {
          sanitizedBlock.data.source = sanitizeUrl(block.data.source)
        }
        if (block.data?.embed && isValidUrl(block.data.embed)) {
          sanitizedBlock.data.embed = sanitizeUrl(block.data.embed)
        }
        if (typeof block.data?.caption === 'string') {
          sanitizedBlock.data.caption = DOMPurify.sanitize(block.data.caption, sanitizerConfig)
        }
        // Without `service` the embed tool renders an empty div.
        if (EMBED_SERVICES.includes(block.data?.service)) {
          sanitizedBlock.data.service = block.data.service
        }
        for (const dimension of ['width', 'height']) {
          const value = block.data?.[dimension]
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            sanitizedBlock.data[dimension] = value
          }
        }
        break

      case 'bulletListItem':
      case 'numberedListItem':
        if (typeof block.data?.text === 'string') {
          sanitizedBlock.data.text = DOMPurify.sanitize(block.data.text, sanitizerConfig)
        }
        break

      case 'checklistItem':
        if (typeof block.data?.text === 'string') {
          sanitizedBlock.data.text = DOMPurify.sanitize(block.data.text, sanitizerConfig)
        }
        sanitizedBlock.data.checked = Boolean(block.data?.checked)
        break

      case 'delimiter':
        // Delimiter blocks don't need data sanitization
        break

      case 'seedPhrase':
        sanitizedBlock.data = {
          words: Array.isArray(block.data?.words) ? block.data.words.map(w => typeof w === 'string' ? w : '').slice(0, 24) : [],
          count: block.data?.count === 24 ? 24 : 12
        }
        break

      case 'attachment':
        sanitizedBlock.data = {
          attachmentId: typeof block.data?.attachmentId === 'string' ? block.data.attachmentId.slice(0, 36) : '',
          filename: typeof block.data?.filename === 'string' ? block.data.filename.slice(0, 255) : '',
          mimeType: typeof block.data?.mimeType === 'string' ? block.data.mimeType.slice(0, 100) : '',
          size: typeof block.data?.size === 'number' ? block.data.size : 0,
          preview: typeof block.data?.preview === 'string' && block.data.preview.startsWith('data:image/') ? block.data.preview : ''
        }
        break

      case 'callout':
        sanitizedBlock.data = {
          text: DOMPurify.sanitize(typeof block.data?.text === 'string' ? block.data.text : '', sanitizerConfig),
          variant: CALLOUT_ORDER.includes(block.data?.variant) ? block.data.variant : 'info'
        }
        break

      case 'toggle':
        sanitizedBlock.data = {
          summary: DOMPurify.sanitize(typeof block.data?.summary === 'string' ? block.data.summary : '', sanitizerConfig),
          content: DOMPurify.sanitize(typeof block.data?.content === 'string' ? block.data.content : '', sanitizerConfig),
          defaultCollapsed: Boolean(block.data?.defaultCollapsed)
        }
        break

      default:
        // For unknown block types, sanitize all string values
        if (block.data && typeof block.data === 'object') {
          sanitizedBlock.data = sanitizeObject(block.data)
        }
    }

    return sanitizedBlock
  }).filter(Boolean) // Remove null blocks

  return {
    time: content.time || Date.now(),
    blocks: sanitizedBlocks,
    version: content.version || '2.30.6'
  }
}

// Sanitize a string input
function sanitizeString(str) {
  if (typeof str !== 'string') return ''
  return str.slice(0, 1000) // Limit length
}

// Validate and sanitize block types
function sanitizeBlockType(type) {
  const allowedTypes = [
    'paragraph', 'header', 'list', 'checklist', 'quote', 'code',
    'table', 'linkTool', 'image', 'embed', 'delimiter', 'marker',
    'inlineCode', 'nestedlist', 'bulletListItem', 'numberedListItem', 'checklistItem', 'seedPhrase', 'attachment',
    'callout', 'toggle'
  ]
  
  return allowedTypes.includes(type) ? type : 'paragraph'
}

// Validate URL format - does NOT allow data: URLs by default (use isValidImageUrl for images)
function isValidUrl(string) {
  try {
    const url = new URL(string)
    // Only allow http and https - NO data: URLs to prevent XSS
    return ['http:', 'https:'].includes(url.protocol)
  } catch (_) {
    return false
  }
}

// Validate image URLs - allows data: URLs but only for safe image MIME types
function isValidImageUrl(string) {
  try {
    const url = new URL(string)

    // Allow http/https
    if (['http:', 'https:'].includes(url.protocol)) {
      return true
    }

    // Allow data: URLs ONLY for safe image MIME types
    if (url.protocol === 'data:') {
      // Parse the MIME type from data URL (format: data:mime/type;base64,...)
      const mimeMatch = string.match(/^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml|bmp|ico));/i)
      if (mimeMatch) {
        // Additional check: block svg with scripts (svg+xml can contain JS)
        if (mimeMatch[1].toLowerCase() === 'image/svg+xml') {
          // Block SVG data URLs entirely - they can contain scripts
          return false
        }
        return true
      }
      return false
    }

    return false
  } catch (_) {
    return false
  }
}

// Sanitize URL - no data: URLs allowed
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url)
    // Only allow http and https - NO data: URLs
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return parsed.toString()
    }
  } catch (_) {
    // Invalid URL
  }
  return ''
}

// Sanitize image URL - allows safe data: image URLs
function sanitizeImageUrl(url) {
  if (isValidImageUrl(url)) {
    return url
  }
  return ''
}

// Recursively sanitize object properties
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? DOMPurify.sanitize(obj, sanitizerConfig) : obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item))
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key)
    sanitized[sanitizedKey] = sanitizeObject(value)
  }
  
  return sanitized
}

// Validate page structure
export function validatePageStructure(page) {
  const errors = []

  if (!page || typeof page !== 'object') {
    errors.push('Page must be an object')
    return { isValid: false, errors, sanitized: null }
  }

  if (!page.id || typeof page.id !== 'string') {
    errors.push('Page must have a valid ID')
  }

  if (!page.title || typeof page.title !== 'string') {
    errors.push('Page must have a valid title')
  }

  if (!page.content || typeof page.content !== 'object') {
    errors.push('Page must have valid content')
  }

  if (errors.length > 0) {
    return { isValid: false, errors, sanitized: null }
  }

  // Sanitize the page
  const sanitized = {
    id: sanitizeString(page.id),
    title: sanitizeString(page.title).slice(0, 200),
    content: sanitizeEditorContent(page.content),
    tags: Array.isArray(page.tags) ? page.tags.map(tag => sanitizeString(tag)) : [],
    tagNames: Array.isArray(page.tagNames) ? page.tagNames.map(tag => sanitizeString(tag)) : [],
    createdAt: page.createdAt || new Date().toISOString(),
    password: page.password || null,
    folderId: page.folderId || null,
    type: page.type || undefined,
    selfDestructAt: page.selfDestructAt || undefined
  }

  return { isValid: true, errors: [], sanitized }
}

// Rate limiting utilities
export class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    this.requests = new Map()
  }

  isAllowed(key) {
    const now = Date.now()
    const windowStart = now - this.windowMs

    if (!this.requests.has(key)) {
      this.requests.set(key, [])
    }

    const requests = this.requests.get(key)
    const validRequests = requests.filter(time => time > windowStart)

    if (validRequests.length >= this.maxRequests) {
      return false
    }

    validRequests.push(now)
    this.requests.set(key, validRequests)
    return true
  }

  cleanup() {
    const now = Date.now()
    const windowStart = now - this.windowMs

    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => time > windowStart)
      if (validRequests.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, validRequests)
      }
    }
  }
} 