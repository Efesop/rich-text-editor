/**
 * The key photo attachment ids are made with (lib/imageAttachments.js).
 *
 * While sync is on and unlocked, useSyncQueue hands over the vault key, and
 * every paired device names a photo the same way. Otherwise a random key kept
 * on this device is used. Losing that key only means a photo added again is
 * stored again; nothing already stored is affected.
 */

import { vaultAttachmentIdKey } from './imageAttachments.js'

const DEVICE_KEY_STORAGE = 'dash:attachment-id-key'

let vaultIdKey = null
let deviceIdKey = null

/** Use the synced vault's id key from now on; pass null when sync stops or locks. */
export async function setAttachmentIdVaultKey (vaultKeyBytes) {
  vaultIdKey = vaultKeyBytes ? await vaultAttachmentIdKey(vaultKeyBytes) : null
}

function bytesToBase64 (bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes (text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function deviceKey (storage) {
  try {
    const saved = storage?.getItem(DEVICE_KEY_STORAGE)
    if (saved) {
      const bytes = base64ToBytes(saved)
      if (bytes.length === 32) return bytes
    }
  } catch { /* storage unavailable: use a key for this session */ }
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  try {
    storage?.setItem(DEVICE_KEY_STORAGE, bytesToBase64(bytes))
  } catch { /* not kept: photos added again next session get new ids */ }
  return bytes
}

export function getAttachmentIdKey ({ storage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
  if (vaultIdKey) return vaultIdKey
  if (!deviceIdKey) deviceIdKey = deviceKey(storage)
  return deviceIdKey
}
