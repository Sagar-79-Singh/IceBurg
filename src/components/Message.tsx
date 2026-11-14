// Signature 3: the sonar cursor, and the two kinds of turn.
//
// A user message is a small tag hung in the right margin, not a bubble. An answer
// is plain full-width text. While the answer streams, two soft rings expand from
// the cursor; the component stops rendering the moment streaming ends.
import { useState, useEffect, useRef } from 'react'
import Markdown from './Markdown.tsx'
import { copyText } from '../store/bridge.ts'
import { AlertIcon, MonitorIcon } from './icons.tsx'
import { useChat } from '../store/chat.ts'
import { shortModelName } from '../lib/modelName.ts'
import { useT } from '../lib/useT.ts'
import type { ChatMessage } from '../../shared/ipc.ts'

// Wall-clock time and a rough token count, both in mono, both quiet.
function note(message: ChatMessage) {
  const time = message.at
    ? new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
  const tokens = message.content ? Math.max(1, Math.round(message.content.length / 4)) : 0
  return { time, tokens }
}


// A computer task that needs the user's say-so: nothing has been launched yet.
function ToolConfirmTurn({ message }: { message: ChatMessage }) {
  const { t } = useT()
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
    <div className="max-w-[58ch] border-l-2 border-melt/60 pl-4">
      <p className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.22em] text-melt">
        <MonitorIcon className="text-melt" />
        {t('msg_computer_task')}
      </p>
      <p className="mt-1.5 text-base leading-[1.55] text-frost">{message.tool?.confirmText}</p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" className="tap tap-solid border-0 px-4 py-1.5" onClick={go} disabled={busy}>
          {busy ? t('msg_opening') : t('msg_open')}
        </button>
        <button type="button" className="tap-bare" onClick={stop} disabled={busy}>
          {t('msg_cancel')}
        </button>
        {time && <span className="meta meta-tight">{time}</span>}
      </div>
    </div>
  )
}

function UserTurn({ message }: { message: ChatMessage }) {
  const { time } = note(message) || {}
  return (
    <div className="flex flex-col items-end gap-1.5">
      <p className="flex items-baseline gap-3 font-mono text-[0.5625rem] uppercase tracking-[0.24em] text-muted">
        {time && <span className="tabular-nums">{time}</span>}
        <span className="text-melt">USER</span>
      </p>
      <p
        className="max-w-[46ch] whitespace-pre-wrap break-words border border-line-strong bg-glacier/45 px-3.5 py-2 text-base leading-[1.6] text-frost/95"
        style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}
      >
        {message.content}
      </p>
    </div>
  )
}

function AnswerTurn({ message, streaming, model }: { message: ChatMessage; streaming?: boolean; model?: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const { time, tokens } = note(message)
  const shortModel = shortModelName(model)

  const copy = async () => {
    const result = await copyText(message.content)
    if (result?.ok === false) return
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  const unread = !streaming && message.content && !message.toolNote

  return (
    <div className="group/reply relative">
      <p className="mb-1.5 flex items-baseline gap-3 font-mono text-[0.5625rem] uppercase tracking-[0.24em] text-muted">
        <span className="inline-flex items-center gap-1.5 text-melt">
          <span className="h-1.5 w-1.5 rotate-45 bg-melt" aria-hidden="true" />
          ICEBURG
        </span>
        {shortModel && !message.toolNote && (
          <span className="max-w-[22ch] truncate opacity-80">{shortModel}</span>
        )}
        <span className="opacity-70">~{tokens} TOK</span>
        {time && <span className="tabular-nums opacity-70">{time}</span>}
      </p>
      <div className="turn-body">
        {message.content ? (
          <Markdown>{message.content}</Markdown>
        ) : (
          !message.error && (
            <div className="flex h-6 items-center gap-2 text-muted" role="status">
              <span className="sonar-static" aria-hidden="true" />
              <span className="meta">{t('msg_listening')}</span>
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

      {unread && (
        <div className="mt-3 flex items-center gap-4 text-base">
          <button
            type="button"
            onClick={copy}
            className="tap-bare"
            aria-label={copied ? t('msg_copied_aria') : t('msg_copy_aria')}
          >
            {copied ? t('msg_copied') : t('msg_copy')}
          </button>
          {message.stopped && <span className="text-muted">{t('msg_stopped')}</span>}
        </div>
      )}
    </div>
  )
}

export default function Message({ message, streaming, model }: { message: ChatMessage; streaming?: boolean; model?: string }) {
  if (message.role === 'user') return <UserTurn message={message} />
  if (message.tool?.type === 'confirm') return <ToolConfirmTurn message={message} />
  return <AnswerTurn message={message} streaming={streaming} model={model} />
}
