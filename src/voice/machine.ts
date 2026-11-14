// The Voice Mode state machine. Pure and DOM-free so the check suite can walk
// every edge. The HUD, the microphone and the speech engine all ask this what
// is allowed to happen next; nothing else decides.
//
// Echo guard by construction: once the assistant is thinking or speaking, the
// listening events do nothing. Listening again is only possible from idle.

export type VoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking'

export type VoiceEvent =
  | { type: 'ptt-start' }
  | { type: 'click-talk' }
  | { type: 'transcript' }
  | { type: 'reply-ready'; speak: boolean }
  | { type: 'speech-end' }
  | { type: 'cancel' }

export const ECHO_TAIL_MS = 750

const TRANSITIONS: Record<VoiceMode, Partial<Record<VoiceEvent['type'], (event: VoiceEvent) => VoiceMode>>> = {
  idle: {
    'ptt-start': () => 'listening',
    'click-talk': () => 'listening',
    // Esc in idle does nothing, but it is not an error either.
    cancel: () => 'idle',
  },
  listening: {
    // A recognised utterance (or an accepted silence timeout) sends the turn.
    transcript: () => 'thinking',
    cancel: () => 'idle',
  },
  thinking: {
    'reply-ready': (event) => ((event as { speak: boolean }).speak ? 'speaking' : 'idle'),
    cancel: () => 'idle',
  },
  speaking: {
    'speech-end': () => 'idle',
    cancel: () => 'idle',
  },
}

/** Reduce the machine. Unknown transitions are dropped (state unchanged). */
export function reduceVoiceMode(state: VoiceMode, event: VoiceEvent): VoiceMode {
  const table = TRANSITIONS[state]
  const step = table[event.type]
  return step ? step(event) : state
}

export function canListen(state: VoiceMode): boolean {
  return state === 'idle' || state === 'listening'
}

/** Echo guard: while the assistant is busy, the mic must stay shut. */
export function blocksListening(state: VoiceMode): boolean {
  return state === 'thinking' || state === 'speaking'
}

export function isBusy(state: VoiceMode): boolean {
  return state !== 'idle'
}

export const VOICE_MODES: VoiceMode[] = ['idle', 'listening', 'thinking', 'speaking']
