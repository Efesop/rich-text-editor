const BOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-4 -4 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

export class AIBlockTool {
  static get toolbox () {
    return {
      title: 'Use Local AI',
      icon: BOT_SVG
    }
  }

  constructor ({ api, block }) {
    this.api = api
    this.block = block
    this._element = null
  }

  render () {
    // Dispatch the AI panel event immediately
    window.dispatchEvent(new CustomEvent('dash-ai-inline', {
      detail: { selectedText: '' }
    }))

    // Return a temporary empty element — delete this block after a tick
    this._element = document.createElement('div')
    setTimeout(() => {
      const index = this.api.blocks.getCurrentBlockIndex()
      if (index !== -1) {
        this.api.blocks.delete(index)
      }
    }, 50)
    return this._element
  }

  save () {
    return {}
  }
}
