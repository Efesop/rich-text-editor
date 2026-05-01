/**
 * Dash Sync — Vault Metadata Storage
 *
 * Stores per-device vault metadata: vault ID, paired devices, lastSyncedVersion,
 * deviceId, deviceName, and the wrapped vault key (encrypted at rest under
 * either the app-lock-derived key OR a user-set sync passphrase).
 *
 * The vault key NEVER touches disk in plaintext. The vault metadata file
 * itself is plaintext (containing vaultId, deviceId, etc.) — no PII, no note
 * content. Only the vault key is wrapped.
 *
 * Storage backend (auto-detected, mirrors lib/storage.js pattern):
 *   - Electron : userData/vault.json (atomic write); vault key wrapped via
 *               safeStorage if app lock disabled, or via app-lock-derived key
 *               if app lock enabled.
 *   - PWA      : IndexedDB metadata store (DB version 4); vault key wrapped
 *               under app-lock-derived key OR user-set sync passphrase.
 *   - Browser  : localStorage (development/testing only); vault key wrapped
 *               under user-set passphrase.
 *
 * The pluggable-backend design lets tests substitute an in-memory backend
 * without spinning up Electron or IndexedDB.
 */

import {
  generateVaultKey,
  importVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  wrapVaultKeyWithPassphrase,
  unwrapVaultKeyWithPassphrase
} from './syncCrypto.js'
import { DecryptionError } from '../utils/cryptoUtils.js'

// Storage schema version — bump if metadata shape changes incompatibly.
export const VAULT_METADATA_VERSION = 1

// =============================================================================
// Vault metadata shape
// =============================================================================

/**
 * @typedef {Object} VaultMetadata
 * @property {number} version - schema version (currently 1)
 * @property {string} vaultId - opaque UUID, sent to server
 * @property {string} deviceId - this device's UUID within the vault
 * @property {string} deviceName - user-friendly name shown in pair list
 * @property {boolean} syncEnabled - master toggle (Settings → Sync)
 * @property {string} relayUrl - WSS URL of the relay (e.g. wss://dash-relay…)
 * @property {string} createdAt - ISO 8601 timestamp of vault creation
 * @property {string} lastPairedAt - ISO 8601 timestamp of most recent device pair
 * @property {Array<PairedDevice>} pairedDevices - other devices in this vault
 * @property {Object<string, number>} lastSyncedVersion - per-pageId: highest pulled version
 * @property {number} cursorVersion - global "since" cursor for next pull
 * @property {Object} wrappedVaultKey - encrypted vault key payload
 * @property {'app-lock'|'passphrase'|'safe-storage'} keyWrapMethod
 */

/**
 * @typedef {Object} PairedDevice
 * @property {string} deviceId
 * @property {string} deviceName
 * @property {string} addedAt - ISO 8601
 * @property {string} lastSeenAt - ISO 8601
 */

/**
 * Default empty metadata for a brand-new device that hasn't opted into sync.
 */
