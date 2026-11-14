import { create } from 'zustand'
import type { AppInfo, AppSettings, OnboardingSettings, ProviderSettings, SecretMap } from '../../shared/ipc.ts'
import { storage, secrets, appInfo } from './bridge.ts'
import { definitionList, getDefinition, createAdapter, providerLabel } from '../providers/registry.ts'
import { setActiveLanguage } from '../lib/i18n.ts'

export const DEFAULT_SETTINGS: AppSettings = {
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
  // Voice Mode defaults. Persisted under the same `settings` document, so old
  // saves merge forward cleanly through DEFAULT_SETTINGS.
  voiceFaceMode: 'face',
  voiceVoiceURI: '',
  voiceRate: 1,
  voiceInputDeviceId: '',
  voiceInputDeviceLabel: '',
  voiceSpeakReplies: true,
  voiceSttLanguage: 'auto',
  voiceAccent: '',
  voiceSttConsent: false,
}

const mergeSettings = (saved: Partial<AppSettings> | null): AppSettings => {
  if (!saved) return structuredClone(DEFAULT_SETTINGS)
  const merged = { ...structuredClone(DEFAULT_SETTINGS), ...saved }
  merged.providers = { ...structuredClone(DEFAULT_SETTINGS.providers), ...(saved.providers || {}) }
  merged.onboarding = { ...DEFAULT_SETTINGS.onboarding, ...(saved.onboarding || {}) }
  // Old saves predate voice settings; clamp whatever they have into shape so the
  // HUD never sees e.g. an out-of-range rate.
  merged.voiceFaceMode = merged.voiceFaceMode === 'orb' ? 'orb' : 'face'
  merged.voiceVoiceURI = typeof merged.voiceVoiceURI === 'string' ? merged.voiceVoiceURI : ''
  merged.voiceRate = Number.isFinite(Number(merged.voiceRate))
    ? Math.min(2, Math.max(0.5, Number(merged.voiceRate)))
    : 1
  merged.voiceInputDeviceId = typeof merged.voiceInputDeviceId === 'string' ? merged.voiceInputDeviceId : ''
  merged.voiceInputDeviceLabel = typeof merged.voiceInputDeviceLabel === 'string' ? merged.voiceInputDeviceLabel : ''
  merged.voiceSpeakReplies = merged.voiceSpeakReplies !== false
  merged.voiceSttLanguage = typeof merged.voiceSttLanguage === 'string' ? merged.voiceSttLanguage : 'auto'
  merged.voiceAccent = typeof merged.voiceAccent === 'string' ? merged.voiceAccent : ''
  merged.voiceSttConsent = merged.voiceSttConsent === true
  return merged
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export interface SettingsState {
  settings: AppSettings
  keys: SecretMap
  encryption: { available: boolean; checked: boolean; platform?: string }
  loaded: boolean
  load(): Promise<{ settings: AppSettings; keys: SecretMap }>
  persist(): void
  update(patch: Partial<AppSettings>): void
  updateProvider(providerId: string, patch: Partial<ProviderSettings>): void
  setActiveProvider(providerId: string): void
  setOnboarding(patch: Partial<OnboardingSettings>): void
  saveKey(providerId: string, key: string): Promise<{ ok: boolean; message?: string; encrypted?: boolean }>
  clearKey(providerId: string): Promise<{ ok: boolean; message?: string }>
  detectEncryption(): Promise<AppInfo>
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  keys: {},
  encryption: { available: false, checked: false },
  loaded: false,

  async load() {
    const [saved, keyMap, encryption] = await Promise.all([
      storage.read<Partial<AppSettings>>('settings'),
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
    if (saveTimer) clearTimeout(saveTimer)
    storage.write('settings', get().settings)
  },

  update(patch: Partial<AppSettings>) {
    set((state) => ({ settings: { ...state.settings, ...patch } }))
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'language')) {
      setActiveLanguage(patch.language)
    }
    get().persist()
  },

  updateProvider(providerId: string, patch: Partial<ProviderSettings>) {
    set((state) => ({
      settings: {
        ...state.settings,
        providers: {
          ...state.settings.providers,
          [providerId]: { ...(state.settings.providers[providerId] || { model: '' }), ...patch },
        },
      },
    }))
    get().persist()
  },

  setActiveProvider(providerId: string) {
    if (!getDefinition(providerId)) return
    get().update({ activeProvider: providerId })
  },

  setOnboarding(patch: Partial<OnboardingSettings>) {
    set((state) => ({
      settings: { ...state.settings, onboarding: { ...state.settings.onboarding, ...patch } },
    }))
    get().persist()
  },

  async saveKey(providerId: string, key: string) {
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

  async clearKey(providerId: string) {
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

export function providerStatus(state: Pick<SettingsState, 'settings' | 'keys'>, providerId: string): { ready: boolean; reason: string } {
  const definition = getDefinition(providerId)
  if (!definition) return { ready: false, reason: 'Unknown provider.' }
  const providerSettings = state.settings.providers[providerId] || { model: '' }
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
export function activeAdapter(state: Pick<SettingsState, 'settings' | 'keys'>) {
  const providerId = state.settings.activeProvider
  const providerSettings = state.settings.providers[providerId] || { model: '' }
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
