// Anything that speaks OpenAI: CloseRouter, LM Studio, vLLM, a gateway on the LAN.
// The address is kept exactly as typed (only normalised to /v1 when it has no
// path), so a server mounted under /openai works too.
import type { AdapterSettings, ModelInfo, ProviderAdapter, ProviderDefinition, WireMessage } from './types.ts'
import { streamText, parseSse, toError } from './http.ts'
import { translate, getActiveLanguage } from '../lib/i18n.ts'

const created = (settings: AdapterSettings): ProviderAdapter => {
  const raw = String(settings?.baseUrl || '').trim().replace(/\/+$/, '')
  const base = /^https?:\/\//i.test(raw) ? raw : raw ? `http://${raw}` : ''
  const withV1 = base && !/\/v\d+$/i.test(base) && !/\/(chat\/completions)$/i.test(base)
    ? `${base}/v1`
    : base
  const label = settings?.label || 'Custom provider'

  return {
    id: 'custom',
    name: label,
    type: 'openai',

    async listModels({ signal }: { signal?: AbortSignal } = {}): Promise<ModelInfo[]> {
      if (!withV1) throw new Error(translate(getActiveLanguage(), 'prov_custom_base_url'))
      let rawResponse = ''
      for await (const chunk of streamText({
        url: `${withV1}/models`,
        method: 'GET',
        auth: { providerId: 'custom', label, optional: true },
        signal,
      }))
        rawResponse += chunk
      let data
      try {
        data = JSON.parse(rawResponse)
      } catch {
        throw new Error(translate(getActiveLanguage(), 'prov_custom_model_list'))
      }
      const list: Array<{ id?: string; name?: string; owned_by?: string }> = data.data || data.models || []
      return list.map((model) => ({
        id: model.id || model.name || 'unknown',
        name: model.id || model.name || 'unknown',
        meta: model.owned_by || '',
      }))
    },

    async *streamChat(messages: WireMessage[], model: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
      if (!withV1) throw new Error(translate(getActiveLanguage(), 'prov_custom_base_url'))
      if (!model) throw new Error(translate(getActiveLanguage(), 'prov_custom_model_name'))
      const source = streamText({
        url: `${withV1}/chat/completions`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { model, messages, stream: true },
        auth: { providerId: 'custom', label, optional: true },
        signal,
      })

      for await (const frame of parseSse(source)) {
        if (frame.error) throw toError({ code: 'provider', body: JSON.stringify({ error: frame.error }) })
        const text = frame.choices?.[0]?.delta?.content
        if (typeof text === 'string' && text) yield text
      }
    },
  }
}

const definition: ProviderDefinition = {
  id: 'custom',
  name: 'Custom OpenAI-compatible',
  type: 'openai',
  blurb: 'Any server that speaks /v1/chat/completions. CloseRouter, LM Studio, vLLM.',
  defaultBaseUrl: '',
  editableBaseUrl: true,
  fields: ['label', 'baseUrl', 'apiKey', 'model'],
  optionalKey: true,
  create: created,
}

export default definition
