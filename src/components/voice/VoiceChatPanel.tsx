// The side conversation panel: the SAME chat messages as the main view, plus a
// composer that works at any time. Speech and text both land in this log.
import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from '../Markdown.tsx'
import { useChat } from '../../store/chat.ts'
import { useVoice } from '../../store/voice.ts'
import { useSettings } from '../../store/settings.ts'
import { useT } from '../../lib/useT.ts'
import { sendVoiceMessage, toggleHandsFree, stopEverything } from '../../voice/controller.ts'
import { stt, type SttStatus } from '../../voice/stt.ts'

const LISTENING_STATES = new Set(['listening'])

export default function VoiceChatPanel() {
  const { t } = useT()
  const chatId = useChat((state) => state.activeId)
  const chats = useChat((state) => state.chats)
  const chat = useMemo(() => chats.find((item) => item.id === chatId) || null, [chats, chatId])
  const streamingId = useChat((state) => state.streamingId)
  const mode = useVoice((state) => state.mode)
  const listeningSource = useVoice((state) => state.listeningSource)
  const [draft, setDraft] = useState('')
  const [sttStatus, setSttStatus] = useState<SttStatus>(() => stt.getSnapshot().status)
  const [sttProgress, setSttProgress] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messageCount = chat?.messages.length ?? 0

  const messages = chat?.messages ?? []

  // Keep the newest turn in view as it streams in.
  const signature = useMemo(() => {
    const lastMessage = messages[messages.length - 1]
    return `${messages.length}:${lastMessage?.content.length ?? 0}:${lastMessage?.id ?? ''}`
  }, [messages])
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [signature])

  useEffect(() => stt.subscribe((snapshot) => {
    setSttStatus(snapshot.status)
    setSttProgress(snapshot.progress)
  }), [])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void sendVoiceMessage(text)
    inputRef.current?.focus()
  }

  const listening = LISTENING_STATES.has(mode)
  const micActive = listening && listeningSource !== null

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line-strong bg-[color-mix(in_srgb,var(--surface)_55%,var(--crevasse))] max-[900px]:border-l-0 max-[900px]:border-t">
      {/* Log header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line-strong bg-[color-mix(in_srgb,var(--melt)_6%,transparent)] px-4">
        <p className="flex items-center gap-2 font-mono text-[0.5625rem] uppercase tracking-[0.26em] text-melt">
          <span className="hud-tick" aria-hidden="true" style={{ width: 3, height: '0.7rem' }} />
          COMMS
        </p>
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.24em] text-muted">{messages.length} MSG</span>
      </div>
      {/* Log */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="meta mt-4 text-center">{t('voice_panel_empty')}</p>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((message) => {
            if (message.role === 'system') return null
            const isUser = message.role === 'user'
            const streaming = streamingId === message.id
            return (
              <div key={message.id} className={isUser ? 'pl-6' : 'pr-2'}>
                <p className="mb-1 flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.24em] text-muted">
                  {isUser ? (
                    <span className="text-frost/60">USER</span>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rotate-45 bg-melt" aria-hidden="true" />
                      <span className="text-melt">ICEBURG</span>
                    </>
                  )}
                </p>
                {isUser ? (
                  <p
                    className="whitespace-pre-wrap break-words border border-line-strong bg-glacier/40 px-2.5 py-1.5 text-[0.95rem] leading-snug text-frost/95"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)' }}
                  >{message.content}</p>
                ) : (
                  <div className="text-[0.95rem] leading-snug text-frost [&_.md]:text-[0.95rem] [&_.md]:leading-snug [&_.md>*+*]:mt-2">
                    {message.content ? <Markdown>{message.content}</Markdown> : !message.error && streaming && (
                      <span className="meta">{t('msg_listening')}</span>
                    )}
                    {message.error && <p className="text-frost">{message.error}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Model download strip */}
      {sttStatus === 'loading' && (
        <div className="border-t border-line px-4 py-2">
          <p className="meta text-[0.72rem]">{t('voice_stt_downloading', { n: Math.round(sttProgress * 100) })}</p>
          <div className="mt-1 h-1 w-full bg-crevasse">
            <div className="h-full bg-melt transition-[width] duration-150" style={{ width: `${Math.round(sttProgress * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Composer: works while speaking, listening, thinking — always. */}
      <div className="border-t border-line-strong bg-crevasse/30 p-3">
        <div className="hud-cmd flex items-end gap-2 px-2 py-1">
          <span aria-hidden="true" className="hud-cmd-glyph select-none pb-1.5 text-sm">&gt;</span>
          <button
            type="button"
            onClick={toggleHandsFree}
            aria-pressed={micActive}
            aria-label={t('voice_panel_mic_aria')}
            className={`voice-mic-btn ${micActive ? 'is-live' : ''} !rounded-[4px] !shadow-none`}
            title={t('voice_panel_mic_aria')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={t('voice_panel_placeholder')}
            aria-label={t('composer_label')}
            className="field max-h-32 min-h-[38px] flex-1 !bg-crevasse py-2 text-[0.95rem]"
          />
          {mode === 'speaking' || mode === 'thinking' ? (
            <button type="button" onClick={stopEverything} className="hud-btn hud-btn-solid shrink-0 px-4 py-2" aria-label={t('voice_panel_stop_aria')}>
              {t('voice_stop')}
            </button>
          ) : (
            <button type="button" onClick={submit} className="hud-btn hud-btn-solid shrink-0 px-4 py-2" aria-label={t('composer_send_aria')}>
              {t('composer_send')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
