// Session state for Voice Mode. Nothing here is persisted — face mode, voice,
// rate and friends live in AppSettings — but the machine state, panel/drawer
// layout and mute toggle are session-scoped and intentionally reset.

import { create } from 'zustand'
import { reduceVoiceMode, type VoiceEvent, type VoiceMode } from '../voice/machine.ts'

export type ListeningSource = 'ptt' | 'click' | null

export interface VoiceSessionState {
  open: boolean
  panelOpen: boolean
  drawerOpen: boolean
  mode: VoiceMode
  /** Session-only: spoken replies paused, without touching settings. */
  muted: boolean
  listeningSource: ListeningSource
  /** The download-consent dialog is showing. */
  consentOpen: boolean
  openVoice(): void
  closeVoice(): void
  togglePanel(): void
  toggleDrawer(): void
  setMuted(muted: boolean): void
  setListeningSource(source: ListeningSource): void
  setConsentOpen(open: boolean): void
  dispatch(event: VoiceEvent): void
  /** Direct set, used when the pipeline settles without a machine edge (e.g. empty transcript). */
  setMode(mode: VoiceMode): void
}

/** Teardown hook: the controller registers mic/speech cleanup here to avoid an import cycle. */
let teardown: (() => void) | null = null
export function registerVoiceTeardown(fn: () => void): () => void {
  teardown = fn
  return () => {
    if (teardown === fn) teardown = null
  }
}

export const useVoice = create<VoiceSessionState>()((set) => ({
  open: false,
  panelOpen: true,
  drawerOpen: false,
  mode: 'idle',
  muted: false,
  listeningSource: null,
  consentOpen: false,

  openVoice() {
    set({ open: true })
  },
  closeVoice() {
    // Esc/close cuts everything: mic ring, worklet, in-flight speech.
    teardown?.()
    set({ open: false, drawerOpen: false, consentOpen: false, mode: 'idle', listeningSource: null })
  },
  togglePanel() {
    set((state) => ({ panelOpen: !state.panelOpen }))
  },
  toggleDrawer() {
    set((state) => ({ drawerOpen: !state.drawerOpen }))
  },
  setMuted(muted: boolean) {
    set({ muted })
  },
  setListeningSource(listeningSource: ListeningSource) {
    set({ listeningSource })
  },
  setConsentOpen(consentOpen: boolean) {
    set({ consentOpen })
  },
  dispatch(event: VoiceEvent) {
    set((state) => ({ mode: reduceVoiceMode(state.mode, event) }))
  },
  setMode(mode: VoiceMode) {
    set({ mode })
  },
}))
