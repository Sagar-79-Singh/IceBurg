import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { ollama, openExternal } from '../store/bridge.js'
import { Spinner, AlertIcon } from './icons.jsx'

const LINUX_SCRIPT = 'https://ollama.com/install.sh'

// The launch dialog. Nothing installs unless the user presses Install Ollama, and
// every step that follows is described in plain words on this screen.
export default function OllamaInstall({ open, detected, onClose, onInstalled }) {
  const [stage, setStage] = useState('ask')
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!open) return
    setStage(detected?.installed ? 'installed-not-running' : 'ask')
    setMessage('')
    setManual(null)
  }, [open, detected?.installed])

  // Windows and macOS hand off to their own installer, which never reports back,
  // so the wait is time-based here rather than invented progress.
  useEffect(() => {
    if (stage !== 'running') return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [stage])

  useEffect(() => {
    return ollama.onInstallProgress((payload) => {
      if (payload.step === 'error') {
        setStage('error')
        setMessage(payload.message || 'The install did not start.')
        return
      }
      setMessage(payload.message || '')
      if (payload.step === 'done') setStage('done')
      if (payload.step === 'download' || payload.step === 'run') setStage('running')
    })
  }, [])

  const install = async () => {
    setStage('running')
    setMessage('Opening the official installer…')
    const result = await ollama.install()
    if (result?.ok) {
      setMessage(
        result.mode === 'installer'
          ? 'Finish the installer, then check again here.'
          : result.mode === 'script'
            ? 'The official script is running in your terminal. Watch it for the sudo prompt.'
            : 'Working…',
      )
      return
    }
    setStage('error')
    setMessage(result?.message || 'The installer could not be opened.')
    if (result?.script) setManual(result.script)
  }

  if (!open) return null

  if (stage === 'installed-not-running') {
    return (
      <Modal
        title="Ollama is installed, but not running"
        description="IceBurg found Ollama on this machine but nothing is answering on port 11434."
        onClose={onClose}
      >
        <p className="text-sm text-muted">
          Open the Ollama app, or run <code className="mono">ollama serve</code> in a terminal, then
          check again.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            data-autofocus
            onClick={async () => {
              const next = await ollama.detect()
              if (next.running) onInstalled?.(next)
              else setMessage("Still nothing on port 11434. Give it a few seconds, then check again.")
            }}
          >
            Check again
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Use a cloud provider
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-frost">{message}</p>}
      </Modal>
    )
  }

  if (stage === 'ask') {
    return (
      <Modal
        title="Ollama isn't installed"
        description="Ollama runs models on this computer, privately and without a key."
        onClose={onClose}
      >
        <p className="text-sm text-muted">
          Install it now and IceBurg will find it automatically. You can also keep going with a
          cloud provider instead.
        </p>
        {manual && (
          <pre className="mt-2 overflow-x-auto rounded bg-crevasse p-3 font-mono text-xs">
            <code>curl -fsSL {manual} | sh</code>
          </pre>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" data-autofocus onClick={install}>
            Install Ollama
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Not now
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Uses the official installer from ollama.com. Windows and macOS open it; Linux runs the
          official script in your terminal.
        </p>
      </Modal>
    )
  }

  if (stage === 'running' || stage === 'done') {
    return (
      <Modal title="Installing Ollama" onClose={onClose}>
        <div className="flex items-start gap-3">
          {stage === 'running' ? <Spinner className="mt-1" /> : null}
          <div className="min-w-0">
            <p className="text-sm text-muted">{message || 'Working…'}</p>
            {stage === 'running' && elapsed >= 8 && (
              <p className="mt-1 text-xs text-muted">Still waiting on the installer. Check the app it opened.</p>
            )}
          </div>
        </div>
        {stage === 'done' && (
          <>
            <p className="mt-3 text-sm text-muted">
              When the installer finishes, come back here and check again. Ollama may need to be
              started once.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                data-autofocus
                onClick={async () => {
                  const next = await ollama.detect()
                  if (next.running) onInstalled?.(next)
                  else {
                    setStage('error')
                    setMessage('Nothing is answering on port 11434 yet. Start Ollama, then check again.')
                  }
                }}
              >
                Check again
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </Modal>
    )
  }

  return (
    <Modal title="Ollama was not installed" onClose={onClose}>
      <p className="flex items-start gap-2 text-sm text-frost">
        <AlertIcon className="mt-0.5 shrink-0" />
        {message}
      </p>
      {manual && (
        <pre className="mt-3 overflow-x-auto rounded bg-crevasse p-3 font-mono text-xs">
          <code>curl -fsSL {manual} | sh</code>
        </pre>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" data-autofocus onClick={install}>
          Try again
        </button>
        <button type="button" className="btn" onClick={() => openExternal(LINUX_SCRIPT)}>
          Open the install page
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Use a cloud provider
        </button>
      </div>
    </Modal>
  )
}
