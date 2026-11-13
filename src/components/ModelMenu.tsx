import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettings, activeAdapter, providerStatus } from '../store/settings.ts'
import { definitionList, createAdapter } from '../providers/registry.ts'
import { useChat } from '../store/chat.ts'
import { Spinner, CheckIcon, AlertIcon } from './icons.tsx'
import { shortModelName } from '../lib/modelName.ts'
import { useT } from '../lib/useT.ts'
import type { ModelInfo } from '../providers/types.ts'

type ModelsState =
  | { status: 'idle' | 'loading' | 'blocked' | 'error'; items: ModelInfo[]; error: string }
  | { status: 'ready'; items: ModelInfo[]; error: string }

// Header switcher: provider on the left of a rule, models on the right.
// Models are fetched when the menu opens, never at launch.
export default function ModelMenu({ onOpenSettings }: { onOpenSettings: (providerId?: string | null) => void }) {
  const { t } = useT()
  const settings = useSettings((state) => state.settings)
  const keys = useSettings((state) => state.keys)
  const setActiveProvider = useSettings((state) => state.setActiveProvider)
  const updateProvider = useSettings((state) => state.updateProvider)
  const isStreaming = useChat((state) => state.streamingId !== null)
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<ModelsState>({ status: 'idle', items: [], error: '' })
  const [hovered, setHovered] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const active = useMemo(() => activeAdapter({ settings, keys }), [settings, keys])
  const status = providerStatus({ settings, keys }, settings.activeProvider)

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && (panelRef.current?.contains(target) || triggerRef.current?.contains(target))) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  const providerId = settings.activeProvider

  useEffect(() => {
    if (!open) return
    if (!status.ready) {
      setModels({ status: 'blocked', items: [], error: status.reason })
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setModels({ status: 'loading', items: [], error: '' })
    const providerSettings = settings.providers[providerId] || { model: '' }
    const adapter = createAdapter(providerId, {
      ...providerSettings,
      hasKey: Boolean(keys[providerId]),
    })
    adapter
      .listModels({ signal: controller.signal })
      .then((items) => {
        if (cancelled) return
        setModels({ status: 'ready', items, error: '' })
        // With nothing chosen yet, pick the first model so the composer is usable.
        if (!providerSettings.model && items[0]) updateProvider(providerId, { model: items[0].id })
      })
      .catch((error: { code?: string; message?: string }) => {
        if (cancelled || error?.code === 'aborted') return
        setModels({ status: 'error', items: [], error: error?.message || String(error) })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, providerId, status.ready, status.reason, keys, updateProvider])

  const chooseProvider = (id: string) => {
    setActiveProvider(id)
    setHovered(null)
  }

  const chooseModel = (id: string) => {
    updateProvider(providerId, { model: id })
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="group flex max-w-[34vw] items-baseline gap-2.5 border-b border-transparent pb-0.5 text-left transition-colors duration-150 hover:border-line-strong md:max-w-[22rem]"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate text-base text-frost">{active.label}</span>
        <span aria-hidden="true" className="h-3.5 w-px self-center bg-line-strong" />
        <span className="meta truncate" title={active.model || ''}>
          {shortModelName(active.model) || t('menu_no_models_yet')}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('menu_choose_aria')}
          className="pane absolute left-0 top-full z-40 mt-2 w-[min(34rem,calc(100vw-2rem))] p-2"
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
            <div className="sm:border-r sm:border-line sm:pr-2">
              <p className="px-2 pb-1 pt-1 text-micro text-muted">{t('menu_providers')}</p>
              <ul className="space-y-0.5">
                {definitionList.map((definition) => {
                  const providerSettings = settings.providers[definition.id] || { model: '' }
                  const providerState = providerStatus({ settings, keys }, definition.id)
                  const selected = definition.id === providerId
                  return (
                    <li key={definition.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHovered(definition.id)}
                        onFocus={() => setHovered(definition.id)}
                        aria-pressed={selected}
                        onClick={() => chooseProvider(definition.id)}
                        className={`flex w-full items-center gap-2  px-2 py-1.5 text-left text-base transition-colors duration-150 ${
                          selected ? 'bg-crevasse text-frost' : 'text-frost/85 hover:bg-crevasse/60'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0  ${
                            selected ? 'bg-frost' : providerState.ready ? 'bg-muted/50' : 'bg-line-strong'
                          }`}
                        />
                        <span className="truncate">
                          {definition.id === 'custom'
                            ? providerSettings.label || definition.name
                            : definition.name}
                        </span>
                        {!providerState.ready && (
                          <span className="ml-auto text-micro text-muted">{t('menu_setup')}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                className="mt-1 w-full px-2 py-1.5 text-left text-base text-muted transition-colors duration-150 hover:bg-crevasse/60 hover:text-frost"
                onClick={() => {
                  setOpen(false)
                  onOpenSettings(providerId)
                }}
              >
                {t('menu_provider_setup')}
              </button>
            </div>

            <div className="min-w-0 sm:pl-1">
              <div className="flex items-baseline justify-between px-2 pb-1 pt-1">
                <p className="text-micro text-muted">{t('menu_models')}</p>
                {models.status === 'ready' && (
                  <p className="font-mono text-micro text-muted">{models.items.length}</p>
                )}
              </div>
              <ModelList
                models={models}
                current={active.model}
                disabled={isStreaming}
                onChoose={chooseModel}
              />
              {hovered && hovered !== providerId && (
                <p className="px-2 pt-2 text-micro text-muted">
                  {definitionList.find((definition) => definition.id === hovered)?.blurb}
                </p>
              )}
              {!status.ready && (
                <button
                  type="button"
                  className="mt-2 w-full px-2 py-1.5 text-left text-base text-frost transition-colors duration-150 hover:bg-crevasse/60"
                  onClick={() => {
                    setOpen(false)
                    onOpenSettings(providerId)
                  }}
                >
                  {t('menu_finish_setup', { label: active.label })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelList({ models, current, disabled, onChoose }: { models: ModelsState; current?: string; disabled?: boolean; onChoose: (id: string) => void }) {
  const { t } = useT()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  if (models.status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-base text-muted" role="status">
        <Spinner />
        {t('menu_loading')}
      </div>
    )
  }

  if (models.status === 'blocked') {
    return (
      <p className="flex items-start gap-2 px-2 py-3 text-base text-muted">
        <AlertIcon className="mt-0.5 shrink-0" />
        {models.error}
      </p>
    )
  }

  if (models.status === 'error') {
    return (
      <div className="px-2 py-3 text-base">
        <p className="flex items-start gap-2 text-frost">
          <AlertIcon className="mt-0.5 shrink-0" />
          {models.error}
        </p>
        {/connect|refus|reach|running|address|network/i.test(models.error) && (
          <p className="mt-1 pl-6 text-micro text-muted">
            {t('menu_start_service')}
          </p>
        )}
      </div>
    )
  }

  if (!models.items.length) {
    return <p className="px-2 py-3 text-base text-muted">{t('menu_no_models')}</p>
  }

  return (
    <div ref={scrollRef} className="max-h-[15rem] overflow-y-auto" role="listbox" aria-label={t('menu_models_aria')}>
      <ul className="space-y-0.5">
        {models.items.map((model) => {
          const selected = model.id === current
          return (
            <li key={model.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => onChoose(model.id)}
                className={`flex w-full items-center gap-2  px-2 py-1.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected ? 'bg-crevasse text-frost' : 'text-frost/85 hover:bg-crevasse/60'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-micro">{model.id}</span>
                {model.meta && <span className="shrink-0 text-micro text-muted">{model.meta}</span>}
                {selected && <CheckIcon className="shrink-0 text-frost" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
