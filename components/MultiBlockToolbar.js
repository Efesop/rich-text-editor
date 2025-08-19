/**
 * Multi-Block Tune Enhancer for Editor.js
 * Enhances the existing tune menu to support multi-block operations
 * 
 * @author Dash Team
 * @version 3.0.0
 */

export default class MultiBlockTuneEnhancer {
  constructor(editor) {
    this.editor = editor
    this.selectedBlocks = new Set()
    this.previouslySelectedBlocks = new Set()
    this.lastMultiSelectionTime = 0
    this.isEnhancing = false
    
    // Bind methods
    this.handleSelection = this.handleSelection.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    
    this.init()
  }

  init() {
    this.editor.isReady.then(() => {
      this.setupEventListeners()
      this.watchForTuneMenus()
    }).catch(error => {
      console.error('Error initializing MultiBlockTuneEnhancer:', error)
    })
  }

  setupEventListeners() {
    // Listen for selection changes
    document.addEventListener('mouseup', this.handleSelection, { passive: true })
    document.addEventListener('keydown', this.handleKeyDown, { passive: true })
    
    // Check for selection changes periodically
    setInterval(() => {
      this.updateSelection()
    }, 200)
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.closeTuneMenu()
    }
  }

  handleSelection(event) {
    // Don't interfere with toolbar interactions
    if (event.target.closest('.ce-toolbar, .ce-popover, .ce-inline-toolbar')) {
      return
    }
    
    setTimeout(() => {
      this.updateSelection()
    }, 50)
  }

  updateSelection() {
    const selectedElements = document.querySelectorAll('.ce-block--selected')
    const previousSize = this.selectedBlocks.size
    
    // Store previous multi-selection before updating
    if (this.selectedBlocks.size > 1) {
      this.previouslySelectedBlocks = new Set(this.selectedBlocks)
      this.lastMultiSelectionTime = Date.now()
    }
    
    this.selectedBlocks.clear()
    
    selectedElements.forEach(element => {
      const blockIndex = this.getBlockIndex(element)
      if (blockIndex !== -1) {
        this.selectedBlocks.add(blockIndex)
      }
    })

    // Store current selection if it's multi-block - Use ACTUAL BLOCK IDs
    if (this.selectedBlocks.size > 1) {
      this.previouslySelectedBlocks = new Set()
      this.selectedBlocks.forEach(index => {
        const block = this.editor.blocks.getBlockByIndex(index)
        if (block && block.id) {
          this.previouslySelectedBlocks.add(block.id)
        }
      })
      this.lastMultiSelectionTime = Date.now()
    }
  }

  getBlockIndex(blockElement) {
    const allBlocks = document.querySelectorAll('.ce-block')
    return Array.from(allBlocks).indexOf(blockElement)
  }

  watchForTuneMenus() {
    // Watch for tune menus (popovers) appearing in the DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Look for tune popovers (.ce-popover)
            let tunePopover = null
            
            // Check if the node itself is a popover
            if (node.classList && node.classList.contains('ce-popover')) {
              tunePopover = node
            }
            // Check if the node contains a popover
            else if (node.querySelector) {
              tunePopover = node.querySelector('.ce-popover')
            }
            
            if (tunePopover && this.shouldEnhanceTuneMenu()) {
              // Small delay to ensure the popover is fully rendered
              setTimeout(() => {
                this.enhanceTuneMenu(tunePopover)
                // Restore selection again after a bit more time to be sure
                setTimeout(() => {
                  this.restoreVisualSelection()
                }, 50)
              }, 10)
            }
          }
        })
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  shouldEnhanceTuneMenu() {
    // Enhance if we recently had multiple blocks selected
    const timeSinceMultiSelection = Date.now() - this.lastMultiSelectionTime
    return this.previouslySelectedBlocks.size > 1 && timeSinceMultiSelection < 2000
  }

  enhanceTuneMenu(popover) {
    if (popover.querySelector('.multi-block-enhanced')) {
      return // Already enhanced
    }

    // Mark as enhanced
    popover.classList.add('multi-block-enhanced')

    // RESTORE VISUAL SELECTION - This is the key fix!
    this.restoreVisualSelection()

    // Find conversion items and enhance them
    const popoverItems = popover.querySelectorAll('.ce-popover__item, .ce-popover-item')
    
    let enhancedCount = 0
    popoverItems.forEach((item, index) => {
      const text = item.textContent?.toLowerCase().trim() || ''
      const innerHTML = item.innerHTML?.toLowerCase() || ''
      
      // Enhanced detection - check for conversion options more broadly
      const isConversion = (
        text.includes('convert to') || 
        text.includes('heading') || text.includes('header') ||
        text.includes('list') || 
        text.includes('checklist') || text.includes('checkbox') ||
        text.includes('quote') || text.includes('blockquote') ||
        text.includes('paragraph') || text.includes('text') ||
        text.includes('code') ||
        // Check HTML content too
        innerHTML.includes('heading') || innerHTML.includes('header') ||
        innerHTML.includes('list') || innerHTML.includes('checklist') ||
        innerHTML.includes('quote') || innerHTML.includes('paragraph') ||
        innerHTML.includes('code') ||
        // Check for common Editor.js tool indicators
        item.querySelector('i[class*="heading"]') ||
        item.querySelector('i[class*="list"]') ||
        item.querySelector('i[class*="quote"]') ||
        item.querySelector('i[class*="paragraph"]') ||
        item.querySelector('i[class*="code"]')
      )
      
      if (isConversion) {
        // Intercept clicks
        const clickHandler = (e) => {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          
          const toolName = this.getToolNameFromText(text, innerHTML)
          if (toolName) {
            this.convertMultipleBlocks(toolName)
            this.closeTuneMenu()
          }
          return false
        }
        
        item.addEventListener('click', clickHandler, true)
        item.addEventListener('mousedown', clickHandler, true)
        enhancedCount++
      }
    })

    this.addThemeStyles()
  }

  restoreVisualSelection() {
    // Get all blocks and remove selection
    const allBlocks = document.querySelectorAll('.ce-block')
    allBlocks.forEach(block => {
      block.classList.remove('ce-block--selected')
    })
    
    // Add selection back using block IDs
    this.previouslySelectedBlocks.forEach(blockId => {
      try {
        const block = this.editor.blocks.getById(blockId)
        if (block && block.holder) {
          block.holder.classList.add('ce-block--selected')
        }
      } catch (error) {
        // Fallback: try to find by index
        const blockIndex = Array.from(this.previouslySelectedBlocks).indexOf(blockId)
        if (blockIndex !== -1 && allBlocks[blockIndex]) {
          allBlocks[blockIndex].classList.add('ce-block--selected')
        }
      }
    })
  }

  getToolNameFromText(text, innerHTML = '') {
    const textLower = text.toLowerCase()
    const htmlLower = innerHTML.toLowerCase()
    const combined = textLower + ' ' + htmlLower
    
    if (combined.includes('paragraph') || combined.includes('text')) {
      return 'paragraph'
    }
    if (combined.includes('heading') || combined.includes('header')) {
      return 'header'
    }
    if (combined.includes('list') && !combined.includes('check')) {
      return 'nestedlist'
    }
    if (combined.includes('checklist') || combined.includes('check') || combined.includes('checkbox')) {
      return 'checklist'
    }
    if (combined.includes('quote') || combined.includes('blockquote')) {
      return 'quote'
    }
    if (combined.includes('code')) {
      return 'code'
    }
    
    return null
  }

  addThemeStyles() {
    if (document.getElementById('multi-block-tune-styles')) return
    
    const style = document.createElement('style')
    style.id = 'multi-block-tune-styles'
    style.textContent = `
      /* Dark theme styles */
      .dark .multi-block-indicator {
        background: #374151 !important;
        border-color: #4b5563 !important;
        color: #e5e7eb !important;
      }
      
      /* Fallout theme styles */
      .fallout .multi-block-indicator {
        background: #1a2e1a !important;
        border-color: #22c55e !important;
        color: #22c55e !important;
      }
    `
    document.head.appendChild(style)
  }

  closeTuneMenu() {
    const popovers = document.querySelectorAll('.ce-popover')
    popovers.forEach(popover => popover.remove())
  }

  async convertMultipleBlocks(targetTool) {
    try {
      const blockIds = Array.from(this.previouslySelectedBlocks)
      let convertedCount = 0
      
      for (const blockId of blockIds) {
        try {
          const currentBlock = this.editor.blocks.getById(blockId)
          
          if (currentBlock && currentBlock.name !== targetTool) {
            const blockData = await currentBlock.save()
            const convertedData = this.prepareDataForTool(targetTool, blockData)
            await this.editor.blocks.convert(blockId, targetTool, convertedData)
            convertedCount++
          }
        } catch (blockError) {
          console.error(`Error converting block ID ${blockId}:`, blockError)
        }
      }
      
      this.clearSelection()
      this.showNotification(`Converted ${convertedCount} blocks to ${targetTool}`)
      
    } catch (error) {
      console.error('Error converting multiple blocks:', error)
      this.showNotification('Error converting blocks', 'error')
    }
  }

  prepareDataForTool(toolName, originalData) {
    const text = this.extractTextFromBlock(originalData)
    
    switch (toolName) {
      case 'paragraph':
        return { text }
      
      case 'header':
        return { text, level: 2 }
      
      case 'nestedlist':
        return {
          style: 'unordered',
          items: [{ content: text, items: [] }]
        }
      
      case 'checklist':
        return {
          items: [{ text, checked: false }]
        }
      
      case 'quote':
        return {
          text,
          caption: '',
          alignment: 'left'
        }
      
      default:
        return { text }
    }
  }

  extractTextFromBlock(blockData) {
    if (!blockData?.data) return ''
    
    const data = blockData.data
    
    if (typeof data.text === 'string') {
      return this.stripHTML(data.text)
    }
    
    if (Array.isArray(data.items)) {
      return data.items.map(item => {
        if (typeof item === 'string') return this.stripHTML(item)
        if (item.text) return this.stripHTML(item.text)
        if (item.content) return this.stripHTML(item.content)
        return ''
      }).join('\n')
    }
    
    if (data.code) return data.code
    
    return ''
  }

  stripHTML(html) {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  clearSelection() {
    const selectedElements = document.querySelectorAll('.ce-block--selected')
    selectedElements.forEach(el => el.classList.remove('ce-block--selected'))
    this.selectedBlocks.clear()
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : '#22c55e'};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.2s ease;
    `
    notification.textContent = message
    
    document.body.appendChild(notification)
    
    setTimeout(() => {
      notification.style.opacity = '1'
      notification.style.transform = 'translateY(0)'
    }, 10)
    
    setTimeout(() => {
      notification.style.opacity = '0'
      notification.style.transform = 'translateY(-10px)'
      setTimeout(() => notification.remove(), 200)
    }, 3000)
  }

  destroy() {
    document.removeEventListener('mouseup', this.handleSelection)
    document.removeEventListener('keydown', this.handleKeyDown)
    
    const style = document.getElementById('multi-block-tune-styles')
    if (style) {
      style.remove()
    }
  }
}
