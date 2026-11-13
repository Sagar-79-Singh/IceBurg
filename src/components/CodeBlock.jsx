import { useEffect, useRef, useState } from 'react'
import { copyText } from '../store/bridge.js'
import { CopyIcon, CheckIcon } from './icons.jsx'
import { useT } from '../lib/useT.js'

// Code sits in a crevasse: no border, a quieter ground than the page. The only
// motion is the copy button confirming that it copied.
export default function CodeBlock({ language, children, inline = false }) {
  const [state, setState] = useState('idle')
  const { t } = useT()
  const timer = useRef(null)
  const text = String(children ?? '').replace(/\n$/, '')

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const result = await copyText(text)
    setState(result?.ok === false ? 'failed' : 'copied')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1600)
  }

  if (inline) return <code>{children}</code>

  return (
    <div className="relative my-4 max-w-full">
      <div className="overflow-hidden border border-line bg-crevasse">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <span className="truncate font-mono text-micro text-muted">
            {language || 'text'}
          </span>
          <button
            type="button"
            onClick={copy}
            className="tap-bare h-6 gap-1.5 px-1.5 text-micro"
            aria-label={state === 'copied' ? t('code_copied') : t('code_copy_aria')}
          >
            {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
            <span>
              {state === 'copied' ? t('code_copied') : state === 'failed' ? t('code_failed') : t('code_copy')}
            </span>
          </button>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-micro leading-[1.6] text-[color:var(--code-text)]">
          <code>{text}</code>
        </pre>
      </div>
    </div>
  )
}
