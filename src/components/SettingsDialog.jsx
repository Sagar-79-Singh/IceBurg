import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import ModelPull from './ModelPull.jsx'
import { createAdapter, definitionList, getDefinition } from '../providers/registry.js'
import { useSettings, providerStatus } from '../store/settings.js'
import { ollama, openExternal } from '../store/bridge.js'
import { toast } from './Toasts.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { CheckIcon, AlertIcon, Spinner } from './icons.jsx'

// Settings are about one thing per row: what this provider needs to work, and
// whether it works right now.
export default function SettingsDialog({ open, onClose, initialProvider, ollamaDetected, onInstallOllama }) {
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const encryption = useSettings((state) => state.encryption)
  const setActiveProvider = useSettings((state) => state.setActiveProvider)
  const [selected, setSelected] = useState(initialProvider || settings.activeProvider)
  const [versions, setVersions] = useState({})
  const [installed, setInstalled] = useState([])

  useEffect(() => {
    if (open && initialProvider) setSelected(initialProvider)
  }, [open, initialProvider])

  useEffect(() => {
    if (!open) return
    let live = true
    ollama.detect().then((result) => {
      if (live && result?.running) setInstalled((result.models || []).map((model) => model.name))
    })
    return () => {
      live = false
    }
  }, [open])

  const definition = getDefinition(selected) || definitionList[0]

  return (
    <Modal
      title="Providers and models"
      description="Keys are stored on this machine, encrypted, and only used for the requests you send."
      onClose={onClose}
      width="w-[46rem]"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="sm:border-r sm:border-line sm:pr-3">
          <ul className="space-y-0.5" role="tablist" aria-label="Providers">
            {definitionList.map((item) => {
              const state = providerStatus({ settings, keys }, item.id)
              const active = settings.activeProvider === item.id
              const current = item.id === selected
              const label =
                item.id === 'custom' ? settings.providers.custom?.label || item.name : item.name
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={current}
                    onClick={() => setSelected(item.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                      current ? 'bg-crevasse text-frost' : 'text-frost/80 hover:bg-crevasse/60'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? 'bg-frost' : state.ready ? 'bg-muted' : 'bg-line-strong'
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {state.ready ? (
                      state.reason === '' && <span className="text-[11px] text-muted">ready</span>
                    ) : (
                      <span className="text-[11px] text-muted">setup</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs text-muted">Appearance</p>
            <div className="mt-1 flex items-center gap-2">
              <ThemeToggle />
              <span className="text-sm text-frost/85">
                {settings.theme === 'light' ? 'Light theme' : 'Dark theme'}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted">
              {encryption.checked
                ? encryption.available
                  ? `Keys encrypted with the system keychain (${encryption.platform || 'this OS'}).`
                  : 'This system has no keyring, so keys are obfuscated, not encrypted.'
                : 'Checking how keys can be stored…'}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <ProviderPanel
            key={definition.id}
            definition={definition}
            isActive={settings.activeProvider === definition.id}
            onActivate={() => setActiveProvider(definition.id)}
            ollamaDetected={ollamaDetected}
            installedModels={installed}
            onInstallOllama={onInstallOllama}
            version={versions[definition.id]}
            setVersion={(value) => setVersions((state) => ({ ...state, [definition.id]: value }))}
          />
        </div>
      </div>
    </Modal>
  )
}

function ProviderPanel({
  definition,
  isActive,
  onActivate,
  ollamaDetected,
  installedModels,
  onInstallOllama,
  version,
  setVersion,
}) {
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const updateProvider = useSettings((state) => state.updateProvider)
  const saveKey = useSettings((state) => state.saveKey)
  const clearKey = useSettings((state) => state.clearKey)

  const providerSettings = settings.providers[definition.id] || {}
  const status = providerStatus({ settings, keys }, definition.id)
  const [keyDraft, setKeyDraft] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [busy, setBusy] = useState('')
  const [test, setTest] = useState(null)
  const flashTimer = useRef(null)

  const hasKey = Boolean(keys[definition.id])
  const fields = definition.fields || []
  const showKey = fields.includes('apiKey')

  useEffect(() => () => clearTimeout(flashTimer.current), [])
  useEffect(() => {
    setTest(null)
  }, [providerSettings.baseUrl, providerSettings.model, definition.id])

  const onSaveKey = async (event) => {
    event.preventDefault()
    const value = keyDraft.trim()
    if (!value) return
    const result = await saveKey(definition.id, value)
    if (result?.ok) {
      setKeyDraft('')
      setReplacing(false)
      setSavedFlash(true)
      setTest(null)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2200)
      toast(`Key saved for ${definition.name}.`)
    }
  }

  const onForgetKey = async () => {
    await clearKey(definition.id)
    setKeyDraft('')
    setReplacing(false)
    setTest(null)
    toast(`Key removed for ${definition.name}.`)
  }

  const runTest = async () => {
    setBusy('test')
    setTest(null)
    try {
      const adapter = createAdapter(definition.id, { ...providerSettings, hasKey })
      const models = await adapter.listModels({})
      setVersion(models.length)
      setTest({
        ok: true,
        message:
          models.length === 0
            ? 'Connected, but no models are available yet.'
            : `Connected. ${models.length} ${models.length === 1 ? 'model' : 'models'} available.`,
      })
    } catch (error) {
      setVersion(null)
      setTest({ ok: false, message: error.message })
    } finally {
      setBusy('')
    }
  }

  const name = definition.id === 'custom' ? providerSettings.label || definition.name : definition.name
  const isOllama = definition.id === 'ollama'
  const ollamaMissing = isOllama && ollamaDetected && !ollamaDetected.running
  const ollamaStopped = ollamaMissing && ollamaDetected.installed

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-md font-semibold">{name}</h3>
          <p className="mt-0.5 max-w-[46ch] text-sm text-muted">{definition.blurb}</p>
        </div>
        {isActive ? (
          <span className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-frost">
            <CheckIcon />
            In use
          </span>
        ) : (
          <button type="button" className="btn h-7 px-2 text-xs" onClick={onActivate} disabled={!status.ready}>
            Use this provider
          </button>
        )}
      </div>

      {ollamaMissing && (
        <div className="mt-3 rounded border border-line px-3 py-2 text-sm">
          <p className="text-frost">
            {ollamaStopped
              ? 'Ollama is installed but not running. Start it, or install it again below.'
              : "Ollama isn't installed. It runs models on this machine, with no key."}
          </p>
          <button type="button" className="btn mt-2 h-7 px-2 text-xs" onClick={onInstallOllama}>
            {ollamaStopped ? 'How to start it' : 'Install Ollama'}
          </button>
        </div>
      )}
      {isOllama && ollamaDetected?.running && (
        <div className="mt-3">
          <p className="text-sm text-muted">Ollama is running and answering on this machine.</p>
          {installedModels?.length > 0 && (
            <div className="mt-2">
              <label className="label" htmlFor="ollama-installed">
                Installed models
              </label>
              <select
                id="ollama-installed"
                className="field font-mono text-xs"
                value={
                  installedModels.includes(providerSettings.model) ? providerSettings.model : ''
                }
                onChange={(event) => {
                  if (event.target.value) updateProvider('ollama', { model: event.target.value })
                }}
              >
                <option value="">Choose one of {installedModels.length}</option>
                {installedModels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {fields.includes('label') && (
          <div>
            <label className="label" htmlFor="custom-label">
              Name
            </label>
            <input
              id="custom-label"
              className="field"
              value={providerSettings.label || ''}
              placeholder="CloseRouter"
              onChange={(event) => updateProvider(definition.id, { label: event.target.value })}
            />
          </div>
        )}

        {(fields.includes('baseUrl') || definition.editableBaseUrl) && (
          <div>
            <label className="label" htmlFor={`${definition.id}-base`}>
              {isOllama ? 'Host' : 'Base URL'}
            </label>
            <input
              id={`${definition.id}-base`}
              className="field font-mono text-xs"
              value={providerSettings.baseUrl ?? definition.defaultBaseUrl ?? ''}
              placeholder={definition.defaultBaseUrl || 'http://127.0.0.1:1234/v1'}
              spellCheck={false}
              onChange={(event) => updateProvider(definition.id, { baseUrl: event.target.value })}
            />
            {isOllama && (
              <p className="mt-1 text-xs text-muted">Leave this unless Ollama runs on another port or machine.</p>
            )}
          </div>
        )}

        {showKey && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label className="label mb-1.5" htmlFor={`${definition.id}-key`}>
                API key
              </label>
              {definition.signup && (
                <button
                  type="button"
                  className="text-xs text-muted underline decoration-line-strong underline-offset-2 hover:text-frost"
                  onClick={() => openExternal(definition.signup)}
                >
                  Where do I get one?
                </button>
              )}
            </div>
            {hasKey ? (
              <div className="flex items-center gap-2">
                <p className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm text-frost/85">
                  <CheckIcon className="text-frost" />
                  Key saved on this machine
                </p>
                <button type="button" className="btn btn-quiet h-8 px-2 text-xs" onClick={onForgetKey}>
                  Remove
                </button>
                <button
                  type="button"
                  className="btn btn-quiet h-8 px-2 text-xs"
                  onClick={() => setReplacing(true)}
                >
                  Replace
                </button>
              </div>
            ) : null}
            {(!hasKey || replacing) && (
              <form className="flex items-center gap-2" onSubmit={onSaveKey}>
                <input
                  id={`${definition.id}-key`}
                  className="field font-mono text-xs"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyDraft}
                  placeholder="Paste the key"
                  onChange={(event) => setKeyDraft(event.target.value)}
                />
                <button type="submit" className="btn h-8 shrink-0 px-2.5 text-xs" disabled={!keyDraft.trim()}>
                  Save key
                </button>
              </form>
            )}
            {definition.optionalKey && (
              <p className="mt-1 text-xs text-muted">Optional: leave empty if the router does not require one.</p>
            )}
            {savedFlash && <p className="mt-1 text-xs text-frost">Saved.</p>}
          </div>
        )}

        {fields.includes('model') && (
          <div>
            <label className="label" htmlFor={`${definition.id}-model`}>
              Model name
            </label>
            <input
              id={`${definition.id}-model`}
              className="field font-mono text-xs"
              value={providerSettings.model || ''}
              placeholder="the model id your server expects"
              spellCheck={false}
              onChange={(event) => updateProvider(definition.id, { model: event.target.value })}
            />
            <p className="mt-1 text-xs text-muted">
              Ask the server with a test below; if it lists models, pick one from the switcher instead.
            </p>
          </div>
        )}
      </div>

      {!isOllama && definition.id !== 'custom' && (
        <div className="mt-3">
          <label className="label" htmlFor={`${definition.id}-model`}>
            Model
          </label>
          <input
            id={`${definition.id}-model`}
            className="field font-mono text-xs"
            value={providerSettings.model || ''}
            placeholder="Pick one from the model menu, or type a name"
            spellCheck={false}
            onChange={(event) => updateProvider(definition.id, { model: event.target.value })}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="button" className="btn h-8 text-xs" onClick={runTest} disabled={busy === 'test'}>
          {busy === 'test' ? <Spinner /> : null}
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        {version !== undefined && version !== null && (
          <span className="text-xs text-muted">
            {version} {version === 1 ? 'model' : 'models'}
          </span>
        )}
      </div>

      {isOllama && <ModelPull />}
    </div>
  )
}
