import { create } from 'zustand'

const useTagStore = create((set, get) => ({
  tags: [], // This will store all unique tags across all pages
  pages: [],
  addTag: (tag) => set((state) => ({ 
    tags: state.tags.includes(tag) ? state.tags : [...state.tags, tag] 
  })),
  removeTag: (tag) => set((state) => ({ 
    tags: state.tags.filter((t) => t !== tag),
    pages: state.pages.map(page => ({
      ...page,
      tags: page.tags ? page.tags.filter(t => t !== tag) : []
    }))
  })),
  deleteTag: (tag) => set((state) => {
    const updatedPages = state.pages.map(page => ({
      ...page,
      tags: page.tags ? page.tags.filter(t => t !== tag) : []
    }));
    return {
      tags: state.tags.filter((t) => t !== tag),
      pages: updatedPages
    };
  }),
  setPages: (pages) => set((state) => {
    const allTags = [...new Set(pages.flatMap(page => page.tags || []))];
    return { pages, tags: allTags };
  }),
}))

export default useTagStore
