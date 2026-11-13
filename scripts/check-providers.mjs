// Drives the real providers and the real chat store against a scripted bridge.
import assert from 'node:assert/strict'

/* ---------- a fake preload bridge ---------- */

const scripted = [] // { match, status, chunks: [], error }
let lastRequest = null
const listeners = new Set()

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    store: new Map(),
    getItem(k) {
      return this.store.has(k) ? this.store.get(k) : null
    },
    setItem(k, v) {
      this.store.set(k, v)
    },
  },
  iceburg: {
    platform: 'linux',
    info: async () => ({ version: '0.1.0', platform: 'linux', encrypted: true }),
    store: {
      read: async (name) => ({ ok: true, data: window.__saved?.[name] ?? null }),
      write: async (name, data) => {
        window.__saved = { ...(window.__saved || {}), [name]: data }
        return { ok: true }
      },
    },
    secrets: {
      list: async () => ({ openrouter: true, gemini: true }),
      set: async () => ({ ok: true, encrypted: true }),
      clear: async () => ({ ok: true }),
      encryptionAvailable: async () => true,
    },
    clipboard: { write: async () => ({ ok: true }) },
    openExternal: async () => ({ ok: true }),
    ollama: { detect: async () => ({ running: true, models: [{ name: 'llama3.2' }] }) },
    net: {
      stream({ requestId, url, onChunk, onError }) {
        lastRequest = { url }
        const scenario = scripted.shift()
        if (!scenario) throw new Error(`no scenario for ${url}`)
        setTimeout(async () => {
          for (const chunk of scenario.chunks) onChunk(chunk)
          if (scenario.error) onError(scenario.error)
          else window.__done?.(requestId)
        }, 0)
        return () => {}
      },
    },
  },
}

window.iceburg.net.stream = ((original) => (options) => {
  // Push completion through the same listener the preload uses.
  const listenersFor = (channel, cb) => {}
  return original(options)
})(window.iceburg.net.stream)

// The preload notifies 'net:done' through an event; emulate it by resolving the
// generator when the scenario finishes. streamText stops on onError only, so give
// every scenario a terminal no-op error.
const finish = (chunks) => ({ chunks: [...chunks, ''], error: { code: 'aborted' } })

const { createAdapter } = await import('../src/providers/registry.js')

async function collect(iterator) {
  let text = ''
  for await (const chunk of iterator) text += chunk
  return text
}

/* ---------- ollama: NDJSON ---------- */
scripted.push(
  finish([
    '{"message":{"content":"Hello"},"done":false}\n{"message":{"content":" there"},"done":false}\n',
    '{"message":{"content":"!"},"done":true}\n',
  ]),
)
{
  const adapter = createAdapter('ollama', { baseUrl: 'http://127.0.0.1:11434' })
  const out = await collect(adapter.streamChat([{ role: 'user', content: 'hi' }], 'llama3.2'))
  assert.equal(out, 'Hello there!')
  console.log('ollama stream ok ->', JSON.stringify(out))
}

/* ---------- openrouter: SSE ---------- */
scripted.push(
  finish([
    'data: {"choices":[{"delta":{"content":"Fe"}}]}\n\ndata: {"choices":[{"delta":{"content":"n"}}]}\n',
    '\ndata: {"choices":[{"delta":{"content":"ce"}}]}\n\ndata: [DONE]\n\n',
  ]),
)
{
  const adapter = createAdapter('openrouter', {})
  const out = await collect(adapter.streamChat([{ role: 'user', content: 'hi' }], 'x'))
  assert.equal(out, 'Fence')
  console.log('openrouter sse ok ->', JSON.stringify(out), '| url:', lastRequest.url)
}

/* ---------- gemini: SSE ---------- */
scripted.push(
  finish([
    'data: {"candidates":[{"content":{"parts":[{"text":"Cold "}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"water"}]},"finishReason":"STOP"}]}\n\n',
  ]),
)
{
  const adapter = createAdapter('gemini', {})
  const out = await collect(adapter.streamChat([{ role: 'user', content: 'hi' }], 'gemini-2.0-flash'))
  assert.equal(out, 'Cold water')
  console.log('gemini sse ok ->', JSON.stringify(out), '| url:', lastRequest.url)
}

/* ---------- custom: SSE + trailing frame without newline ---------- */
scripted.push(
  finish([
    'data: {"choices":[{"delta":{"content":"one"}}]}\n\ndata: {"choices":[{"delta":{"content":" two"}}]}',
  ]),
)
{
  const adapter = createAdapter('custom', { baseUrl: 'localhost:1234', model: 'qwen', label: 'CloseRouter' })
  assert.equal(adapter.name, 'CloseRouter')
  const out = await collect(adapter.streamChat([], 'qwen'))
  assert.equal(out, 'one two')
  console.log('custom sse ok ->', JSON.stringify(out), '| url:', lastRequest.url)
}

/* the readable sentences are localized; this suite pins the english wording */
const { setActiveLanguage } = await import('../src/lib/i18n.js')
setActiveLanguage('english')

/* ---------- error surfaces as a readable sentence ---------- */
scripted.push({ chunks: [], error: { code: 'http', status: 401, body: '{"error":{"message":"bad key"}}' } })
{
  const adapter = createAdapter('openrouter', {})
  await assert.rejects(
    () => collect(adapter.streamChat([], 'x')),
    /key was rejected/,
  )
  console.log('auth error ok')
}

/* ---------- chat store: send, stream, title, stop ---------- */
process.on('unhandledRejection', (error) => {
  console.error('unhandled', error)
  process.exit(1)
})

const { useChat } = await import('../src/store/chat.js')
const { useSettings } = await import('../src/store/settings.js')

await useSettings.getState().load()
await useChat.getState().load()

useSettings.getState().updateProvider('openrouter', { model: 'free/model' })
useSettings.getState().setActiveProvider('openrouter')

scripted.push(
  finish([
    'data: {"choices":[{"delta":{"content":"## Depth"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"\\n\\nThe sea gets darker."}}]}\n\n',
  ]),
)

const result = await useChat.getState().send('How does the depth effect work?')
assert.equal(result.ok, true)
const state = useChat.getState()
const chat = state.chats[0]
assert.equal(chat.title, 'How does the depth effect work?')
assert.equal(chat.messages.length, 2)
assert.equal(chat.messages[1].role, 'assistant')
assert.match(chat.messages[1].content, /The sea gets darker/)
assert.equal(state.streamingId, null)
console.log('chat store ok:', JSON.stringify(chat.messages.map((m) => [m.role, m.content])))

// Persistence lands after the short save debounce.
await new Promise((resolve) => setTimeout(resolve, 600))
assert.ok(window.__saved.chats.chats[0].messages.length === 2)
console.log('persistence ok')

// A fresh chat has its own turn, and models are remembered per chat.
const second = useChat.getState().createChat()
assert.equal(useChat.getState().activeId, second)
scripted.push(finish(['data: {"choices":[{"delta":{"content":"Second answer"}}]}\n\n']))
await useChat.getState().send('A second question')
const secondChat = useChat.getState().chats.find((c) => c.id === second)
assert.equal(secondChat.providerId, 'openrouter')
assert.equal(secondChat.model, 'free/model')
console.log('second chat ok')

// Rename and delete.
useChat.getState().renameChat(second, 'Renamed chat')
assert.equal(useChat.getState().chats.find((c) => c.id === second).title, 'Renamed chat')
useChat.getState().deleteChat(second)
assert.equal(useChat.getState().chats.find((c) => c.id === second), undefined)
console.log('rename + delete ok')

console.log('\nall checks passed')
