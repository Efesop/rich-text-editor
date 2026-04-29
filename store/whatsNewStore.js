import { create } from 'zustand'

const STORAGE_KEY = 'dash-whats-new-version'

const useWhatsNewStore = create((set, get) => ({
  lastSeenVersion: null,
  isLoaded: false,

  loadData: async () => {
    try {
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        const data = await window.electron.invoke('read-whats-new')
        set({ lastSeenVersion: data?.lastSeenVersion || null, isLoaded: true })
      } else {
        const stored = localStorage.getItem(STORAGE_KEY)
        set({ lastSeenVersion: stored || null, isLoaded: true })
      }
    } catch (error) {
      console.error('Error loading whats-new data:', error)
      set({ isLoaded: true })
    }
  },

  shouldShow: (currentVersion) => {
    const { lastSeenVersion, isLoaded } = get()
    if (!isLoaded) return false
    if (!currentVersion) return false
    return lastSeenVersion !== currentVersion
  },

  dismiss: async (version) => {
    set({ lastSeenVersion: version })
    try {
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        // Read-then-merge so we don't clobber sibling keys (featuresTooltipSeen, etc.)
        const existing = await window.electron.invoke('read-whats-new')
        await window.electron.invoke('save-whats-new', { ...(existing || {}), lastSeenVersion: version })
      } else {
        localStorage.setItem(STORAGE_KEY, version)
      }
    } catch (error) {
      console.error('Error saving whats-new data:', error)
    }
  }
}))

export default useWhatsNewStore