function emptyMetadata () {
  return {
    version: VAULT_METADATA_VERSION,
    vaultId: null,
    deviceId: null,
    deviceName: null,
    syncEnabled: false,
    relayUrl: null,
    createdAt: null,
    lastPairedAt: null,
    pairedDevices: [],
    lastSyncedVersion: {},
    cursorVersion: 0,
    wrappedVaultKey: null,
    keyWrapMethod: null
  }
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a metadata object. Throws on invalid shape. Used after read to
 * detect corruption or downgrade attacks.
 */
export function validateMetadata (m) {
  if (!m || typeof m !== 'object') {
    throw new Error('vault metadata: must be an object')
  }
  if (m.version !== VAULT_METADATA_VERSION) {
    throw new Error(`vault metadata: unsupported version ${m.version}`)
  }
  if (m.syncEnabled === true) {
    if (typeof m.vaultId !== 'string' || m.vaultId.length === 0) {
      throw new Error('vault metadata: syncEnabled but vaultId missing')
    }
    if (typeof m.deviceId !== 'string' || m.deviceId.length === 0) {
      throw new Error('vault metadata: syncEnabled but deviceId missing')
    }
    if (typeof m.relayUrl !== 'string' || !/^wss?:\/\//.test(m.relayUrl)) {
      throw new Error('vault metadata: syncEnabled but relayUrl invalid')
    }
    if (!m.wrappedVaultKey || typeof m.wrappedVaultKey !== 'object') {
      throw new Error('vault metadata: syncEnabled but wrappedVaultKey missing')
    }
    if (!['app-lock', 'passphrase', 'safe-storage'].includes(m.keyWrapMethod)) {
      throw new Error(`vault metadata: invalid keyWrapMethod ${m.keyWrapMethod}`)
    }
  }
  if (!Array.isArray(m.pairedDevices)) {
    throw new Error('vault metadata: pairedDevices must be array')
  }
  if (!m.lastSyncedVersion || typeof m.lastSyncedVersion !== 'object') {
    throw new Error('vault metadata: lastSyncedVersion must be object')
  }
  if (typeof m.cursorVersion !== 'number' || m.cursorVersion < 0) {
    throw new Error('vault metadata: cursorVersion must be non-negative number')
  }
  return m
}

// =============================================================================
// VaultStore — pluggable backend wrapper
// =============================================================================

/**
 * @typedef {Object} StorageBackend
 * @property {() => Promise<object|null>} read - returns stored metadata or null if none
 * @property {(metadata: object) => Promise<void>} write - atomic write
 * @property {() => Promise<void>} clear - delete metadata (for "Disable sync" / "Purge")
 */

/**
 * Wrap a backend with metadata-aware methods. The backend handles raw bytes;
 * this layer handles validation, defaults, and key wrap/unwrap.
 *
 * @param {StorageBackend} backend
 * @returns {VaultStore}
 */
export function createVaultStore (backend) {
  if (!backend || typeof backend.read !== 'function' || typeof backend.write !== 'function' || typeof backend.clear !== 'function') {
    throw new Error('createVaultStore: backend must implement read/write/clear')
  }

  // Cached vault key (raw 32 bytes) and CryptoKey, populated after unlock.
  // Cleared on lock or app close.
  let vaultKeyBytes = null
  let vaultKeyCrypto = null

  return {
    /**
     * Read metadata from disk. Returns empty metadata if none exists.
     * Validates schema; throws on corruption.
     *
     * @returns {Promise<VaultMetadata>}
     */
    async load () {
      const raw = await backend.read()
      if (!raw) return emptyMetadata()
      return validateMetadata(raw)
    },

    /**
     * Persist metadata. Validates before writing.
     *
     * @param {VaultMetadata} metadata
     * @returns {Promise<void>}
     */
    async save (metadata) {
      validateMetadata(metadata)
      await backend.write(metadata)
    },

    /**
     * Initialize a new vault (called when user first opts into sync on this
     * device). Generates vault key, wraps it, returns the new metadata
     * (NOT yet saved — caller can mutate further before save()).
     *
     * Two wrap modes:
     *   - 'app-lock': user has app lock enabled; provide app-lock CryptoKey + salt.
     *   - 'passphrase': user provides a sync passphrase (or app sets one for them).
     *   - 'safe-storage': Electron only; vault key stored via safeStorage IPC.
     *     For 'safe-storage', wrappedVaultKey is { method: 'safe-storage', ref: 'vault-key' }
     *     and the actual bytes live in the OS keychain.
     *
     * @param {Object} opts
     * @param {string} opts.deviceName - user-friendly device name
     * @param {string} opts.relayUrl - WSS URL of relay
     * @param {'app-lock'|'passphrase'|'safe-storage'} opts.wrapMethod
     * @param {Object} [opts.appLockKey] - { key: CryptoKey, salt: Uint8Array } if wrapMethod='app-lock'
     * @param {string} [opts.passphrase] - if wrapMethod='passphrase'
     * @param {(rawKey: Uint8Array) => Promise<void>} [opts.safeStorageStore] - if wrapMethod='safe-storage'
     * @returns {Promise<{metadata: VaultMetadata, vaultKey: Uint8Array}>}
     */
    async createVault ({ deviceName, relayUrl, wrapMethod, appLockKey, passphrase, safeStorageStore }) {
      if (typeof deviceName !== 'string' || deviceName.length === 0) {
        throw new Error('createVault: deviceName required')
      }
      if (typeof relayUrl !== 'string' || !/^wss?:\/\//.test(relayUrl)) {
        throw new Error('createVault: relayUrl must be ws:// or wss://')
      }
      const rawKey = generateVaultKey()
      let wrapped, method

      if (wrapMethod === 'app-lock') {
        if (!appLockKey || !appLockKey.key || !appLockKey.salt) {
          throw new Error("createVault: wrapMethod='app-lock' requires appLockKey {key, salt}")
        }
        wrapped = await wrapVaultKey(rawKey, appLockKey.key, appLockKey.salt)
        method = 'app-lock'
      } else if (wrapMethod === 'passphrase') {
        if (typeof passphrase !== 'string' || passphrase.length === 0) {
          throw new Error("createVault: wrapMethod='passphrase' requires non-empty passphrase")
        }
        wrapped = await wrapVaultKeyWithPassphrase(rawKey, passphrase)
        method = 'passphrase'
      } else if (wrapMethod === 'safe-storage') {
        if (typeof safeStorageStore !== 'function') {
          throw new Error("createVault: wrapMethod='safe-storage' requires safeStorageStore callback")
        }
        await safeStorageStore(rawKey)
        wrapped = { method: 'safe-storage', ref: 'vault-key' }
        method = 'safe-storage'
      } else {
        throw new Error(`createVault: unknown wrapMethod ${wrapMethod}`)
      }

      const now = new Date().toISOString()
      const vaultId = crypto.randomUUID()
      const deviceId = crypto.randomUUID()
      const metadata = {
        ...emptyMetadata(),
        vaultId,
        deviceId,
        deviceName,
        syncEnabled: true,
        relayUrl,
        createdAt: now,
        lastPairedAt: now,
        pairedDevices: [],
        lastSyncedVersion: {},
        cursorVersion: 0,
        wrappedVaultKey: wrapped,
        keyWrapMethod: method
      }

      // Cache for immediate use
      vaultKeyBytes = rawKey
      vaultKeyCrypto = await importVaultKey(rawKey)

      return { metadata, vaultKey: rawKey }
    },

    /**
     * Unlock the vault key. Caller provides whichever credential matches the
     * stored keyWrapMethod. After this returns, getVaultKey() / getVaultCryptoKey()
     * return the live key until lock() is called.
     *
     * @param {VaultMetadata} metadata
     * @param {Object} opts - same shape as createVault but no deviceName/relayUrl
     * @returns {Promise<Uint8Array>} raw 32-byte vault key
     */
    async unlock (metadata, { appLockKey, passphrase, safeStorageRetrieve } = {}) {
      validateMetadata(metadata)
      if (!metadata.syncEnabled) {
        throw new Error('unlock: vault not enabled')
      }
      let raw
      if (metadata.keyWrapMethod === 'app-lock') {
        if (!appLockKey || !appLockKey.key) {
          throw new Error("unlock: keyWrapMethod='app-lock' requires appLockKey")
        }
        raw = await unwrapVaultKey(metadata.wrappedVaultKey, appLockKey.key)
      } else if (metadata.keyWrapMethod === 'passphrase') {
        if (typeof passphrase !== 'string') {
          throw new Error("unlock: keyWrapMethod='passphrase' requires passphrase")
        }
        raw = await unwrapVaultKeyWithPassphrase(metadata.wrappedVaultKey, passphrase)
      } else if (metadata.keyWrapMethod === 'safe-storage') {
        if (typeof safeStorageRetrieve !== 'function') {
          throw new Error("unlock: keyWrapMethod='safe-storage' requires safeStorageRetrieve callback")
        }
        const retrieved = await safeStorageRetrieve()
        if (!(retrieved instanceof Uint8Array) || retrieved.length !== 32) {
          throw new DecryptionError('unlock: safeStorage returned invalid vault key')
        }
        raw = retrieved
      } else {
        throw new Error(`unlock: unknown keyWrapMethod ${metadata.keyWrapMethod}`)
      }
      vaultKeyBytes = raw
      vaultKeyCrypto = await importVaultKey(raw)
      return raw
    },

    /**
     * Clear the cached vault key from memory. Called on app lock entry,
     * duress entry, "Disable sync" toggle.
     */
    lock () {
      vaultKeyBytes = null
      vaultKeyCrypto = null
    },

    /**
     * Whether the vault is currently unlocked (vault key in memory).
     * @returns {boolean}
     */
    isUnlocked () {
      return vaultKeyBytes !== null
    },

    /**
     * Get raw vault key bytes (for HMAC ops, sub-key derivation). Returns null
     * if locked.
     * @returns {Uint8Array|null}
     */
    getVaultKey () {
      return vaultKeyBytes
    },

    /**
     * Get vault key as CryptoKey (for AES-GCM encrypt/decrypt). Returns null
     * if locked.
     * @returns {CryptoKey|null}
     */
    getVaultCryptoKey () {
      return vaultKeyCrypto
    },

    /**
     * Two-phase commit re-key: when app-lock password changes, rewrap vault
     * key under new app-lock-derived key. Plan section "App-lock password
     * change — vault key re-key (two-phase commit)".
     *
     * Process:
     *   1. Decrypt vault key with old credential.
     *   2. Encrypt under new credential into TEMP slot (returned, not saved).
     *   3. Verify decrypt of TEMP works.
     *   4. Caller atomically writes new metadata (with new wrappedVaultKey).
     *
     * If verify fails at step 3, the original `metadata.wrappedVaultKey` is
     * untouched. Caller can retry or fall back.
     *
     * @param {VaultMetadata} metadata - current metadata
     * @param {Object} oldCred - same shape as unlock() opts
     * @param {Object} newCred - same shape as createVault() opts (without deviceName)
     * @returns {Promise<VaultMetadata>} new metadata with re-wrapped key (not yet saved)
     */
    async rekey (metadata, oldCred, newCred) {
      // Step 1: unlock with old credential
      const raw = await this.unlock(metadata, oldCred)

      // Step 2: rewrap under new credential
      let wrapped, method
      if (newCred.wrapMethod === 'app-lock') {
        if (!newCred.appLockKey || !newCred.appLockKey.key || !newCred.appLockKey.salt) {
          throw new Error("rekey: new wrapMethod='app-lock' requires appLockKey {key, salt}")
        }
        wrapped = await wrapVaultKey(raw, newCred.appLockKey.key, newCred.appLockKey.salt)
        method = 'app-lock'
      } else if (newCred.wrapMethod === 'passphrase') {
        if (typeof newCred.passphrase !== 'string' || newCred.passphrase.length === 0) {
          throw new Error("rekey: new wrapMethod='passphrase' requires passphrase")
        }
        wrapped = await wrapVaultKeyWithPassphrase(raw, newCred.passphrase)
        method = 'passphrase'
      } else if (newCred.wrapMethod === 'safe-storage') {
        if (typeof newCred.safeStorageStore !== 'function') {
          throw new Error("rekey: new wrapMethod='safe-storage' requires safeStorageStore callback")
        }
        await newCred.safeStorageStore(raw)
        wrapped = { method: 'safe-storage', ref: 'vault-key' }
        method = 'safe-storage'
      } else {
        throw new Error(`rekey: unknown new wrapMethod ${newCred.wrapMethod}`)
      }

      // Step 3: verify by unwrapping the new wrapping
      let verifyRaw
      if (method === 'app-lock') {
        verifyRaw = await unwrapVaultKey(wrapped, newCred.appLockKey.key)
      } else if (method === 'passphrase') {
        verifyRaw = await unwrapVaultKeyWithPassphrase(wrapped, newCred.passphrase)
      } else {
        // safe-storage: the OS keychain stored the bytes; verify by retrieve
        if (typeof newCred.safeStorageRetrieve !== 'function') {
          throw new Error("rekey: safe-storage verify requires newCred.safeStorageRetrieve")
        }
        verifyRaw = await newCred.safeStorageRetrieve()
      }
      const matches = verifyRaw && verifyRaw.length === 32 &&
        verifyRaw.every((b, i) => b === raw[i])
      if (!matches) {
        throw new Error('rekey: verification failed — new wrapping does not unwrap to original key')
      }

      return {
        ...metadata,
        wrappedVaultKey: wrapped,
        keyWrapMethod: method
      }
    },

    /**
     * Disable sync entirely on this device. Clears metadata + cached key.
     * Caller is responsible for any server-side vault purge (separate API call).
     */
    async disableSync () {
      vaultKeyBytes = null
      vaultKeyCrypto = null
      await backend.clear()
    }
  }
}

// =============================================================================
// In-memory backend — for tests and as a fallback
// =============================================================================

/**
 * Pure-memory backend. Holds metadata in a closure variable. Useful for
 * tests; do NOT use in production (data lost on reload).
 */
export function createMemoryBackend (initial = null) {
  let stored = initial
  return {
    async read () { return stored ? JSON.parse(JSON.stringify(stored)) : null },
    async write (m) { stored = JSON.parse(JSON.stringify(m)) },
    async clear () { stored = null }
  }
}

// =============================================================================
// Production backends — auto-detect Electron / PWA / browser
// =============================================================================

/**
 * Electron backend — uses IPC to electron-main.js. Vault metadata stored as
 * userData/vault.json (atomic write). Vault key stored separately via
 * vault-key-store IPC (OS keychain via safeStorage).
 */
export function createElectronVaultBackend () {
  return {
    async read () {
      if (typeof window === 'undefined' || !window.electron?.invoke) return null
      return window.electron.invoke('read-vault')
    },
    async write (metadata) {
      if (typeof window === 'undefined' || !window.electron?.invoke) {
        throw new Error('Electron not available')
      }
      await window.electron.invoke('save-vault', metadata)
    },
    async clear () {
      if (typeof window === 'undefined' || !window.electron?.invoke) return
      await window.electron.invoke('clear-vault')
      // Also wipe the OS-keychain copy of the vault key (if any).
      try { await window.electron.invoke('vault-key-delete') } catch { /* ignore */ }
    }
  }
}

/**
 * PWA backend — uses IndexedDB v4 vaultMetadata store. Vault key only ever
 * stored as wrapped blob inside metadata.wrappedVaultKey (no separate
 * keychain available in browsers).
 */
export function createPwaVaultBackend (mobileStorageInstance) {
  if (!mobileStorageInstance) {
    throw new Error('createPwaVaultBackend: mobileStorageInstance required')
  }
  return {
    async read () { return mobileStorageInstance.readVaultMetadata() },
    async write (metadata) {
      const result = await mobileStorageInstance.saveVaultMetadata(metadata)
      if (!result.success) throw new Error('PWA vault write failed: ' + (result.error || 'unknown'))
    },
    async clear () { await mobileStorageInstance.clearVaultMetadata() }
  }
}

/**
 * Auto-detect best backend for this environment. Pass mobileStorage instance
 * for PWA fallback.
 *
 * Resolution order:
 *   1. Electron (window.electron available) → ElectronVaultBackend
 *   2. PWA / web with mobileStorage instance → PwaVaultBackend
 *   3. Pure browser without mobileStorage → memory backend (data lost on reload — for testing only)
 */
export function autoSelectBackend (mobileStorageInstance = null) {
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    return createElectronVaultBackend()
  }
  if (mobileStorageInstance) {
    return createPwaVaultBackend(mobileStorageInstance)
  }
  console.warn('vaultStorage: no production backend available, using memory (data lost on reload)')
  return createMemoryBackend(null)
}

