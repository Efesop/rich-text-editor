import { create } from 'zustand'
import bcrypt from 'bcryptjs'

// Module-level encryption key cache (CryptoKey is not serializable in Zustand)
let _appLockKey = null // { key: CryptoKey, salt: Uint8Array }

const useAppLockStore = create((set, get) => ({
  isEnabled: false,
  timeoutMinutes: 5,
  passwordHash: null,
  isLocked: false,
  biometricEnabled: false,
  isLoaded: false,
  encryptionSalt: null, // Array of numbers (serialized Uint8Array)
  duressEnabled: false,
  duressPasswordHash: null,
  duressAction: 'hide', // 'wipe' or 'hide'

  loadData: async () => {
    try {
      let data = null
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        data = await window.electron.invoke('read-app-lock')
      } else {
        const stored = localStorage.getItem('dash-app-lock')
        data = stored ? JSON.parse(stored) : null
      }

      if (data) {
        set({
          isEnabled: data.isEnabled || false,
          timeoutMinutes: typeof data.timeoutMinutes === 'number' ? data.timeoutMinutes : 5,
          passwordHash: data.passwordHash || null,
          biometricEnabled: data.biometricEnabled || false,
          encryptionSalt: data.encryptionSalt || null,
          isLocked: data.isEnabled || false, // Lock on launch if enabled
          isLoaded: true,
          duressEnabled: data.duressEnabled || false,
          duressPasswordHash: data.duressPasswordHash || null,
          duressAction: data.duressAction || 'hide'
        })
      } else {
        set({ isLoaded: true })
      }
    } catch (error) {
      console.error('Error loading app-lock data:', error)
      set({ isLoaded: true })
    }
  },

  _persist: async () => {
    const { isEnabled, timeoutMinutes, passwordHash, biometricEnabled, encryptionSalt, duressEnabled, duressPasswordHash, duressAction } = get()
    const data = { isEnabled, timeoutMinutes, passwordHash, biometricEnabled, encryptionSalt, duressEnabled, duressPasswordHash, duressAction }
    try {
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        await window.electron.invoke('save-app-lock', data)
      } else {
        localStorage.setItem('dash-app-lock', JSON.stringify(data))
      }
    } catch (error) {
      console.error('Error saving app-lock data:', error)
    }
  },

  enable: async (password, timeoutMinutes, biometricEnabled = false, encryptionSalt = null) => {
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(password, salt)
    set({
      isEnabled: true,
      timeoutMinutes,
      passwordHash: hash,
      biometricEnabled,
      encryptionSalt
    })
    await get()._persist()
  },

  disable: async () => {
    _appLockKey = null
    set({
      isEnabled: false,
      timeoutMinutes: 5,
      passwordHash: null,
      biometricEnabled: false,
      encryptionSalt: null,
      isLocked: false,
      duressEnabled: false,
      duressPasswordHash: null,
      duressAction: 'hide'
    })
    await get()._persist()
    // Clean up safeStorage
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('safe-storage-delete', 'app-lock-password').catch(() => {})
    }
  },

  lock: () => {
    const { isEnabled } = get()
    if (isEnabled) {
      _appLockKey = null
      set({ isLocked: true })
    }
  },

  checkPassword: (password) => {
    const { passwordHash } = get()
    if (!passwordHash) return false
    return bcrypt.compareSync(password, passwordHash)
  },

  unlock: (password) => {
    const { passwordHash } = get()
    if (!passwordHash) return false
    const valid = bcrypt.compareSync(password, passwordHash)
    if (valid) {
      set({ isLocked: false })
    }
    return valid
  },

  unlockBiometric: () => {
    set({ isLocked: false })
  },

  setEncryptionKey: (key, salt) => {
    _appLockKey = { key, salt }
  },

  getEncryptionKey: () => {
    return _appLockKey
  },

  clearEncryptionKey: () => {
    _appLockKey = null
  },

  setEncryptionSalt: async (salt) => {
    set({ encryptionSalt: salt })
    await get()._persist()
  },

  updateTimeout: async (timeoutMinutes) => {
    set({ timeoutMinutes })
    await get()._persist()
  },

  updatePassword: async (currentPassword, newPassword) => {
    const { passwordHash } = get()
    if (!passwordHash || !bcrypt.compareSync(currentPassword, passwordHash)) {
      return false
    }
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(newPassword, salt)
    set({ passwordHash: hash })
    await get()._persist()
    return true
  },

  toggleBiometric: async (enabled) => {
    set({ biometricEnabled: enabled })
    await get()._persist()
  },

  setDuress: async (password, action) => {
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(password, salt)
    set({ duressEnabled: true, duressPasswordHash: hash, duressAction: action })
    await get()._persist()
  },

  checkDuress: (password) => {
    const { duressEnabled, duressPasswordHash } = get()
    if (!duressEnabled || !duressPasswordHash) return false
    return bcrypt.compareSync(password, duressPasswordHash)
  },

  clearDuress: async () => {
    set({ duressEnabled: false, duressPasswordHash: null, duressAction: 'hide' })
    await get()._persist()
  }
}))

export default useAppLockStore
