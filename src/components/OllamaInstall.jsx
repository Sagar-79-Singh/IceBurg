import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { ollama, openExternal } from '../store/bridge.js'
import { Spinner, AlertIcon } from './icons.jsx'
import { useT } from '../lib/useT.js'

const LINUX_SCRIPT = 'https://ollama.com/install.sh'

// Renders the body text, turning `backtick` spans into code, in every language.
function OllamaServeHint() {
  const { t } = useT()
  const parts = t('oli_not_running_body').split('`')
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="mono">
            {part}
          </code>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

// The launch dialog. Nothing installs unless the user presses Install Ollama, and
// every step that follows is described in plain words on this screen.
export default function OllamaInstall({ open, detected, onClose, onInstalled }) {
  const { t } = useT()
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
        setMessage(payload.message || t('oli_did_not_start'))
        return
      }
      setMessage(payload.message || '')
      if (payload.step === 'done') setStage('done')
      if (payload.step === 'download' || payload.step === 'run') setStage('running')
    })
  }, [])

  const install = async () => {
    setStage('running')
    setMessage(t('oli_opening'))
    const result = await ollama.install()
    if (result?.ok) {
      setMessage(
        result.mode === 'installer'
          ? t('oli_finish_installer')
          : result.mode === 'script'
            ? t('oli_script_running')
            : 'Working…',
      )
      return
    }
    setStage('error')
    setMessage(result?.message || t('oli_could_not_open'))
    if (result?.script) setManual(result.script)
  }

  if (!open) return null

  if (stage === 'installed-not-running') {
    return (
      <Modal
        title={t('oli_installed_not_running_title')}
        description={t('oli_installed_not_running_desc')}
        onClose={onClose}
      >
        <p className="text-base text-muted">
          <OllamaServeHint />
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="tap tap-solid border-0"
            data-autofocus
            onClick={async () => {
              const next = await ollama.detect()
              if (next.running) onInstalled?.(next)
              else setMessage(t('oli_still_nothing'))
            }}
          >
            {t('oli_check_again')}
          </button>
          <button type="button" className="tap" onClick={onClose}>
            {t('oli_use_cloud')}
          </button>
        </div>
        {message && <p className="mt-3 text-base text-frost">{message}</p>}
      </Modal>
    )
  }

  if (stage === 'ask') {
    return (
      <Modal
        title={t('oli_ask_title')}
        description={t('oli_ask_desc')}
        onClose={onClose}
      >
        <p className="text-base text-muted">
          {t('oli_ask_body')}
        </p>
        {manual && (
          <pre className="mt-2 overflow-x-auto bg-crevasse p-3 font-mono text-micro">
            <code>curl -fsSL {manual} | sh</code>
          </pre>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="tap tap-solid border-0" data-autofocus onClick={install}>
            {t('oli_install')}
          </button>
          <button type="button" className="tap" onClick={onClose}>
            {t('oli_not_now')}
          </button>
        </div>
        <p className="mt-3 text-micro text-muted">
          {t('oli_ask_note')}
        </p>
      </Modal>
    )
  }

  if (stage === 'running' || stage === 'done') {
    return (
      <Modal title={t('oli_installing')} onClose={onClose}>
        <div className="flex items-start gap-3">
          {stage === 'running' ? <Spinner className="mt-1" /> : null}
          <div className="min-w-0">
            <p className="text-base text-muted">{message || t('oli_working')}</p>
            {stage === 'running' && elapsed >= 8 && (
              <p className="mt-1 text-micro text-muted">{t('oli_still_waiting')}</p>
            )}
          </div>
        </div>
        {stage === 'done' && (
          <>
            <p className="mt-3 text-base text-muted">
              {t('oli_installed_body')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="tap tap-solid border-0"
                data-autofocus
                onClick={async () => {
                  const next = await ollama.detect()
                  if (next.running) onInstalled?.(next)
                  else {
                    setStage('error')
                    setMessage(t('oli_nothing_yet'))
                  }
                }}
              >
                {t('oli_check_again')}
              </button>
              <button type="button" className="tap" onClick={onClose}>
                {t('oli_close')}
              </button>
            </div>
          </>
        )}
      </Modal>
    )
  }

  return (
    <Modal title={t('oli_failed_title')} onClose={onClose}>
      <p className="flex items-start gap-2 text-base text-frost">
        <AlertIcon className="mt-0.5 shrink-0" />
        {message}
      </p>
      {manual && (
        <pre className="mt-3 overflow-x-auto bg-crevasse p-3 font-mono text-micro">
          <code>curl -fsSL {manual} | sh</code>
        </pre>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="tap tap-solid border-0" data-autofocus onClick={install}>
          {t('oli_try_again')}
        </button>
        <button type="button" className="tap" onClick={() => openExternal(LINUX_SCRIPT)}>
          {t('oli_open_install')}
        </button>
        <button type="button" className="tap" onClick={onClose}>
          Use a cloud provider
        </button>
      </div>
    </Modal>
  )
}
