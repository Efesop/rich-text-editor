import hljs from 'highlight.js/lib/core'

// Register commonly used languages
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('java', java)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)

const LANGUAGES = [
  { value: 'auto', label: 'Auto' },
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'markdown', label: 'Markdown' },
]

export default class CodeBlock {
  static get toolbox() {
    return {
      title: 'Code',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>'
    }
  }

  static get isReadOnlySupported() {
    return true
  }

  static get enableLineBreaks() {
    return true
  }

  constructor({ data, api, config, readOnly }) {
    this.api = api
    this.config = config || {}
    this.readOnly = readOnly
    this._data = {
      code: data.code || '',
      language: data.language || 'auto'
    }
    this._wrapper = null
    this._textarea = null
    this._highlight = null
    this._select = null
  }

  render() {
    this._wrapper = document.createElement('div')
    this._wrapper.classList.add('code-block')

    // Header with language selector
    const header = document.createElement('div')
    header.classList.add('code-block__header')

    this._select = document.createElement('select')
    this._select.classList.add('code-block__select')
    this._select.setAttribute('data-no-drag', 'true')

    LANGUAGES.forEach(lang => {
      const option = document.createElement('option')
      option.value = lang.value
      option.textContent = lang.label
      if (lang.value === this._data.language) {
        option.selected = true
      }
      this._select.appendChild(option)
    })

    this._select.addEventListener('change', () => {
      this._data.language = this._select.value
      this._updateHighlight()
    })

    header.appendChild(this._select)
    this._wrapper.appendChild(header)

    // Code area: textarea for editing overlaid on highlighted output
    const codeArea = document.createElement('div')
    codeArea.classList.add('code-block__body')

    // Highlighted code display (behind textarea)
    this._highlight = document.createElement('pre')
    this._highlight.classList.add('code-block__highlight')
    const codeEl = document.createElement('code')
    this._highlight.appendChild(codeEl)
    codeArea.appendChild(this._highlight)

    // Textarea for editing (transparent text, on top)
    this._textarea = document.createElement('textarea')
    this._textarea.classList.add('code-block__textarea')
    this._textarea.placeholder = this.config.placeholder || 'Enter code'
    this._textarea.value = this._data.code
    this._textarea.readOnly = this.readOnly
    this._textarea.spellcheck = false
    this._textarea.setAttribute('data-no-drag', 'true')

    this._textarea.addEventListener('input', () => {
      this._data.code = this._textarea.value
      this._updateHighlight()
      this._autoResize()
    })

    // Handle Tab key for indentation
    this._textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        const start = this._textarea.selectionStart
        const end = this._textarea.selectionEnd
        const value = this._textarea.value

        if (e.shiftKey) {
          // Shift+Tab: remove leading 2 spaces on the current line
          const beforeCursor = value.substring(0, start)
          const lineStart = beforeCursor.lastIndexOf('\n') + 1
          const line = value.substring(lineStart, end)
          if (line.startsWith('  ')) {
            this._textarea.value = value.substring(0, lineStart) + line.substring(2) + value.substring(end)
            this._textarea.selectionStart = Math.max(lineStart, start - 2)
            this._textarea.selectionEnd = Math.max(lineStart, start - 2)
          }
        } else {
          // Tab: insert 2 spaces
          this._textarea.value = value.substring(0, start) + '  ' + value.substring(end)
          this._textarea.selectionStart = start + 2
          this._textarea.selectionEnd = start + 2
        }

        this._data.code = this._textarea.value
        this._updateHighlight()
      }
    })

    codeArea.appendChild(this._textarea)
    this._wrapper.appendChild(codeArea)

    // Initial highlight and resize
    this._updateHighlight()
    // Defer auto-resize to after DOM insertion
    setTimeout(() => this._autoResize(), 0)

    return this._wrapper
  }

  _updateHighlight() {
    const codeEl = this._highlight.querySelector('code')
    const code = this._data.code || ''

    if (!code.trim()) {
      codeEl.textContent = ''
      codeEl.className = ''
      return
    }

    if (this._data.language === 'plaintext') {
      codeEl.textContent = code
      codeEl.className = ''
      return
    }

    try {
      let result
      if (this._data.language === 'auto') {
        result = hljs.highlightAuto(code)
      } else {
        result = hljs.highlight(code, { language: this._data.language })
      }
      codeEl.innerHTML = result.value
      codeEl.className = 'hljs'
    } catch {
      codeEl.textContent = code
      codeEl.className = ''
    }
  }

  _autoResize() {
    if (!this._textarea) return
    this._textarea.style.height = 'auto'
    const newHeight = Math.max(this._textarea.scrollHeight, 60)
    this._textarea.style.height = newHeight + 'px'
    this._highlight.style.height = newHeight + 'px'
  }

  save() {
    return {
      code: this._data.code,
      language: this._data.language
    }
  }

  validate(savedData) {
    return savedData.code !== undefined
  }

  static get sanitize() {
    return {
      code: true,
      language: false
    }
  }

  static get pasteConfig() {
    return {
      tags: ['pre']
    }
  }

  onPaste(event) {
    const content = event.detail.data
    this._data.code = content.textContent || ''
    if (this._textarea) {
      this._textarea.value = this._data.code
      this._updateHighlight()
      this._autoResize()
    }
  }
}
