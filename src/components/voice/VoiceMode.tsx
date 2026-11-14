// The full-window Voice Mode HUD. Same conversation as the chat behind it —
// everything said or typed here lands in the same history.
import { useEffect, useMemo, useRef, useState } from 'react'
import BergMark from '../BergMark.tsx'
import { useChat } from '../../store/chat.ts'
import { useSettings, activeAdapter } from '../../store/settings.ts'
import { useVoice } from '../../store/voice.ts'
import { useT } from '../../lib/useT.ts'
import { shortModelName } from '../../lib/modelName.ts'
import VoiceStage from './VoiceStage.tsx'
import VoiceChatPanel from './VoiceChatPanel.tsx'
import BriefingCard from './BriefingCard.tsx'
import { useBriefing } from '../../store/briefing.ts'
import VoiceSettingsDrawer from './VoiceSettingsDrawer.tsx'
import {
  pttKeyDown,
  pttKeyUp,
  toggleHandsFree,
  stopEverything,
  handleCompletedReply,
  consentAndListen,
} from '../../voice/controller.ts'
import { speechAvailable, listVoices } from '../../voice/speech.ts'
import { voiceLevels } from '../../voice/levels.ts'
import type { VoiceMode as Mode } from '../../voice/machine.ts'

const STATE_CHIP: Record<Mode, string> = {
  idle: 'voice_state_idle',
  listening: 'voice_state_listening',
  thinking: 'voice_state_thinking',
  speaking: 'voice_state_speaking',
}

function useLevelMeter(active: boolean): { level: number } {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => {
      const target = useVoice.getState().mode === 'listening' ? voiceLevels.mic : voiceLevels.voiceEnergy
      setLevel((previous) => Math.round((previous * 0.6 + target * 0.4) * 100))
    }, 120)
    return () => clearInterval(id)
  }, [active])
  return { level }
}

