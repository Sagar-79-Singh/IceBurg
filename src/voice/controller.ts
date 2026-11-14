// Orchestrates Voice Mode end to end: microphone, local Whisper, the chat
// store, speech output and the HUD state machine. Components stay dumb — they
// call the functions here and render what the stores say.

import { useVoice, registerVoiceTeardown } from '../store/voice.ts'
import { useBriefing } from '../store/briefing.ts'
import { useChat } from '../store/chat.ts'
import { useSettings } from '../store/settings.ts'
import { openMic, type MicSession } from './mic.ts'
import { stt } from './stt.ts'
import { speak, cancelSpeech } from './speech.ts'
import { stripForSpeech } from './visemes.ts'
import { canListen, ECHO_TAIL_MS } from './machine.ts'
import { cancelBriefing } from './briefing.ts'
import { voiceLevels } from './levels.ts'
import { VOICE_REPLY_INSTRUCTION, translate } from '../lib/i18n.ts'
import { toast } from '../components/Toasts.tsx'

const SILENCE_END_MS = 1500
const NO_SPEECH_TIMEOUT_MS = 6000
const HARD_CAP_MS = 45000
const LEVEL_HEARD = 0.055

let session: MicSession | null = null
let openedAt = 0
let lastVoiceAt = 0
let heardVoice = false
let watchdog: ReturnType<typeof setInterval> | null = null
let pttActive = false
/** Which gesture asked for the download, so the consent dialog can resume it. */
let pendingGesture: 'ptt' | 'click' | null = null
let lastSpeechEndAt = 0
/** Bumped whenever the user cancels: stale transcriptions are dropped, not sent. */
let epoch = 0

const t = (key: string) => translate(useSettings.getState().settings.language, key)

function clearWatchdog() {
  if (watchdog) clearInterval(watchdog)
  watchdog = null
}

function stopTracks() {
  clearWatchdog()
  const active = session
  session = null
  if (active) void active.stop()
}

function startWatchdog() {
  clearWatchdog()
  watchdog = setInterval(() => {
    const now = performance.now()
    if (voiceLevels.mic > LEVEL_HEARD) {
      heardVoice = true
      lastVoiceAt = now
    }
    const silentFor = now - lastVoiceAt
    const openFor = now - openedAt
    if ((heardVoice && silentFor > SILENCE_END_MS) || (!heardVoice && openFor > NO_SPEECH_TIMEOUT_MS) || openFor > HARD_CAP_MS) {
      void stopListeningAndTranscribe()
    }
  }, 120)
}

/** Open the mic and start listening. Assumes every gate already passed. */
async function openSession(source: 'ptt' | 'click') {
  if (session) return
  if (!useVoice.getState().open) return // the HUD closed while the model downloaded
  try {
    session = await openMic({ deviceId: useSettings.getState().settings.voiceInputDeviceId || undefined })
  } catch (error) {
    console.warn('[iceburg] microphone refused', error)
    toast(t('voice_mic_denied'))
    useVoice.getState().setListeningSource(null)
    if (useVoice.getState().mode === 'listening') useVoice.getState().setMode('idle')
    return
  }
  heardVoice = false
  openedAt = performance.now()
  lastVoiceAt = openedAt
  useVoice.getState().setListeningSource(source)
  useVoice.getState().dispatch(source === 'ptt' ? { type: 'ptt-start' } : { type: 'click-talk' })
  startWatchdog()
}

/** Begin listening, downloading the local Whisper model first if needed. */
export async function startListening(source: 'ptt' | 'click'): Promise<void> {
  const voice = useVoice.getState()
  if (!voice.open) return
  if (voice.mode === 'listening') return
  if (!canListen(voice.mode)) {
    toast(t('voice_still_speaking'))
    return
  }
  // Echo guard: the mic stays shut while the assistant speaks, and for a
  // moment after, so it never hears its own voice.
  if (performance.now() - lastSpeechEndAt < ECHO_TAIL_MS) return

  const settings = useSettings.getState().settings
  if (stt.isReady()) {
    await openSession(source)
    return
  }
  if (!settings.voiceSttConsent) {
    pendingGesture = source
    voice.setConsentOpen(true)
    return
  }
  // Consent given before: load if needed, then listen.
  stt.load()
  const unsubscribe = stt.subscribe((snapshot) => {
    if (snapshot.status === 'ready') {
      unsubscribe()
      void openSession(source)
    } else if (snapshot.status === 'error') {
      unsubscribe()
      toast(t('voice_stt_error'))
    }
  })
}

/** The consent dialog was accepted: download the model, then start listening. */
export function consentAndListen(): void {
  useSettings.getState().update({ voiceSttConsent: true })
  useVoice.getState().setConsentOpen(false)
  const source = pendingGesture ?? 'click'
  pendingGesture = null
  stt.load()
  const unsubscribe = stt.subscribe((snapshot) => {
    if (snapshot.status === 'ready') {
      unsubscribe()
      void openSession(source)
    } else if (snapshot.status === 'error') {
      unsubscribe()
      toast(t('voice_stt_error'))
    }
  })
}

