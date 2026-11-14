// Thin layer over window.speechSynthesis. Owns the utterance lifecycle and the
// per-frame mouth drive: boundary events resync the plan when the engine emits
// them, otherwise timing comes from the rate we planned with.
//
// Mouth movement happens ONLY here and ONLY while an utterance is live. When
// nothing is speaking, the waveform and the face fall back to their resting
// shapes and this module does no animation work.

import {
  stripForSpeech,
  planVisemes,
  samplePlan,
  smoothWeights,
  boundaryOffset,
  type VisemeEvent,
} from './visemes.ts'
import { voiceLevels, restingMouth } from './levels.ts'

export interface SpeakOptions {
  voiceURI?: string
  /** 0.5 .. 2 */
  rate?: number
  onStart?: () => void
  onEnd?: () => void
}

export function speechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return []
  try {
    return window.speechSynthesis.getVoices() || []
  } catch {
    return []
  }
}

export function onVoicesChanged(callback: () => void): () => void {
  if (!speechAvailable()) return () => {}
  const synth = window.speechSynthesis
  synth.addEventListener('voiceschanged', callback)
  // Some engines (Linux eSpeak) only populate after a first call.
  synth.getVoices()
  return () => synth.removeEventListener('voiceschanged', callback)
}

interface LiveUtterance {
  utterance: SpeechSynthesisUtterance
  events: VisemeEvent[]
  startedAtMs: number
  /** planTime = wall - startedAt + clockOffset (set by boundary resync). */
  clockOffset: number
  raf: number | null
  finished: boolean
  onEnd?: () => void
}

let live: LiveUtterance | null = null

const clampRate = (rate: number | undefined): number => {
  const n = Number(rate)
  if (!Number.isFinite(n)) return 1
  return Math.min(2, Math.max(0.5, n))
}

const wallSeconds = (utterance: LiveUtterance): number => (performance.now() - utterance.startedAtMs) / 1000

function drive() {
  if (!live || live.finished) return
  const elapsed = wallSeconds(live) + live.clockOffset
  const target = samplePlan(live.events, Math.max(0, elapsed))
  voiceLevels.mouth = smoothWeights(voiceLevels.mouth, target, 1 / 60)
  // Spectrum input for the orb: jaw height plus a little sibilance. A low,
  // speech-like hum keeps the ring alive between syllables.
  const jaw = voiceLevels.mouth.jaw
  voiceLevels.voiceEnergy = Math.min(1, jaw * 1.15 + voiceLevels.mouth.teeth * 0.18)
  voiceLevels.stampedAt = performance.now()
  live.raf = requestAnimationFrame(drive)
}

function finish() {
  const current = live
  if (!current || current.finished) return
  current.finished = true
  if (current.raf !== null) cancelAnimationFrame(current.raf)
  live = null
  voiceLevels.speaking = false
  voiceLevels.voiceEnergy = 0
  // Ease the mouth back to rest over a few frames rather than snapping shut.
  const mouthAtFinish = { ...voiceLevels.mouth }
  const rest = restingMouth()
  const t0 = performance.now()
  const settle = () => {
    const k = Math.min(1, (performance.now() - t0) / 240)
    const inv = 1 - k
    voiceLevels.mouth = {
      jaw: mouthAtFinish.jaw * inv + rest.jaw * k,
      round: mouthAtFinish.round * inv + rest.round * k,
      wide: mouthAtFinish.wide * inv + rest.wide * k,
      teeth: mouthAtFinish.teeth * inv + rest.teeth * k,
    }
    if (k < 1) requestAnimationFrame(settle)
  }
  requestAnimationFrame(settle)
  current.onEnd?.()
}

/**
 * Speak `text` (markdown stripped, emoji removed, code dropped). Returns false
 * when speechSynthesis is unavailable or nothing printable remains, so callers
 * can fall back to the panel.
 */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!speechAvailable()) return false
  const spoken = stripForSpeech(text).replace(/\s+/g, ' ').trim()
  if (!spoken) return false

  cancelSpeech()

  const rate = clampRate(options.rate)
  const events = planVisemes(spoken, rate)
  const utterance = new window.SpeechSynthesisUtterance(spoken)
  utterance.rate = rate
  const voices = listVoices()
  if (options.voiceURI) {
    const match = voices.find((voice) => voice.voiceURI === options.voiceURI)
    if (match) utterance.voice = match
  }
  const record: LiveUtterance = {
    utterance,
    events,
    startedAtMs: performance.now(),
    clockOffset: 0,
    raf: null,
    finished: false,
    onEnd: options.onEnd,
  }

  utterance.addEventListener('start', () => {
    record.startedAtMs = performance.now()
    record.clockOffset = 0
    voiceLevels.speaking = true
  })
  utterance.addEventListener('boundary', (event: SpeechSynthesisEvent) => {
    const charIndex = (event as SpeechSynthesisEvent & { charIndex?: number }).charIndex
    if (typeof charIndex !== 'number') return
    record.clockOffset = boundaryOffset(record.events, charIndex, wallSeconds(record))
  })
  utterance.addEventListener('end', () => finish())
  utterance.addEventListener('error', () => finish())

  live = record
  voiceLevels.speaking = true
  record.raf = requestAnimationFrame(drive)
  try {
    window.speechSynthesis.speak(utterance)
  } catch {
    finish()
    return false
  }
  options.onStart?.()
  return true
}

/** Cut speech immediately. Safe to call at any time. */
export function cancelSpeech(): void {
  if (speechAvailable()) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // some engines throw when idle; cancelling is still a no-op then
    }
  }
  finish()
}

export function isSpeaking(): boolean {
  return live !== null && !live.finished
}
