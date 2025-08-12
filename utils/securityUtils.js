import DOMPurify from 'isomorphic-dompurify'

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

    // Sanitize block data based on type
    switch (block.type) {
      case 'paragraph':
      case 'header':
        if (block.data?.text) {
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
        if (block.data?.text) {
          sanitizedBlock.data.text = DOMPurify.sanitize(block.data.text, sanitizerConfig)
        }
        if (block.data?.caption) {
          sanitizedBlock.data.caption = DOMPurify.sanitize(block.data.caption, sanitizerConfig)
        }
        break

      case 'code':
        if (block.data?.code) {
          // For code blocks, we want to preserve the exact content but escape HTML
          sanitizedBlock.data.code = escapeHtml(block.data.code)
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
        if (block.data?.file?.url && isValidUrl(block.data.file.url)) {
          sanitizedBlock.data.file = {
            url: sanitizeUrl(block.data.file.url)
          }
        }
        if (block.data?.caption) {
          sanitizedBlock.data.caption = DOMPurify.sanitize(block.data.caption, sanitizerConfig)
        }
        break

      case 'embed':
        if (block.data?.source && isValidUrl(block.data.source)) {
          sanitizedBlock.data.source = sanitizeUrl(block.data.source)
        }
        if (block.data?.embed && isValidUrl(block.data.embed)) {
          sanitizedBlock.data.embed = sanitizeUrl(block.data.embed)
        }
        if (block.data?.caption) {
          sanitizedBlock.data.caption = DOMPurify.sanitize(block.data.caption, sanitizerConfig)
        }
        break

      case 'delimiter':
        // Delimiter blocks don't need data sanitization
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
    'inlineCode', 'nestedlist'
  ]
  
  return allowedTypes.includes(type) ? type : 'paragraph'
}

// Escape HTML characters for code blocks
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  
  return text.replace(/[&<>"']/g, m => map[m])
}

// Validate URL format
function isValidUrl(string) {
  try {
    const url = new URL(string)
    return ['http:', 'https:', 'data:'].includes(url.protocol)
  } catch (_) {
    return false
  }
}

// Sanitize URL
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url)
    // Only allow http, https, and data URLs
    if (['http:', 'https:', 'data:'].includes(parsed.protocol)) {
      return parsed.toString()
    }
  } catch (_) {
    // Invalid URL
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
    type: page.type || undefined
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