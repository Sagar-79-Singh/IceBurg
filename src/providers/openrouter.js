import { streamText, parseSse, toError } from './http.js'

const BASE = 'https://openrouter.ai/api/v1'

const created = (settings) => {
  const base = settings?.baseUrl?.trim() || BASE
  return {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'cloud',

    async listModels({ signal } = {}) {
      let raw = ''
      for await (const chunk of streamText({ url: `${base}/models`, method: 'GET', signal })) raw += chunk
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error('OpenRouter returned an unexpected list of models.')
      }
      return (data.data || [])
        .map((model) => ({
          id: model.id,
          name: model.name || model.id,
          meta: model.context_length ? `${Math.round(model.context_length / 1000)}k` : '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    async *streamChat(messages, model, signal) {
      const source = streamText({
        url: `${base}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://iceburg.app',
          'X-Title': 'IceBurg',
        },
        body: { model, messages, stream: true },
        auth: { providerId: 'openrouter', label: 'OpenRouter' },
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

export default {
  id: 'openrouter',
  name: 'OpenRouter',
  type: 'cloud',
  signup: 'https://openrouter.ai/keys',
  blurb: 'One key for most cloud models. Paid per use, with free models available.',
  defaultBaseUrl: BASE,
  fields: ['apiKey'],
  create: created,
}
