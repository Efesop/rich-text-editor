const ORDERED_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><line x1="12" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="12" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M7.79999 14L7.79999 7.2135C7.79999 7.12872 7.7011 7.0824 7.63597 7.13668L4.79999 9.5"/></svg>'

export default class NumberedListItem {
  static get toolbox() {
    return {
      title: 'Numbered List',
      icon: ORDERED_ICON
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

  static renumberAll() {
    const blocks = document.querySelectorAll('.codex-editor .ce-block')
    let counter = 0
    blocks.forEach(block => {
      const numItem = block.querySelector('.dash-numbered-item')
      if (numItem) {
        counter++
        numItem.dataset.number = counter
      } else {
        counter = 0
      }
    })
  }

  constructor({ data, api, config, readOnly }) {
    this.api = api
    this.readOnly = readOnly
    this._data = { text: data.text || '' }
    this._element = null
  }

  render() {
    this._element = document.createElement('div')
    this._element.classList.add('dash-numbered-item')
    this._element.contentEditable = !this.readOnly
    this._element.innerHTML = this._data.text
    this._element.dataset.placeholder = 'List item'

    setTimeout(() => NumberedListItem.renumberAll(), 0)

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
        NumberedListItem.renumberAll()
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
        setTimeout(() => NumberedListItem.renumberAll(), 50)
        return
      }

      const { beforeCaret, afterCaret } = this._splitAtCursor()
      this._data.text = beforeCaret
      this._element.innerHTML = beforeCaret

      const currentIndex = this.api.blocks.getCurrentBlockIndex()
      this.api.blocks.insert('numberedListItem', { text: afterCaret }, {}, currentIndex + 1, true)

      setTimeout(() => {
        this.api.caret.setToBlock(currentIndex + 1, 'start')
        NumberedListItem.renumberAll()
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
          setTimeout(() => NumberedListItem.renumberAll(), 50)
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

if (typeof window !== 'undefined') {
  window._renumberListItems = () => NumberedListItem.renumberAll()
}
