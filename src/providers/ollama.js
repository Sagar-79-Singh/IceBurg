import { streamText, parseJsonLines, joinUrl, baseUrl, toError } from './http.js'
import { translate, getActiveLanguage } from '../lib/i18n.js'

// Ollama runs on this machine and needs no key. The host is editable for people
// who move the daemon to another port or machine.
const created = (settings) => {
  const host = baseUrl(settings?.baseUrl || 'http://127.0.0.1:11434', { forceV1: false })

  return {
    id: 'ollama',
    name: 'Ollama',
    type: 'local',

    async listModels({ signal } = {}) {
      const source = streamText({ url: joinUrl(host, '/api/tags'), method: 'GET', signal })
      let raw = ''
      for await (const chunk of source) raw += chunk
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(translate(getActiveLanguage(), 'prov_ollama_answer'))
      }
      return (data.models || []).map((model) => ({
        id: model.name || model.model,
        name: model.name || model.model,
        meta: model.details?.parameter_size || '',
      }))
    },

    async *streamChat(messages, model, signal) {
      const source = streamText({
        url: joinUrl(host, '/api/chat'),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          model,
          messages: messages.map(({ role, content }) => ({ role, content })),
          stream: true,
        },
        signal,
      })

      for await (const frame of parseJsonLines(source)) {
        if (frame.error) throw toError({ code: 'provider', body: JSON.stringify({ error: frame.error }) })
        const text = frame.message?.content
        if (text) yield text
        if (frame.done) return
      }
    },
  }
}

export default {
  id: 'ollama',
  name: 'Ollama',
  type: 'local',
  signup: 'https://ollama.com',
  blurb: 'Runs on your machine. No key, no account, nothing leaves the computer.',
  defaultBaseUrl: 'http://127.0.0.1:11434',
  editableBaseUrl: true,
  fields: ['baseUrl'],
  create: created,
}
