import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Message from './Message.jsx'
import Composer from './Composer.jsx'
import EmptyState from './EmptyState.jsx'
import DepthGauge from './DepthGauge.jsx'
import WaterlineTitle from './WaterlineTitle.jsx'
import { useChat } from '../store/chat.js'
import { useSettings } from '../store/settings.js'

// The conversation is left-aligned, not centred: a depth gauge in the left
// margin, the text beside it, and a wide quiet margin on the right for metadata.
export default function ChatView({ chat, onOpenSettings, ollamaDown = false, ollamaModels = 0 }) {
  const scrollRef = useRef(null)
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

  if (messages.length === 0) {
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
        <div className="relative w-[58px] shrink-0" aria-hidden="true">
          <DepthGauge nodeRef={scrollRef} count={messages.length} />
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-6 sm:pr-10"
        >
          <div className="pb-10 pt-7">
            <WaterlineTitle
              title={chat.title}
              meta={
                <>
                  {providerId && (
                    <span className="meta">
                      {settings.providers[providerId]?.label || providerId}
                    </span>
                  )}
                  {model && <span className="meta truncate max-w-[26rem]">{model}</span>}
                  <span className="meta">{messages.length} msg</span>
                  <span className="meta">~{tokens} tok</span>
                </>
              }
            />

            <div className="turn-feed mt-6 space-y-10">
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
