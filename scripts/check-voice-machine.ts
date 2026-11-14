// Walks the Voice Mode state machine exhaustively: the full truth table, the
// echo-guard invariant, cancel semantics, and a long random fuzz to prove the
// machine can never land outside its states.
import assert from 'node:assert/strict'
import {
  reduceVoiceMode,
  canListen,
  blocksListening,
  isBusy,
  VOICE_MODES,
  type VoiceMode,
  type VoiceEvent,
} from '../src/voice/machine.ts'

const EVENTS: VoiceEvent[] = [
  { type: 'ptt-start' },
  { type: 'click-talk' },
  { type: 'transcript' },
  { type: 'reply-ready', speak: true },
  { type: 'reply-ready', speak: false },
  { type: 'speech-end' },
  { type: 'cancel' },
]

/* The truth table, spelled out. */
const TABLE: Record<VoiceMode, Record<string, VoiceMode>> = {
  idle: {
    'ptt-start': 'listening',
    'click-talk': 'listening',
    transcript: 'idle',
    'reply-ready:true': 'idle',
    'reply-ready:false': 'idle',
    'speech-end': 'idle',
    cancel: 'idle',
  },
  listening: {
    'ptt-start': 'listening',
    'click-talk': 'listening',
    transcript: 'thinking',
    'reply-ready:true': 'listening',
    'reply-ready:false': 'listening',
    'speech-end': 'listening',
    cancel: 'idle',
  },
  thinking: {
    'ptt-start': 'thinking', // echo guard: listening is refused
    'click-talk': 'thinking',
    transcript: 'thinking',
    'reply-ready:true': 'speaking',
    'reply-ready:false': 'idle',
    'speech-end': 'thinking',
    cancel: 'idle',
  },
  speaking: {
    'ptt-start': 'speaking', // echo guard: listening is refused
    'click-talk': 'speaking',
    transcript: 'speaking',
    'reply-ready:true': 'speaking',
    'reply-ready:false': 'speaking',
    'speech-end': 'idle',
    cancel: 'idle',
  },
}

const eventKey = (event: VoiceEvent): string =>
  event.type === 'reply-ready' ? `reply-ready:${(event as { speak: boolean }).speak}` : event.type

for (const from of VOICE_MODES) {
  for (const event of EVENTS) {
    const expected = TABLE[from][eventKey(event)]!
    const actual = reduceVoiceMode(from, event)
    assert.equal(actual, expected, `${from} + ${eventKey(event)} should be ${expected}, got ${actual}`)
  }
}

/* Echo guard, stated as invariants over single events. */
for (const state of VOICE_MODES) {
  for (const event of [{ type: 'ptt-start' } as VoiceEvent, { type: 'click-talk' } as VoiceEvent]) {
    if (blocksListening(state)) {
      assert.equal(reduceVoiceMode(state, event), state, 'a busy assistant never opens the mic')
    } else {
      assert.equal(reduceVoiceMode(state, event), 'listening')
    }
  }
}

/* No event can move the machine INTO listening from thinking or speaking. */
for (const state of VOICE_MODES) {
  for (const event of EVENTS) {
    if (blocksListening(state)) {
      assert.notEqual(reduceVoiceMode(state, event), 'listening', `${state} + ${eventKey(event)} can never open the mic`)
    }
  }
}
/* And the states where listening IS legal agree with canListen. */
assert.deepEqual(VOICE_MODES.filter(canListen), ['idle', 'listening'])

/* Cancel lands in idle from everywhere, always. */
for (const state of VOICE_MODES) {
  assert.equal(reduceVoiceMode(state, { type: 'cancel' }), 'idle')
}

/* isBusy / canListen agree with the states. */
assert.equal(canListen('idle'), true)
assert.equal(canListen('listening'), true)
assert.equal(canListen('thinking'), false)
assert.equal(canListen('speaking'), false)
assert.equal(isBusy('idle'), false)
assert.equal(isBusy('listening'), true)
assert.equal(blocksListening('thinking'), true)
assert.equal(blocksListening('speaking'), true)
assert.equal(blocksListening('idle'), false)

/* A full happy-path conversation: idle -> listening -> thinking -> speaking -> idle. */
let mode: VoiceMode = 'idle'
mode = reduceVoiceMode(mode, { type: 'ptt-start' })
assert.equal(mode, 'listening')
mode = reduceVoiceMode(mode, { type: 'transcript' })
assert.equal(mode, 'thinking')
mode = reduceVoiceMode(mode, { type: 'reply-ready', speak: true })
assert.equal(mode, 'speaking')
mode = reduceVoiceMode(mode, { type: 'speech-end' })
assert.equal(mode, 'idle')

/* Fuzz: no sequence of events ever produces an out-of-set state. */
let seed = 123456789
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
for (let round = 0; round < 5000; round++) {
  let fuzzMode: VoiceMode = 'idle'
  const steps = 1 + Math.floor(rand() * 40)
  for (let step = 0; step < steps; step++) {
    const event = EVENTS[Math.floor(rand() * EVENTS.length)]!
    fuzzMode = reduceVoiceMode(fuzzMode, event)
    assert.ok(VOICE_MODES.includes(fuzzMode), 'machine escaped its state set')
    // The mic must never be open while the assistant thinks or speaks.
    if (blocksListening(fuzzMode)) assert.notEqual(fuzzMode, 'listening')
  }
}

console.log('voice machine ok: truth table, echo guard, cancel, and 5000 fuzz walks all hold')
