const BOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-4 -4 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

export class AIInlineTool {
  static get isInline() {
    return true
  }

  static get title() {
    return 'Use Local AI'
  }

  constructor({ api }) {
    this.api = api
    this._button = null
  }

  render() {
    this._button = document.createElement('button')
    this._button.type = 'button'
    this._button.innerHTML = BOT_SVG
    this._button.classList.add('ce-inline-tool')
    return this._button
  }

  surround(range) {
    const text = range.toString()
    if (!text.trim()) return
    window.dispatchEvent(new CustomEvent('dash-ai-inline', {
      detail: { selectedText: text }
    }))
  }

  checkState() {
    return false
  }
}
