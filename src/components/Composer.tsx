import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useChat } from '../store/chat.ts'
import { useSettings } from '../store/settings.ts'
import { shortModelName } from '../lib/modelName.ts'
import { useT } from '../lib/useT.ts'

// The command line of the console: a chamfered frame that lights up while it
// has focus, a prompt glyph, the model as a word you can click, and Send as
// the one solid control. Enter sends, Shift+Enter is a new line.
export default function Composer({ disabled, onOpenModels }: { disabled: boolean; onOpenModels: () => void }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const send = useChat((state) => state.send)
  const stop = useChat((state) => state.stop)
  const streaming = useChat((state) => state.streamingId !== null)
  const model = useSettings(
    (state) => state.settings.providers[state.settings.activeProvider]?.model || '',
  )
  const error = useChat((state) => state.error)
  const { t } = useT()

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`
  }, [value])

  // Return focus to the composer when a chat opens, as a desktop app should.
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus()
  }, [disabled])

  const submit = () => {
    if (!value.trim() || streaming) return
    const text = value
    setValue('')
    // If the turn could not start, put the words back instead of losing them.
    send(text).then((result) => {
      if (result?.ok === false) setValue(text)
    })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative z-20 shrink-0 border-t border-line-strong bg-[color-mix(in_srgb,var(--crevasse)_45%,var(--surface))] px-4 pb-4 pt-3 sm:px-6">
      <div className="hud-cmd flex items-end gap-3 px-3.5 py-1.5 max-w-[1100px] mx-auto w-full">
        <span aria-hidden="true" className="hud-cmd-glyph text-[1.05rem]">&gt;</span>
        <label htmlFor="composer" className="sr-only">
          {t('composer_label')}
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={model ? t('composer_placeholder_model') : t('composer_placeholder_no_model')}
          className="max-h-[200px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-prose leading-[1.6] text-frost outline-none placeholder:text-muted"
        />

        <div className="flex shrink-0 items-center gap-2.5 pb-0.5">
          <button
            type="button"
            onClick={onOpenModels}
            className="hidden max-w-[12rem] truncate pb-1.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted transition-colors hover:text-melt md:block"
            title={model || t('composer_change_model')}
          >
            {shortModelName(model) || t('composer_no_model')}
          </button>
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="hud-btn"
              aria-label={t('composer_stop_aria')}
            >
              {t('composer_stop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || disabled}
              className="hud-btn hud-btn-solid px-5"
              aria-label={t('composer_send_aria')}
            >
              {t('composer_send')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="px-5 pb-3 text-base text-frost sm:px-8" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
