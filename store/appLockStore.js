import { create } from 'zustand'
import bcrypt from 'bcryptjs'

const useAppLockStore = create((set, get) => ({
  isEnabled: false,
  timeoutMinutes: 5,
  passwordHash: null,
  isLocked: false,
  biometricEnabled: false,
  isLoaded: false,

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
          isLocked: data.isEnabled || false, // Lock on launch if enabled
          isLoaded: true
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
    const { isEnabled, timeoutMinutes, passwordHash, biometricEnabled } = get()
    const data = { isEnabled, timeoutMinutes, passwordHash, biometricEnabled }
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

  enable: async (password, timeoutMinutes, biometricEnabled = false) => {
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(password, salt)
    set({
      isEnabled: true,
      timeoutMinutes,
      passwordHash: hash,
      biometricEnabled
    })
    await get()._persist()
  },

  disable: async () => {
    set({
      isEnabled: false,
      timeoutMinutes: 5,
      passwordHash: null,
      biometricEnabled: false,
      isLocked: false
    })
    await get()._persist()
  },

  lock: () => {
    const { isEnabled } = get()
    if (isEnabled) {
      set({ isLocked: true })
    }
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
  }
}))

export default useAppLockStore
