// Mounts the whole app in jsdom with a scripted bridge, then drives it the way a
// person would: pick a model, send a message, watch it stream, stop it, rename a
// chat, toggle the theme, open settings. Needs no browser download.
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

/* ---------- environment ---------- */

const dom = new JSDOM('<!doctype html><html data-theme="dark"><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5273/',
  pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

/* ---------- scripted provider traffic ---------- */

const queue = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const text = () => document.body.textContent

/* Wait until `predicate` holds, instead of sleeping a fixed guess. CI runners are
   slow and lumpy; a fixed sleep that is fine on a dev machine is a flaky test
   there. Polls every `interval` ms up to `timeout` ms. */
const waitFor = async (predicate, { timeout = 8000, interval = 10 } = {}) => {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      if (predicate()) return
    } catch {
      /* keep polling */
    }
    if (Date.now() > deadline) {
      throw new Error('waitFor: condition not met within ' + timeout + 'ms')
    }
    await sleep(interval)
  }
}
const waitForText = (needle, opts) => waitFor(() => text().includes(needle), opts)
const waitForStore = (fn, opts) => waitFor(fn, opts)
let modelsCalls = 0

function pushStream({ chunks, error, delay = 2 }) {
  queue.push({ chunks, error, delay })
}

window.iceburg = {
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
    list: async () => ({ openrouter: true }),
    set: async () => ({ ok: true, encrypted: true }),
    clear: async () => ({ ok: true }),
    encryptionAvailable: async () => true,
  },
  clipboard: { write: async () => ({ ok: true }) },
  openExternal: async () => ({ ok: true }),
  ollama: {
    detect: async () => ({ running: true, installed: true, models: [{ name: 'llama3.2' }, { name: 'qwen2.5-coder' }] }),
    install: async () => ({ ok: true }),
    onInstallProgress: () => () => {},
  },
  tools: {
    open: async (text, options = {}) => {
      const clean = String(text || '').trim().toLowerCase()
      const playMatch = /play\s+(.+?)\s+on\s+yout(?:ube|be)\b/i.exec(String(text || ''))
      const compoundMatch = /open youtube and play/i.test(String(text || ''))
      if (playMatch) {
        return {
          matched: true,
          ok: true,
          action: 'play',
          kind: 'play',
          tool: 'youtube',
          label: 'YouTube',
          message: `Playing “${playMatch[1]}” on YouTube.`,
        }
      }
      if (compoundMatch) {
        return {
          matched: true,
          ok: true,
          action: 'play',
          kind: 'play',
          tool: 'youtube',
          label: 'YouTube',
          message: 'Playing “Koi Mil Gaya song sung by Tony Kakkar” on YouTube.',
          title: 'Play Koi Mil Gaya song sung by Tony Kakkar',
        }
      }
      if (/\bopen youtube\b/.test(clean)) {
        return { matched: true, ok: true, tool: 'youtube', label: 'YouTube', kind: 'pwa', message: 'Opened YouTube in its installed app.', title: 'Open YouTube' }
      }
      if (/^open omniroute$/.test(clean)) {
        if (options.confirmed) {
          return { matched: true, ok: true, kind: 'started', tool: 'omniroute', label: 'OmniRoute', message: 'Started OmniRoute and opened its dashboard. Give it a few seconds to come up.' }
        }
        return {
          matched: true,
          needsConfirmation: true,
          kind: 'service',
          tool: 'omniroute',
          label: 'OmniRoute',
          url: 'https://www.omniroute.online',
          confirmText: 'OmniRoute is not running on port 20128. Start it in the background with "omniroute" and open its dashboard?',
        }
      }
      return { matched: false }
    },
  },
  net: {
    stream({ requestId, url, method, body, onChunk, onError, onDone }) {
      window.__lastStreamBody = body
      const chunkListeners = window.__chunkListeners || (window.__chunkListeners = new Map())
      // The preload routes chunks by request id; emulate that route directly.
      const scenario = queue.shift()
      if (process.env.TRACE) console.log('  -> stream', url, 'scenario:', scenario ? scenario.chunks.length : 'none')
      const finishOk = () => window.__done?.(requestId)
      ;(async () => {
        await sleep(2)
        if (url.endsWith('/models')) {
          modelsCalls += 1
          onChunk(
            JSON.stringify({
              data: [
                { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
                { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' },
              ],
            }),
          )
          onError({ code: 'aborted' })
          return
        }
        if (url.endsWith('/api/tags')) {
          onChunk(JSON.stringify({ models: [{ name: 'llama3.2' }, { name: 'qwen2.5-coder' }] }))
          onDone?.()
          return
        }
        if (url.endsWith('/api/chat') || url.endsWith('/chat/completions')) {
          if (!scenario) {
            onError({ code: 'http', status: 500, message: 'no scenario' })
            return
          }
          for (const chunk of scenario.chunks) {
            await sleep(scenario.delay)
            onChunk(chunk)
          }
          if (scenario.error) onError(scenario.error)
          else onDone?.()
          return
        }
        onError({ code: 'http', status: 404, message: 'unexpected url' })
      })().catch((error) => onError({ code: 'network', message: String(error) }))
      void method
      void chunkListeners
      return () => {}
    },
  },
}

// streamText listens for net:done on the ipc channel; the preload clears up there.
// In this harness the generator ends when onError fires, so make the terminator an
// 'aborted' that the adapter treats as a clean stop.
const originalStream = window.iceburg.net.stream

/* ---------- mount ---------- */

const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const React = await import('react')
const { default: App } = await import('../src/App.jsx')
const { useChat } = await import('../src/store/chat.js')
const { useSettings } = await import('../src/store/settings.js')

// streamText treats every onError except 'aborted' as a failure; end scenarios the
// same way the preload does, with a done event, by aborting quietly.
const root = createRoot(document.getElementById('root'))
await act(async () => {
  root.render(React.createElement(App))
})
await act(async () => {
  await waitForText('Llama 3.2')
})

const button = (name) =>
  [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === name || element.textContent.trim() === name,
  )

assert.equal(document.getElementById('composer').placeholder.includes('Kuch bhi puchhiye'), true, 'the composer boots in Hinglish')
console.log('default language is hinglish ok')

/* the following assertions were written against the english interface */
await act(async () => {
  useSettings.getState().update({ language: 'english' })
  await sleep(30)
})
console.log('mounted:', text().includes('is under the surface'), '| ollama detected:', text().includes('Llama 3.2'))
assert.ok(text().includes('is under the surface'), 'the english interface renders the english chrome')

// The launch check should have supplied a model from the running Ollama.
assert.ok(text().includes('Llama 3.2'), 'the first Ollama model should be selected on launch')

/* ---------- send a message and watch it stream ---------- */

const modelCallsBefore = modelsCalls
pushStream({
  chunks: [
    '{"message":{"content":"The "},"done":false}\n',
    '{"message":{"content":"**depth** "},"done":false}\n',
    '{"message":{"content":"effect darkens the background."},"done":true}\n',
  ],
})

const textarea = document.getElementById('composer')
assert.ok(textarea, 'composer exists')
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(textarea, 'How does the depth effect work?')
  textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
})
void typeInto
const sendButton = button('Send message')
assert.ok(sendButton, 'send button exists')
assert.equal(sendButton.disabled, false, 'send is enabled once there is text')

