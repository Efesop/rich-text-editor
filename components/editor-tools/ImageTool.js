/**
 * Image block: photos stored as attachments and shown inline.
 *
 * Takes over the `image` key from @editorjs/image and keeps its class names,
 * tunes and saved fields, so existing notes look and save as before. A new
 * photo is stored as an attachment (utils/photoUpload.js) and saved as the
 * attachment contract: `attachmentId` plus a stub `file.url` naming it
 * (lib/attachmentRefs.js). Images saved inline or as web addresses still show
 * as they are.
 *
 * Editor.js config: storePhotoFile(file), storePhotoUrl(url),
 * acquirePhotoUrl(id, mimeType), releasePhotoUrl(id), captionPlaceholder.
 */

import { IMAGE_MIME_TYPES, cleanAttachmentFilename, imageAttachmentId, isImageDimension } from '../../lib/attachmentRefs.js'
import { buildImageBlockData } from '../../lib/imageAttachments.js'
import { onAttachmentStored } from '../../lib/attachmentEvents.js'

const IMAGE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="14" height="14" x="5" y="5" stroke="currentColor" stroke-width="2" rx="4"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.14 15.32l3.55-3.75a1.75 1.75 0 0 1 2.55 0L15.39 16M13.58 14.07l1.43-1.54a1.75 1.75 0 0 1 2.55 0l1.28 1.43"/><circle cx="13.5" cy="9.5" r="1.5" fill="currentColor"/></svg>'
const BORDER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="14" height="14" x="5" y="5" stroke="currentColor" stroke-width="2" rx="2"/></svg>'
const STRETCH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12h16M7.5 8.5L4 12l3.5 3.5M16.5 8.5L20 12l-3.5 3.5"/></svg>'
const BACKGROUND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="16" height="16" x="4" y="4" fill="currentColor" opacity="0.25" rx="3"/><rect width="8" height="8" x="8" y="8" stroke="currentColor" stroke-width="2" rx="1.5"/></svg>'

const TUNES = [
  { name: 'withBorder', title: 'With border', icon: BORDER_ICON },
  { name: 'stretched', title: 'Stretch image', icon: STRETCH_ICON },
  { name: 'withBackground', title: 'With background', icon: BACKGROUND_ICON }
]

const NOT_HERE_YET = 'This photo has not reached this device yet. It will appear once it downloads.'
const CANNOT_SHOW = 'This photo could not be shown.'

function make (tag, classNames = [], props = {}) {
  const node = document.createElement(tag)
  for (const name of [].concat(classNames)) {
    if (name) node.classList.add(name)
  }
  return Object.assign(node, props)
}

function readData (data = {}) {
  const flag = (value) => value === true || value === 'true'
  const attachmentId = imageAttachmentId(data)
  const sized = isImageDimension(data.width) && isImageDimension(data.height)
  return {
    attachmentId,
    url: !attachmentId && typeof data.file?.url === 'string' ? data.file.url : '',
    caption: typeof data.caption === 'string' ? data.caption : '',
    withBorder: flag(data.withBorder),
    withBackground: flag(data.withBackground),
    stretched: flag(data.stretched),
    mimeType: IMAGE_MIME_TYPES.includes(data.mimeType) ? data.mimeType : undefined,
    width: sized ? data.width : undefined,
    height: sized ? data.height : undefined,
    filename: cleanAttachmentFilename(data.filename) || undefined
  }
}

export default class ImageTool {
  static get toolbox () {
    return { icon: IMAGE_ICON, title: 'Image' }
  }

  static get isReadOnlySupported () {
    return true
  }

  static get pasteConfig () {
    return {
      tags: [{ img: { src: true } }],
      patterns: {
        image: /https?:\/\/\S+\.(gif|jpe?g|tiff|png|svg|webp)(\?[a-z0-9=]*)?$/i
      },
      files: {
        mimeTypes: ['image/*']
      }
    }
  }

