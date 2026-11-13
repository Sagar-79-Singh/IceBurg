import { create } from 'zustand'
import { storage, secrets, appInfo } from './bridge.js'
import { definitionList, getDefinition, createAdapter, providerLabel } from '../providers/registry.js'
import { setActiveLanguage } from '../lib/i18n.js'

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  // 'hinglish' | 'english' | 'hindi' | any other language name the model speaks.
  language: 'hinglish',
  activeProvider: 'ollama',
  // Per provider: { baseUrl, label, model }
  providers: {
    ollama: { baseUrl: 'http://127.0.0.1:11434', model: '' },
    openrouter: { model: '' },
    omniroute: { baseUrl: 'http://127.0.0.1:20128/v1', model: 'auto' },
    gemini: { model: '' },
    custom: { baseUrl: '', model: '', label: 'CloseRouter' },
  },
  onboarding: {
    ollamaChecked: false,
    ollamaDeclined: false,
  },
}

const mergeSettings = (saved) => {
  if (!saved) return structuredClone(DEFAULT_SETTINGS)
  const merged = { ...structuredClone(DEFAULT_SETTINGS), ...saved }
  merged.providers = { ...structuredClone(DEFAULT_SETTINGS.providers), ...(saved.providers || {}) }
  merged.onboarding = { ...DEFAULT_SETTINGS.onboarding, ...(saved.onboarding || {}) }
  return merged
}

let saveTimer = null

export const useSettings = create((set, get) => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  keys: {},
  encryption: { available: false, checked: false },
  loaded: false,

  async load() {
    const [saved, keyMap, encryption] = await Promise.all([
      storage.read('settings'),
      secrets.list(),
      secrets.available(),
    ])
    const settings = mergeSettings(saved)
    setActiveLanguage(settings.language)
    set({
      settings,
      keys: keyMap || {},
      encryption: { available: Boolean(encryption), checked: true },
      loaded: true,
    })
    return { settings, keys: keyMap || {} }
  },

  /** Settings change on explicit actions only, so they are written at once. */
  persist() {
    clearTimeout(saveTimer)
    storage.write('settings', get().settings)
  },

  update(patch) {
    set((state) => ({ settings: { ...state.settings, ...patch } }))
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'language')) {
      setActiveLanguage(patch.language)
    }
    get().persist()
  },

  updateProvider(providerId, patch) {
    set((state) => ({
      settings: {
        ...state.settings,
        providers: {
          ...state.settings.providers,
          [providerId]: { ...(state.settings.providers[providerId] || {}), ...patch },
        },
      },
    }))
    get().persist()
  },

  setActiveProvider(providerId) {
    if (!getDefinition(providerId)) return
    get().update({ activeProvider: providerId })
  },

  setOnboarding(patch) {
    set((state) => ({
      settings: { ...state.settings, onboarding: { ...state.settings.onboarding, ...patch } },
    }))
    get().persist()
  },

  async saveKey(providerId, key) {
    const result = await secrets.set(providerId, key)
    if (result?.ok) {
      set((state) => {
        const keys = { ...state.keys }
        if (String(key || '').trim()) keys[providerId] = true
        else delete keys[providerId]
        return { keys }
      })
    }
    return result
  },

  async clearKey(providerId) {
    const result = await secrets.clear(providerId)
    set((state) => {
      const keys = { ...state.keys }
      delete keys[providerId]
      return { keys }
    })
    return result
  },

  async detectEncryption() {
    const [info, available] = await Promise.all([appInfo(), secrets.available()])
    set({ encryption: { available: Boolean(available), checked: true, platform: info?.platform } })
    return info
  },
}))

export function providerStatus(state, providerId) {
  const definition = getDefinition(providerId)
  if (!definition) return { ready: false, reason: 'Unknown provider.' }
  const providerSettings = state.settings.providers[providerId] || {}
  const hasKey = Boolean(state.keys[providerId])
  const needsKey = (definition.fields || []).includes('apiKey') && !definition.optionalKey
  if (needsKey && !hasKey) {
    return { ready: false, reason: 'Needs an API key.' }
  }
  if (definition.id === 'custom') {
    if (!providerSettings.baseUrl) return { ready: false, reason: 'Needs a base URL.' }
    if (!providerSettings.model) return { ready: false, reason: 'Needs a model name.' }
  }
  return { ready: true, reason: '' }
}

/** The adapter for whoever is active, with the user's settings baked in. */
export function activeAdapter(state) {
  const providerId = state.settings.activeProvider
  const providerSettings = state.settings.providers[providerId] || {}
  const definition = getDefinition(providerId)
  return {
    providerId,
    definition,
    label: providerLabel(providerId, providerSettings),
    model: providerSettings.model || '',
    adapter: definition
      ? createAdapter(providerId, { ...providerSettings, hasKey: Boolean(state.keys[providerId]) })
      : null,
  }
}

export { definitionList }
