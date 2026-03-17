/**
 * Multi-Block Tune Enhancer for Editor.js
 * Shows a settings button when multiple blocks are selected,
 * allowing batch conversion via a popover menu.
 */

const SETTINGS_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 18 18"><circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="9" r="1.5"/><circle cx="4" cy="14" r="1.5"/></svg>'
const AI_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-4 -4 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

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
  constructor (editor) {
    this.editor = editor
    this.selectedBlocks = new Set()
    this._selectedElements = []
    this.lastMultiSelectionTime = 0
    this.preservedSelection = null
    this._cmdClickActive = false
    this._settingsBtn = null
    this._popover = null

    this.handleSelection = this.handleSelection.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleClickOutside = this.handleClickOutside.bind(this)

    this.init()
  }

  // Get all .ce-block elements scoped to the editor's redactor (not global)
  _getEditorBlocks () {
    const redactor = document.querySelector('.codex-editor__redactor')
    if (redactor) return Array.from(redactor.querySelectorAll(':scope > .ce-block'))
    return Array.from(document.querySelectorAll('.ce-block'))
  }

  init () {
    this.editor.isReady.then(() => {
      this.createSettingsButton()
      this.setupEventListeners()
    }).catch(error => {
      console.error('[MBT] Error initializing:', error)
    })
  }

  createSettingsButton () {
    this._settingsBtn = document.createElement('div')
    this._settingsBtn.className = 'multi-block-settings-btn'
    this._settingsBtn.innerHTML = SETTINGS_ICON
    this._settingsBtn.title = '⌘+Click blocks to select more'
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

  setupEventListeners () {
    document.addEventListener('mouseup', this.handleSelection, { passive: true })
    document.addEventListener('keydown', this.handleKeyDown, { passive: true })
    document.addEventListener('mousedown', this.handleClickOutside)

    this.handleWindowBlur = () => {
      if (this._selectedElements.length > 0) {
        this.preservedSelection = [...this._selectedElements]
      }
    }
    this.handleWindowFocus = () => {
      if (this.preservedSelection && this.preservedSelection.length > 0) {
        const saved = this.preservedSelection
        this.preservedSelection = null
        setTimeout(() => {
          this._selectedElements = saved.filter(el => el.isConnected)
          this.restoreVisualSelection()
        }, 10)
      }
    }
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener('focus', this.handleWindowFocus)

    const editorHolder = document.querySelector('.codex-editor')
    if (editorHolder) {
      this.handleMouseLeave = () => {
        if (this._selectedElements.length > 0) {
          this.preservedSelection = [...this._selectedElements]
        }
      }
      editorHolder.addEventListener('mouseleave', this.handleMouseLeave)
    }

    this._selectionInterval = setInterval(() => {
      this.updateSelection()
    }, 200)
  }

  handleKeyDown (event) {
    if (event.key === 'Escape') {
      this.clearSelection()
    }
  }

  handleClickOutside (event) {
    const onBtn = this._settingsBtn && this._settingsBtn.contains(event.target)
    const onPopover = this._popover && this._popover.contains(event.target)


    // Cmd+click to toggle individual blocks in/out of selection
    if (event.metaKey || event.ctrlKey) {
      const clickedBlock = event.target.closest('.ce-block')
      if (clickedBlock) {
        event.preventDefault()
        event.stopPropagation()
        this._cmdClickActive = true

        // First Cmd+click: absorb any existing selection
        if (this._selectedElements.length === 0) {
          const alreadySelected = document.querySelectorAll('.ce-block--selected')
          alreadySelected.forEach(el => {
            if (el !== clickedBlock) {
              this._selectedElements.push(el)
            }
          })

          // If still empty, add the currently focused block
          if (this._selectedElements.length === 0) {
            try {
              const currentIdx = this.editor.blocks.getCurrentBlockIndex()
              const allBlocks = this._getEditorBlocks()
              const currentEl = allBlocks[currentIdx]
              if (currentEl && currentEl !== clickedBlock) {
                this._selectedElements.push(currentEl)
                currentEl.classList.add('ce-block--selected')
              }
            } catch {}
          }
        }

        const alreadyInList = this._selectedElements.indexOf(clickedBlock)

        if (clickedBlock.classList.contains('ce-block--selected') && alreadyInList !== -1) {
          clickedBlock.classList.remove('ce-block--selected')
          this._selectedElements.splice(alreadyInList, 1)
        } else {
          clickedBlock.classList.add('ce-block--selected')
          if (alreadyInList === -1) this._selectedElements.push(clickedBlock)
        }

        if (this._selectedElements.length >= 1) {
          this.lastMultiSelectionTime = Date.now()
          this.positionSettingsButton()
          this.hideEditorToolbar()
        } else {
          this.hideSettingsButton()
          this.hidePopover()
          this.showEditorToolbar()
        }
        return
      }
    }

    if (!onBtn && !onPopover) {
      this.clearSelection()
    } else {
    }
  }

  handleSelection (event) {
    if (event.target.closest('.multi-block-settings-btn, .multi-block-popover')) {
      return
    }

    // Cmd+click is handled in handleClickOutside
    if (event.metaKey || event.ctrlKey) {
      return
    }

    setTimeout(() => {
      const allBlocks = this._getEditorBlocks()
      const sel = window.getSelection()

      // Gather all blocks that are either in the text selection range
      // OR already marked as ce-block--selected by Editor.js
      const selectedSet = new Set()

      // 1. Capture blocks already marked by Editor.js
      const visuallySelected = document.querySelectorAll('.ce-block--selected')
      visuallySelected.forEach(el => {
        const idx = allBlocks.indexOf(el)
        if (idx !== -1) selectedSet.add(idx)
      })

      // 2. Capture blocks within the native text selection range
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        const startBlock = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement)?.closest('.ce-block')
        const endBlock = (range.endContainer.nodeType === Node.ELEMENT_NODE
          ? range.endContainer
          : range.endContainer.parentElement)?.closest('.ce-block')

        if (startBlock && endBlock && startBlock !== endBlock) {
          const startIdx = allBlocks.indexOf(startBlock)
          const endIdx = allBlocks.indexOf(endBlock)

          if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx)
            const max = Math.max(startIdx, endIdx)
            for (let i = min; i <= max; i++) {
              selectedSet.add(i)
            }
          }
        }
      }

      if (selectedSet.size > 1) {
        sel.removeAllRanges()

        // Build a contiguous range from the min to max selected index
        const sortedIndices = [...selectedSet].sort((a, b) => a - b)
        const min = sortedIndices[0]
        const max = sortedIndices[sortedIndices.length - 1]

        this._selectedElements = []
        for (let i = min; i <= max; i++) {
          allBlocks[i].classList.add('ce-block--selected')
          this._selectedElements.push(allBlocks[i])
        }


        this.lastMultiSelectionTime = Date.now()
        this.positionSettingsButton()
        this.hideEditorToolbar()
        return
      }

      this.updateSelection()
    }, 50)
  }

  updateSelection () {
    // Don't clear selection while popover/button is active — just restore visuals
    const settingsVisible = this._settingsBtn && this._settingsBtn.style.display === 'flex'
    if ((this._popover || settingsVisible) && this._selectedElements.length >= 1) {
      this.restoreVisualSelection()
      return
    }

    const selectedElements = document.querySelectorAll('.ce-block--selected')

    if (selectedElements.length > 1 || (selectedElements.length === 1 && this._cmdClickActive)) {
      // Only update if we don't already have a larger captured set
      if (this._selectedElements.length < selectedElements.length) {
        this._selectedElements = Array.from(selectedElements)
      }
      this.lastMultiSelectionTime = Date.now()
      this.positionSettingsButton()
      this.hideEditorToolbar()
    } else if (this._selectedElements.length === 0) {
      this._cmdClickActive = false
      this.hideSettingsButton()
      this.hidePopover()
      this.showEditorToolbar()
    }
  }

  positionSettingsButton () {
    if (!this._settingsBtn || this._selectedElements.length === 0) return

    const firstEl = this._selectedElements[0]
    if (!firstEl || !firstEl.isConnected) return

    const editorHolder = document.querySelector('.codex-editor')
    if (!editorHolder) return

    const blockRect = firstEl.getBoundingClientRect()
    const editorRect = editorHolder.getBoundingClientRect()
    const contentEl = firstEl.querySelector('.ce-block__content')
    const contentRect = contentEl ? contentEl.getBoundingClientRect() : blockRect

    this._settingsBtn.style.display = 'flex'
    this._settingsBtn.style.top = `${blockRect.top - editorRect.top + blockRect.height / 2 - 12}px`
    this._settingsBtn.style.left = `${contentRect.left - editorRect.left - 36}px`
  }

  hideSettingsButton () {
    if (this._settingsBtn) {
      this._settingsBtn.style.display = 'none'
    }
  }

  togglePopover () {
    if (this._popover) {
      this.hidePopover()
    } else {
      this.showPopover()
    }
  }

  showPopover () {
    this.hidePopover()

    if (this._selectedElements.length < 1) {
      return
    }

    this.restoreVisualSelection()


    // Render popover on document.body with fixed positioning to escape
    // Editor.js event handling inside .codex-editor
    this._popover = document.createElement('div')
    this._popover.className = 'multi-block-popover'
    this._popover.style.cssText = `
      position: fixed;
      z-index: 10000;
      min-width: 180px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 3px 15px -3px rgba(13,20,33,.13), 0 0 0 1px rgba(0,0,0,.05);
      background: var(--color-bg-primary, #fff);
      color: var(--color-text-primary, #000);
    `

    // Log ALL events on the popover container itself
    this._popover.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    }, true) // capture phase

    this._popover.addEventListener('mouseup', (e) => {
    }, true)

    this._popover.addEventListener('click', (e) => {
    }, true) // capture phase

    const count = this._selectedElements.length
    const title = document.createElement('div')
    title.textContent = count === 1 ? 'Convert to' : `Convert ${count} blocks`
    title.style.cssText = `
      padding: 8px 12px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.5;
    `
    this._popover.appendChild(title)

    const self = this

    CONVERT_OPTIONS.forEach(option => {
      const item = document.createElement('div')
      item.setAttribute('data-tool', option.tool)
      item.setAttribute('data-label', option.label)
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
      icon.style.cssText = 'display: flex; align-items: center; width: 20px; height: 20px; flex-shrink: 0; pointer-events: none;'

      const label = document.createElement('span')
      label.textContent = option.label
      label.style.cssText = 'pointer-events: none;'

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
        e.stopImmediatePropagation()
      })

      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        const extraData = option.data || {}
        self.convertMultipleBlocks(option.tool, extraData)
        self.hidePopover()
        self.hideSettingsButton()
      })

      this._popover.appendChild(item)
    })

    // Divider
    const divider = document.createElement('div')
    divider.style.cssText = 'height: 1px; margin: 4px 12px; opacity: 0.15; background: currentColor;'
    this._popover.appendChild(divider)

    // AI option
    const aiItem = document.createElement('div')
    aiItem.setAttribute('data-tool', 'ai')
    aiItem.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.1s;
    `
    const aiIcon = document.createElement('span')
    aiIcon.innerHTML = AI_ICON
    aiIcon.style.cssText = 'display: flex; align-items: center; width: 20px; height: 20px; flex-shrink: 0; pointer-events: none;'
    const aiLabel = document.createElement('span')
    aiLabel.textContent = 'Use Local AI'
    aiLabel.style.cssText = 'pointer-events: none;'
    aiItem.appendChild(aiIcon)
    aiItem.appendChild(aiLabel)
    aiItem.addEventListener('mouseenter', () => { aiItem.style.background = 'var(--color-bg-secondary, rgba(0,0,0,0.04))' })
    aiItem.addEventListener('mouseleave', () => { aiItem.style.background = '' })
    aiItem.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    })
    aiItem.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      self.sendToAI()
      self.hidePopover()
      self.hideSettingsButton()
    })
    this._popover.appendChild(aiItem)

    document.body.appendChild(this._popover)

    // Position using fixed coordinates from the settings button
    const btnRect = this._settingsBtn.getBoundingClientRect()
    this._popover.style.top = `${btnRect.bottom + 4}px`
    this._popover.style.left = `${btnRect.left}px`


    this.restoreVisualSelection()
  }

  hidePopover () {
    if (this._popover) {
      this._popover.remove()
      this._popover = null
    }
  }

  restoreVisualSelection () {
    this._selectedElements.forEach(el => {
      if (el && el.isConnected) {
        el.classList.add('ce-block--selected')
      }
    })
  }

  async sendToAI () {
    try {
      const texts = []
      const blockIndices = []
      const allBlocks = this._getEditorBlocks()

      const elements = this._selectedElements.length > 0
        ? this._selectedElements
        : Array.from(document.querySelectorAll('.ce-block--selected'))

      elements.forEach(el => {
        if (!el || !el.isConnected) return
        // Get block index for precise replacement
        const idx = allBlocks.indexOf(el)
        if (idx !== -1) blockIndices.push(idx)
        // Extract text — use table cells specifically to avoid toolbar UI text
        const content = el.querySelector('.ce-block__content')
        if (content) {
          const tableCells = content.querySelectorAll('.tc-cell')
          if (tableCells.length > 0) {
            const rows = content.querySelectorAll('.tc-row')
            const rowTexts = Array.from(rows).map(row =>
              Array.from(row.querySelectorAll('.tc-cell')).map(c => c.textContent.trim()).join(' | ')
            )
            texts.push(rowTexts.join('\n'))
          } else {
            const clone = content.cloneNode(true)
            clone.querySelectorAll('[class*="toolbar"], [class*="Toolbar"], .ce-toolbar').forEach(n => n.remove())
            const text = clone.textContent.trim()
            if (text) texts.push(text)
          }
        }
      })

      const selectedText = texts.join('\n')
      if (selectedText.trim()) {
        window.dispatchEvent(new CustomEvent('dash-ai-inline', {
          detail: { selectedText, blockIndices: blockIndices.length > 0 ? blockIndices : undefined }
        }))
      }
      this.clearSelection()
    } catch (err) {
      console.error('[MBT] Error sending to AI:', err)
    }
  }

  async convertMultipleBlocks (targetTool, extraData = {}) {
    try {
      const allBlocks = this._getEditorBlocks()

      // Get indices of selected elements
      const selectedIndices = new Set()
      this._selectedElements.forEach((el, i) => {
        const connected = el && el.isConnected
        const idx = connected ? allBlocks.indexOf(el) : -1
        if (idx !== -1) selectedIndices.add(idx)
      })


      if (selectedIndices.size === 0) {
        return
      }

      // Save the entire editor content
      const savedData = await this.editor.save()
      savedData.blocks.forEach((b, i) => {
      })

      let convertedCount = 0

      // Modify blocks at selected indices
      savedData.blocks = savedData.blocks.map((block, i) => {
        if (!selectedIndices.has(i)) return block
        if (block.type === targetTool && !extraData.level) return block

        const text = this._extractText(block)
        const newData = { ...this._prepareData(targetTool, text), ...extraData }
        convertedCount++
        return { type: targetTool, data: newData }
      })


      // Clear selection before re-render (elements will be destroyed)
      this.clearSelection()

      // Re-render the entire editor with modified content
      await this.editor.render(savedData)


      const friendlyName = FRIENDLY_NAMES[targetTool] || targetTool
      this.showNotification(`Converted ${convertedCount} block${convertedCount !== 1 ? 's' : ''} to ${friendlyName}`)
    } catch (error) {
      console.error('[CONVERT] ERROR:', error)
      this.showNotification('Error converting blocks', 'error')
    }
  }

  _extractText (block) {
    const data = block.data || {}
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

  _prepareData (toolName, text) {
    switch (toolName) {
      case 'paragraph': return { text }
      case 'header': return { text, level: 2 }
      case 'bulletListItem': return { text }
      case 'numberedListItem': return { text }
      case 'checklistItem': return { text, checked: false }
      case 'quote': return { text, caption: '', alignment: 'left' }
      case 'code': return { code: text }
      default: return { text }
    }
  }

  clearSelection () {
    const selectedElements = document.querySelectorAll('.ce-block--selected')
    selectedElements.forEach(el => el.classList.remove('ce-block--selected'))
    this.selectedBlocks.clear()
    this._selectedElements = []
    this._cmdClickActive = false
    this.hideSettingsButton()
    this.hidePopover()
    this.showEditorToolbar()
  }

  showNotification (message, type = 'success') {
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

  hideEditorToolbar () {
    const toolbar = document.querySelector('.ce-toolbar')
    if (toolbar) toolbar.style.display = 'none'
  }

  showEditorToolbar () {
    const toolbar = document.querySelector('.ce-toolbar')
    if (toolbar) toolbar.style.display = ''
  }

  destroy () {
    document.removeEventListener('mouseup', this.handleSelection)
    document.removeEventListener('keydown', this.handleKeyDown)
    document.removeEventListener('mousedown', this.handleClickOutside)
    window.removeEventListener('blur', this.handleWindowBlur)
    window.removeEventListener('focus', this.handleWindowFocus)

    const editorHolder = document.querySelector('.codex-editor')
    if (editorHolder && this.handleMouseLeave) {
      editorHolder.removeEventListener('mouseleave', this.handleMouseLeave)
    }

    this.showEditorToolbar()

    if (this._selectionInterval) {
      clearInterval(this._selectionInterval)
    }

    if (this._settingsBtn) {
      this._settingsBtn.remove()
    }
    this.hidePopover()
  }
}
