import { create } from 'zustand'
import { storage } from './bridge.js'

// Theme lives on <html data-theme> so every token resolves without a re-render.
export const useTheme = create((set) => ({
  theme: 'dark',

  async load() {
    const saved = await storage.read('settings')
    const theme = saved?.theme === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    set({ theme })
  },

  set(theme) {
    document.documentElement.dataset.theme = theme
    set({ theme })
  },
}))
