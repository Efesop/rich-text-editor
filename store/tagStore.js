import { create } from 'zustand'

const useTagStore = create((set, get) => ({
  tags: [], // Initialize with an empty array
  pages: [], // Add a pages array to store all pages
  addTag: (tag) => set((state) => ({ tags: [...state.tags, tag] })),
  removeTag: (tag) => set((state) => ({ tags: state.tags.filter((t) => t !== tag) })),
  deleteTag: (tag) => set((state) => {
    const updatedPages = state.pages.map(page => ({
      ...page,
      tags: page.tags.filter(t => t !== tag)
    }));
    return {
      tags: state.tags.filter((t) => t !== tag),
      pages: updatedPages
    };
  }),
  setPages: (pages) => set({ pages }),
}))

export default useTagStore
