/**
 * "These attachment bytes are now on this device", for anything showing a
 * placeholder while a photo downloads or saves.
 */

const listeners = new Set()

/** Call `listener(attachmentId)` whenever an attachment is stored. Returns an unsubscribe function. */
export function onAttachmentStored (listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyAttachmentStored (attachmentId) {
  for (const listener of [...listeners]) {
    try {
      listener(attachmentId)
    } catch (err) {
      console.error('attachment listener failed', err)
    }
  }
}
