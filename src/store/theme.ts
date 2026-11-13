import { create } from 'zustand'
import type { ThemeName } from '../../shared/ipc.ts'
import { storage } from './bridge.ts'

// Theme lives on <html data-theme> so every token resolves without a re-render.
interface ThemeState {
  theme: ThemeName
  load(): Promise<void>
  set(theme: ThemeName): void
}

export const useTheme = create<ThemeState>()((set) => ({
  theme: 'dark',

  async load() {
    const saved = (await storage.read<{ theme?: string }>('settings'))?.theme
    const theme: ThemeName = saved === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    set({ theme })
  },

  set(theme: ThemeName) {
    document.documentElement.dataset.theme = theme
    set({ theme })
  },
}))
