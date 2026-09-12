import DOMPurify from 'isomorphic-dompurify'
import { queuePasteItems } from '../../utils/pasteQueue'
import { splitListItem } from '../../lib/listEnter.js'
import { clampListIndent, withIndent } from '../../lib/listIndent.js'
import { listBlocksFromPaste } from '../../lib/listPaste.js'
import { applyIndent, changeListIndent, listConversionConfig, listIndentMenu } from './listIndentRuntime'

const BULLET_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><line x1="9" x2="19" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="12" y2="12" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><line x1="9" x2="19" y1="17" y2="17" stroke="currentColor" stroke-linecap="round" stroke-width="2"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 17H4.99002"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 12H4.99002"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5.00001 7H4.99002"/></svg>'

export default class BulletListItem {
  static get toolbox() {
    return {
      title: 'Bullet List',
      icon: BULLET_ICON
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

  static get pasteConfig() {
    // Every list tag belongs to this tool, so Editor.js hands over a whole
    // list with its nesting. While NumberedListItem owned <ol>, Editor.js split
    // an <ol> into its <li>s and they pasted as bullets. The <li> and <input>
    // rules keep what marks a checklist item.
    return {
      tags: ['UL', 'OL', { li: { 'aria-checked': true } }, { input: { type: true, checked: true } }]
    }
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

  onPaste(event) {
    const items = listBlocksFromPaste(event.detail.data, html => DOMPurify.sanitize(BulletListItem._autoLinkUrls(html)))

    // Inserts are deferred — inserting during onPaste conflicts with Editor.js paste flow
    if (items.length === 0) {
      // A checkbox pasted outside a list, or a list with no text: remove this block
      queuePasteItems(this.api.blocks, this, [], null, true)
      return
    }

    const [first, ...rest] = items
    if (first.tool !== 'bulletListItem') {
      // Replace this bullet block with the first item's own type
      queuePasteItems(this.api.blocks, this, items, null, true)
      return
    }

    this._data.text = first.data.text
    this.setIndent(first.data.indent)
    if (this._element) {
      this._element.innerHTML = DOMPurify.sanitize(first.data.text)
    }
    if (rest.length > 0) {
      queuePasteItems(this.api.blocks, this, rest, null)
    }
  }

  static _autoLinkUrls(html) {
    const parts = html.split(/(<a[^>]*>.*?<\/a>)/gi)
    return parts.map(part => {
      if (part.match(/^<a\s/i)) return part
      return part.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    }).join('')
  }

  render() {
    this._element = document.createElement('div')
    this._element.classList.add('dash-bullet-item')
    this._element.contentEditable = !this.readOnly
    this._element.innerHTML = DOMPurify.sanitize(this._data.text)
    this._element.dataset.placeholder = 'List item'
    applyIndent(this._element, this._data.indent)

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
        return
      }

      // The rest of the text moves to a new item at the same level, and the
      // caret moves into it now, so keys typed straight after Enter land there
      this._data.text = splitListItem({
        api: this.api,
        block: this.block,
        input: this._element,
        tool: 'bulletListItem',
        dataFor: text => withIndent({ text }, this._data.indent),
        clean: html => DOMPurify.sanitize(html)
      })
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
        }
      }
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
