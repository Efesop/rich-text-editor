/**
 * Multi-Block Tune Enhancer for Editor.js
 * Shows a settings button when multiple blocks are selected,
 * allowing batch conversion via a popover menu.
 */

const SETTINGS_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 18 18"><circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="9" r="1.5"/><circle cx="4" cy="14" r="1.5"/></svg>'

const FRIENDLY_NAMES = {
  paragraph: 'Text',
  header: 'Heading',
  bulletListItem: 'Bullet List',
  numberedListItem: 'Numbered List',
  checklistItem: 'Checklist',
  quote: 'Quote',
  code: 'Code',
}

const CONVERT_OPTIONS = [
  { label: 'Text', tool: 'paragraph', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M9 7L9 17"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 7H15C16.1046 7 17 7.89543 17 9V9C17 10.1046 16.1046 11 15 11H9"/></svg>' },
  { label: 'Heading 1', tool: 'header', data: { level: 2 }, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 7v10"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 12h6"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7v10"/></svg>' },
  { label: 'Heading 2', tool: 'header', data: { level: 3 }, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 7v10"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 12h6"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7v10"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M17 12a2 2 0 11.001 3.999A2 2 0 0117 12zm0 0V10m0 6h2"/></svg>' },
  { label: 'Heading 3', tool: 'header', data: { level: 4 }, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 7v10"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 12h6"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7v10"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M17.5 11a1.5 1.5 0 10.001 2.999A1.5 1.5 0 0017.5 11zm0 3a1.5 1.5 0 10.001 2.999A1.5 1.5 0 0017.5 14z"/></svg>' },
  { label: 'Bullet List', tool: 'bulletListItem', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><line x1="9" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><circle cx="5" cy="7" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="17" r="1" fill="currentColor"/></svg>' },
  { label: 'Numbered List', tool: 'numberedListItem', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><line x1="12" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M7.8 14V7.21c0-.08-.1-.13-.16-.08L5 9.5"/></svg>' },
  { label: 'Checklist', tool: 'checklistItem', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M9.2 12L11.06 13.86c.08.08.2.08.28 0L14.7 10.5"/><rect width="14" height="14" x="5" y="5" stroke="currentColor" stroke-width="2" rx="4"/></svg>' },
  { label: 'Quote', tool: 'quote', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 10h5V7a3 3 0 00-3-3H7"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M13 10h5V7a3 3 0 00-3-3h-1"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M6 10c0 3 1 5 5 7"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M13 10c0 3 1 5 5 7"/></svg>' },
  { label: 'Code', tool: 'code', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M8 5l-5 7 5 7"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M16 5l5 7-5 7"/></svg>' },
]

export default class MultiBlockTuneEnhancer {
  constructor(editor) {
    this.editor = editor
    this.selectedBlocks = new Set()
    this.previouslySelectedBlocks = new Set()
    this.lastMultiSelectionTime = 0
    this.preservedSelection = null
    this._settingsBtn = null
    this._popover = null

    this.handleSelection = this.handleSelection.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleClickOutside = this.handleClickOutside.bind(this)

    this.init()
  }

  init() {
    this.editor.isReady.then(() => {
      this.createSettingsButton()
      this.setupEventListeners()
    }).catch(error => {
      console.error('Error initializing MultiBlockTuneEnhancer:', error)
    })
  }

  createSettingsButton() {
    this._settingsBtn = document.createElement('div')
    this._settingsBtn.className = 'multi-block-settings-btn'
    this._settingsBtn.innerHTML = SETTINGS_ICON
    this._settingsBtn.style.cssText = `
      position: absolute;
      display: none;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      z-index: 2001;
      color: inherit;
      opacity: 0.7;
      transition: opacity 0.15s ease;
    `
    this._settingsBtn.addEventListener('mouseenter', () => {
      this._settingsBtn.style.opacity = '1'
    })
    this._settingsBtn.addEventListener('mouseleave', () => {
      this._settingsBtn.style.opacity = '0.7'
    })
    this._settingsBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    })
    this._settingsBtn.addEventListener('mouseup', (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    })
    this._settingsBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      this.togglePopover()
    })

    const editorHolder = document.querySelector('.codex-editor')
    if (editorHolder) {
      editorHolder.style.position = 'relative'
      editorHolder.appendChild(this._settingsBtn)
    }
  }

  setupEventListeners() {
    document.addEventListener('mouseup', this.handleSelection, { passive: true })
    document.addEventListener('keydown', this.handleKeyDown, { passive: true })
    document.addEventListener('mousedown', this.handleClickOutside, { passive: true })

    this.handleWindowBlur = () => {
      if (this.selectedBlocks.size > 0) {
        this.preservedSelection = new Set(this.selectedBlocks)
      }
    }
    this.handleWindowFocus = () => {
      if (this.preservedSelection && this.preservedSelection.size > 0) {
        setTimeout(() => {
          this.preservedSelection.forEach(index => {
            const allBlocks = document.querySelectorAll('.ce-block')
            if (allBlocks[index]) {
              allBlocks[index].classList.add('ce-block--selected')
            }
          })
          this.selectedBlocks = new Set(this.preservedSelection)
          this.preservedSelection = null
        }, 10)
      }
    }
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener('focus', this.handleWindowFocus)

    const editorHolder = document.querySelector('.codex-editor')
    if (editorHolder) {
      this.handleMouseLeave = () => {
        if (this.selectedBlocks.size > 0) {
          this.preservedSelection = new Set(this.selectedBlocks)
        }
      }
      editorHolder.addEventListener('mouseleave', this.handleMouseLeave)
    }

    this._selectionInterval = setInterval(() => {
      this.updateSelection()
    }, 200)
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.hidePopover()
      this.hideSettingsButton()
    }
  }

  handleClickOutside(event) {
    if (this._popover && !this._popover.contains(event.target) &&
        !this._settingsBtn.contains(event.target)) {
      this.hidePopover()
    }
  }

  handleSelection(event) {
    if (event.target.closest('.multi-block-settings-btn, .multi-block-popover')) {
      return
    }

    setTimeout(() => {
      // Check if browser text selection spans multiple blocks
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        const startBlock = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement)?.closest('.ce-block')
        const endBlock = (range.endContainer.nodeType === Node.ELEMENT_NODE
          ? range.endContainer
          : range.endContainer.parentElement)?.closest('.ce-block')

        if (startBlock && endBlock && startBlock !== endBlock) {
          const allBlocks = Array.from(document.querySelectorAll('.ce-block'))
          const startIdx = allBlocks.indexOf(startBlock)
          const endIdx = allBlocks.indexOf(endBlock)

          if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx)
            const max = Math.max(startIdx, endIdx)

            sel.removeAllRanges()
            for (let i = min; i <= max; i++) {
              allBlocks[i].classList.add('ce-block--selected')
            }
          }
        }
      }

      this.updateSelection()
    }, 50)
  }

  updateSelection() {
    // Don't clear selection while popover is open — restore it instead
    if (this._popover && this.previouslySelectedBlocks.size > 1) {
      this.restoreVisualSelection()
      return
    }

    const selectedElements = document.querySelectorAll('.ce-block--selected')

    this.selectedBlocks.clear()

    selectedElements.forEach(element => {
      const blockIndex = this.getBlockIndex(element)
      if (blockIndex !== -1) {
        this.selectedBlocks.add(blockIndex)
      }
    })

    if (this.selectedBlocks.size > 1) {
      this.previouslySelectedBlocks = new Set()
      this.selectedBlocks.forEach(index => {
        try {
          const block = this.editor.blocks.getBlockByIndex(index)
          if (block && block.id) {
            this.previouslySelectedBlocks.add(block.id)
          }
        } catch {}
      })
      this.lastMultiSelectionTime = Date.now()
      this.positionSettingsButton()
    } else {
      this.hideSettingsButton()
      this.hidePopover()
    }
  }

  getBlockIndex(blockElement) {
    const allBlocks = document.querySelectorAll('.ce-block')
    return Array.from(allBlocks).indexOf(blockElement)
  }

  positionSettingsButton() {
    if (!this._settingsBtn) return

    const firstIndex = Math.min(...this.selectedBlocks)
    const allBlocks = document.querySelectorAll('.ce-block')
    const firstBlock = allBlocks[firstIndex]
    if (!firstBlock) return

    const editorHolder = document.querySelector('.codex-editor')
    if (!editorHolder) return

    const blockRect = firstBlock.getBoundingClientRect()
    const editorRect = editorHolder.getBoundingClientRect()

    // Position to the left of the block content, vertically centered on first selected block
    const contentEl = firstBlock.querySelector('.ce-block__content')
    const contentRect = contentEl ? contentEl.getBoundingClientRect() : blockRect

    this._settingsBtn.style.display = 'flex'
    this._settingsBtn.style.top = `${blockRect.top - editorRect.top + blockRect.height / 2 - 12}px`
    this._settingsBtn.style.left = `${contentRect.left - editorRect.left - 36}px`
  }

  hideSettingsButton() {
    if (this._settingsBtn) {
      this._settingsBtn.style.display = 'none'
    }
  }

  togglePopover() {
    if (this._popover) {
      this.hidePopover()
    } else {
      this.showPopover()
    }
  }

  showPopover() {
    this.hidePopover()

    if (this.previouslySelectedBlocks.size < 2) return

    // Immediately restore visual selection in case Editor.js cleared it
    this.restoreVisualSelection()

    this._popover = document.createElement('div')
    this._popover.className = 'multi-block-popover ce-popover'
    this._popover.style.cssText = `
      position: absolute;
      z-index: 2002;
      min-width: 180px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 3px 15px -3px rgba(13,20,33,.13), 0 0 0 1px rgba(0,0,0,.05);
    `

    // Title
    const title = document.createElement('div')
    title.textContent = `Convert ${this.previouslySelectedBlocks.size} blocks`
    title.style.cssText = `
      padding: 8px 12px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.5;
    `
    this._popover.appendChild(title)

    CONVERT_OPTIONS.forEach(option => {
      const item = document.createElement('div')
      item.className = 'ce-popover-item'
      item.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.1s;
      `

      const icon = document.createElement('span')
      icon.innerHTML = option.icon
      icon.style.cssText = 'display: flex; align-items: center; width: 20px; height: 20px; flex-shrink: 0;'

      const label = document.createElement('span')
      label.textContent = option.label

      item.appendChild(icon)
      item.appendChild(label)

      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--color-bg-secondary, rgba(0,0,0,0.04))'
      })
      item.addEventListener('mouseleave', () => {
        item.style.background = ''
      })
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const extraData = option.data || {}
        this.convertMultipleBlocks(option.tool, extraData)
        this.hidePopover()
        this.hideSettingsButton()
      })

      this._popover.appendChild(item)
    })

    // Position popover below the settings button
    const editorHolder = document.querySelector('.codex-editor')
    if (!editorHolder) return

    editorHolder.appendChild(this._popover)

    const btnRect = this._settingsBtn.getBoundingClientRect()
    const editorRect = editorHolder.getBoundingClientRect()

    this._popover.style.top = `${btnRect.bottom - editorRect.top + 4}px`
    this._popover.style.left = `${btnRect.left - editorRect.left}px`

    // Restore selection highlights that clicking might have cleared
    this.restoreVisualSelection()
  }

  hidePopover() {
    if (this._popover) {
      this._popover.remove()
      this._popover = null
    }
  }

  restoreVisualSelection() {
    this.previouslySelectedBlocks.forEach(blockId => {
      try {
        const block = this.editor.blocks.getById(blockId)
        if (block && block.holder) {
          block.holder.classList.add('ce-block--selected')
        }
      } catch {}
    })
  }

  async convertMultipleBlocks(targetTool, extraData = {}) {
    try {
      const blockIds = Array.from(this.previouslySelectedBlocks)
      let convertedCount = 0

      const sortedBlockIds = blockIds
        .map(id => {
          try {
            const block = this.editor.blocks.getById(id)
            return block ? { id, index: this.editor.blocks.getBlockIndex(block.id) } : null
          } catch { return null }
        })
        .filter(Boolean)
        .sort((a, b) => b.index - a.index)
        .map(item => item.id)

      for (const blockId of sortedBlockIds) {
        try {
          const currentBlock = this.editor.blocks.getById(blockId)

          if (currentBlock && currentBlock.name !== targetTool) {
            const blockData = await currentBlock.save()
            const convertedData = { ...this.prepareDataForTool(targetTool, blockData), ...extraData }
            await this.editor.blocks.convert(blockId, targetTool, convertedData)
            convertedCount++
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        } catch (blockError) {
          console.error(`Error converting block ID ${blockId}:`, blockError)
        }
      }

      this.clearSelection()
      const friendlyName = FRIENDLY_NAMES[targetTool] || targetTool
      this.showNotification(`Converted ${convertedCount} blocks to ${friendlyName}`)

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

      case 'bulletListItem':
        return { text }

      case 'numberedListItem':
        return { text }

      case 'checklistItem':
        return { text, checked: false }

      case 'quote':
        return { text, caption: '', alignment: 'left' }

      case 'code':
        return { code: text }

      default:
        return { text }
    }
  }

  extractTextFromBlock(blockData) {
    if (!blockData?.data) return ''

    const data = blockData.data

    if (typeof data.text === 'string') return data.text
    if (typeof data.code === 'string') return data.code

    if (Array.isArray(data.items)) {
      return data.items.map(item => {
        if (typeof item === 'string') return item
        if (item.text) return item.text
        if (item.content) return item.content
        return ''
      }).filter(Boolean).join('<br>')
    }

    return ''
  }

  clearSelection() {
    const selectedElements = document.querySelectorAll('.ce-block--selected')
    selectedElements.forEach(el => el.classList.remove('ce-block--selected'))
    this.selectedBlocks.clear()
    this.previouslySelectedBlocks.clear()
    this.hideSettingsButton()
    this.hidePopover()
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
    document.removeEventListener('mousedown', this.handleClickOutside)
    window.removeEventListener('blur', this.handleWindowBlur)
    window.removeEventListener('focus', this.handleWindowFocus)

    const editorHolder = document.querySelector('.codex-editor')
    if (editorHolder && this.handleMouseLeave) {
      editorHolder.removeEventListener('mouseleave', this.handleMouseLeave)
    }

    if (this._selectionInterval) {
      clearInterval(this._selectionInterval)
    }

    if (this._settingsBtn) {
      this._settingsBtn.remove()
    }
    this.hidePopover()
  }
}
