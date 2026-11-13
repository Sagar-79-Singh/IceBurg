import { useEffect, useRef, useState } from 'react'
import { useChat } from '../store/chat.ts'
import { CloseIcon, PencilIcon, TrashIcon } from './icons.tsx'
import { useT } from '../lib/useT.ts'
import type { ChatRecord } from '../../shared/ipc.ts'

// Signature 4: the faceted sidebar.
//
// The rail is a block of ice cut on its outer edge; every chat is a facet cut to
// a different depth. The open conversation is the one lit facet: brighter, with a
// sharper edge and the accent. Everything else is a quiet cut line. No 
// cards, no shadows.
export default function Sidebar({ open, onClose, onNewChat }: { open: boolean; onClose: () => void; onNewChat: () => void }) {
  const chats = useChat((state) => state.chats)
  const activeId = useChat((state) => state.activeId)
  const selectChat = useChat((state) => state.selectChat)
  const renameChat = useChat((state) => state.renameChat)
  const deleteChat = useChat((state) => state.deleteChat)
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

  // A short depth reading for each chat: its own number of turns, in metres.
  const depthOf = (chat: ChatRecord) => `${(chat.messages?.length || 0) * 2} m`

  return (
    <aside
      className={`relative z-20 flex shrink-0 flex-col bg-glacier ${
        open ? 'w-[268px] rail-cut' : 'w-0'
      }`}
      aria-label={t('sidebar_chats')}
      aria-hidden={!open}
    >
      {open && (
        <div className="flex min-h-0 flex-1 flex-col pl-1 pr-5">
          <div className="flex h-[58px] shrink-0 items-center justify-between pl-4">
            <span className="display text-[1.0625rem] tracking-[-0.02em] text-frost">{t('sidebar_chats')}</span>
            <button type="button" onClick={onClose} className="tap-bare" aria-label={t('header_hide_chats')}>
              <CloseIcon />
            </button>
          </div>

          <div className="mb-3 mt-1 pl-4">
            <button type="button" onClick={onNewChat} className="tap border-line-strong px-3 py-1.5">
              {t('sidebar_new')}
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto pb-4" aria-label={t('sidebar_conversations_aria')}>
            {chats.length === 0 && (
              <p className="px-4 py-3 text-base text-muted">{t('sidebar_empty')}</p>
            )}
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
                        className="py-1 pl-3 pr-2"
                      >
                        <input
                          ref={inputRef}
                          name="title"
                          defaultValue={chat.title}
                          className="field py-1"
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
                        className={`facet relative flex w-full items-baseline gap-3 py-2.5 pl-3 pr-9 text-left transition-colors duration-150 ${
                          active
                            ? 'facet-lit text-frost'
                            : 'text-frost/70 hover:bg-surface/50 hover:text-frost'
                        }`}
                      >
                        <span aria-hidden="true" className="meta meta-tight w-6 shrink-0 tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-base leading-[1.35]">
                          {chat.title}
                        </span>
                        <span aria-hidden="true" className="meta meta-tight shrink-0 opacity-70">
                          {depthOf(chat)}
                        </span>
                      </button>
                    )}

                    {!isRenaming && (
                      <div
                        className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 bg-glacier pl-1 ${
                          isDeleting ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/facet:opacity-100'
                        }`}
                      >
                        {isDeleting ? (
                          <button
                            type="button"
                            onClick={() => deleteChat(chat.id)}
                            className="text-base text-frost underline decoration-line-strong underline-offset-2"
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

        </div>
      )}
    </aside>
  )
}
