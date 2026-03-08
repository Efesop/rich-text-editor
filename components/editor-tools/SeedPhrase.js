import DOMPurify from 'isomorphic-dompurify'

const SEED_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="-4 -4 32 32" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'

// BIP-39 validation: dynamically loaded
let bip39Words = null

async function loadBip39() {
  if (bip39Words) return bip39Words
  try {
    const mod = await import('@/utils/bip39wordlist')
    bip39Words = new Set(mod.default)
    return bip39Words
  } catch {
    return null
  }
}

export default class SeedPhrase {
  static get toolbox() {
    return {
      title: 'Seed Phrase',
      icon: SEED_ICON
    }
  }

  static get isReadOnlySupported() {
    return true
  }

  constructor({ data, api, config, readOnly }) {
    this.api = api
    this.readOnly = readOnly
    this._data = {
      words: Array.isArray(data.words) ? data.words.slice(0, 24) : [],
      count: data.count === 24 ? 24 : 12
    }
    // Pad words array to match count
    while (this._data.words.length < this._data.count) {
      this._data.words.push('')
    }
    this._element = null
    this._bip39 = null
    this._loadBip39()
  }

  async _loadBip39() {
    this._bip39 = await loadBip39()
    if (this._element) this._updateValidation()
  }

  render() {
    this._element = document.createElement('div')
    this._element.classList.add('dash-seed-phrase')
    this._element.setAttribute('contenteditable', 'false')
    this._buildUI()
    return this._element
  }

  _buildUI() {
    this._element.innerHTML = ''

    // Header row
    const header = document.createElement('div')
    header.classList.add('dash-seed-header')

    const titleEl = document.createElement('span')
    titleEl.classList.add('dash-seed-title')
    titleEl.textContent = 'Seed Phrase'
    header.appendChild(titleEl)

    if (!this.readOnly) {
      const controls = document.createElement('div')
      controls.classList.add('dash-seed-controls')

      // 12/24 toggle
      const toggle = document.createElement('button')
      toggle.classList.add('dash-seed-toggle')
      toggle.textContent = this._data.count === 12 ? '12 words' : '24 words'
      toggle.type = 'button'
      toggle.addEventListener('click', () => {
        this._data.count = this._data.count === 12 ? 24 : 12
        while (this._data.words.length < this._data.count) {
          this._data.words.push('')
        }
        this._data.words = this._data.words.slice(0, this._data.count)
        this._buildUI()
      })
      controls.appendChild(toggle)

      // Copy button
      const copyBtn = document.createElement('button')
      copyBtn.classList.add('dash-seed-copy')
      copyBtn.textContent = 'Copy All'
      copyBtn.type = 'button'
      copyBtn.addEventListener('click', () => this._handleCopy(copyBtn))
      controls.appendChild(copyBtn)

      header.appendChild(controls)
    }

    this._element.appendChild(header)

    // Grid
    const grid = document.createElement('div')
    grid.classList.add('dash-seed-grid')
    grid.classList.add(this._data.count === 24 ? 'dash-seed-grid-24' : 'dash-seed-grid-12')

    for (let i = 0; i < this._data.count; i++) {
      const cell = document.createElement('div')
      cell.classList.add('dash-seed-cell')

      const num = document.createElement('span')
      num.classList.add('dash-seed-num')
      num.textContent = i + 1
      cell.appendChild(num)

      const input = document.createElement('input')
      input.type = 'text'
      input.classList.add('dash-seed-input')
      input.value = this._data.words[i] || ''
      input.autocomplete = 'off'
      input.spellcheck = false
      input.autocorrect = 'off'
      input.autocapitalize = 'off'
      input.setAttribute('data-index', i)
      input.placeholder = '...'

      if (this.readOnly) {
        input.readOnly = true
      } else {
        input.addEventListener('input', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'))
          this._data.words[idx] = e.target.value.trim().toLowerCase()
          e.target.value = this._data.words[idx]
          this._validateInput(e.target, this._data.words[idx])
        })
        input.addEventListener('paste', (e) => {
          const paste = (e.clipboardData || window.clipboardData).getData('text')
          const pastedWords = paste.trim().split(/[\s,]+/).filter(Boolean)
          if (pastedWords.length > 1) {
            e.preventDefault()
            const startIdx = parseInt(e.target.getAttribute('data-index'))
            for (let j = 0; j < pastedWords.length && (startIdx + j) < this._data.count; j++) {
              this._data.words[startIdx + j] = pastedWords[j].toLowerCase()
            }
            this._buildUI()
          }
        })
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault()
            const idx = parseInt(e.target.getAttribute('data-index'))
            const next = e.shiftKey ? idx - 1 : idx + 1
            if (next >= 0 && next < this._data.count) {
              const inputs = this._element.querySelectorAll('.dash-seed-input')
              inputs[next]?.focus()
            }
          }
        })
      }

      cell.appendChild(input)

      // Validation indicator
      const indicator = document.createElement('span')
      indicator.classList.add('dash-seed-valid')
      cell.appendChild(indicator)

      grid.appendChild(cell)
    }

    this._element.appendChild(grid)
    this._updateValidation()
  }

  _validateInput(input, word) {
    const indicator = input.parentElement?.querySelector('.dash-seed-valid')
    if (!indicator) return
    if (!word) {
      indicator.textContent = ''
      indicator.className = 'dash-seed-valid'
      return
    }
    if (this._bip39) {
      if (this._bip39.has(word)) {
        indicator.textContent = '\u2713'
        indicator.className = 'dash-seed-valid dash-seed-valid-ok'
      } else {
        indicator.textContent = ''
        indicator.className = 'dash-seed-valid'
      }
    }
  }

  _updateValidation() {
    const inputs = this._element.querySelectorAll('.dash-seed-input')
    inputs.forEach((input, i) => {
      this._validateInput(input, this._data.words[i] || '')
    })
  }

  async _handleCopy(btn) {
    const phrase = this._data.words.filter(Boolean).join(' ')
    if (!phrase) return
    try {
      await navigator.clipboard.writeText(phrase)
      btn.textContent = 'Copied!'
      btn.classList.add('dash-seed-copied')
      // Clear clipboard after 30 seconds
      setTimeout(async () => {
        try { await navigator.clipboard.writeText('') } catch {}
      }, 30000)
      setTimeout(() => {
        btn.textContent = 'Copy All'
        btn.classList.remove('dash-seed-copied')
      }, 2000)
    } catch {}
  }

  save() {
    return {
      words: this._data.words.slice(0, this._data.count),
      count: this._data.count
    }
  }

  validate(savedData) {
    return true
  }
}