/**
 * Helper: store / retrieve / delete the raw vault key in Electron's safeStorage
 * (OS keychain). For 'safe-storage' wrap method only. Returns base64 string.
 */
export async function safeStorageStoreVaultKey (rawKey) {
  if (typeof window === 'undefined' || !window.electron?.invoke) {
    throw new Error('safeStorageStoreVaultKey: Electron required')
  }
  if (!(rawKey instanceof Uint8Array) || rawKey.length !== 32) {
    throw new Error('safeStorageStoreVaultKey: rawKey must be 32-byte Uint8Array')
  }
  // Convert to base64 for safeStorage (which only handles strings).
  let bin = ''
  for (let i = 0; i < rawKey.length; i++) bin += String.fromCharCode(rawKey[i])
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(rawKey).toString('base64')
  const ok = await window.electron.invoke('vault-key-store', b64)
  if (!ok) throw new Error('safeStorage vault-key-store failed (encryption unavailable?)')
}

export async function safeStorageRetrieveVaultKey () {
  if (typeof window === 'undefined' || !window.electron?.invoke) {
    throw new Error('safeStorageRetrieveVaultKey: Electron required')
  }
  const b64 = await window.electron.invoke('vault-key-retrieve')
  if (typeof b64 !== 'string') return null
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return new Uint8Array(Buffer.from(b64, 'base64'))
}