await act(async () => {
  sendButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    () => [...(useChat.getState().chats[0]?.messages || [])].at(-1)?.content ===
      'The **depth** effect darkens the background.',
  )
})

const stateAfter = useChat.getState()
const chat = stateAfter.chats[0]
assert.ok(chat, 'a chat was created')
assert.equal(chat.title, 'How does the depth effect work?')
assert.equal(chat.providerId, 'ollama')
assert.equal(chat.messages[1].content, 'The **depth** effect darkens the background.')
assert.ok(document.querySelector('.md strong'), 'markdown is rendered, not printed as text')
assert.equal(chat.messages[1].providerId, 'ollama')
console.log('streamed and rendered ok:', JSON.stringify(chat.messages[1].content))

/* ---------- stop generation ---------- */

assert.equal(modelsCalls, modelCallsBefore, 'models are not fetched until the menu opens')

pushStream({
  chunks: [
    '{"message":{"content":"This answer will be cut "},"done":false}\n',
    '{"message":{"content":"before it finishes "},"done":false}\n',
    '{"message":{"content":"and this part never arrives."},"done":true}\n',
  ],
  delay: 200,
})
const typeInto = async (node, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => {
    setter.call(node, value)
    node.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const node = document.getElementById('composer')
  setter.call(node, 'A long answer please')
  node.dispatchEvent(new window.Event('input', { bubbles: true }))
})
await act(async () => {
  button('Send message').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitFor(() => Boolean(button('Stop generating')))
})