  constructor ({ data, config, api, readOnly, block }) {
    this.api = api
    this.block = block
    this.readOnly = readOnly
    this.config = config || {}
    this._data = readData(data)
    this._nodes = null
    this._acquiredId = null
    this._loadToken = 0
    this._stopWaiting = null
    this._storing = false
  }

  render () {
    const wrapper = make('div', [this.api.styles.block, 'image-tool'])
    const image = make('div', 'image-tool__image')
    // The photo arrives after the block renders. Swapping the placeholder for
    // the picture isn't an edit, so Editor.js must not report it as one.
    image.dataset.mutationFree = 'true'
    const caption = make('div', [this.api.styles.input, 'image-tool__caption'], { contentEditable: !this.readOnly })
    caption.dataset.placeholder = this.config.captionPlaceholder || 'Caption'
    caption.innerHTML = this._data.caption
    wrapper.append(image, caption)
    this._nodes = { wrapper, image, caption }
    for (const tune of TUNES) this._applyTune(tune.name)
    this._showCurrent()
    return wrapper
  }

  rendered () {
    if (this._data.stretched) this.block.stretched = true
  }

  // Chosen from the toolbox: open the file picker straight away, as the old tool did.
  appendCallback () {
    if (!this.readOnly && !this._hasImage()) this._pickFile()
  }

  renderSettings () {
    return TUNES.map(tune => ({
      icon: tune.icon,
      label: this.api.i18n.t(tune.title),
      name: tune.name,
      toggle: true,
      isActive: this._data[tune.name],
      onActivate: () => this._toggleTune(tune.name)
    }))
  }

  onPaste (event) {
    switch (event.type) {
      case 'tag': {
        const img = event.detail.data
        const src = img?.getAttribute?.('src') || img?.src
        if (src) this._store(() => this.config.storePhotoUrl(src))
        break
      }
      case 'pattern':
        this._store(() => this.config.storePhotoUrl(event.detail.data))
        break
      case 'file':
        this._store(() => this.config.storePhotoFile(event.detail.file))
        break
    }
  }

  save () {
    const caption = this._nodes ? this._nodes.caption.innerHTML : this._data.caption
    if (this._data.attachmentId) {
      return buildImageBlockData({ ...this._data, caption })
    }
    const { url, withBorder, withBackground, stretched } = this._data
    return { file: { url }, caption, withBorder, withBackground, stretched }
  }

  // A photo whose bytes haven't reached this device yet is still kept.
  validate (savedData) {
    return Boolean(imageAttachmentId(savedData) || savedData?.file?.url)
  }

  removed () {
    this._teardown()
  }

  destroy () {
    this._teardown()
  }

  // --- showing ---------------------------------------------------------------

  _hasImage () {
    return Boolean(this._data.attachmentId || this._data.url)
  }

  _setState (state, children) {
    this._nodes.image.dataset.state = state
    this._nodes.image.replaceChildren(...children)
  }

  _showCurrent () {
    if (this._data.attachmentId) this._showAttachment()
    else if (this._data.url) this._showPicture(this._data.url)
    else this._showPicker()
  }

  _showPicker () {
    if (this.readOnly) {
      this._setState('empty', [])
      return
    }
    const button = make('div', [this.api.styles.button, 'image-tool__picker'])
    button.innerHTML = IMAGE_ICON
    button.append(document.createTextNode(this.api.i18n.t('Select an Image')))
    button.addEventListener('click', () => this._pickFile())
    this._setState('empty', [button])
  }

  _placeholder (message = '') {
    const box = make('div', 'image-tool__placeholder')
    const { width, height } = this._data
    if (width && height) {
      box.style.aspectRatio = `${width} / ${height}`
      box.style.width = `min(100%, ${Math.round(500 * width / height)}px)`
    }
    if (message) box.textContent = message
    return box
  }

  _altText () {
    return (this._nodes?.caption.textContent || '').trim() || this._data.filename || ''
  }

