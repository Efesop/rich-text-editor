const ORB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><defs><filter id="oi-bl"><feGaussianBlur stdDeviation="2.5"/></filter></defs><clipPath id="oi-cp"><circle cx="12" cy="12" r="10"/></clipPath><g clip-path="url(#oi-cp)" filter="url(#oi-bl)"><circle cx="9" cy="9" r="8" fill="rgba(70,120,255,0.9)"/><circle cx="16" cy="10" r="7" fill="rgba(140,80,250,0.8)"/><circle cx="12" cy="16" r="6" fill="rgba(230,90,180,0.7)"/><circle cx="7" cy="14" r="6" fill="rgba(40,180,255,0.65)"/></g><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/></svg>'

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
    this._button.innerHTML = ORB_SVG
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
