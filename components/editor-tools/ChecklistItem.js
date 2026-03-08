import DOMPurify from 'isomorphic-dompurify'

const CHECKLIST_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M9.2 12L11.0586 13.8586C11.1367 13.9367 11.2633 13.9367 11.3414 13.8586L14.7 10.5"/><rect width="14" height="14" x="5" y="5" stroke="currentColor" stroke-width="2" rx="4"/></svg>'
const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M7 12L10.4884 15.8372C10.5677 15.9245 10.705 15.9245 10.7844 15.8372L17 9"/></svg>'

export default class ChecklistItem {
  static get toolbox() {
    return {
      title: 'Checklist',
      icon: CHECKLIST_ICON
    }
  }

  static get conversionConfig() {
    return {
      export: (data) => data.text,
      import: (text) => ({ text, checked: false })
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
          rel: 'noopener noreferrer',
          'data-page-id': true,
          class: true
        }
      }
    }
  }

  constructor({ data, api, config, readOnly }) {
    this.api = api
    this.readOnly = readOnly
    this._data = {
      text: data.text || '',
      checked: Boolean(data.checked)
    }
    this._wrapper = null
    this._textEl = null
    this._checkbox = null
  }

  render() {
    this._wrapper = document.createElement('div')
    this._wrapper.classList.add('dash-checklist-item')

    // Checkbox
    this._checkbox = document.createElement('span')
    this._checkbox.classList.add('dash-checklist-checkbox')
    if (this._data.checked) {
      this._checkbox.classList.add('dash-checklist-checked')
    }
    this._checkbox.innerHTML = CHECK_ICON
    this._checkbox.addEventListener('click', (e) => {
      e.stopPropagation()
      this._data.checked = !this._data.checked
      this._checkbox.classList.toggle('dash-checklist-checked', this._data.checked)
    })

    // Text content
    this._textEl = document.createElement('div')
    this._textEl.classList.add('dash-checklist-text')
    this._textEl.contentEditable = !this.readOnly
    this._textEl.innerHTML = DOMPurify.sanitize(this._data.text)
    this._textEl.dataset.placeholder = 'Checklist item'

    if (!this.readOnly) {
      this._textEl.addEventListener('keydown', this._handleKeyDown.bind(this))
    }

    this._wrapper.appendChild(this._checkbox)
    this._wrapper.appendChild(this._textEl)

    return this._wrapper
  }

  _handleKeyDown(e) {
    // Convert to paragraph on '/' in empty block so Editor.js slash menu appears
    if (e.key === '/' && this._textEl.textContent.trim() === '') {
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

      if (this._textEl.textContent.trim() === '') {
        const currentIndex = this.api.blocks.getCurrentBlockIndex()
        this.api.blocks.insert('paragraph', { text: '' }, {}, currentIndex + 1, true)
        this.api.blocks.delete(currentIndex)
        return
      }

      const { beforeCaret, afterCaret } = this._splitAtCursor()
      this._data.text = beforeCaret
      this._textEl.innerHTML = beforeCaret

      const currentIndex = this.api.blocks.getCurrentBlockIndex()
      this.api.blocks.insert('checklistItem', { text: afterCaret, checked: false }, {}, currentIndex + 1, true)

      // For ChecklistItem, the contentEditable is inside a wrapper,
      // so api.caret won't find it. Manually focus the new block's text element.
      setTimeout(() => {
        const allBlocks = document.querySelectorAll('.ce-block')
        const newBlock = allBlocks[currentIndex + 1]
        const textEl = newBlock?.querySelector('.dash-checklist-text')
        if (textEl) {
          textEl.focus()
          const range = document.createRange()
          range.selectNodeContents(textEl)
          range.collapse(true)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }, 50)
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (sel && sel.isCollapsed && sel.anchorOffset === 0) {
        const range = sel.getRangeAt(0)
        const preRange = document.createRange()
        preRange.selectNodeContents(this._textEl)
        preRange.setEnd(range.startContainer, range.startOffset)
        const textBefore = preRange.toString()

        if (textBefore.length === 0) {
          e.preventDefault()
          e.stopPropagation()

          const currentIndex = this.api.blocks.getCurrentBlockIndex()
          const currentText = this._textEl.innerHTML

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
      return { beforeCaret: this._textEl.innerHTML, afterCaret: '' }
    }

    const range = sel.getRangeAt(0)

    const preRange = document.createRange()
    preRange.selectNodeContents(this._textEl)
    preRange.setEnd(range.startContainer, range.startOffset)
    const beforeFragment = preRange.cloneContents()

    const postRange = document.createRange()
    postRange.selectNodeContents(this._textEl)
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
      text: this._textEl ? this._textEl.innerHTML : this._data.text,
      checked: this._data.checked
    }
  }

  validate(savedData) {
    return true
  }
}