const stopButton = button('Stop generating')
assert.ok(stopButton, 'the send button becomes Stop while streaming')
await act(async () => {
  stopButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(60)
})
const stoppedChat = useChat.getState().chats[0]
const lastMessage = stoppedChat.messages[stoppedChat.messages.length - 1]
assert.equal(useChat.getState().streamingId, null, 'streaming ends on stop')
assert.ok(lastMessage.stopped, 'the cut answer is marked as stopped')
console.log('stop generation ok:', JSON.stringify(lastMessage.content))

/* ---------- sidebar: rename and delete ---------- */

const sidebarButtons = () => [...document.querySelectorAll('aside button')]
assert.ok(
  sidebarButtons().some((element) => element.textContent.includes('New chat')),
  'sidebar offers a new chat',
)

const renameButton = sidebarButtons().find((element) => element.getAttribute('aria-label')?.startsWith('Rename'))
assert.ok(renameButton, 'rename control exists')
await act(async () => {
  renameButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(20)
})
const nameInput = document.querySelector('aside input')
assert.ok(nameInput, 'rename field appears')
await act(async () => {
  nameInput.value = 'Depth notes'
  nameInput.dispatchEvent(new window.MouseEvent('input', { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(nameInput, 'Depth notes')
  nameInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  nameInput.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }))
  await sleep(50)
})
assert.equal(useChat.getState().chats[0].title, 'Depth notes')
console.log('rename ok')

/* ---------- theme toggle ---------- */

const themeButton = button('Switch to light theme')
assert.ok(themeButton, 'theme toggle in the header')
await act(async () => {
  themeButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(20)
})
assert.equal(document.documentElement.dataset.theme, 'light')
assert.equal(useSettings.getState().settings.theme, 'light')
console.log('theme toggle ok')

/* ---------- model menu: list models, switch model ---------- */

const menuTrigger = [...document.querySelectorAll('header button')].find((element) =>
  element.textContent.includes('Ollama'),
)
assert.ok(menuTrigger, 'model switcher in the header')
await act(async () => {
  menuTrigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(80)
})
assert.ok(text().includes('qwen2.5-coder'), 'Ollama models are listed')
const qwen = [...document.querySelectorAll('[role="option"]')].find((element) =>
  element.textContent.includes('qwen2.5-coder'),
)
assert.ok(qwen, 'qwen is an option')
await act(async () => {
  qwen.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(30)
})
assert.equal(useSettings.getState().settings.providers.ollama.model, 'qwen2.5-coder')
console.log('model switch ok')

/* ---------- a cloud provider with a saved key, models listed on demand ---------- */

await act(async () => {
  useSettings.getState().setActiveProvider('openrouter')
  await sleep(20)
})
await act(async () => {
  const trigger = [...document.querySelectorAll('header button')].find((element) =>
    element.textContent.includes('OpenRouter'),
  )
  trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForText('qwen/qwen-2.5-72b-instruct')
})
assert.ok(text().includes('qwen/qwen-2.5-72b-instruct'), 'openrouter models listed')
const before = modelsCalls
await act(async () => {
  const option = [...document.querySelectorAll('[role="option"]')].find((element) =>
    element.textContent.includes('qwen/qwen-2.5-72b-instruct'),
  )
  option.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(30)
})
assert.equal(modelsCalls, before, 'choosing a model does not refetch')
assert.equal(useSettings.getState().settings.providers.openrouter.model, 'qwen/qwen-2.5-72b-instruct')
console.log('openrouter listing ok')

/* ---------- errors are sentences, not crashes ---------- */

pushStream({
  chunks: [],
  error: { code: 'http', status: 401, body: '{"error":{"message":"bad key"}}' },
})
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const node = document.getElementById('composer')
  setter.call(node, 'Will this fail?')
  node.dispatchEvent(new window.Event('input', { bubbles: true }))
})
await act(async () => {
  button('Send message').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForText('The key was rejected')
})
assert.ok(text().includes('The key was rejected'), 'bad key produces a readable sentence')
console.log('error handling ok')

/* ---------- settings: save a key, pull progress bar exists ---------- */

const settingsButton = button('Providers and settings')
await act(async () => {
  settingsButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(60)
})
assert.ok(text().includes('Encrypted with the system keychain') || text().includes('encrypted'), 'settings says how keys are stored')
assert.ok(document.querySelector('[role="dialog"]'), 'settings dialog is open')

