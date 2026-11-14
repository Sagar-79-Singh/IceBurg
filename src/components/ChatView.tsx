import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Message from './Message.tsx'
import Composer from './Composer.tsx'
import EmptyState from './EmptyState.tsx'
import { useChat } from '../store/chat.ts'
import { useT } from '../lib/useT.ts'
import { useSettings } from '../store/settings.ts'
import { shortModelName } from '../lib/modelName.ts'
import type { ChatRecord } from '../../shared/ipc.ts'

// The conversation is left-aligned, not centred: a depth gauge in the left
// margin, the text beside it, and a wide quiet margin on the right for metadata.
export default function ChatView({ chat, onOpenSettings, ollamaDown = false, ollamaModels = 0 }: { chat: ChatRecord | null; onOpenSettings: (tab?: string | null) => void; ollamaDown?: boolean; ollamaModels?: number }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(true)
  const streamingId = useChat((state) => state.streamingId)
  const settings = useSettings((state) => state.settings)
  const messages = chat?.messages || []
  const streaming = Boolean(streamingId && messages.some((message) => message.id === streamingId))
  const lastCount = useRef(0)

  // Is the reader at the bottom? That is all this needs to know now; depth is
  // measured by the gauge, which reads the DOM itself.
  const measure = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    setPinned(node.scrollHeight - node.scrollTop - node.clientHeight < 72)
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    let frame = 0
    const raf = window.requestAnimationFrame?.bind(window)
    const caf = window.cancelAnimationFrame?.bind(window)
    const onScroll = () => {
      if (!raf) return measure()
      if (caf) caf(frame)
      frame = raf(measure)
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (caf) caf(frame)
      node.removeEventListener('scroll', onScroll)
    }
  }, [measure, chat?.id])

  // Follow the answer while it streams, but only if the reader is at the bottom.
  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const grew = messages.length > lastCount.current
    lastCount.current = messages.length
    if (grew || pinned) node.scrollTop = node.scrollHeight
    measure()
  }, [messages, pinned, measure])

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
    lastCount.current = messages.length
    measure()
  }, [chat?.id, measure, messages.length])

  const model = chat?.model || ''
  const providerId = chat?.providerId || ''
  const tokens = Math.round(
    messages.reduce((total, message) => total + (message.content?.length || 0), 0) / 4,
  )
  const { t } = useT()

  if (!chat || messages.length === 0) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <EmptyState
          ollamaDown={ollamaDown}
          ollamaModels={ollamaModels}
          onOpenSettings={() => onOpenSettings(providerId || null)}
        />
        <Composer disabled={false} onOpenModels={() => onOpenSettings(providerId || null)} />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pr-6 sm:px-8 sm:pr-10"
        >
          <div className="pb-10">
            {/* The console header: an accent tick, the handle, the data column. */}
            <div className="conv-head">
              <div className="flex min-w-0 items-start gap-3">
                <span className="hud-tick mt-2" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="hud-key">{t('conv_label')}</p>
                  <h1
                    className="display mt-1.5 truncate text-[clamp(1.35rem,2.1vw,1.9rem)] text-frost"
                    title={chat.title}
                  >
                    {chat.title}
                  </h1>
                </div>
              </div>
              <div className="conv-head-meta hidden min-[860px]:flex">
                {providerId && (
                  <span className="hud-key" title={settings.providers[providerId]?.label || providerId}>
                    {(settings.providers[providerId]?.label || providerId).toUpperCase()}
                  </span>
                )}
                {model && (
                  <span className="hud-key max-w-[16rem] truncate" title={model}>
                    {shortModelName(model)}
                  </span>
                )}
                <span className="hud-key">{messages.length} MSG</span>
                <span className="hud-key">~{tokens} TOK</span>
              </div>
            </div>

            <div className="turn-feed mt-7 space-y-9">
              {messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  model={message.model || model}
                  streaming={streaming && message.id === streamingId}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Composer disabled={streaming} onOpenModels={() => onOpenSettings(providerId || null)} />
    </div>
  )
}
