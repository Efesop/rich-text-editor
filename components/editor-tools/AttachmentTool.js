import { saveAttachment, deleteAttachment, validateAttachment, formatFileSize, openAttachment } from '@/lib/attachmentStorage'

const ATTACHMENT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="-4 -4 32 32" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'

const PDF_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12l-2 4h4l-2 4"/></svg>'

const IMAGE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'

const ACCEPT_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf'

export default class AttachmentTool {
  static get toolbox () {
    return {
      title: 'File',
      icon: ATTACHMENT_ICON
    }
  }

  static get isReadOnlySupported () {
    return true
  }

  constructor ({ data, api, config, readOnly }) {
    this.api = api
    this.readOnly = readOnly
    this._data = {
      attachmentId: data.attachmentId || '',
      filename: data.filename || '',
      mimeType: data.mimeType || '',
      size: data.size || 0,
      preview: data.preview || ''
    }
    this._element = null
  }

  render () {
    this._element = document.createElement('div')
    this._element.classList.add('attachment-block')

    if (this._data.attachmentId) {
      this._renderCard()
    } else {
      this._renderUploader()
    }

    return this._element
  }

  _renderUploader () {
    this._element.innerHTML = ''

    const uploader = document.createElement('div')
    uploader.classList.add('attachment-uploader')
    uploader.innerHTML = `
      <div class="attachment-uploader-content">
        ${ATTACHMENT_ICON}
        <span>Click to attach a file</span>
        <span class="attachment-uploader-hint">Images or PDFs up to 10MB</span>
      </div>
    `

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT_TYPES
    input.style.display = 'none'

    uploader.addEventListener('click', () => {
      if (!this.readOnly) input.click()
    })

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return

      const validation = await validateAttachment(file)
      if (!validation.valid) {
        this._showError(validation.error)
        return
      }

      await this._processFile(file)
    })

    this._element.appendChild(uploader)
    this._element.appendChild(input)
  }

  async _processFile (file) {
    const attachmentId = crypto.randomUUID()

    // Show loading state
    this._element.innerHTML = ''
    const loading = document.createElement('div')
    loading.classList.add('attachment-loading')
    loading.textContent = 'Saving file...'
    this._element.appendChild(loading)

    try {
      const buffer = await file.arrayBuffer()

      // Generate preview thumbnail for images
      let preview = ''
      if (file.type.startsWith('image/')) {
        preview = await this._generateThumbnail(file)
      }

      await saveAttachment(attachmentId, buffer)

      this._data = {
        attachmentId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        preview
      }

      this._renderCard()
    } catch (err) {
      console.error('Failed to save attachment:', err)
      this._showError('Failed to save file. Please try again.')
    }
  }

  async _generateThumbnail (file) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxSize = 120
          let w = img.width
          let h = img.height
          if (w > h) {
            if (w > maxSize) { h = h * maxSize / w; w = maxSize }
          } else {
            if (h > maxSize) { w = w * maxSize / h; h = maxSize }
          }
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.6))
        }
        img.onerror = () => resolve('')
        img.src = e.target.result
      }
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
  }

  _renderCard () {
    this._element.innerHTML = ''

    const card = document.createElement('div')
    card.classList.add('attachment-card')

    const isPdf = this._data.mimeType === 'application/pdf'
    const isImage = this._data.mimeType?.startsWith('image/')

    // Left: icon or thumbnail
    const iconArea = document.createElement('div')
    iconArea.classList.add('attachment-icon')

    if (isImage && this._data.preview) {
      const thumb = document.createElement('img')
      thumb.src = this._data.preview
      thumb.alt = this._data.filename
      thumb.classList.add('attachment-thumbnail')
      iconArea.appendChild(thumb)
    } else {
      iconArea.innerHTML = isPdf ? PDF_ICON : IMAGE_ICON
    }

    // Middle: filename + size
    const info = document.createElement('div')
    info.classList.add('attachment-info')

    const name = document.createElement('div')
    name.classList.add('attachment-filename')
    name.textContent = this._data.filename
    name.title = this._data.filename

    const size = document.createElement('div')
    size.classList.add('attachment-size')
    size.textContent = formatFileSize(this._data.size)

    info.appendChild(name)
    info.appendChild(size)

    card.appendChild(iconArea)
    card.appendChild(info)

    // Click to open
    card.addEventListener('click', () => {
      openAttachment(this._data.attachmentId, this._data.filename, this._data.mimeType)
    })

    // Delete button (not in read-only mode)
    if (!this.readOnly) {
      const deleteBtn = document.createElement('button')
      deleteBtn.classList.add('attachment-delete')
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      deleteBtn.title = 'Remove attachment'
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (this._data.attachmentId) {
          await deleteAttachment(this._data.attachmentId)
        }
        this.api.blocks.delete(this.api.blocks.getCurrentBlockIndex())
      })
      card.appendChild(deleteBtn)
    }

    this._element.appendChild(card)
  }

  _showError (message) {
    this._element.innerHTML = ''
    const error = document.createElement('div')
    error.classList.add('attachment-error')
    error.textContent = message
    this._element.appendChild(error)

    setTimeout(() => {
      this._renderUploader()
    }, 3000)
  }

  save () {
    return this._data
  }

  validate (savedData) {
    return !!savedData.attachmentId
  }

  destroy () {
    // Cleanup if needed
  }
}
