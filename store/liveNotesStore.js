import { create } from 'zustand'

const STORAGE_KEY = 'dash-live-notes'

/**
 * Zustand store for Live Notes state
 *
 * Manages:
 * - Active live session state (room, participants, status)
 * - Subscribed notes (read-only notes from others)
 * - Edit request notifications
 * - Shared document metadata (which docs are being auto-synced)
 */
const useLiveNotesStore = create((set, get) => ({
  // ── Active Session ────────────────────────────────────────────
  activeSession: null, // { roomId, keyStr, docId, pageId, isHost, link }
  sessionStatus: 'disconnected', // 'connecting' | 'connected' | 'disconnected' | 'error'
  participants: 0,

  setActiveSession: (session) => set({ activeSession: session }),
  setSessionStatus: (status) => set({ sessionStatus: status }),
  setParticipants: (count) => set({ participants: count }),

  clearSession: () => set({
    activeSession: null,
    sessionStatus: 'disconnected',
    participants: 0,
  }),

  // ── Subscribed Notes ──────────────────────────────────────────
  // Notes shared with this user (read-only, auto-updating)
  subscribedNotes: [],
  // { docId, keyStr, title, content, updatedAt, hostAlias, pageId (local) }
  isLoaded: false,

  loadSubscribedNotes: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      const notes = data ? JSON.parse(data) : []
      set({ subscribedNotes: Array.isArray(notes) ? notes : [], isLoaded: true })
    } catch {
      set({ subscribedNotes: [], isLoaded: true })
    }
  },

  _persist: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().subscribedNotes))
    } catch { /* ignore */ }
  },

  addSubscribedNote: (note) => {
    const { subscribedNotes } = get()
    // Don't duplicate
    if (subscribedNotes.some(n => n.docId === note.docId)) return
    const updated = [...subscribedNotes, {
      docId: note.docId,
      keyStr: note.keyStr,
      title: note.title || 'Untitled',
      content: note.content || null,
      updatedAt: note.updatedAt || Date.now(),
      hostAlias: note.hostAlias || 'Unknown',
      pageId: note.pageId || null,
    }]
    set({ subscribedNotes: updated })
    get()._persist()
  },

  updateSubscribedNote: (docId, updates) => {
    const updated = get().subscribedNotes.map(n =>
      n.docId === docId ? { ...n, ...updates } : n
    )
    set({ subscribedNotes: updated })
    get()._persist()
  },

  removeSubscribedNote: (docId) => {
    const updated = get().subscribedNotes.filter(n => n.docId !== docId)
    set({ subscribedNotes: updated })
    get()._persist()
  },

  // ── Shared Documents (host side) ─────────────────────────────
  // Docs this user is hosting (auto-syncing to guests)
  sharedDocs: [],
  // { docId, keyStr, pageId, guestAliases: [] }

  loadSharedDocs: () => {
    try {
      const data = localStorage.getItem('dash-shared-docs')
      const docs = data ? JSON.parse(data) : []
      set({ sharedDocs: Array.isArray(docs) ? docs : [] })
    } catch {
      set({ sharedDocs: [] })
    }
  },

  _persistSharedDocs: () => {
    try {
      localStorage.setItem('dash-shared-docs', JSON.stringify(get().sharedDocs))
    } catch { /* ignore */ }
  },

  addSharedDoc: (doc) => {
    const { sharedDocs } = get()
    if (sharedDocs.some(d => d.docId === doc.docId)) return
    const updated = [...sharedDocs, {
      docId: doc.docId,
      keyStr: doc.keyStr,
      pageId: doc.pageId,
      guestAliases: doc.guestAliases || [],
    }]
    set({ sharedDocs: updated })
    get()._persistSharedDocs()
  },

  removeSharedDoc: (docId) => {
    const updated = get().sharedDocs.filter(d => d.docId !== docId)
    set({ sharedDocs: updated })
    get()._persistSharedDocs()
  },

  getSharedDocForPage: (pageId) => {
    return get().sharedDocs.find(d => d.pageId === pageId) || null
  },

  // ── Edit Request Notifications ────────────────────────────────
  editRequests: [],
  // { id, docId, alias, timestamp, pageId, title }

  addEditRequest: (request) => {
    const { editRequests } = get()
    if (editRequests.some(r => r.id === request.id)) return
    set({ editRequests: [...editRequests, request] })
  },

  dismissEditRequest: (requestId) => {
    const updated = get().editRequests.filter(r => r.id !== requestId)
    set({ editRequests: updated })
  },

  clearEditRequests: (docId) => {
    const updated = get().editRequests.filter(r => r.docId !== docId)
    set({ editRequests: updated })
  },

  hasNotifications: () => {
    return get().editRequests.length > 0
  },
}))

export default useLiveNotesStore
