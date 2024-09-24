import { create } from 'zustand'

const useTagStore = create((set, get) => ({
  tags: [], // Array of unique global tags
  addTag: (tag) => set((state) => ({
    tags: state.tags.includes(tag) ? state.tags : [...state.tags, tag]
  })),
  removeTag: (tag) => set((state) => ({
    tags: state.tags.filter((t) => t !== tag)
  })),
  setTags: (tags) => set({ tags }),
}))

export default useTagStore
