// Data validation and corruption recovery utilities

// Validate and repair corrupted page data
export function validateAndRepairPage(page) {
  if (!page || typeof page !== 'object') {
    return createDefaultPage()
  }

  const repairedPage = {
    id: validateId(page.id),
    title: validateTitle(page.title),
    content: validateContent(page.content),
    tags: validateTags(page.tags),
    tagNames: validateTagNames(page.tagNames),
    createdAt: validateDate(page.createdAt),
    password: page.password || null,
    folderId: page.folderId || null,
    type: page.type || undefined
  }

  return repairedPage
}

// Validate page ID
function validateId(id) {
  if (typeof id === 'string' && id.trim().length > 0) {
    return id.trim()
  }
  // Generate new ID if invalid
  return Date.now().toString() + Math.random().toString(36).substr(2, 9)
}

// Validate page title
function validateTitle(title) {
  if (typeof title === 'string' && title.trim().length > 0) {
    return title.trim().slice(0, 200) // Limit length
  }
  return 'Untitled Page'
}

// Validate content structure
function validateContent(content) {
  if (!content || typeof content !== 'object') {
    return createDefaultContent()
  }

  const repairedContent = {
    time: validateTimestamp(content.time),
    blocks: validateBlocks(content.blocks),
    version: validateVersion(content.version)
  }

  return repairedContent
}

// Validate timestamp
function validateTimestamp(time) {
  if (typeof time === 'number' && time > 0) {
    return time
  }
  return Date.now()
}

// Validate Editor.js blocks
function validateBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return []
  }

  return blocks.map(validateBlock).filter(Boolean)
}

// Validate individual block
function validateBlock(block) {
  if (!block || typeof block !== 'object') {
    return null
  }

  const validTypes = [
    'paragraph', 'header', 'list', 'checklist', 'quote', 'code',
    'table', 'linkTool', 'image', 'embed', 'delimiter', 'marker',
    'inlineCode', 'nestedlist'
  ]

  return {
    id: block.id || generateBlockId(),
    type: validTypes.includes(block.type) ? block.type : 'paragraph',
    data: validateBlockData(block.data, block.type)
  }
}

// Generate unique block ID
function generateBlockId() {
  return Math.random().toString(36).substr(2, 10)
}

// Validate block data based on type
function validateBlockData(data, type) {
  if (!data || typeof data !== 'object') {
    return {}
  }

  switch (type) {
    case 'paragraph':
    case 'header':
      return {
        text: typeof data.text === 'string' ? data.text : '',
        level: type === 'header' && typeof data.level === 'number' 
          ? Math.min(Math.max(data.level, 1), 6) 
          : undefined
      }
    
    case 'list':
    case 'checklist':
      return {
        items: Array.isArray(data.items) ? data.items.filter(item => 
          typeof item === 'string' || (item && typeof item.text === 'string')
        ) : [],
        style: ['ordered', 'unordered'].includes(data.style) ? data.style : 'unordered'
      }
    
    case 'quote':
      return {
        text: typeof data.text === 'string' ? data.text : '',
        caption: typeof data.caption === 'string' ? data.caption : ''
      }
    
    case 'code':
      return {
        code: typeof data.code === 'string' ? data.code : ''
      }
    
    case 'table':
      return {
        content: Array.isArray(data.content) ? data.content.map(row => 
          Array.isArray(row) ? row.map(cell => typeof cell === 'string' ? cell : '') : []
        ) : [['']],
        withHeadings: Boolean(data.withHeadings)
      }
    
    default:
      return data
  }
}

// Validate version
function validateVersion(version) {
  if (typeof version === 'string' && version.match(/^\d+\.\d+\.\d+$/)) {
    return version
  }
  return '2.30.6'
}

// Validate tags array
function validateTags(tags) {
  if (!Array.isArray(tags)) {
    return []
  }
  return tags.filter(tag => tag && typeof tag === 'object' && tag.name)
}

// Validate tag names array
function validateTagNames(tagNames) {
  if (!Array.isArray(tagNames)) {
    return []
  }
  return tagNames.filter(name => typeof name === 'string' && name.trim().length > 0)
}

