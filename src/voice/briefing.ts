// The startup briefing, Mark-LVII style: IceBurg opens on the face, the face
// says hello, then reads the day's headlines. No model call is involved —
// the greeting is a template and the headlines come from the public Google
// News RSS feed through the main process. Everything degrades quietly:
// no speech engine → the card still shows the headlines; no network → the
// greeting happens anyway; Esc or close stops the whole thing mid-word.

import { useVoice } from '../store/voice.ts'
import { useSettings } from '../store/settings.ts'
import { useBriefing } from '../store/briefing.ts'
import { news } from '../store/bridge.ts'
import { speak, speechAvailable } from './speech.ts'
import { translate } from '../lib/i18n.ts'
import type { NewsHeadline } from '../../shared/ipc.ts'

/** One run per process — a reload re-greets, a remount must not. */
let attempted = false
/** Bumped on every run and on cancellation: stale speech callbacks bail out. */
let epoch = 0

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** Zero-padded 24-hour clock, locale-free, so tests and both languages agree. */
export const timeOfDay = (now: Date): string => `${pad2(now.getHours())}:${pad2(now.getMinutes())}`

export type GreetingBucket = 'morning' | 'afternoon' | 'evening'

export const greetingBucket = (now: Date): GreetingBucket => {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function buildGreeting(now: Date, language: string): string {
  const bucket = greetingBucket(now)
  return translate(language, `briefing_greet_${bucket}`, { time: timeOfDay(now) })
}

const truncate = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`

export function buildLeadSpeech(items: NewsHeadline[], language: string): string {
  const lead = items[0]
  if (!lead) return translate(language, 'briefing_unavailable')
  return translate(language, 'briefing_lead', { title: truncate(lead.title, 110) })
}

const languageOf = (): string => useSettings.getState().settings.language

/** Esc mid-sentence: drop every stale callback so nothing else is spoken. */
export function cancelBriefing(): void {
  epoch += 1
}

export async function runStartupBriefing(): Promise<boolean> {
  if (attempted) return false
  attempted = true

  const settings = useSettings.getState().settings
  if (settings.startupBriefing === false) return false
  if (useVoice.getState().open) return false

  // Silence is honoured: with replies muted or no speech engine available the
  // card still opens and shows the headlines, it just says nothing.
  const voiceOn = settings.voiceSpeakReplies !== false && speechAvailable()
  const run = ++epoch
  const language = settings.language
  const voice = useSettings.getState().settings
  const briefing = useBriefing.getState()
  briefing.begin('greeting')

  // The HUD is the face — open it first so the hello lands on it.
  useVoice.getState().openVoice()
  useVoice.getState().setMode('speaking')

  // Prefetch headlines in parallel with the hello, like the reference does.
  const itemsPromise = news.headlines(language).catch((error: unknown) => ({
    ok: false,
    items: [] as NewsHeadline[],
    message: String((error as Error)?.message || error),
  }))

  const stale = (): boolean => run !== epoch || !useVoice.getState().open

  const deliverNews = async (): Promise<void> => {
    if (stale() || useVoice.getState().mode !== 'speaking') {
      useBriefing.getState().dismiss()
      return
    }
    const result = await itemsPromise
    if (stale() || useVoice.getState().mode !== 'speaking') {
      useBriefing.getState().dismiss()
      return
    }
    const items = result.ok ? result.items : []
    if (items.length === 0) {
      useBriefing.getState().fail(result.message || translate(language, 'briefing_unavailable'))
      const idle = () => {
        if (run !== epoch) return
        if (useVoice.getState().open) useVoice.getState().setMode('idle')
      }
      if (voiceOn) {
        const spokeFallback = speak(translate(language, 'briefing_unavailable'), {
          voiceURI: voice.voiceVoiceURI,
          rate: voice.voiceRate,
          onEnd: idle,
        })
        if (spokeFallback) return
      }
      idle()
      return
    }
    useBriefing.getState().setItems(items, translate(language, 'briefing_on_screen'))
    const lead = buildLeadSpeech(items, language)
    const idle = () => {
      if (run !== epoch) return
      if (useVoice.getState().open) useVoice.getState().setMode('idle')
    }
    if (voiceOn) {
      const spoke = speak(lead, {
        voiceURI: voice.voiceVoiceURI,
        rate: voice.voiceRate,
        onEnd: idle,
      })
      if (spoke) return
    }
    idle()
  }

  const greeting = buildGreeting(new Date(), language)
  if (voiceOn) {
    const spoke = speak(greeting, {
      voiceURI: voice.voiceVoiceURI,
      rate: voice.voiceRate,
      onEnd: () => {
        void deliverNews()
      },
    })
    if (spoke) return true
  }
  void deliverNews()
  return true
}

/** Re-read the lead story (the card's "read again" button). */
export function replayLeadSpeech(): void {
  const language = languageOf()
  const { items } = useBriefing.getState()
  if (items.length === 0) return
  const voice = useSettings.getState().settings
  useVoice.getState().setMode('speaking')
  const spoke = speak(buildLeadSpeech(items, language), {
    voiceURI: voice.voiceVoiceURI,
    rate: voice.voiceRate,
    onEnd: () => {
      if (useVoice.getState().open) useVoice.getState().setMode('idle')
    },
  })
  if (!spoke) useVoice.getState().setMode('idle')
}

/** Retry after a failed fetch (the card's retry button). */
export async function retryBriefing(): Promise<void> {
  const language = languageOf()
  const run = ++epoch
  const briefing = useBriefing.getState()
  briefing.begin('greeting')
  useVoice.getState().setMode('speaking')
  const result = await news.headlines(language).catch((error: unknown) => ({
    ok: false,
    items: [] as NewsHeadline[],
    message: String((error as Error)?.message || error),
  }))
  if (run !== epoch) return
  const items = result.ok ? result.items : []
  if (items.length === 0) {
    useBriefing.getState().fail(result.message || translate(language, 'briefing_unavailable'))
    useVoice.getState().setMode('idle')
    return
  }
  useBriefing.getState().setItems(items, translate(language, 'briefing_on_screen'))
  useVoice.getState().setMode('idle')
}
