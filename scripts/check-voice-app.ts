// Mounts Voice Mode inside the real app shell (jsdom, scripted bridge) and
// drives it the way a person would: open the HUD from the header, type a
// message in the panel, watch the scripted answer land in the SAME history,
// toggle face/orb (persisted), and close with Escape. Canvas painting is
// unavailable in jsdom (getContext returns null), which the stage tolerates;
// ResizeObserver is polyfilled below.
import assert from 'node:assert/strict'
import { JSDOM, type DOMWindow } from 'jsdom'

/* ---------- environment ---------- */

const dom = new JSDOM('<!doctype html><html data-theme="dark"><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5273/',
  pretendToBeVisual: true,
})
const jsdomWindow = dom.window as unknown as DOMWindow
Object.defineProperty(globalThis, 'window', { value: jsdomWindow, configurable: true })
Object.defineProperty(globalThis, 'document', { value: jsdomWindow.document, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: jsdomWindow.navigator, configurable: true })
for (const key of ['HTMLElement', 'Element', 'Node', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const) {
  if ((jsdomWindow as unknown as Record<string, unknown>)[key] !== undefined) {
    (globalThis as Record<string, unknown>)[key] = (jsdomWindow as unknown as Record<string, unknown>)[key]
  }
}
const ResizeObserverStub = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(jsdomWindow as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
;(jsdomWindow as unknown as { matchMedia: unknown }).matchMedia = () => ({
  matches: false,
  media: '',
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const text = (): string => document.body.textContent || ''
const waitFor = async (predicate: () => boolean, { timeout = 9000, interval = 10 }: { timeout?: number; interval?: number } = {}): Promise<void> => {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      if (predicate()) return
    } catch {
      /* keep polling */
    }
    if (Date.now() > deadline) throw new Error('waitFor: condition not met within ' + timeout + 'ms')
    await sleep(interval)
  }
}

/* ---------- scripted Ollama traffic: JSON-line frames, like the real daemon ---------- */

interface Scenario {
  pieces: string[]
}
const queue: Scenario[] = []
const pushAnswer = (pieces: string[]): void => {
  queue.push({ pieces })
}
const ollamaFrame = (content: string, done = false): string =>
  JSON.stringify({ model: 'llama3.2', message: { role: 'assistant', content }, done }) + '\n'

const listen = {
  platform: 'linux',
  info: async () => ({ version: '0.6.0', platform: 'linux', encrypted: true }),
  store: {
    read: async (name: string) => ({ ok: true, data: name === 'settings' ? { startupBriefing: false } : null }),
    write: async () => ({ ok: true }),
  },
  secrets: {
    list: async () => ({}),
    set: async () => ({ ok: true, encrypted: true }),
    clear: async () => ({ ok: true }),
    encryptionAvailable: async () => true,
  },
  clipboard: { write: async () => ({ ok: true }) },
  openExternal: async () => ({ ok: true }),
  ollama: {
    detect: async () => ({ running: true, installed: true, models: [{ name: 'llama3.2' }] }),
    install: async () => ({ ok: true }),
    cancelInstall: async () => ({ ok: true }),
    onInstallProgress: () => () => {},
  },
  tools: { open: async () => ({ matched: false }) },
  net: {
    stream({ url, onChunk, onError, onDone }: { url: string; onChunk: (chunk: string) => void; onError: (error: { code: string; message?: string; status?: number }) => void; onDone?: () => void }) {
      const scenario = queue.shift()
      ;(async () => {
        await sleep(2)
        if (url.endsWith('/api/tags')) {
          onChunk(JSON.stringify({ models: [{ name: 'llama3.2' }] }) + '\n')
          onDone?.()
          return
        }
        if (url.endsWith('/api/chat')) {
          if (!scenario) {
            onError({ code: 'http', status: 500, message: 'no scenario' })
            return
          }
          for (const piece of scenario.pieces) {
            await sleep(2)
            onChunk(ollamaFrame(piece))
          }
          onChunk(ollamaFrame('', true))
          onDone?.()
          return
        }
        onError({ code: 'http', status: 404, message: 'unexpected url ' + url })
      })().catch((error) => onError({ code: 'network', message: String(error) }))
      return () => {}
    },
  },
}
;(jsdomWindow as unknown as Record<string, unknown>).iceburg = listen

/* ---------- mount ---------- */

const { default: React } = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { default: App } = await import('../src/App.tsx')
const { useChat } = await import('../src/store/chat.ts')
const { useSettings } = await import('../src/store/settings.ts')
const { useVoice } = await import('../src/store/voice.ts')

const container = document.getElementById('root')!
const root = createRoot(container)

await act(async () => {
  root.render(React.createElement(App))
})
await waitFor(() => useSettings.getState().loaded && useChat.getState().loaded)
// Bootstrap auto-selects the scripted Ollama model, same as the real first run.
await waitFor(() => useSettings.getState().settings.providers.ollama?.model === 'llama3.2')

/* Open Voice Mode from the header. */
const voiceButton = (): HTMLButtonElement => {
  const button = [...document.querySelectorAll('button')].find((candidate) =>
    (candidate.getAttribute('aria-label') || '').toLowerCase().includes('voice'),
  )
  assert.ok(button, 'header exposes a Voice Mode button')
  return button as HTMLButtonElement
}
await act(async () => {
  voiceButton().click()
})
assert.equal(useVoice.getState().open, true, 'Voice Mode opens from the header')
assert.ok(document.querySelector('[data-voice-mode]'), 'the HUD is on screen')

/* Type a message in the panel — the same store drives the main chat. */
pushAnswer(['Sure — the river runs past the glacier.'])
const panelInput = document.querySelector('[data-voice-mode] textarea') as HTMLTextAreaElement
assert.ok(panelInput, 'the panel composer renders')
const nativeSetter = Object.getOwnPropertyDescriptor(jsdomWindow.HTMLTextAreaElement.prototype, 'value')!.set!
await act(async () => {
  nativeSetter.call(panelInput, 'hello voice')
  panelInput.dispatchEvent(new jsdomWindow.Event('input', { bubbles: true }))
})
await act(async () => {
  panelInput.dispatchEvent(new jsdomWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
await waitFor(() => useChat.getState().streamingId === null)
await waitFor(() => text().includes('Sure — the river runs past the glacier.'))
const storeText = useChat
  .getState()
  .chats.flatMap((chat) => chat.messages.map((message) => message.content))
  .join(' ')
assert.ok(storeText.includes('hello voice'), 'the user turn is in the shared history')
assert.ok(storeText.includes('Sure — the river runs past the glacier.'), 'the reply is in the shared history')

/* Face/orb toggle persists to settings. */
const gear = [...document.querySelectorAll('[data-voice-mode] button')].find((b) =>
  (b.getAttribute('aria-label') || '').toLowerCase().includes('voice settings'),
) as HTMLButtonElement
assert.ok(gear, 'the gear button exists in the HUD')
await act(async () => {
  gear.click()
})
await waitFor(() => Boolean(document.querySelector('[data-voice-choice="orb"]')))
await act(async () => {
  ;(document.querySelector('[data-voice-choice="orb"]') as HTMLButtonElement).click()
})
assert.equal(useSettings.getState().settings.voiceFaceMode, 'orb', 'the orb choice persists')
await act(async () => {
  ;(document.querySelector('[data-voice-choice="face"]') as HTMLButtonElement).click()
})
assert.equal(useSettings.getState().settings.voiceFaceMode, 'face', 'the face choice persists')

/* Escape closes the HUD. */
await act(async () => {
  window.dispatchEvent(new jsdomWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
})
assert.equal(useVoice.getState().open, false, 'Escape closes Voice Mode')

console.log('voice app ok: header opens the HUD, panel and chat share one history, face toggle persists, Escape closes')
process.exit(0)