export default function VoiceMode() {
  const { t } = useT()
  const closeVoice = useVoice((state) => state.closeVoice)
  const panelOpen = useVoice((state) => state.panelOpen)
  const togglePanel = useVoice((state) => state.togglePanel)
  const drawerOpen = useVoice((state) => state.drawerOpen)
  const toggleDrawer = useVoice((state) => state.toggleDrawer)
  const mode = useVoice((state) => state.mode)
  const muted = useVoice((state) => state.muted)
  const setMuted = useVoice((state) => state.setMuted)
  const consentOpen = useVoice((state) => state.consentOpen)
  const setConsentOpen = useVoice((state) => state.setConsentOpen)
  const briefingPhase = useBriefing((state) => state.phase)

  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const { label, model } = useMemo(() => activeAdapter({ settings, keys }), [settings, keys])
  const streamingId = useChat((state) => state.streamingId)
  const messageCount = useChat((state) => {
    const chat = state.chats.find((item) => item.id === state.activeId)
    return chat?.messages.length ?? 0
  })
  const active = mode !== 'idle'
  const { level } = useLevelMeter(active)

  const [noVoices, setNoVoices] = useState(false)
  const platform = typeof window !== 'undefined' ? window.iceburg?.platform : undefined

  useEffect(() => {
    // Linux often ships without speech voices; say it in the app, not in a crash.
    setNoVoices(speechAvailable() && listVoices().length === 0)
  }, [])

  // A finished reply is spoken out loud (unless silence was asked for).
  const prevStreamingRef = useRef(streamingId)
  useEffect(() => {
    const previous = prevStreamingRef.current
    prevStreamingRef.current = streamingId
    if (previous && !streamingId) handleCompletedReply()
  }, [streamingId])

  // The face drops its gaze when new text lands in the panel.
  const lastMessageCount = useRef(messageCount)
  useEffect(() => {
    if (messageCount !== lastMessageCount.current) {
      lastMessageCount.current = messageCount
      voiceLevels.glanceUntil = performance.now() + 1200
    }
  }, [messageCount])
  useEffect(() => {
    if (streamingId) voiceLevels.glanceUntil = performance.now() + 900
  }, [streamingId])

  // Window-scoped keys: Ctrl+Space hold-to-talk, Esc to cut everything.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.metaKey && event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) pttKeyDown()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        const current = useVoice.getState()
        if (current.mode !== 'idle') stopEverything()
        else current.closeVoice()
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        pttKeyUp()
      }
    }
    const blur = () => pttKeyUp()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const stateLabel = t(STATE_CHIP[mode])
  const accentStyle = settings.voiceAccent ? ({ '--voice-accent': settings.voiceAccent } as React.CSSProperties) : undefined

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{ background: 'var(--crevasse)', ...accentStyle }}
      role="dialog"
      aria-modal="true"
      aria-label={t('voice_mode')}
      data-voice-mode={mode}
    >
      {/* Top bar */}
      <div className="relative z-10 flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-line px-4 max-[560px]:px-3">
        <div className="flex min-w-0 items-center gap-3">
          <BergMark size={18} />
          <span className="wordmark text-[0.92rem]">{t('voice_name')}</span>
          <span className="hidden h-4 w-px bg-line-strong min-[560px]:block" aria-hidden="true" />
          <span className="voice-chip hidden min-[560px]:inline-flex" title={model || undefined}>
            {shortModelName(model) || '—'}
          </span>
          <span className="voice-chip hidden min-[760px]:inline-flex opacity-70">{label}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2 min-[560px]:gap-3">
          <span className={`voice-state voice-state-${mode}`}>
            <span className="voice-state-dot" aria-hidden="true" />
            {stateLabel}
          </span>
          <button type="button" className="hud-icon-btn" onClick={togglePanel} aria-pressed={panelOpen} aria-label={t('voice_panel_aria')} title={t('voice_panel_aria')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M13.5 4.5v15" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
          <button type="button" className="hud-icon-btn" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? t('voice_unmute_aria') : t('voice_mute_aria')} title={muted ? t('voice_unmute_aria') : t('voice_mute_aria')}>
            {muted ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter"/>
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter"/>
                <path d="M15.5 9.2a4.3 4.3 0 0 1 0 5.6M18.4 6.6a8.2 8.2 0 0 1 0 10.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            )}
          </button>
          <button type="button" className="hud-icon-btn" onClick={toggleDrawer} aria-pressed={drawerOpen} aria-label={t('voice_settings_aria')} title={t('voice_settings_aria')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M19.4 13.5a7.8 7.8 0 0 0 .04-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5H10l-.54 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.54 2.6h4l.54-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
          <button type="button" className="hud-icon-btn" onClick={closeVoice} aria-label={t('voice_close_aria')} title={t('voice_close_aria')}>
            <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {noVoices && (
        <div className="flex items-start gap-2 border-b border-line bg-glacier px-4 py-2 text-[0.85rem] leading-snug text-frost">
          <span className="mt-0.5 text-melt" aria-hidden="true">!</span>
          <p>
            {platform === 'linux' ? t('voice_no_voices_linux') : t('voice_no_voices')}
          </p>
          <button type="button" className="tap-bare ml-auto shrink-0" onClick={() => setNoVoices(false)} aria-label={t('modal_close')}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* Body: stage + side panel (stacks under the stage on narrow windows) */}
      <div className="relative flex min-h-0 flex-1 max-[900px]:flex-col">
        <div className="relative min-h-0 min-w-0 flex-1">
          <VoiceStage />
          <div className="pointer-events-none absolute inset-0 hud-scan" aria-hidden="true" />
          <span className="stage-corner stage-corner-tl" aria-hidden="true" />
          <span className="stage-corner stage-corner-tr" aria-hidden="true" />
          <span className="stage-corner stage-corner-bl" aria-hidden="true" />
          <span className="stage-corner stage-corner-br" aria-hidden="true" />

          {/* Corner readouts — honest numbers, nothing invented */}
          <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1">
            <span className="hud-corner">MDL//{shortModelName(model) || '—'}</span>
            <span className="hud-corner opacity-75">PRV//{(label || '—').toUpperCase()}</span>
          </div>
          <div className="pointer-events-none absolute right-4 top-3 flex flex-col items-end gap-1">
            <span className="hud-corner">
              {mode === 'listening' ? `IN//${level}` : mode === 'speaking' ? `OUT//${level}` : 'SIG//···'}
            </span>
            <span className="hud-corner opacity-75">FACE//{settings.voiceFaceMode === 'orb' ? 'ORB' : 'FACE'}</span>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex flex-col items-center gap-1">
            <p className="hud-corner text-center opacity-80">
              {mode === 'listening' ? t('voice_click_hint') : t('voice_hold_hint')}
            </p>
          </div>

          {/* Consent dialog: the one question before the model downloads */}
          {consentOpen && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-scrim/70 p-4">
              <div className="pane max-w-[420px] p-6" role="alertdialog" aria-labelledby="voice-consent-title" aria-describedby="voice-consent-body">
                <h2 id="voice-consent-title" className="display text-[1.25rem] text-frost">{t('voice_consent_title')}</h2>
                <p id="voice-consent-body" className="mt-2 text-[0.95rem] leading-relaxed text-frost/90">{t('voice_consent_body')}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" className="tap tap-solid border-0 px-4 py-2" onClick={consentAndListen}>
                    {t('voice_consent_allow')}
                  </button>
                  <button type="button" className="tap-bare" onClick={() => setConsentOpen(false)}>
                    {t('voice_consent_deny')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {briefingPhase !== 'idle' ? (
          <aside className="h-full w-[360px] shrink-0 max-[900px]:h-[46%] max-[900px]:w-full">
            <BriefingCard />
          </aside>
        ) : (
          panelOpen && (
            <aside className="h-full w-[360px] shrink-0 max-[900px]:h-[46%] max-[900px]:w-full">
              <VoiceChatPanel />
            </aside>
          )
        )}
      </div>

      {/* The footer strip */}
      <footer className="hud-statusbar" aria-hidden="true">
        <span className="inline-flex items-center text-melt"><span className="hud-dot" />MODE // {settings.voiceFaceMode === 'orb' ? 'ORB' : 'FACE'}</span>
        <span className="hidden sm:inline">ICEBURG LOCAL VOICE</span>
        <span className="hidden md:inline">STT // WHISPER-TINY</span>
        <span className="hud-statusbar-right">{t('shortcut_hint_voice')}</span>
      </footer>

      <VoiceSettingsDrawer open={drawerOpen} onClose={toggleDrawer} />
    </div>
  )
}
