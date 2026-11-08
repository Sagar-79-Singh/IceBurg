import { useEffect, useRef, useState } from 'react'
import { useChat } from '../store/chat.js'
import { useSettings } from '../store/settings.js'
import { SendIcon, StopIcon } from './icons.jsx'

// One slab in the crevasse, pinned to the bottom of the column. Enter sends,
// Shift+Enter is a newline; while an answer streams the send button becomes Stop.
export default function Composer({ disabled, onOpenModels }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)
  const send = useChat((state) => state.send)
  const stop = useChat((state) => state.stop)
  const streaming = useChat((state) => state.streamingId !== null)
  const model = useSettings(
    (state) => state.settings.providers[state.settings.activeProvider]?.model || '',
  )
  const error = useChat((state) => state.error)

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`
  }, [value])

  // Return focus to the composer when a chat opens, as a desktop app should.
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus()
  }, [disabled])

  useEffect(() => {
    if (value) return
    const node = textareaRef.current
    if (node) node.style.height = 'auto'
  }, [value])

  const submit = () => {
    if (!value.trim() || streaming) return
    const text = value
    setValue('')
    // If the turn could not start, put the words back instead of losing them.
    send(text).then((result) => {
      if (result?.ok === false) setValue(text)
    })
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative z-20 px-5 pb-4 pt-1 sm:px-8">
      <div className="mx-auto w-full max-w-[44rem]">
        {error && (
          <p className="mb-2 text-sm text-frost" role="alert">
            {error}
          </p>
        )}
        <div className="rounded-lg border border-line bg-crevasse p-2 transition-colors duration-150 focus-within:border-line-strong">
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={model ? 'Write a message' : 'Pick a model, then write'}
            className="max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted"
          />
          <div className="flex items-end justify-between gap-3 px-1 pb-0.5 pt-1">
            <button
              type="button"
              onClick={onOpenModels}
              className="max-w-[60%] truncate rounded px-1 py-0.5 text-left font-mono text-[11px] text-muted transition-colors duration-150 hover:text-frost"
              title="Change model"
            >
              {model || 'No model selected'}
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-muted sm:inline">
                Enter sends, Shift+Enter is a new line
              </span>
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="btn h-8 gap-1.5 border-line-strong bg-glacier px-3 text-sm"
                  aria-label="Stop generating"
                >
                  <StopIcon />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!value.trim() || disabled}
                  className="btn btn-primary h-8 gap-1.5 px-3 text-sm"
                  aria-label="Send message"
                >
                  <SendIcon />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
