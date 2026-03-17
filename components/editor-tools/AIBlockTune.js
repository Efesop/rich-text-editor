/**
 * AI Block Tune for Editor.js
 * Adds an "AI" option to every block's settings menu (the 6-dot popover).
 * Uses the MenuConfig API (Editor.js 2.26+) for proper popover integration.
 */

const AI_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-4 -4 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

export default class AIBlockTune {
  static get isTune () {
    return true
  }

  constructor ({ block, api }) {
    this.block = block
    this.api = api
  }

  render () {
    return {
      icon: AI_ICON,
      label: 'Use Local AI',
      onActivate: () => {
        const text = this._extractBlockText()
        if (text) {
          // Pass blockIndex so replace can target the exact block
          const blockIndex = this.api.blocks.getCurrentBlockIndex()
          window.dispatchEvent(new CustomEvent('dash-ai-inline', {
            detail: { selectedText: text, blockIndex }
          }))
        }
        this.api.toolbar.close()
      }
    }
  }

  _extractBlockText () {
    const blockElement = this.block.holder || document.querySelector(`.ce-block[data-id="${this.block.id}"]`)
    if (!blockElement) return ''

    const content = blockElement.querySelector('.ce-block__content')
    if (!content) return ''

    // Table blocks: only extract text from table cells, not toolbar UI
    const tableCells = content.querySelectorAll('.tc-cell')
    if (tableCells.length > 0) {
      const rows = content.querySelectorAll('.tc-row')
      const lines = []
      rows.forEach(row => {
        const cells = row.querySelectorAll('.tc-cell')
        const cellTexts = Array.from(cells).map(c => c.textContent.trim())
        lines.push(cellTexts.join(' | '))
      })
      return lines.join('\n')
    }

    // Code blocks: extract from code element
    const codeEl = content.querySelector('code, .ce-code__textarea, textarea')
    if (codeEl) return codeEl.textContent.trim() || codeEl.value?.trim() || ''

    // Default: clone and strip any UI elements before reading text
    const clone = content.cloneNode(true)
    clone.querySelectorAll('[class*="toolbar"], [class*="Toolbar"], .ce-settings, .cdx-settings-button').forEach(el => el.remove())

    return clone.textContent.trim()
  }

  save () {
    return undefined
  }
}
