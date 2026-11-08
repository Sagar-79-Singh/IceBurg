import { useMemo, useState } from 'react'
import { useSettings } from '../store/settings.js'
import { useModels } from '../store/chat.js'
import { toast } from './Toasts.jsx'
import { DownloadIcon, Spinner, AlertIcon } from './icons.jsx'

// Pulling a model is a long download, so it says exactly where it is: which model,
// how many bytes, and a real bar that only moves when bytes arrive.
const SUGGESTIONS = [
  { name: 'llama3.2', note: '3B, quick on most laptops' },
  { name: 'qwen2.5-coder', note: '7B, good at code' },
  { name: 'mistral', note: '7B, general' },
  { name: 'gemma2:2b', note: '2B, very light' },
]

const formatSize = (bytes) => {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit < 2 ? 0 : 1)} ${units[unit]}`
}

export default function ModelPull({ onPulled }) {
  const [name, setName] = useState('')
  const pull = useModels((state) => state.pull)
  const pullModel = useModels((state) => state.pullModel)
  const cancelPull = useModels((state) => state.cancelPull)
  const clearPull = useModels((state) => state.clearPull)
  const updateProvider = useSettings((state) => state.updateProvider)
  const currentModel = useSettings((state) => state.settings.providers.ollama?.model || '')

  const running = pull?.status === 'running'
  const suggestion = useMemo(() => SUGGESTIONS.slice(0, 3), [])

  const start = (model) => {
    const target = String(model || name).trim()
    if (!target) return
    pullModel(target, {
      onDone: (pulled) => {
        updateProvider('ollama', { model: pulled })
        toast(`${pulled} is ready on Ollama.`)
        onPulled?.(pulled)
        setName('')
      },
    })
  }

  return (
    <div className="mt-4 rounded border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Pull a model</h4>
        {currentModel && <span className="truncate font-mono text-[11px] text-muted">using {currentModel}</span>}
      </div>

      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          start()
        }}
      >
        <input
          className="field font-mono text-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="llama3.2"
          spellCheck={false}
          aria-label="Model to pull"
          disabled={running}
        />
        <button type="submit" className="btn h-8 shrink-0 px-2.5 text-xs" disabled={running || !name.trim()}>
          <DownloadIcon />
          Pull
        </button>
      </form>

      {!running && !name && pull == null && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {suggestion.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => start(item.name)}
                className="rounded border border-line px-2 py-1 text-left text-xs text-muted transition-colors duration-150 hover:border-line-strong hover:text-frost"
                title={item.note}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pull && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-mono text-frost/85">{pull.model}</span>
            <span className="text-muted">
              {pull.status === 'running' && pull.total
                ? `${formatSize(pull.completed)} of ${formatSize(pull.total)}`
                : pull.status === 'running'
                  ? pull.message
                  : pull.status === 'done'
                    ? 'Ready'
                    : pull.status === 'cancelled'
                      ? 'Cancelled'
                      : ''}
            </span>
          </div>

          <div
            className="relative mt-1.5 h-1.5 overflow-hidden rounded-full"
            style={{ background: 'var(--line)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pull.total ? pull.percent : undefined}
            aria-label={`Pulling ${pull.model}`}
          >
            {pull.total ? (
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${pull.percent}%`, background: 'var(--melt)' }}
              />
            ) : running ? (
              <div className="bar-sweep relative h-full w-full overflow-hidden" />
            ) : null}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs">
            {running ? (
              <>
                <Spinner className="text-muted" />
                <span className="truncate text-muted">{pull.message}</span>
                <button type="button" className="btn btn-quiet ml-auto h-7 px-2 text-xs" onClick={cancelPull}>
                  Stop
                </button>
              </>
            ) : pull.status === 'cancelled' ? (
              <>
                <span className="text-muted">The download was stopped.</span>
                <button type="button" className="btn btn-quiet ml-auto h-7 px-2 text-xs" onClick={() => start(pull.model)}>
                  Start again
                </button>
              </>
            ) : pull.status === 'error' ? (
              <>
                <AlertIcon className="shrink-0" />
                <span className="text-frost">{pull.message}</span>
                <button type="button" className="btn btn-quiet ml-auto h-7 px-2 text-xs" onClick={() => start(pull.model)}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <span className="text-muted">The model is installed on this machine.</span>
                <button type="button" className="btn btn-quiet ml-auto h-7 px-2 text-xs" onClick={clearPull}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
