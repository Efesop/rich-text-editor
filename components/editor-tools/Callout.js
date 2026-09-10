import DOMPurify from 'isomorphic-dompurify'
import { CALLOUT_ORDER, CALLOUT_LABELS } from '@/lib/markdownShortcuts'

// Callout block. Follows Dash's existing quote vocabulary — tinted fill, 8px
// radius, no rule down the side — so it reads as native rather than bolted on.
// Colours live in globals.css keyed off data-variant.

const ICONS = {
  info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 16v-5"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7.6v.1"/></svg>',
  tip: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M9.5 18h5M10.5 21h3"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M15.1 14c.2-1 .65-1.75 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .25 2.25 1.5 3.5.75.75 1.2 1.5 1.4 2.5"/></svg>',
  done: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M21 11.2V12a9 9 0 1 1-5.3-8.2"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 5 12 14l-2.7-2.7"/></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linejoin="round" stroke-width="2" d="M10.6 4.3 2.7 17.5A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.5L13.4 4.3a1.6 1.6 0 0 0-2.8 0Z"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 10v3.5"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 16.8v.1"/></svg>',
  danger: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6"/></svg>'
}

const TOOLBOX_ICON = ICONS.info

export default class Callout {
  static get toolbox () {
    return { title: 'Callout', icon: TOOLBOX_ICON }
  }

  static get conversionConfig () {
    return {
      export: (data) => data.text,
      import: (text) => ({ text, variant: 'info' })
    }
  }

  static get enableLineBreaks () {
    return true
  }

  static get isReadOnlySupported () {
    return true
  }

  static get sanitize () {
    return {
      text: {
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
      },
      variant: false
    }
  }

  constructor ({ data, api, readOnly }) {
    this.api = api
    this.readOnly = readOnly
    this._data = {
      text: data?.text || '',
      variant: CALLOUT_ORDER.includes(data?.variant) ? data.variant : 'info'
    }
    this._wrapper = null
    this._iconEl = null
    this._textEl = null
  }

  render () {
    this._wrapper = document.createElement('div')
    this._wrapper.classList.add('dash-callout')
    this._wrapper.dataset.variant = this._data.variant

    this._iconEl = document.createElement('span')
    this._iconEl.classList.add('dash-callout-icon')
    this._iconEl.setAttribute('contenteditable', 'false')
    this._iconEl.innerHTML = ICONS[this._data.variant]

    this._textEl = document.createElement('div')
    this._textEl.classList.add('dash-callout-text')
    this._textEl.contentEditable = !this.readOnly
    this._textEl.innerHTML = DOMPurify.sanitize(this._data.text)
    this._textEl.dataset.placeholder = 'Callout'

    if (!this.readOnly) {
      this._textEl.addEventListener('keydown', this._handleKeyDown.bind(this))
    }

    this._wrapper.appendChild(this._iconEl)
    this._wrapper.appendChild(this._textEl)
    return this._wrapper
  }

  // Variant picker in the block's ⋮⋮ tune popover, beside alignment and AI.
  renderSettings () {
    return CALLOUT_ORDER.map(variant => ({
      icon: ICONS[variant],
      label: CALLOUT_LABELS[variant],
      isActive: this._data.variant === variant,
      closeOnActivate: true,
      onActivate: () => this._setVariant(variant)
    }))
  }

  _setVariant (variant) {
    if (!CALLOUT_ORDER.includes(variant)) return
    this._data.variant = variant
    if (this._wrapper) this._wrapper.dataset.variant = variant
    if (this._iconEl) this._iconEl.innerHTML = ICONS[variant]
  }

  _handleKeyDown (e) {
    if (e.key !== 'Enter' || e.shiftKey) return

    // Enter on an empty callout is the way out: become a plain paragraph.
    if (this._textEl.textContent.trim() === '') {
      e.preventDefault()
      e.stopPropagation()
      const index = this.api.blocks.getCurrentBlockIndex()
      this.api.blocks.insert('paragraph', { text: '' }, {}, index + 1, true)
      this.api.blocks.delete(index)
      return
    }

    // Otherwise Enter adds a line inside the callout, the way a quote behaves.
    e.stopPropagation()
  }

  save () {
    return {
      text: this._textEl ? this._textEl.innerHTML : this._data.text,
      variant: this._data.variant
    }
  }

  validate (savedData) {
    return typeof savedData?.text === 'string'
  }
}
