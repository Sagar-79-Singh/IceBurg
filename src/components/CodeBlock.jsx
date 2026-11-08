import { useEffect, useRef, useState } from 'react'
import { copyText } from '../store/bridge.js'
import { CopyIcon, CheckIcon } from './icons.jsx'

// Code sits in a crevasse: no border, a quieter ground than the page. The only
// motion is the copy button confirming that it copied.
export default function CodeBlock({ language, children, inline = false }) {
  const [state, setState] = useState('idle')
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
    <div className="group/code relative my-4 max-w-full">
      <div className="overflow-hidden rounded-md bg-crevasse">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <span className="truncate font-mono text-[11px] text-muted">
            {language || 'text'}
          </span>
          <button
            type="button"
            onClick={copy}
            className="btn btn-quiet h-6 gap-1.5 px-1.5 text-xs"
            aria-label={state === 'copied' ? 'Copied' : 'Copy code'}
          >
            {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
            <span>
              {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
            </span>
          </button>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-[1.6] text-[color:var(--code-text)]">
          <code>{text}</code>
        </pre>
      </div>
    </div>
  )
}
