import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.tsx'
import ModelPull from './ModelPull.tsx'
import { createAdapter, definitionList, getDefinition } from '../providers/registry.ts'
import { useSettings, providerStatus } from '../store/settings.ts'
import { ollama, openExternal } from '../store/bridge.ts'
import { toast } from './Toasts.tsx'
import ThemeToggle from './ThemeToggle.tsx'
import { CheckIcon, AlertIcon, Spinner } from './icons.tsx'
import { useT } from '../lib/useT.ts'
import type React from 'react'
import type { OllamaDetectResult } from '../../shared/ipc.ts'
import type { ProviderDefinition } from '../providers/types.ts'

interface TestResult {
  ok: boolean
  message: string
}

// Settings are about one thing per row: what this provider needs to work, and
// whether it works right now.
export default function SettingsDialog({ open, onClose, initialProvider, ollamaDetected, onInstallOllama }: { open: boolean; onClose: () => void; initialProvider?: string | null; ollamaDetected?: OllamaDetectResult | null; onInstallOllama: () => void }) {
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const encryption = useSettings((state) => state.encryption)
  const setActiveProvider = useSettings((state) => state.setActiveProvider)
  const update = useSettings((state) => state.update)
  const [selected, setSelected] = useState(initialProvider || settings.activeProvider)
  const [versions, setVersions] = useState<Record<string, number | null>>({})
  const [installed, setInstalled] = useState<string[]>([])
  const { t } = useT()
  const language = settings.language || 'hinglish'
  const isPreset = language === 'hinglish' || language === 'english' || language === 'hindi'
  const [otherDraft, setOtherDraft] = useState(isPreset ? '' : language)
  const [otherMode, setOtherMode] = useState(!isPreset)
  const showOther = otherMode || !isPreset

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
  if (!definition) return null

  return (
    <Modal
      title={t('set_title')}
      description={t('set_desc')}
      onClose={onClose}
      width="w-[46rem]"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="sm:border-r sm:border-line sm:pr-3">
          <ul className="space-y-0.5" role="tablist" aria-label={t('set_providers_aria')}>
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
                    className={`flex w-full items-center gap-2  px-2 py-1.5 text-left text-base transition-colors duration-150 ${
                      current ? 'bg-crevasse text-frost' : 'text-frost/80 hover:bg-crevasse/60'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0  ${
                        active ? 'bg-frost' : state.ready ? 'bg-muted' : 'bg-line-strong'
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {state.ready ? (
                      state.reason === '' && <span className="text-micro text-muted">{t('setup_ready')}</span>
                    ) : (
                      <span className="text-micro text-muted">{t('menu_setup')}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-micro text-muted">{t('set_appearance')}</p>
            <div className="mt-1">
              <ThemeToggle />
            </div>
            <p className="mt-3 text-micro text-muted">
              {encryption.checked
                ? encryption.available
                  ? t('set_keys_keychain', { platform: encryption.platform || 'this OS' })
                  : t('set_keys_no_keyring')
                : t('set_keys_checking')}
            </p>
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <p className="text-micro text-muted">{t('set_language_section')}</p>
            <label className="label mt-1" htmlFor="language-select">
              {t('set_language_label')}
            </label>
            <select
              id="language-select"
              className="field"
              value={showOther ? 'other' : language}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'other') {
                  setOtherMode(true)
                  return
                }
                setOtherMode(false)
                update({ language: value })
              }}
            >
              <option value="hinglish">{t('language_hinglish')}</option>
              <option value="english">{t('language_english')}</option>
              <option value="hindi">{t('language_hindi')}</option>
              <option value="other">{t('language_other')}</option>
            </select>
            {showOther && (
              <>
                <input
                  className="field mt-2"
                  value={otherDraft}
                  autoFocus
                  placeholder={t('set_language_other_placeholder')}
                  aria-label={t('set_language_other_aria')}
                  onChange={(event) => {
                    const value = event.target.value
                    setOtherDraft(value)
                    const clean = value.trim()
                    if (clean.length >= 2) update({ language: clean })
                  }}
                />
                <p className="mt-1.5 text-micro text-muted">{t('set_language_other_note')}</p>
              </>
            )}
            <p className="mt-1.5 text-micro text-muted">{t('set_language_caption')}</p>
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
}: {
  definition: ProviderDefinition
  isActive: boolean
  onActivate: () => void
  ollamaDetected?: OllamaDetectResult | null
  installedModels: string[]
  onInstallOllama: () => void
  version?: number | null
  setVersion: (value: number | null) => void
}) {
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const updateProvider = useSettings((state) => state.updateProvider)
  const saveKey = useSettings((state) => state.saveKey)
  const clearKey = useSettings((state) => state.clearKey)
  const { t } = useT()

  const providerSettings = settings.providers[definition.id] || { model: '' }
  const status = providerStatus({ settings, keys }, definition.id)
  const [keyDraft, setKeyDraft] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [busy, setBusy] = useState('')
  const [test, setTest] = useState<TestResult | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasKey = Boolean(keys[definition.id])
  const fields = definition.fields || []
  const showKey = fields.includes('apiKey')

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])
  useEffect(() => {
    setTest(null)
  }, [providerSettings.baseUrl, providerSettings.model, definition.id])

  const onSaveKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = keyDraft.trim()
    if (!value) return
    const result = await saveKey(definition.id, value)
    if (result?.ok) {
      setKeyDraft('')
      setReplacing(false)
      setSavedFlash(true)
      setTest(null)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2200)
      toast(t('set_key_saved_toast', { name: definition.name }))
    }
  }

  const onForgetKey = async () => {
    await clearKey(definition.id)
    setKeyDraft('')
    setReplacing(false)
    setTest(null)
    toast(t('set_key_removed_toast', { name: definition.name }))
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
            ? t('set_connected_none')
            : models.length === 1 ? t('set_connected_one') : t('set_connected_some', { n: models.length }),
      })
    } catch (error) {
      setVersion(null)
      setTest({ ok: false, message: (error as Error)?.message || String(error) })
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
          <h3 className="display text-lead">{name}</h3>
          <p className="mt-0.5 max-w-[46ch] text-base text-muted">{definition.blurb}</p>
        </div>
        {isActive ? (
          <span className="flex items-center gap-1.5 border border-line px-2 py-1 text-micro text-frost">
            <CheckIcon />
            {t('set_in_use')}
          </span>
        ) : (
          <button type="button" className="tap h-7 px-2 text-micro" onClick={onActivate} disabled={!status.ready}>
            {t('set_use_provider')}
          </button>
        )}
      </div>

      {ollamaMissing && (
        <div className="mt-3 border border-line px-3 py-2 text-base">
          <p className="text-frost">
            {ollamaStopped ? t('set_ollama_not_running') : t('set_ollama_not_installed')}
          </p>
          <button type="button" className="tap mt-2 h-7 px-2 text-micro" onClick={onInstallOllama}>
            {ollamaStopped ? t('set_how_start') : t('set_install_ollama')}
          </button>
        </div>
      )}
      {isOllama && ollamaDetected?.running && (
        <div className="mt-3">
          <p className="text-base text-muted">{t('set_ollama_running')}</p>
          {installedModels.length > 0 && (
            <div className="mt-2">
              <label className="label" htmlFor="ollama-installed">
                {t('set_installed_models')}
              </label>
              <select
                id="ollama-installed"
                className="field font-mono text-micro"
                value={
                  installedModels.includes(providerSettings.model) ? providerSettings.model : ''
                }
                onChange={(event) => {
                  if (event.target.value) updateProvider('ollama', { model: event.target.value })
                }}
              >
                <option value="">{t('set_choose_one', { n: installedModels.length })}</option>
                {installedModels.map((name: string) => (
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
              {t('set_name')}
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
              {isOllama ? t('set_host') : t('set_base_url')}
            </label>
            <input
              id={`${definition.id}-base`}
              className="field font-mono text-micro"
              value={providerSettings.baseUrl ?? definition.defaultBaseUrl ?? ''}
              placeholder={definition.defaultBaseUrl || 'http://127.0.0.1:1234/v1'}
              spellCheck={false}
              onChange={(event) => updateProvider(definition.id, { baseUrl: event.target.value })}
            />
            {isOllama && (
              <p className="mt-1 text-micro text-muted">{t('set_base_url_note')}</p>
            )}
          </div>
        )}

        {showKey && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label className="label mb-1.5" htmlFor={`${definition.id}-key`}>
                {t('set_api_key')}
              </label>
              {definition.signup && (
                <button
                  type="button"
                  className="text-micro text-muted underline decoration-line-strong underline-offset-2 hover:text-frost"
                  onClick={() => { const url = definition.signup; if (url) void openExternal(url) }}
                >
                  {t('set_where_key')}
                </button>
              )}
            </div>
            {hasKey ? (
              <div className="flex items-center gap-2">
                <p className="flex items-center gap-2 border border-line px-3 py-2 text-base text-frost/85">
                  <CheckIcon className="text-frost" />
                  {t('set_key_saved_on_machine')}
                </p>
                <button type="button" className="tap-bare h-8 px-2 text-micro" onClick={onForgetKey}>
                  {t('set_key_remove')}
                </button>
                <button
                  type="button"
                  className="tap-bare h-8 px-2 text-micro"
                  onClick={() => setReplacing(true)}
                >
                  {t('set_key_replace')}
                </button>
              </div>
            ) : null}
            {(!hasKey || replacing) && (
              <form className="flex items-center gap-2" onSubmit={onSaveKey}>
                <input
                  id={`${definition.id}-key`}
                  className="field font-mono text-micro"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyDraft}
                  placeholder={t('set_paste_key')}
                  onChange={(event) => setKeyDraft(event.target.value)}
                />
                <button type="submit" className="tap h-8 shrink-0 px-2.5 text-micro" disabled={!keyDraft.trim()}>
                  {t('set_save_key')}
                </button>
              </form>
            )}
            {definition.optionalKey && (
              <p className="mt-1 text-micro text-muted">{t('set_key_optional')}</p>
            )}
            {savedFlash && <p className="mt-1 text-micro text-frost">{t('set_saved_flash')}</p>}
          </div>
        )}

        {fields.includes('model') && (
          <div>
            <label className="label" htmlFor={`${definition.id}-model`}>
              {t('set_model_name')}
            </label>
            <input
              id={`${definition.id}-model`}
              className="field font-mono text-micro"
              value={providerSettings.model || ''}
              placeholder={t('set_model_placeholder')}
              spellCheck={false}
              onChange={(event) => updateProvider(definition.id, { model: event.target.value })}
            />
            <p className="mt-1 text-micro text-muted">
              {t('set_model_note')}
            </p>
          </div>
        )}
      </div>

      {!isOllama && definition.id !== 'custom' && (
        <div className="mt-3">
          <label className="label" htmlFor={`${definition.id}-model`}>
            {t('set_model')}
          </label>
          <input
            id={`${definition.id}-model`}
            className="field font-mono text-micro"
            value={providerSettings.model || ''}
            placeholder={t('set_model_menu_placeholder')}
            spellCheck={false}
            onChange={(event) => updateProvider(definition.id, { model: event.target.value })}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="button" className="tap h-8 text-micro" onClick={runTest} disabled={busy === 'test'}>
          {busy === 'test' ? <Spinner /> : null}
          {busy === 'test' ? t('set_testing') : t('set_test_connection')}
        </button>
        {version !== undefined && version !== null && (
          <span className="text-micro text-muted">
            {version === 1 ? t('set_one_model') : t('set_models', { n: version })}
          </span>
        )}
      </div>

      {isOllama && <ModelPull />}
    </div>
  )
}
