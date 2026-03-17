/**
 * Custom Alignment Block Tune for Editor.js
 * Replaces the third-party editorjs-text-alignment-blocktune with
 * a MenuConfig-based tune that shows a proper labeled submenu.
 */

const ALIGN_LEFT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>'
const ALIGN_CENTER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>'
const ALIGN_RIGHT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>'

const ICONS = {
  left: ALIGN_LEFT_ICON,
  center: ALIGN_CENTER_ICON,
  right: ALIGN_RIGHT_ICON
}

export default class AlignmentTune {
  static get isTune () {
    return true
  }

  constructor ({ api, data, config, block }) {
    this.api = api
    this.block = block
    this.config = config || {}
    this._alignment = data?.alignment || this.config.default || 'left'
    this._wrapper = null
  }

  render () {
    return {
      icon: ICONS[this._alignment] || ALIGN_LEFT_ICON,
      label: 'Align',
      children: {
        items: [
          {
            icon: ALIGN_LEFT_ICON,
            title: 'Left',
            isActive: this._alignment === 'left',
            onActivate: () => this._setAlignment('left'),
            closeOnActivate: true
          },
          {
            icon: ALIGN_CENTER_ICON,
            title: 'Center',
            isActive: this._alignment === 'center',
            onActivate: () => this._setAlignment('center'),
            closeOnActivate: true
          },
          {
            icon: ALIGN_RIGHT_ICON,
            title: 'Right',
            isActive: this._alignment === 'right',
            onActivate: () => this._setAlignment('right'),
            closeOnActivate: true
          }
        ]
      }
    }
  }

  _setAlignment (alignment) {
    this._alignment = alignment
    if (this._wrapper) {
      this._wrapper.classList.remove('ce-tune-alignment--left', 'ce-tune-alignment--center', 'ce-tune-alignment--right')
      this._wrapper.classList.add(`ce-tune-alignment--${alignment}`)
    }
    // Trigger block change event so Editor.js knows data changed
    this.block.dispatchChange()
  }

  wrap (blockContent) {
    this._wrapper = document.createElement('div')
    this._wrapper.classList.add('ce-tune-alignment', `ce-tune-alignment--${this._alignment}`)
    this._wrapper.appendChild(blockContent)
    return this._wrapper
  }

  save () {
    return { alignment: this._alignment }
  }
}
