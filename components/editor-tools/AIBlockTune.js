/**
 * AI Block Tune for Editor.js
 * Adds an "AI" option to every block's settings menu (the 6-dot popover).
 * Uses the MenuConfig API (Editor.js 2.26+) for proper popover integration.
 */

const AI_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><defs><filter id="ot-bl"><feGaussianBlur stdDeviation="2.5"/></filter></defs><clipPath id="ot-cp"><circle cx="12" cy="12" r="10"/></clipPath><g clip-path="url(#ot-cp)" filter="url(#ot-bl)"><circle cx="9" cy="9" r="8" fill="rgba(70,120,255,0.9)"/><circle cx="16" cy="10" r="7" fill="rgba(140,80,250,0.8)"/><circle cx="12" cy="16" r="6" fill="rgba(230,90,180,0.7)"/><circle cx="7" cy="14" r="6" fill="rgba(40,180,255,0.65)"/></g><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/></svg>'

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
          // Pass blockIndex and blockId so replace can target the exact block
          const blockIndex = this.api.blocks.getCurrentBlockIndex()
          const blockId = this.block.id
          window.dispatchEvent(new CustomEvent('dash-ai-inline', {
            detail: { selectedText: text, blockIndex, blockId }
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
