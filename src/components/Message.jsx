import { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown.jsx'
import { copyText } from '../store/bridge.js'
import { CopyIcon, CheckIcon, AlertIcon } from './icons.jsx'

// User turns are quiet and right-aligned: a bordered slab, no fill, no avatar.
function UserMessage({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-md border border-line bg-glacier/60 px-3.5 py-2.5 text-[15px] leading-relaxed text-frost sm:max-w-[75%]">
        {content}
      </div>
    </div>
  )
}

// Assistant turns are plain full-width text. No card, no identical chrome.
function AssistantMessage({ message, streaming }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const result = await copyText(message.content)
    if (result?.ok === false) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="group/reply">
      {message.content ? (
        <Markdown>{message.content}</Markdown>
      ) : (
        !message.error && (
          <div className="flex h-6 items-center text-muted" aria-label="Waiting for the first words">
            <span className="thinking-dots">
              <span />
              <span />
              <span />
            </span>
          </div>
        )
      )}

      {streaming && message.content && (
        <span className="stream-cursor" aria-hidden="true" />
      )}

      {message.error && (
        <div className="mt-2 flex max-w-prose items-start gap-2 rounded border border-line-strong px-3 py-2 text-sm">
          <AlertIcon className="mt-0.5 shrink-0 text-frost" />
          <p className="text-frost">{message.error}</p>
        </div>
      )}

      {message.stopped && message.note && (
        <p className="mt-1 text-sm text-muted">{message.note}</p>
      )}

      {!streaming && message.content && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="btn btn-quiet h-7 gap-1.5 px-1.5 text-xs opacity-0 transition-opacity duration-150 group-hover/reply:opacity-100 focus-visible:opacity-100"
            aria-label={copied ? 'Answer copied' : 'Copy answer'}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          {message.stopped && <span className="text-xs text-muted">Stopped</span>}
        </div>
      )}
    </div>
  )
}

export default function Message({ message, streaming }) {
  if (message.role === 'user') return <UserMessage content={message.content} />
  return <AssistantMessage message={message} streaming={streaming} />
}
