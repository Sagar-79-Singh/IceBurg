import type { AdapterSettings, ModelInfo, ProviderAdapter, ProviderDefinition, WireMessage } from './types.ts'
import { streamText, parseSse, toError } from './http.ts'
import { translate, getActiveLanguage } from '../lib/i18n.ts'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Gemini speaks its own dialect: contents/parts, roles "user" and "model", and
// streamGenerateContent, which answers with server-sent events when asked for
// alt=sse. The adapter squashes all of that back into plain text chunks.
const created = (settings: AdapterSettings): ProviderAdapter => {
  const base = settings?.baseUrl?.trim() || BASE
  const auth = { providerId: 'gemini', label: 'Gemini', header: 'x-goog-api-key', prefix: '' }

  return {
    id: 'gemini',
    name: 'Gemini',
    type: 'cloud',

    async listModels({ signal }: { signal?: AbortSignal } = {}): Promise<ModelInfo[]> {
      let raw = ''
      for await (const chunk of streamText({
        url: `${base}/models?pageSize=200`,
        method: 'GET',
        auth,
        signal,
      }))
        raw += chunk
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(translate(getActiveLanguage(), 'prov_gemini_models'))
      }
      const models: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }> = data.models || []
      return models
        .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
        .map((model) => ({
          id: (model.name || '').replace(/^models\//, ''),
          name: (model.displayName || model.name || '').replace(/^models\//, ''),
          meta: model.inputTokenLimit ? `${Math.round(model.inputTokenLimit / 1000)}k` : '',
        }))
        .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name))
    },

    async *streamChat(messages: WireMessage[], model: string = 'gemini-2.0-flash', signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
      const contents = messages
        .filter((message) => message.role !== 'system' && message.content)
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        }))
      const system = messages
        .filter((message) => message.role === 'system' && message.content)
        .map((message) => message.content)
        .join('\n\n')

      const source = streamText({
        url: `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        },
        auth,
        signal,
      })

      for await (const frame of parseSse(source)) {
        if (frame.error) throw toError({ code: 'provider', status: frame.error.code, body: JSON.stringify(frame) })
        const candidate = frame.candidates?.[0]
        const text = (candidate?.content?.parts || []).map((part: { text?: string }) => part.text || '').join('')
        if (text) yield text
        if (candidate?.finishReason === 'SAFETY') {
          throw toError({ code: 'provider', body: JSON.stringify({ error: translate(getActiveLanguage(), 'prov_gemini_blocked') }) })
        }
      }
    },
  }
}

const definition: ProviderDefinition = {
  id: 'gemini',
  name: 'Gemini',
  type: 'cloud',
  signup: 'https://aistudio.google.com/app/apikey',
  blurb: 'Google AI Studio keys. A free tier is available.',
  defaultBaseUrl: BASE,
  fields: ['apiKey'],
  create: created,
}

export default definition
