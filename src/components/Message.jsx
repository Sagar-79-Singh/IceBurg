// Signature 3: the sonar cursor, and the two kinds of turn.
//
// A user message is a small tag hung in the right margin, not a bubble. An answer
// is plain full-width text. While the answer streams, two soft rings expand from
// the cursor; the component stops rendering the moment streaming ends.
import { useState, useEffect, useRef } from 'react'
import Markdown from './Markdown.jsx'
import { copyText } from '../store/bridge.js'
import { AlertIcon, MonitorIcon } from './icons.jsx'
import { useChat } from '../store/chat.js'

// Wall-clock time and a rough token count, both in mono, both quiet.
function note(message) {
  const time = message.at
    ? new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
  const tokens = message.content ? Math.max(1, Math.round(message.content.length / 4)) : 0
  return { time, tokens }
}


// A computer task that needs the user's say-so: nothing has been launched yet.
function ToolConfirmTurn({ message }) {
  const confirmTool = useChat((state) => state.confirmTool)
  const cancelTool = useChat((state) => state.cancelTool)
  const [busy, setBusy] = useState(false)
  const { time } = note(message) || {}

  const go = async () => {
    if (busy) return
    setBusy(true)
    await confirmTool(message.id)
  }

  const stop = () => {
    if (busy) return
    cancelTool(message.id)
  }

  return (
    <div data-depth-item className="max-w-[58ch] border-l-2 border-melt/60 pl-4">
      <p className="meta flex items-center gap-2">
        <MonitorIcon className="text-melt" />
        Computer task
      </p>
      <p className="mt-1.5 text-base leading-[1.55] text-frost">{message.tool?.confirmText}</p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" className="tap tap-solid border-0 px-4 py-1.5" onClick={go} disabled={busy}>
          {busy ? 'Opening…' : 'Open'}
        </button>
        <button type="button" className="tap-bare" onClick={stop} disabled={busy}>
          Cancel
        </button>
        {time && <span className="meta meta-tight">{time}</span>}
      </div>
    </div>
  )
}

function UserTurn({ message }) {
  const { time } = note(message) || {}
  return (
    <div data-depth-item className="flex justify-end gap-4 pl-10">
      <p className="max-w-[46ch] whitespace-pre-wrap break-words border-l-2 border-melt/50 pl-3 text-base leading-[1.55] text-frost/90">
        {message.content}
      </p>
      {time && <span className="meta meta-tight hidden shrink-0 pt-0.5 sm:block">{time}</span>}
    </div>
  )
}

function AnswerTurn({ message, streaming, model }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const { time, tokens } = note(message)

  const copy = async () => {
    const result = await copyText(message.content)
    if (result?.ok === false) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  const unread = !streaming && message.content && !message.toolNote

  return (
    <div data-depth-item className="group/reply relative">
      <div className="turn-body">
        {message.content ? (
          <Markdown>{message.content}</Markdown>
        ) : (
          !message.error && (
            <div className="flex h-6 items-center gap-2 text-muted" role="status">
              <span className="sonar-static" aria-hidden="true" />
              <span className="meta">Listening for the answer</span>
            </div>
          )
        )}

        {streaming && message.content && (
          <span className="stream-mark" aria-hidden="true">
            <span className="sonar" />
            <span className="sonar" />
          </span>
        )}

        {message.error && (
          <div className="mt-3 flex max-w-[68ch] items-start gap-2 border-l-2 border-melt pl-3 text-base">
            <AlertIcon className="mt-1 shrink-0 text-frost" />
            <p className="text-frost">{message.error}</p>
          </div>
        )}

        {message.stopped && message.note && <p className="mt-2 text-base text-muted">{message.note}</p>}
      </div>

      {/* The quiet right margin: who wrote this, how much of it, and when. On a
          narrow window it moves under the answer instead of disappearing. */}
      <div className="turn-meta absolute right-0 top-1 flex-col gap-1.5 text-right">
        {!message.toolNote && model && <span className="meta truncate">{model}</span>}
        {!message.toolNote && <span className="meta meta-tight">{tokens} tok</span>}
        <span className="meta meta-tight">{time}</span>
      </div>

      {unread && (
        <div className="mt-3 flex items-center gap-4 text-base">
          <button
            type="button"
            onClick={copy}
            className="tap-bare"
            aria-label={copied ? 'Answer copied' : 'Copy answer'}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {message.stopped && <span className="text-muted">Stopped</span>}
          <span className="turn-meta-inline meta meta-tight">
            {[model, message.toolNote ? null : `${tokens} tok`, time].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
    </div>
  )
}

export default function Message({ message, streaming, model }) {
  if (message.role === 'user') return <UserTurn message={message} />
  if (message.tool?.type === 'confirm') return <ToolConfirmTurn message={message} />
  return <AnswerTurn message={message} streaming={streaming} model={model} />
}
