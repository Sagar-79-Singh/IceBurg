import { useEffect, useRef, useState } from 'react'
import { CloseIcon, PencilIcon, TrashIcon, PlusIcon } from './icons.tsx'
import HudPanel from './HudPanel.tsx'
import { useChat } from '../store/chat.ts'
import { useSettings, activeAdapter } from '../store/settings.ts'
import { useVoice } from '../store/voice.ts'
import { useT } from '../lib/useT.ts'
import { shortModelName } from '../lib/modelName.ts'
import pkg from '../../package.json'
import type { ChatRecord } from '../../shared/ipc.ts'

// The left column, Mark-style: a SYSTEMS panel with the honest state of the
// machine (who answers, which model, whether the local service is up, what the
// voice is doing) and the CHATS roster below it. No invented gauges: every
// value is read from the same stores the rest of the app uses.
export default function Sidebar({ open, onClose, onNewChat, ollamaStatus }: { open: boolean; onClose: () => void; onNewChat: () => void; ollamaStatus?: { running: boolean; models: number } | null }) {
  const chats = useChat((state) => state.chats)
  const activeId = useChat((state) => state.activeId)
  const selectChat = useChat((state) => state.selectChat)
  const renameChat = useChat((state) => state.renameChat)
  const deleteChat = useChat((state) => state.deleteChat)
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const voiceOpen = useVoice((state) => state.open)
  const voiceMode = useVoice((state) => state.mode)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { t } = useT()

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  const commitRename = (id: string, value: string) => {
    renameChat(id, value)
    setRenaming(null)
  }

  const depthOf = (chat: ChatRecord) => `${(chat.messages?.length || 0) * 2} m`

  const { label, model } = activeAdapter({ settings, keys })
  const voiceLabel = voiceOpen
    ? t(`voice_state_${voiceMode}`)
    : t('status_off')
  const ollamaLabel = !ollamaStatus
    ? '--'
    : ollamaStatus.running
      ? t('status_ollama_up', { n: ollamaStatus.models })
      : t('status_ollama_down')

  return (
    <aside
      className={`relative z-20 flex shrink-0 flex-col border-r border-line bg-[color-mix(in_srgb,var(--crevasse)_38%,var(--surface))] ${
        open ? 'w-[248px]' : 'w-0 border-r-0'
      }`}
      aria-label={t('sidebar_chats')}
      aria-hidden={!open}
    >
      {open && (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
          <div className="flex h-7 shrink-0 items-center justify-between px-1 pt-1">
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.28em] text-muted">
              {t('sidebar_console')}
            </span>
            <button type="button" onClick={onClose} className="tap-bare p-1" aria-label={t('header_hide_chats')}>
              <CloseIcon />
            </button>
          </div>

          <HudPanel title={t('status_panel')} code={t('status_live')} className="shrink-0">
            <div className="flex flex-col gap-1.5">
              <div className="hud-row">
                <span className="hud-key">{t('status_engine')}</span>
                <span className="hud-fill" aria-hidden="true" />
                <span className="hud-val hud-val-accent">{(label || '—').toUpperCase()}</span>
              </div>
              <div className="hud-row">
                <span className="hud-key">{t('status_model')}</span>
                <span className="hud-fill" aria-hidden="true" />
                <span className="hud-val" title={model || undefined}>
                  {shortModelName(model) || '—'}
                </span>
              </div>
              <div className="hud-row">
                <span className="hud-key">{t('status_ollama')}</span>
                <span className="hud-fill" aria-hidden="true" />
                <span className={`hud-val ${ollamaStatus?.running ? 'hud-val-accent' : ''}`}>{ollamaLabel}</span>
              </div>
              <div className="hud-row">
                <span className="hud-key">{t('status_voice')}</span>
                <span className="hud-fill" aria-hidden="true" />
                <span className={`hud-val ${voiceOpen ? 'hud-val-accent' : ''}`}>{voiceLabel}</span>
              </div>
            </div>
          </HudPanel>

          <HudPanel title={t('sidebar_chats')} code={String(chats.length).padStart(2, '0')} className="flex min-h-0 flex-1 flex-col" bodyClassName="flex min-h-0 flex-1 flex-col">
            <button type="button" onClick={onNewChat} className="hud-btn mb-2 w-full justify-center">
              <PlusIcon width={14} height={14} />
              {t('sidebar_new')}
            </button>
            <nav className="min-h-0 flex-1 overflow-y-auto" aria-label={t('sidebar_conversations_aria')}>
              {chats.length === 0 && <p className="px-2 py-3 text-sm text-muted">{t('sidebar_empty')}</p>}
              <ul>
                {chats.map((chat, index) => {
                  const active = chat.id === activeId
                  const isRenaming = renaming === chat.id
                  const isDeleting = confirmDelete === chat.id
                  return (
                    <li key={chat.id} className="group/facet relative">
                      {isRenaming ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault()
                            commitRename(chat.id, String(new FormData(event.currentTarget).get('title') || ''))
                          }}
                          className="py-1 pl-2 pr-2"
                        >
                          <input
                            ref={inputRef}
                            name="title"
                            defaultValue={chat.title}
                            className="field py-1 text-sm"
                            aria-label={t('sidebar_name_aria')}
                            onBlur={(event) => commitRename(chat.id, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                setRenaming(null)
                              }
                            }}
                          />
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectChat(chat.id)}
                          title={chat.title}
                          aria-current={active ? 'true' : undefined}
                          className={`facet relative flex w-full items-baseline gap-2.5 py-2 pl-2.5 pr-9 text-left transition-colors duration-150 ${
                            active ? 'facet-lit text-frost' : 'text-frost/75 hover:bg-glacier/60 hover:text-frost'
                          }`}
                        >
                          <span aria-hidden="true" className="w-5 shrink-0 font-mono text-[0.625rem] tabular-nums text-muted">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[0.92rem] leading-[1.35]">{chat.title}</span>
                          <span aria-hidden="true" className="shrink-0 font-mono text-[0.625rem] text-muted opacity-70">
                            {depthOf(chat)}
                          </span>
                        </button>
                      )}

                      {!isRenaming && (
                        <div
                          className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 bg-[color-mix(in_srgb,var(--crevasse)_38%,var(--surface))] pl-1 ${
                            isDeleting ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/facet:opacity-100'
                          }`}
                        >
                          {isDeleting ? (
                            <button
                              type="button"
                              onClick={() => deleteChat(chat.id)}
                              className="text-sm text-frost underline decoration-line-strong underline-offset-2"
                            >
                              {t('sidebar_delete')}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setRenaming(chat.id)}
                                className="tap-bare p-1"
                                aria-label={t('sidebar_rename_aria', { title: chat.title })}
                              >
                                <PencilIcon />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(chat.id)}
                                className="tap-bare p-1"
                                aria-label={t('sidebar_delete_aria', { title: chat.title })}
                              >
                                <TrashIcon />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
            <p className="shrink-0 pt-2 text-center font-mono text-[0.5rem] uppercase tracking-[0.3em] text-muted/70">
              IceBurg v{pkg.version} · Local-first
            </p>
          </HudPanel>
        </div>
      )}
    </aside>
  )
}
