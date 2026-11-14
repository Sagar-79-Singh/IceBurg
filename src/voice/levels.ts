// A tiny mutable cell shared between the audio engines, the lip-sync plan and
// the canvas renderers. Kept outside React state on purpose: it is written and
// read every animation frame, and going through the store would repaint the
// whole HUD 60 times a second.

import type { MouthWeights } from './visemes.ts'

export const restingMouth = (): MouthWeights => ({ jaw: 0.03, round: 0, wide: 0.08, teeth: 0.3 })

export interface VoiceLevels {
  /** 0..1 microphone input level while LISTENING. */
  mic: number
  /** True while an assistant utterance is actively driving the mouth. */
  speaking: boolean
  /** Smoothed mouth shape, written by the lip-sync driver each frame. */
  mouth: MouthWeights
  /** 0..1 spectral-ish energy of the voice output, for the orb + waveform. */
  voiceEnergy: number
  /** Wall clock seconds, stamped by whoever drove the mouth last. */
  stampedAt: number
  /** 32 downsampled mic frequency bins, 0..255, refreshed while LISTENING. */
  spectrum: Uint8Array
  /** Wall-clock ms until which the face should glance down at the panel (new text). */
  glanceUntil: number
}

export const voiceLevels: VoiceLevels = {
  mic: 0,
  speaking: false,
  mouth: restingMouth(),
  voiceEnergy: 0,
  stampedAt: 0,
  spectrum: new Uint8Array(32),
  glanceUntil: 0,
}

export function resetVoiceLevels() {
  voiceLevels.mic = 0
  voiceLevels.speaking = false
  voiceLevels.mouth = restingMouth()
  voiceLevels.voiceEnergy = 0
  voiceLevels.stampedAt = 0
}
