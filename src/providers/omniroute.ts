// OmniRoute is an OpenAI-compatible router that usually runs on this machine on
// port 20128 (npx omniroute or omniroute). It can require a key, and it can also
// be hosted. Both work: the address and the key are both editable.
import type { AdapterSettings, ModelInfo, ProviderAdapter, ProviderDefinition, WireMessage } from './types.ts'
import { streamText, parseSse, toError } from './http.ts'
import { translate, getActiveLanguage } from '../lib/i18n.ts'

const DEFAULT_BASE = 'http://127.0.0.1:20128/v1'

const created = (settings: AdapterSettings): ProviderAdapter => {
  const base = (settings?.baseUrl?.trim() || DEFAULT_BASE).replace(/\/+$/, '')
  const hasKey = Boolean(settings?.hasKey)

  return {
    id: 'omniroute',
    name: 'OmniRoute',
    type: 'router',

    async listModels({ signal }: { signal?: AbortSignal } = {}): Promise<ModelInfo[]> {
      let raw = ''
      for await (const chunk of streamText({
        url: `${base}/models`,
        method: 'GET',
        auth: hasKey ? { providerId: 'omniroute', label: 'OmniRoute' } : undefined,
        signal,
      }))
        raw += chunk
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(translate(getActiveLanguage(), 'prov_omniroute_models'))
      }
      const rawModels: Array<{ id?: string; name?: string; owned_by?: string }> = data.data || data.models || []
      const models = rawModels.map((model) => ({
        id: model.id || model.name || 'unknown',
        name: model.name || model.id || 'unknown',
        meta: model.owned_by && model.owned_by !== 'system' ? model.owned_by : '',
      }))
      if (!models.length) models.push({ id: 'auto', name: 'auto', meta: 'router picks' })
      return models
    },

    async *streamChat(messages: WireMessage[], model: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
      const source = streamText({
        url: `${base}/chat/completions`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { model: model || 'auto', messages, stream: true },
        auth: hasKey ? { providerId: 'omniroute', label: 'OmniRoute' } : undefined,
        signal,
      })

      for await (const frame of parseSse(source)) {
        if (frame.error) throw toError({ code: 'provider', ...frame.error })
        const text = frame.choices?.[0]?.delta?.content
        if (typeof text === 'string' && text) yield text
      }
    },
  }
}

const definition: ProviderDefinition = {
  id: 'omniroute',
  name: 'OmniRoute',
  type: 'router',
  signup: 'https://www.omniroute.online',
  blurb: 'Local router in front of many providers. Runs on port 20128 by default.',
  defaultBaseUrl: DEFAULT_BASE,
  editableBaseUrl: true,
  fields: ['baseUrl', 'apiKey'],
  optionalKey: true,
  create: created,
}

export default definition
