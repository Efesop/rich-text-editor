/**
 * Backup passphrase storage (Phase 2.10a).
 *
 * The .dashpack auto-export needs a passphrase to encrypt the bundle. We
 * store it once (when the user first sets up backup) so subsequent
 * scheduled exports run without prompting.
 *
 * Storage backend per environment:
 *   - Electron : safe-storage IPC ('backup-passphrase' key) — OS keychain.
 *                Already used for app-lock and GitHub token. Gold standard.
 *   - PWA      : localStorage with a static obfuscation key. NOT secure
 *                from a determined attacker with disk access — but the
 *                .dashpack file itself is the high-value target and it's
 *                encrypted with this passphrase. Storing the passphrase
 *                obfuscated in localStorage is a defense-in-depth
 *                trade-off so that schedule-based auto-export works at
 *                all on PWA without re-prompting daily/weekly.
 *   - Browser  : same as PWA fallback.
 *
 * Users who want stronger PWA security can leave the passphrase un-set
 * and use the manual "Export now" flow which prompts each time.
 */

const ELECTRON_KEY = 'backup-passphrase'
const LS_KEY = '_dbpw'

const isElectron = () => typeof window !== 'undefined' && !!window.electron?.invoke

// ── PWA / browser obfuscation ──
// XOR with a static byte sequence + base64. NOT cryptographic — meant
// only to prevent casual disk-dump exposure (e.g. via DevTools peeking).
// Real protection comes from the .dashpack file being encrypted with the
// passphrase itself; if an attacker can read localStorage they can also
// just access the user's notes directly via IndexedDB so this is a
// trade-off for usability.
const OBFUSCATION_KEY = new Uint8Array([0x9d, 0xc1, 0x14, 0x2a, 0x37, 0xff, 0x88, 0x05, 0xae, 0x6e, 0xb2, 0x21, 0x73, 0x4f, 0xe9, 0x52])

function obfuscate (str) {
  const bytes = new TextEncoder().encode(str)
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.length]
  }
  let bin = ''
  for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i])
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(out).toString('base64')
}

function deobfuscate (b64) {
  if (typeof b64 !== 'string' || b64.length === 0) return null
  let bytes
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64)
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else {
      // eslint-disable-next-line no-undef
      bytes = new Uint8Array(Buffer.from(b64, 'base64'))
    }
  } catch { return null }
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.length]
  }
  try { return new TextDecoder().decode(out) } catch { return null }
}

/**
 * Store the passphrase. Returns true on success, false otherwise.
 *
 * @param {string} passphrase
 * @returns {Promise<boolean>}
 */
export async function storeBackupPassphrase (passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('storeBackupPassphrase: passphrase required')
  }
  if (isElectron()) {
    try {
      const ok = await window.electron.invoke('safe-storage-store', ELECTRON_KEY, passphrase)
      return Boolean(ok)
    } catch (err) {
      console.error('storeBackupPassphrase electron failed', err)
      return false
    }
  }
  try {
    const obf = obfuscate(passphrase)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY, obf)
      return true
    }
    return false
  } catch (err) {
    console.error('storeBackupPassphrase localStorage failed', err)
    return false
  }
}

/**
 * Retrieve the stored passphrase. Returns null if none stored or retrieval failed.
 *
 * @returns {Promise<string|null>}
 */
export async function retrieveBackupPassphrase () {
  if (isElectron()) {
    try {
      const v = await window.electron.invoke('safe-storage-retrieve', ELECTRON_KEY)
      return typeof v === 'string' && v.length > 0 ? v : null
    } catch (err) {
      console.error('retrieveBackupPassphrase electron failed', err)
      return null
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const obf = localStorage.getItem(LS_KEY)
      if (!obf) return null
      const v = deobfuscate(obf)
      return typeof v === 'string' && v.length > 0 ? v : null
    }
  } catch { /* fall through */ }
  return null
}

/**
 * Delete the stored passphrase (e.g. when user disables backups or
 * wants to re-set).
 *
 * @returns {Promise<void>}
 */
export async function clearBackupPassphrase () {
  if (isElectron()) {
    try { await window.electron.invoke('safe-storage-delete', ELECTRON_KEY) } catch { /* ignore */ }
    return
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_KEY)
    }
  } catch { /* ignore */ }
}

/**
 * Quick check without retrieving the actual value (e.g. for UI gating).
 *
 * @returns {Promise<boolean>}
 */
export async function hasBackupPassphrase () {
  const v = await retrieveBackupPassphrase()
  return typeof v === 'string' && v.length > 0
}
