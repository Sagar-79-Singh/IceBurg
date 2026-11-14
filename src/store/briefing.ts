// Session state for the startup briefing: what phase it is in and which
// headlines came back. Never persisted, resets every launch. The orchestration
// lives in voice/briefing.ts; components render what's here.

import { create } from 'zustand'
import type { NewsHeadline } from '../../shared/ipc.ts'

export type BriefingPhase = 'idle' | 'greeting' | 'news' | 'error'

export interface BriefingSessionState {
  /** idle: nothing to show · greeting: fetching while the hello plays · news: headline list is up · error: fetch failed */
  phase: BriefingPhase
  items: NewsHeadline[]
  /** Shown under the list, so "on screen" is honest even when speech is off. */
  message: string | null
  begin(phase: BriefingPhase): void
  setItems(items: NewsHeadline[], message?: string | null): void
  fail(message: string): void
  dismiss(): void
}

export const useBriefing = create<BriefingSessionState>()((set) => ({
  phase: 'idle',
  items: [],
  message: null,

  begin(phase) {
    set({ phase, items: [], message: null })
  },
  setItems(items, message = null) {
    set({ phase: 'news', items, message })
  },
  fail(message) {
    set({ phase: 'error', items: [], message })
  },
  dismiss() {
    set({ phase: 'idle', items: [], message: null })
  },
}))
