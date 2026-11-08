// Anything that speaks OpenAI: CloseRouter, LM Studio, vLLM, a gateway on the LAN.
// The address is kept exactly as typed (only normalised to /v1 when it has no
// path), so a server mounted under /openai works too.
import { streamText, parseSse, toError } from './http.js'

const created = (settings) => {
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

    async listModels({ signal } = {}) {
      if (!withV1) throw new Error('Add a base URL for this provider in settings.')
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
        throw new Error('That address did not return a model list. Type the model name instead.')
      }
      const list = data.data || data.models || []
      return list.map((model) => ({
        id: model.id || model.name,
        name: model.id || model.name,
        meta: model.owned_by || '',
      }))
    },

    async *streamChat(messages, model, signal) {
      if (!withV1) throw new Error('Add a base URL for this provider in settings.')
      if (!model) throw new Error('Add a model name for this provider in settings.')
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

export default {
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
