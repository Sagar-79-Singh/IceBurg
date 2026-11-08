import { useMemo } from 'react'
import { useSettings, activeAdapter, providerStatus } from '../store/settings.js'
import { useChat } from '../store/chat.js'

// The empty screen offers exactly one clear action: pick a model if a provider is
// ready, otherwise finish setup for one.
export default function EmptyState({ onOpenSettings, ollamaDown = false }) {
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const send = useChat((state) => state.send)

  const active = useMemo(() => activeAdapter({ settings, keys }), [settings, keys])
  const status = providerStatus({ settings, keys }, settings.activeProvider)
  const ready = status.ready && Boolean(active.model)
  const needsSetup = !status.ready
  const localDown = ollamaDown && settings.activeProvider === 'ollama'

  const starters = [
    'Explain what a race condition is, with a small example.',
    'Turn this regex into plain English: ^[a-z0-9_-]{3,16}$',
    'Write a SQL query that finds the second-highest salary per department.',
  ]

  return (
    <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pt-[12vh]">
      <div className="w-full max-w-[38rem]">
        <p className="mb-3 font-mono text-xs text-muted">IceBurg</p>
        <h1 className="text-xl font-semibold tracking-tight">One window for every model you use.</h1>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          {ready
            ? `Ready on ${active.label} with ${active.model}. Type below, or start from one of these.`
            : localDown
              ? "Ollama isn't running. Start it, or pick another provider."
              : 'Nothing leaves this machine except the messages you send to a cloud provider. Pick a model to begin.'}
        </p>

        {!ready ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenSettings(settings.activeProvider)}
            >
              {needsSetup ? 'Add a provider' : 'Pick a model'}
            </button>
            <button type="button" className="btn" onClick={() => onOpenSettings(settings.activeProvider)}>
              Provider setup
            </button>
          </div>
        ) : (
          <ul className="mt-6 space-y-1">
            {starters.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  onClick={() => send(prompt)}
                  className="w-full rounded border border-transparent px-2.5 py-2 text-left text-[15px] text-muted transition-colors duration-150 hover:border-line hover:bg-glacier/60 hover:text-frost"
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
