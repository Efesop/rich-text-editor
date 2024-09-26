import { create } from 'zustand'

const useTagStore = create((set) => ({
  tags: [],
  addTag: (tag) => set((state) => {
    if (!state.tags.some(t => t.name === tag.name)) {
      return { tags: [...state.tags, tag] }
    }
    return state
  }),
  removeTag: (tagName) => set((state) => ({
    tags: state.tags.filter(t => t.name !== tagName)
  })),
  updateTag: (oldName, newTag) => set((state) => ({
    tags: state.tags.map(t => t.name === oldName ? newTag : t)
  })),
}))

export default useTagStore
