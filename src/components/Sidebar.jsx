import { useEffect, useRef, useState } from 'react'
import { useChat } from '../store/chat.js'
import { PencilIcon, TrashIcon, CloseIcon, PlusIcon } from './icons.jsx'

// A 62px rail when idle: a stack of chat buttons, no text. Open it for the list
// with names, rename and delete. Both states are the same component.
export default function Sidebar({ open, depth = 0, onClose, onNewChat }) {
  const chats = useChat((state) => state.chats)
  const activeId = useChat((state) => state.activeId)
  const selectChat = useChat((state) => state.selectChat)
  const renameChat = useChat((state) => state.renameChat)
  const deleteChat = useChat((state) => state.deleteChat)
  const [renaming, setRenaming] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  const initials = (title) =>
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 1)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '·'

  const commitRename = (id, value) => {
    renameChat(id, value)
    setRenaming(null)
  }

  return (
    <aside
      className={`relative z-20 flex shrink-0 flex-col border-r border-line transition-[width] duration-200 ease-out ${
        open ? 'w-[248px]' : 'w-[62px]'
      }`}
      style={{
        backgroundColor: `color-mix(in oklab, var(--glacier) ${Math.round((1 - depth * 0.5) * 100)}%, var(--abyss))`,
      }}
      aria-label="Chats"
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-2.5">
        {open ? (
          <>
            <span className="pl-1 text-sm font-medium">Chats</span>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-quiet btn-icon"
              aria-label="Hide chat list"
            >
              <CloseIcon />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onNewChat}
            className="btn btn-quiet btn-icon mx-auto"
            aria-label="New chat"
            title="New chat"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        {chats.length === 0 && open && (
          <p className="px-2 py-3 text-sm text-muted">No chats yet. Your first message starts one.</p>
        )}
        <ul className="space-y-0.5">
          {chats.map((chat) => {
            const active = chat.id === activeId
            const isRenaming = renaming === chat.id
            const isDeleting = confirmDelete === chat.id
            return (
              <li key={chat.id} className="group relative">
                {isRenaming ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      commitRename(chat.id, new FormData(event.currentTarget).get('title'))
                    }}
                    className="flex items-center gap-1 py-0.5"
                  >
                    <input
                      ref={inputRef}
                      name="title"
                      defaultValue={chat.title}
                      className="field h-8 py-1 text-sm"
                      aria-label="Chat name"
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
                    className={`flex w-full items-center gap-2 rounded text-left transition-colors duration-150 ${
                      open ? 'px-2 py-1.5' : 'justify-center px-0 py-2'
                    } ${active ? 'bg-crevasse text-frost' : 'text-frost/75 hover:bg-crevasse/60 hover:text-frost'}`}
                  >
                    {open ? (
                      <>
                        <span
                          aria-hidden="true"
                          className={`-ml-2 h-5 w-0.5 shrink-0 rounded-r ${active ? 'bg-melt' : 'bg-transparent'}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                      </>
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r ${
                            active ? 'bg-melt' : 'bg-transparent'
                          }`}
                        />
                        <span className="font-mono text-xs">{initials(chat.title)}</span>
                      </>
                    )}
                  </button>
                )}

                {open && !isRenaming && (
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded bg-glacier pl-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                    {isDeleting ? (
                      <button
                        type="button"
                        onClick={() => deleteChat(chat.id)}
                        className="rounded px-1.5 py-0.5 text-xs text-frost hover:bg-crevasse"
                      >
                        Delete
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setRenaming(chat.id)}
                          className="btn btn-quiet btn-icon h-7 w-7"
                          aria-label={`Rename ${chat.title}`}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(chat.id)}
                          className="btn btn-quiet btn-icon h-7 w-7"
                          aria-label={`Delete ${chat.title}`}
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

      {open && (
        <button
          type="button"
          onClick={onNewChat}
          className="drawer-in m-2 mt-0 flex items-center gap-2 rounded border border-line px-2.5 py-2 text-sm text-frost transition-colors duration-150 hover:bg-crevasse/60"
        >
          <PlusIcon />
          New chat
        </button>
      )}
    </aside>
  )
}
