import DOMPurify from 'isomorphic-dompurify'

// Toggle block — a chevron, a title, and a body you can fold away.
//
// Two pieces of state, deliberately kept apart:
//   • `defaultCollapsed` lives in the block and syncs, so the author controls
//     how the note opens for everyone.
//   • whether YOU have it open right now lives in localStorage, because
//     folding a section to read it is not an edit. Storing it in the block
//     would bump the page, push a sync envelope and mint a version-history
//     entry every time someone collapsed something.
//
// Editor.js is a flat block list, so the body is rich text rather than
// arbitrary nested blocks.

const CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 6 6 6-6 6"/></svg>'

const OPEN_STATE_KEY = 'dash:toggle:open'

function readOpenState () {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(OPEN_STATE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeOpenState (map) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(map))
  } catch { /* private mode / quota — the toggle just won't be remembered */ }
}

const RICH_TEXT = {
  br: true,
  b: true,
  strong: true,
  i: true,
  em: true,
  u: true,
  s: true,
  mark: { class: true },
  code: { class: true },
  a: {
    href: true,
    target: '_blank',
    rel: 'noopener noreferrer',
    'data-page-id': true,
    class: true
  }
}

export default class Toggle {
  static get toolbox () {
    return { title: 'Toggle', icon: CHEVRON }
  }

  static get conversionConfig () {
    return {
      export: (data) => data.summary,
      import: (text) => ({ summary: text, content: '', defaultCollapsed: false })
    }
  }

  static get enableLineBreaks () {
    return true
  }

  static get isReadOnlySupported () {
    return true
  }

  static get sanitize () {
    return { summary: RICH_TEXT, content: RICH_TEXT, defaultCollapsed: false }
  }

  constructor ({ data, api, readOnly, block }) {
    this.api = api
    this.readOnly = readOnly
    this._blockId = block?.id || null
    this._data = {
      summary: data?.summary || '',
      content: data?.content || '',
      defaultCollapsed: Boolean(data?.defaultCollapsed)
    }
    this._open = this._resolveInitialOpen()
    this._wrapper = null
    this._summaryEl = null
    this._bodyEl = null
    this._chevronEl = null
  }

  // Per-device preference wins; otherwise fall back to the author's default.
  _resolveInitialOpen () {
    if (this._blockId) {
      const stored = readOpenState()[this._blockId]
      if (typeof stored === 'boolean') return stored
    }
    return !this._data.defaultCollapsed
  }

  render () {
    this._wrapper = document.createElement('div')
    this._wrapper.classList.add('dash-toggle')

    const head = document.createElement('div')
    head.classList.add('dash-toggle-head')

    this._chevronEl = document.createElement('button')
    this._chevronEl.type = 'button'
    this._chevronEl.classList.add('dash-toggle-chevron')
    this._chevronEl.innerHTML = CHEVRON
    this._chevronEl.setAttribute('aria-label', 'Toggle section')
    this._chevronEl.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this._setOpen(!this._open)
    })

    this._summaryEl = document.createElement('div')
    this._summaryEl.classList.add('dash-toggle-summary')
    this._summaryEl.contentEditable = !this.readOnly
    this._summaryEl.innerHTML = DOMPurify.sanitize(this._data.summary)
    this._summaryEl.dataset.placeholder = 'Toggle'

    head.appendChild(this._chevronEl)
    head.appendChild(this._summaryEl)

    this._bodyEl = document.createElement('div')
    this._bodyEl.classList.add('dash-toggle-body')
    this._bodyEl.contentEditable = !this.readOnly
    this._bodyEl.innerHTML = DOMPurify.sanitize(this._data.content)
    this._bodyEl.dataset.placeholder = 'Empty toggle. Type something.'

    if (!this.readOnly) {
      this._summaryEl.addEventListener('keydown', this._handleSummaryKeyDown.bind(this))
      this._bodyEl.addEventListener('keydown', (e) => {
        // Enter inside the body is a new line, not a new block.
        if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation()
      })
    }

    this._wrapper.appendChild(head)
    this._wrapper.appendChild(this._bodyEl)
    this._applyOpen()

    return this._wrapper
  }

  _applyOpen () {
    if (!this._wrapper) return
    this._wrapper.classList.toggle('dash-toggle-open', this._open)
    this._wrapper.classList.toggle('dash-toggle-closed', !this._open)
    if (this._bodyEl) this._bodyEl.hidden = !this._open
    if (this._chevronEl) this._chevronEl.setAttribute('aria-expanded', String(this._open))
  }

  _setOpen (open) {
    this._open = open
    this._applyOpen()
    if (!this._blockId) return
    const map = readOpenState()
    // Only remember a deviation from the author's default, so the map stays small.
    if (open === !this._data.defaultCollapsed) delete map[this._blockId]
    else map[this._blockId] = open
    writeOpenState(map)
  }

  _handleSummaryKeyDown (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()

      // Enter on an empty toggle is the way out.
      if (this._summaryEl.textContent.trim() === '') {
        const index = this.api.blocks.getCurrentBlockIndex()
        this.api.blocks.insert('paragraph', { text: '' }, {}, index + 1, true)
        this.api.blocks.delete(index)
        return
      }

      // Otherwise Enter opens the toggle and drops the caret into the body.
      if (!this._open) this._setOpen(true)
      this._bodyEl.focus()
      const range = document.createRange()
      range.selectNodeContents(this._bodyEl)
      range.collapse(false)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  // Fold state is a per-device preference, so it belongs in the tune menu
  // rather than the block. What IS saved is the author's default.
  renderSettings () {
    return [{
      icon: CHEVRON,
      label: this._data.defaultCollapsed ? 'Open by default' : 'Collapsed by default',
      closeOnActivate: true,
      onActivate: () => {
        this._data.defaultCollapsed = !this._data.defaultCollapsed
        this.api.blocks.getBlockByIndex(this.api.blocks.getCurrentBlockIndex())?.dispatchChange?.()
      }
    }]
  }

  save () {
    return {
      summary: this._summaryEl ? this._summaryEl.innerHTML : this._data.summary,
      content: this._bodyEl ? this._bodyEl.innerHTML : this._data.content,
      defaultCollapsed: this._data.defaultCollapsed
    }
  }

  validate (savedData) {
    return typeof savedData?.summary === 'string'
  }
}