// Validate date string
function validateDate(date) {
  if (typeof date === 'string') {
    const parsed = new Date(date)
    if (!isNaN(parsed.getTime())) {
      return date
    }
  }
  return new Date().toISOString()
}

// Create default page
function createDefaultPage() {
  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    title: 'New Page',
    content: createDefaultContent(),
    tags: [],
    tagNames: [],
    createdAt: new Date().toISOString(),
    password: null,
    folderId: null
  }
}

// Create default content
function createDefaultContent() {
  return {
    time: Date.now(),
    blocks: [],
    version: '2.30.6'
  }
}

// Validate and repair entire pages array
export function validateAndRepairPages(pages) {
  if (!Array.isArray(pages)) {
    return [createDefaultPage()]
  }

  const repairedPages = pages.map(validateAndRepairPage)
  
  // Ensure we have at least one page
  if (repairedPages.length === 0) {
    repairedPages.push(createDefaultPage())
  }

  // Ensure unique IDs
  const usedIds = new Set()
  return repairedPages.map(page => {
    if (usedIds.has(page.id)) {
      page.id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }
    usedIds.add(page.id)
    return page
  })
}

// Detect corruption
export function detectCorruption(data) {
  const issues = []

  if (!data) {
    issues.push('Data is null or undefined')
    return { isCorrupt: true, issues }
  }

  if (!Array.isArray(data)) {
    issues.push('Data is not an array')
  }

  data.forEach((page, index) => {
    if (!page || typeof page !== 'object') {
      issues.push(`Page ${index} is not an object`)
      return
    }

    if (!page.id) {
      issues.push(`Page ${index} missing ID`)
    }

    if (!page.title) {
      issues.push(`Page ${index} missing title`)
    }

    if (!page.content || typeof page.content !== 'object') {
      issues.push(`Page ${index} missing or invalid content`)
    } else {
      if (!Array.isArray(page.content.blocks)) {
        issues.push(`Page ${index} content blocks is not an array`)
      }
    }
  })

  return {
    isCorrupt: issues.length > 0,
    issues
  }
}

// Create backup before risky operations
export function createDataBackup(data) {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      checksum: generateChecksum(data)
    }
    
    // Store in localStorage as backup
    const backups = getStoredBackups()
    backups.push(backup)
    
    // Keep only last 5 backups
    const recentBackups = backups.slice(-5)
    localStorage.setItem('dash-data-backups', JSON.stringify(recentBackups))
    
    return backup
  } catch (error) {
    console.error('Failed to create backup:', error)
    return null
  }
}

// Get stored backups
function getStoredBackups() {
  try {
    const stored = localStorage.getItem('dash-data-backups')
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Failed to get backups:', error)
    return []
  }
}

// Restore from backup
export function restoreFromBackup(backupIndex = 0) {
  try {
    const backups = getStoredBackups()
    if (backups.length === 0) {
      throw new Error('No backups available')
    }
    
    const backup = backups[backups.length - 1 - backupIndex] // Latest first
    if (!backup) {
      throw new Error('Backup not found')
    }
    
    // Verify backup integrity
    const currentChecksum = generateChecksum(backup.data)
    if (currentChecksum !== backup.checksum) {
      console.warn('Backup checksum mismatch, data may be corrupted')
    }
    
    return backup.data
  } catch (error) {
    console.error('Failed to restore from backup:', error)
    return null
  }
}

// Generate simple checksum
function generateChecksum(data) {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString()
}

// Auto-recovery mechanism
export function attemptAutoRecovery(corruptData) {
  try {
    // First, try to repair the data
    const repairedData = validateAndRepairPages(corruptData)
    
    // If repair was successful and we have valid data, return it
    if (repairedData && repairedData.length > 0) {
      console.log('Data corruption repaired successfully')
      return { success: true, data: repairedData, method: 'repair' }
    }
    
    // If repair failed, try to restore from backup
    const backupData = restoreFromBackup()
    if (backupData) {
      console.log('Data restored from backup')
      return { success: true, data: backupData, method: 'backup' }
    }
    
    // If all else fails, create new default data
    const defaultData = [createDefaultPage()]
    console.log('Created new default data')
    return { success: true, data: defaultData, method: 'default' }
    
  } catch (error) {
    console.error('Auto-recovery failed:', error)
    return { success: false, error: error.message }
  }
} 