/** Stop listening; transcribe and send if there is anything to send. */
export async function stopListeningAndTranscribe(): Promise<void> {
  clearWatchdog()
  const active = session
  session = null
  const voice = useVoice.getState()
  voice.setListeningSource(null)
  pttActive = false
  const audio = active ? await active.stop() : null
  if (!audio || !heardVoice) {
    if (voice.mode === 'listening') voice.dispatch({ type: 'cancel' })
    if (audio && !heardVoice) toast(t('voice_nothing_heard'))
    return
  }
  // listening → thinking happens here, once there is something to think about.
  if (voice.mode === 'listening') voice.dispatch({ type: 'transcript' })
  const myEpoch = epoch
  try {
    const language = useSettings.getState().settings.voiceSttLanguage
    const text = (await stt.transcribe(audio, language)).trim()
    if (myEpoch !== epoch) return // the user cancelled while Whisper was working
    if (!text) {
      toast(t('voice_nothing_heard'))
      useVoice.getState().setMode('idle')
      return
    }
    await sendVoiceMessage(text)
  } catch {
    toast(t('voice_stt_error'))
    useVoice.getState().setMode('idle')
  }
}

/** Esc / interrupt: drop anything being captured, say nothing. */
export function cancelListening(): void {
  epoch += 1
  pttActive = false
  stopTracks()
  const voice = useVoice.getState()
  voice.setListeningSource(null)
  if (voice.mode === 'listening' || voice.mode === 'thinking') voice.dispatch({ type: 'cancel' })
}

/** Cancel everything in flight — Esc's job. */
export function stopEverything(): void {
  epoch += 1
  pttActive = false
  stopTracks()
  cancelSpeech()
  const voice = useVoice.getState()
  voice.setListeningSource(null)
  if (voice.mode !== 'idle') voice.dispatch({ type: 'cancel' })
  useChat.getState().stop()
}

/** Send a message from Voice Mode (typed or transcribed). */
export async function sendVoiceMessage(text: string): Promise<void> {
  const prompt = String(text || '').trim()
  if (!prompt) return
  const voice = useVoice.getState()
  // Anyone who sends text while the mic is open: the mic session is dropped.
  if (voice.mode === 'listening') {
    stopTracks()
    voice.setListeningSource(null)
  }
  useVoice.getState().setMode('thinking')
  const result = await useChat.getState().send(prompt, { systemAppend: VOICE_REPLY_INSTRUCTION })
  if (result?.reason === 'tool') {
    // Computer tasks answer synchronously and bypass the stream watcher.
    handleCompletedReply()
    return
  }
  if (result && !result.ok && result.reason !== 'busy') {
    useVoice.getState().setMode('idle')
  }
  // 'busy' means another answer was already streaming; we await nothing, and
  // the in-flight reply will be spoken through the stream watcher instead.
}

const LONG_REPLY_CHARS = 420

/**
 * A reply from the active chat just finished. Speak it, unless the user asked
 * for silence, it errored, was stopped, is empty, or deserves the panel.
 */
export function handleCompletedReply(): void {
  const voice = useVoice.getState()
  if (!voice.open || voice.mode !== 'thinking') return
  const settings = useSettings.getState().settings
  const chatState = useChat.getState()
  const chat = chatState.chats.find((candidate) => candidate.id === chatState.activeId) || null
  const last = chat?.messages[chat.messages.length - 1]

  const speakIt =
    settings.voiceSpeakReplies &&
    !voice.muted &&
    last?.role === 'assistant' &&
    !last.error &&
    !last.stopped &&
    Boolean((last?.content || '').trim())

  if (!speakIt || !last) {
    useVoice.getState().dispatch({ type: 'reply-ready', speak: false })
    return
  }

  const raw = last.content
  const clean = stripForSpeech(raw).replace(/\s+/g, ' ').trim()
  const needsPanel = /```/.test(raw) || clean.length > LONG_REPLY_CHARS
  const line = needsPanel ? translate(settings.language, 'voice_spoken_overflow') : clean

  const speaks = speak(line, {
    voiceURI: settings.voiceVoiceURI,
    rate: settings.voiceRate,
    onEnd: () => {
      lastSpeechEndAt = performance.now()
      const now = useVoice.getState()
      if (now.mode === 'speaking') now.dispatch({ type: 'speech-end' })
    },
  })
  if (speaks) {
    useVoice.getState().dispatch({ type: 'reply-ready', speak: true })
  } else {
    useVoice.getState().dispatch({ type: 'reply-ready', speak: false })
  }
}

/* ---- push-to-talk (Ctrl+Space) ---- */
export function pttKeyDown(): void {
  if (pttActive) return
  pttActive = true
  void startListening('ptt')
}
export function pttKeyUp(): void {
  if (!pttActive) return
  pttActive = false
  const voice = useVoice.getState()
  if (voice.mode === 'listening' && voice.listeningSource === 'ptt') {
    void stopListeningAndTranscribe()
  }
}

/** Hands-free toggle for the mic button / clicking the face. */
export function toggleHandsFree(): void {
  const voice = useVoice.getState()
  if (voice.mode === 'listening' && voice.listeningSource === 'click') {
    void stopListeningAndTranscribe()
    return
  }
  void startListening('click')
}

/* ---- teardown on close ---- */
registerVoiceTeardown(() => {
  pttActive = false
  clearWatchdog()
  cancelBriefing()
  useBriefing.getState().dismiss()
  const active = session
  session = null
  if (active) void active.stop()
  cancelSpeech()
  resetMeters()
})

function resetMeters() {
  voiceLevels.mic = 0
  voiceLevels.speaking = false
  voiceLevels.voiceEnergy = 0
}