  _showPicture (url) {
    const picture = make('img', 'image-tool__image-picture', { src: url, alt: this._altText(), decoding: 'async' })
    if (this._data.width && this._data.height) {
      picture.width = this._data.width
      picture.height = this._data.height
    }
    picture.addEventListener('error', () => {
      if (picture.isConnected) this._setState('broken', [this._placeholder(CANNOT_SHOW)])
    })
    this._setState('filled', [picture])
  }

  async _showAttachment () {
    const id = this._data.attachmentId
    const token = ++this._loadToken
    this._stopWaitingForBytes()
    this._release()
    this._setState('loading', [this._placeholder()])
    if (typeof this.config.acquirePhotoUrl !== 'function') {
      this._setState('broken', [this._placeholder(CANNOT_SHOW)])
      return
    }
    let url
    try {
      url = await this.config.acquirePhotoUrl(id, this._data.mimeType)
    } catch (err) {
      if (token !== this._loadToken) return
      if (err?.name === 'AttachmentNotOnDeviceError') {
        this._setState('missing', [this._placeholder(NOT_HERE_YET)])
        this._waitForBytes(id)
      } else {
        console.error('Image block: could not show photo', id, err)
        this._setState('broken', [this._placeholder(CANNOT_SHOW)])
      }
      return
    }
    if (token !== this._loadToken || !this._nodes) {
      this.config.releasePhotoUrl?.(id)
      return
    }
    this._acquiredId = id
    this._showPicture(url)
  }

  _waitForBytes (id) {
    this._stopWaitingForBytes()
    this._stopWaiting = onAttachmentStored((storedId) => {
      if (storedId === id && this._data.attachmentId === id) this._showAttachment()
    })
  }

  _stopWaitingForBytes () {
    if (this._stopWaiting) {
      this._stopWaiting()
      this._stopWaiting = null
    }
  }

  _release () {
    if (this._acquiredId) {
      this.config.releasePhotoUrl?.(this._acquiredId)
      this._acquiredId = null
    }
  }

  _teardown () {
    this._loadToken++
    this._stopWaitingForBytes()
    this._release()
  }

  // --- adding ----------------------------------------------------------------

  _pickFile () {
    const input = make('input', [], { type: 'file', accept: 'image/*' })
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]
      if (file) this._store(() => this.config.storePhotoFile(file))
    })
    input.click()
  }

  async _store (task) {
    if (this._storing || this.readOnly) return
    this._storing = true
    this._setState('uploading', [make('div', 'image-tool__image-preloader')])
    try {
      const stored = await task()
      if (stored?.attachmentId) {
        Object.assign(this._data, {
          attachmentId: stored.attachmentId,
          url: '',
          mimeType: IMAGE_MIME_TYPES.includes(stored.mimeType) ? stored.mimeType : undefined,
          width: isImageDimension(stored.width) && isImageDimension(stored.height) ? stored.width : undefined,
          height: isImageDimension(stored.width) && isImageDimension(stored.height) ? stored.height : undefined,
          filename: cleanAttachmentFilename(stored.filename) || undefined
        })
      } else if (stored?.url) {
        Object.assign(this._data, { attachmentId: null, url: stored.url, mimeType: undefined, width: undefined, height: undefined, filename: undefined })
      } else {
        throw new Error('nothing was stored')
      }
      this._showCurrent()
      // The image lives in a region Editor.js ignores, so say the block changed.
      this.block.dispatchChange()
    } catch (err) {
      console.error('Image block: could not add image', err)
      this.api.notifier.show({
        message: err?.name === 'ImageTooLargeError'
          ? 'This photo is too large to add, even made smaller.'
          : 'Could not add this image. Try another one.',
        style: 'error'
      })
      this._showCurrent()
    } finally {
      this._storing = false
    }
  }

  _applyTune (name) {
    this._nodes?.wrapper.classList.toggle(`image-tool--${name}`, Boolean(this._data[name]))
  }

  _toggleTune (name) {
    this._data[name] = !this._data[name]
    this._applyTune(name)
    if (name === 'stretched') {
      Promise.resolve().then(() => { this.block.stretched = this._data.stretched }).catch(err => console.error(err))
    }
  }
}
