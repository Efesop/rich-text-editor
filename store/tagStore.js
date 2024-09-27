import { create } from 'zustand'

const useTagStore = create((set, get) => ({
  tags: [],
  isLoaded: false,
  addTag: (tag) => {
    set((state) => {
      if (!state.tags.some(t => t.name === tag.name)) {
        const newTags = [...state.tags, tag];
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
      const loadedTags = await window.electron.invoke('read-tags');
      set({ tags: loadedTags, isLoaded: true });
    } catch (error) {
      console.error('Error loading tags:', error);
      set({ isLoaded: true });
    }
  },
  saveTags: async (tags) => {
    try {
      console.log('Saving tags:', tags); // Add this line
      await window.electron.invoke('save-tags', tags);
    } catch (error) {
      console.error('Error saving tags:', error);
    }
  },
}));

export default useTagStore;
