const BULLET_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><line x1="9" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 17H4.99002"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 12H4.99002"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 7H4.99002"/></svg>'

export default class BulletListItem {
  static get toolbox() {
    return {
      title: 'Bullet List',
      icon: BULLET_ICON
    }
  }

  static get conversionConfig() {
    return {
      export: (data) => data.text,
      import: (text) => ({ text })
    }
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
          rel: 'noopener noreferrer'
        }
      }
    }
  }

  constructor({ data, api, config, readOnly }) {
    this.api = api
    this.readOnly = readOnly
    this._data = { text: data.text || '' }
    this._element = null
  }

  render() {
    this._element = document.createElement('div')
    this._element.classList.add('dash-bullet-item')
    this._element.contentEditable = !this.readOnly
    this._element.innerHTML = this._data.text
    this._element.dataset.placeholder = 'List item'

    if (!this.readOnly) {
      this._element.addEventListener('keydown', this._handleKeyDown.bind(this))
    }

    return this._element
  }

  _handleKeyDown(e) {
    // Convert to paragraph on '/' in empty block so Editor.js slash menu appears
    if (e.key === '/' && this._element.textContent.trim() === '') {
      e.preventDefault()
      const currentIndex = this.api.blocks.getCurrentBlockIndex()
      this.api.blocks.insert('paragraph', { text: '' }, {}, currentIndex + 1, true)
      this.api.blocks.delete(currentIndex)
      setTimeout(() => {
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
        this.api.blocks.insert('paragraph', { text: '' }, {}, currentIndex + 1, true)
        this.api.blocks.delete(currentIndex)
        return
      }

      const { beforeCaret, afterCaret } = this._splitAtCursor()
      this._data.text = beforeCaret
      this._element.innerHTML = beforeCaret

      const currentIndex = this.api.blocks.getCurrentBlockIndex()
      this.api.blocks.insert('bulletListItem', { text: afterCaret }, {}, currentIndex + 1, true)

      // Ensure caret lands in the new block
      setTimeout(() => {
        this.api.caret.setToBlock(currentIndex + 1, 'start')
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
    return {
      text: this._element ? this._element.innerHTML : this._data.text
    }
  }

  validate(savedData) {
    return true
  }
}
