import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Message from './Message.jsx'
import Composer from './Composer.jsx'
import EmptyState from './EmptyState.jsx'
import { useChat } from '../store/chat.js'

// The conversation column: one wide centred measure, the composer always pinned to
// the bottom, and a depth veil that answers the scroll position.
export default function ChatView({ chat, onOpenSettings, onDepth, ollamaDown = false }) {
  const scrollRef = useRef(null)
  const [pinned, setPinned] = useState(true)
  const streamingId = useChat((state) => state.streamingId)
  const messages = chat?.messages || []
  const streaming = Boolean(streamingId && messages.some((message) => message.id === streamingId))
  const lastCount = useRef(0)
  const lastDepth = useRef(0)

  const measure = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    const max = node.scrollHeight - node.clientHeight
    // Depth is relative: a short conversation never shows it.
    const length = Math.min(1, max / 1800)
    const up = max > 0 ? Math.min(1, Math.max(0, (max - node.scrollTop) / max)) : 0
    // Two decimals: the ramp has 100 steps, so scrolling does not re-render the
    // window on every frame.
    setPinned(max - node.scrollTop < 64)
    const next = Math.round(length * up * 100) / 100
    if (next === lastDepth.current) return
    lastDepth.current = next
    onDepth?.(next)
  }, [onDepth])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    // rAF keeps a fast scroll from measuring on every frame; the fallback keeps
    // environments without it (older runtimes, tests) working.
    const raf = window.requestAnimationFrame?.bind(window)
    const caf = window.cancelAnimationFrame?.bind(window)
    let frame = 0
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
    const count = messages.length
    const grew = count > lastCount.current
    lastCount.current = count
    if (grew || pinned) node.scrollTop = node.scrollHeight
    measure()
  }, [messages, pinned, measure])

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
    lastCount.current = messages.length
    measure()
  }, [chat?.id, measure, messages.length])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <EmptyState
          chat={chat}
          ollamaDown={ollamaDown}
          onOpenSettings={() => onOpenSettings(chat?.providerId || null)}
        />
      ) : (
        <div
          ref={scrollRef}
          className="surface-light relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-8 sm:px-8"
        >
          <div className="mx-auto w-full max-w-[44rem] space-y-7">
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                streaming={streaming && message.id === streamingId}
              />
            ))}
            <div className="h-2" />
          </div>
        </div>
      )}
      <Composer disabled={streaming} onOpenModels={() => onOpenSettings(chat?.providerId || null)} />
    </div>
  )
}
