import { create } from 'zustand'
import { readTags as readTagsFallback, saveTags as saveTagsFallback } from '@/lib/storage'

const useTagStore = create((set, get) => ({
  tags: [],
  isLoaded: false,
  addTag: (tag) => {
    set((state) => {
      const trimmedTag = { ...tag, name: tag.name.slice(0, 15) };
      if (!state.tags.some(t => t.name === trimmedTag.name)) {
        const newTags = [...state.tags, trimmedTag];
        get().saveTags(newTags); // Save all tags
        return { tags: newTags };
      }
      return state;
    });
  },
  removeTag: (tagName) => {
    set((state) => {
      const newTags = state.tags.filter(t => t.name !== tagName);
      get().saveTags(newTags); // Save all tags
      return { tags: newTags };
    });
  },
  updateTag: (oldName, newTag) => {
    set((state) => {
      const newTags = state.tags.map(t => t.name === oldName ? newTag : t);
      get().saveTags(newTags); // Save all tags
      return { tags: newTags };
    });
  },
  loadTags: async () => {
    try {
      const loadedTags = (typeof window !== 'undefined' && window.electron?.invoke)
        ? await window.electron.invoke('read-tags')
        : await readTagsFallback()
      set({ tags: loadedTags, isLoaded: true });
    } catch (error) {
      console.error('Error loading tags:', error);
      set({ isLoaded: true });
    }
  },
  saveTags: async (tags) => {
    try {
      const op = (typeof window !== 'undefined' && window.electron?.invoke)
        ? window.electron.invoke('save-tags', tags)
        : saveTagsFallback(tags)
      await op
    } catch (error) {
      console.error('Error saving tags:', error);
    }
  },
}));

export default useTagStore;