const ollamaTab = [...document.querySelectorAll('[role="tab"]')].find((element) =>
  element.textContent.includes('Ollama'),
)
await act(async () => {
  ollamaTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(30)
})
assert.ok(text().includes('Pull a model'), 'ollama panel offers a pull')
assert.ok(text().includes('llama3.2'), 'pull suggestions are real model names')
console.log('settings ok')

/* ---------- computer tasks: open apps from the composer ---------- */

const composerNode = () => document.getElementById('composer')

await typeInto(composerNode(), 'Can you open youtube please??')
await act(async () => {
  button('Send message').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForText('Opened YouTube in its installed app.')
})
assert.equal(useChat.getState().streamingId, null, 'a computer task does not stream from a model')
assert.ok(text().includes('Opened YouTube in its installed app.'), 'the tool result is shown as a note')
console.log('tool task ok')

await typeInto(composerNode(), 'open omniroute')
await act(async () => {
  button('Send message').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForText('Start it in the background')
})
assert.ok(text().includes('Start it in the background'), 'a heavy service asks before anything starts')
const openService = button('Open')
assert.ok(openService, 'the confirmation card offers Open')
assert.equal(useChat.getState().streamingId, null, 'the confirmation does not start a stream either')
await act(async () => {
  openService.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForText('Started OmniRoute and opened its dashboard.')
})
assert.ok(text().includes('Started OmniRoute and opened its dashboard.'), 'confirming starts the service')
console.log('confirmation flow ok')

const composerForPlay = document.getElementById('composer')
await typeInto(composerForPlay, 'Hey yo bro can you open youtube and play "Koi Mil Gaya" song sung by Tony Kakkar')
await act(async () => {
  button('Send message').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForText('Playing “Koi Mil Gaya song sung by Tony Kakkar” on YouTube.')
})
assert.equal(useChat.getState().streamingId, null, 'a play task does not stream')
assert.ok(text().includes('Playing “Koi Mil Gaya song sung by Tony Kakkar” on YouTube.'), 'the compound task is shown as a note')
console.log('compound task ok')
console.log('play task ok')

/* ---------- computer task titles ---------- */

useChat.getState().clear()
await act(async () => {
  await sleep(50)
})
await typeInto(document.getElementById('composer'), 'Can you open youtube please??')
await act(async () => {
  button('Send message').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForStore(() => useChat.getState().chats[0]?.title === 'Open YouTube')
})
const freshChat = useChat.getState().chats[0]
assert.equal(freshChat?.title, 'Open YouTube', 'a task chat is named from the task, not the raw prompt')
console.log('task title ok')

/* ---------- language setting switches the app ---------- */

useChat.getState().clear()

const setLanguage = async (language) => {
  await act(async () => {
    useSettings.getState().update({ language })
    await sleep(30)
  })
}
await setLanguage('english')
assert.equal(document.getElementById('composer').placeholder, 'Ask it anything, or "play lofi on youtube"')
assert.ok(text().includes('New chat'), 'english interface renders english chrome')
await setLanguage('hindi')
assert.equal(document.getElementById('composer').placeholder, 'कुछ भी पूछिए, या "play lofi on youtube"')
assert.ok(text().includes('नई चैट'), 'hindi interface renders hindi chrome')
await setLanguage('tamil')
assert.equal(document.getElementById('composer').placeholder, 'Ask it anything, or "play lofi on youtube"', 'unsupported languages fall back to an english interface')
await setLanguage('hinglish')
console.log('language switching ok')

/* ---------- the model is told to answer in the configured language ---------- */

pushStream({
  chunks: ['{"message":{"content":"haan yaar"},"done":true}\n'],
})
await typeInto(document.getElementById('composer'), 'namaste')
await act(async () => {
  button('Message bhejein').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitForStore(() => Boolean(window.__lastStreamBody))
})
const raw = window.__lastStreamBody
const streamed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
assert.equal(streamed.messages?.[0]?.role, 'system', 'a system message is sent first')
assert.match(streamed.messages[0].content, /Hinglish/, 'the system message pins Hinglish')
console.log('reply language instruction ok')

/* ---------- persistence ---------- */

await act(async () => {
  await sleep(600)
})
assert.ok(window.__saved.chats.chats.length >= 1, 'chats are written to the store')
assert.ok(window.__saved.settings, 'settings are written to the store')
console.log('persistence ok,', JSON.stringify(Object.keys(window.__saved)))

console.log('\nall app checks passed')

// jsdom keeps timers alive; end deliberately.
process.exit(0)
