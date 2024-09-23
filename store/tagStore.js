import { create } from 'zustand'

const useTagStore = create((set) => ({
  tags: ['Tag1', 'Tag2', 'Tag3'], // Example existing tags
  addTag: (tag) => set((state) => ({ tags: [...state.tags, tag] })),
  removeTag: (tag) => set((state) => ({ tags: state.tags.filter((t) => t !== tag) })),
  deleteTag: (tag) => set((state) => ({ tags: state.tags.filter((t) => t !== tag) })),
}))

export default useTagStore
