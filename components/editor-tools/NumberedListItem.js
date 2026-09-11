import DOMPurify from 'isomorphic-dompurify'
import { clampListIndent, withIndent } from '../../lib/listIndent.js'
import { applyIndent, changeListIndent, listConversionConfig, listIndentMenu, renumberLists } from './listIndentRuntime'

const ORDERED_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><line x1="12" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M7.79999 14L7.79999 7.2135C7.79999 7.12872 7.7011 7.0824 7.63597 7.13668L4.79999 9.5"/></svg>'

export default class NumberedListItem {
  static get toolbox() {
    return {
      title: 'Numbered List',
      icon: ORDERED_ICON
    }
  }

  static get conversionConfig() {
    return listConversionConfig(text => ({ text }))
  }

  static get enableLineBreaks() {
    return true
  }

  static get isReadOnlySupported() {
    return true
  }

  static get sanitize() {
    return {
      text: {
        br: true,
        b: true,
        strong: true,
        i: true,
        em: true,
        u: true,
        s: true,
        mark: true,
        code: true,
        a: {
          href: true,
          target: '_blank',
          rel: 'noopener noreferrer',
          'data-page-id': true,
          class: true
        }
      }
    }
  }

  constructor({ data, api, config, readOnly, block }) {
    this.api = api
    this.block = block
    this.readOnly = readOnly
    this._data = { text: data.text || '', indent: clampListIndent(data.indent) }
    this._element = null
  }

  render() {
    this._element = document.createElement('div')
    this._element.classList.add('dash-numbered-item')
    this._element.contentEditable = !this.readOnly
    this._element.innerHTML = DOMPurify.sanitize(this._data.text)
    this._element.dataset.placeholder = 'List item'
    applyIndent(this._element, this._data.indent)

    setTimeout(() => renumberLists(), 0)

    if (!this.readOnly) {
      this._element.addEventListener('keydown', this._handleKeyDown.bind(this))
    }

    return this._element
  }

  // Indent and Outdent in the block menu
  renderSettings() {
    return listIndentMenu(this.api, this.block, this._data.indent)
  }

  // Called by listIndentRuntime through BlockAPI.call
  setIndent(level) {
    this._data.indent = clampListIndent(level)
    applyIndent(this._element, this._data.indent)
  }

  _handleKeyDown(e) {
    // Convert to paragraph on '/' in empty block so Editor.js slash menu appears
    if (e.key === '/' && this._element.textContent.trim() === '') {
      e.preventDefault()
      const currentIndex = this.api.blocks.getCurrentBlockIndex()
      this.api.blocks.insert('paragraph', { text: '' }, {}, currentIndex + 1, true)
      this.api.blocks.delete(currentIndex)
      setTimeout(() => {
        renumberLists()
        const block = document.querySelectorAll('.ce-block')[currentIndex]
        const contentEl = block?.querySelector('[contenteditable]')
        if (contentEl) {
          contentEl.focus()
          document.execCommand('insertText', false, '/')
        }
      }, 50)
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      if (this._element.textContent.trim() === '') {
        const currentIndex = this.api.blocks.getCurrentBlockIndex()
        // An empty nested item steps out a level before it stops being a list item
        if (this._data.indent > 0 && changeListIndent(this.api, [currentIndex], -1)) return
        this.api.blocks.insert('paragraph', { text: '' }, {}, currentIndex + 1, true)
        this.api.blocks.delete(currentIndex)
        setTimeout(() => renumberLists(), 50)
        return
      }

      const { beforeCaret, afterCaret } = this._splitAtCursor()
      this._data.text = DOMPurify.sanitize(beforeCaret)
      this._element.innerHTML = this._data.text

      const currentIndex = this.api.blocks.getCurrentBlockIndex()
      // The new item starts at the same level
      this.api.blocks.insert('numberedListItem', withIndent({ text: DOMPurify.sanitize(afterCaret) }, this._data.indent), {}, currentIndex + 1, true)

      setTimeout(() => {
        this.api.caret.setToBlock(currentIndex + 1, 'start')
        renumberLists()
      }, 50)
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (sel && sel.isCollapsed && sel.anchorOffset === 0) {
        const range = sel.getRangeAt(0)
        const preRange = document.createRange()
        preRange.selectNodeContents(this._element)
        preRange.setEnd(range.startContainer, range.startOffset)
        const textBefore = preRange.toString()

        if (textBefore.length === 0) {
          e.preventDefault()
          e.stopPropagation()

          const currentIndex = this.api.blocks.getCurrentBlockIndex()
          // A nested item steps out a level first
          if (this._data.indent > 0 && changeListIndent(this.api, [currentIndex], -1)) return

          const currentText = this._element.innerHTML

          if (currentText.trim() === '') {
            this.api.blocks.delete(currentIndex)
            if (currentIndex > 0) {
              this.api.caret.setToBlock(currentIndex - 1, 'end')
            }
          } else {
            this.api.blocks.insert('paragraph', { text: currentText }, {}, currentIndex + 1, true)
            this.api.blocks.delete(currentIndex)
          }
          setTimeout(() => renumberLists(), 50)
        }
      }
    }
  }

  _splitAtCursor() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) {
      return { beforeCaret: this._element.innerHTML, afterCaret: '' }
    }

    const range = sel.getRangeAt(0)

    const preRange = document.createRange()
    preRange.selectNodeContents(this._element)
    preRange.setEnd(range.startContainer, range.startOffset)
    const beforeFragment = preRange.cloneContents()

    const postRange = document.createRange()
    postRange.selectNodeContents(this._element)
    postRange.setStart(range.endContainer, range.endOffset)
    const afterFragment = postRange.cloneContents()

    const tempBefore = document.createElement('div')
    tempBefore.appendChild(beforeFragment)
    const tempAfter = document.createElement('div')
    tempAfter.appendChild(afterFragment)

    return {
      beforeCaret: tempBefore.innerHTML,
      afterCaret: tempAfter.innerHTML
    }
  }

  save() {
    return withIndent({
      text: this._element ? this._element.innerHTML : this._data.text
    }, this._data.indent)
  }

  validate(savedData) {
    return true
  }
}
