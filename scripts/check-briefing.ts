// The startup briefing, end to end in jsdom: the app mounts, the face opens on
// its own, speaks a time-of-day greeting, shows the scripted headlines in a
// card that is NOT the conversation log, and recovers from a failed fetch via
// the retry button. Pure helpers are asserted directly. Speech is stubbed and
// records what would have been said.
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
for (const key of ['HTMLElement', 'Element', 'Node', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'] as const) {
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

/* ---------- scripted speech: records everything, ends quickly ---------- */

const spoken: string[] = []
const listeners = new Map<string, Array<(event?: unknown) => void>>()
const fire = (type: string): void => {
  for (const callback of listeners.get(type) || []) callback()
}
class FakeUtterance {
  text: string
  rate = 1
  voice: unknown = null
  private map = listeners
  constructor(text: string) {
    this.text = text
  }
  addEventListener(type: string, callback: (event?: unknown) => void): void {
    const list = this.map.get(type) || []
    list.push(callback)
    this.map.set(type, list)
  }
}
const fakeVoices = [{ voiceURI: 'fake-1', name: 'Fake Voice', lang: 'en-US', default: true, localService: true } as SpeechSynthesisVoice]
Object.defineProperty(jsdomWindow, 'speechSynthesis', {
  configurable: true,
  value: {
    getVoices: () => fakeVoices,
    speak(utterance: FakeUtterance) {
      spoken.push(utterance.text)
      queueMicrotask(() => {
        fire('start')
        setTimeout(() => fire('end'), 15)
      })
    },
    cancel() {
      fire('end')
    },
    addEventListener() {},
    removeEventListener() {},
  },
})
;(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance
;(jsdomWindow as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance

/* ---------- scripted bridge: Ollama up, news feed on command ---------- */

interface NewsResult {
  ok: boolean
  items: Array<{ title: string; source: string; link: string; pubDate: string }>
  message?: string
}
let newsMode: 'fail' | 'success' = 'fail'
let newsCalls = 0
const FIXTURE: NewsResult['items'] = [
  { title: 'Monsoon arrives early over the coast', source: 'The Hindu', link: 'https://example.com/monsoon', pubDate: 'Sat, 14 Nov 2026 05:30:00 GMT' },
  { title: 'Markets rally on record tech earnings', source: 'Mint', link: 'https://example.com/markets', pubDate: 'Sat, 14 Nov 2026 04:10:00 GMT' },
  { title: 'Supreme Court to hear free speech case', source: 'Indian Express', link: 'https://example.com/supreme-court', pubDate: 'Sat, 14 Nov 2026 03:00:00 GMT' },
]

const listen = {
  platform: 'linux',
  info: async () => ({ version: '0.8.0', platform: 'linux', encrypted: true }),
  store: {
    read: async (name: string) => ({ ok: true, data: name === 'settings' ? { language: 'english' } : null }),
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
  tools: { open: async () => ({ matched: false }) },
  ollama: {
    detect: async () => ({ running: true, installed: true, models: [{ name: 'llama3.2' }] }),
    install: async () => ({ ok: true }),
    cancelInstall: async () => ({ ok: true }),
    onInstallProgress: () => () => {},
  },
  news: {
    headlines: async (): Promise<NewsResult> => {
      newsCalls += 1
      if (newsMode === 'success') return { ok: true, items: FIXTURE }
      return { ok: false, items: [], message: 'Could not fetch the news (timed out).' }
    },
  },
  net: {
    stream({ url, onChunk, onError, onDone }: { url: string; onChunk: (chunk: string) => void; onError: (error: { code: string; message?: string }) => void; onDone?: () => void }) {
      ;(async () => {
        await sleep(2)
        if (url.endsWith('/api/tags')) {
          onChunk(JSON.stringify({ models: [{ name: 'llama3.2' }] }) + '\n')
          onDone?.()
          return
        }
        onError({ code: 'http', message: 'unexpected url ' + url })
      })().catch((error) => onError({ code: 'network', message: String(error) }))
      return () => {}
    },
  },
}
;(jsdomWindow as unknown as Record<string, unknown>).iceburg = listen

/* ---------- pure helpers ---------- */

const { buildGreeting, buildLeadSpeech, greetingBucket, timeOfDay } = await import('../src/voice/briefing.ts')
const morning = new Date(2026, 10, 14, 7, 5)
const noon = new Date(2026, 10, 14, 12, 30)
const night = new Date(2026, 10, 14, 20, 45)
assert.equal(greetingBucket(morning), 'morning')
assert.equal(greetingBucket(noon), 'afternoon')
assert.equal(greetingBucket(night), 'evening')
assert.equal(timeOfDay(morning), '07:05')
assert.equal(timeOfDay(night), '20:45')
assert.ok(buildGreeting(morning, 'english').toLowerCase().includes('good morning'), 'morning greeting speaks morning')
assert.ok(buildGreeting(morning, 'english').includes('07:05'), 'greeting carries the clock')
assert.ok(buildGreeting(night, 'hi').length > 0, 'hindi greeting renders')
assert.equal(buildLeadSpeech([], 'english'), 'I could not fetch the news right now.', 'empty list falls back to the unavailable line')
assert.ok(buildLeadSpeech(FIXTURE, 'english').includes('Monsoon arrives early'), 'lead story is the first headline')

/* ---------- mount the real app ---------- */

const { default: React } = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { default: App } = await import('../src/App.tsx')
const { useChat } = await import('../src/store/chat.ts')
const { useSettings } = await import('../src/store/settings.ts')
const { useVoice } = await import('../src/store/voice.ts')
const { useBriefing } = await import('../src/store/briefing.ts')

const container = document.getElementById('root')!
const root = createRoot(container)

await act(async () => {
  root.render(React.createElement(App))
})
await waitFor(() => useSettings.getState().loaded && useChat.getState().loaded)

// The face must open by itself and greet — news fetch fails first, so the
// error card should come up after the hello.
await waitFor(() => useVoice.getState().open === true)
await waitFor(() => spoken.length >= 1)
const greetingHeard = spoken[0] ?? ''
assert.match(greetingHeard, /good (morning|afternoon|evening)/i, 'the greeting is spoken out loud')
await waitFor(() => newsCalls >= 1)
await waitFor(() => useBriefing.getState().phase === 'error')
assert.ok(document.querySelector('[data-briefing="error"]'), 'the error card is on screen')
assert.ok(text().includes('Could not fetch the news'), 'the error card names the failure')

// Flip the feed on, press Retry, expect the headline list and a spoken lead.
newsMode = 'success'
const retry = [...document.querySelectorAll('[data-briefing="error"] button')].find((b) =>
  (b.textContent || '').toLowerCase().includes('retry'),
) as HTMLButtonElement
assert.ok(retry, 'the error card offers a retry')
await act(async () => {
  retry.dispatchEvent(new jsdomWindow.MouseEvent('click', { bubbles: true }))
})
await waitFor(() => useBriefing.getState().phase === 'news')
assert.ok(text().includes('Monsoon arrives early over the coast'), 'headline one is on screen')
assert.ok(text().includes('Supreme Court to hear free speech case'), 'headline three is on screen')
assert.ok(text().includes('The full list is on screen'), 'the card says the list is on screen')

// Headlines appear without a single chat message being fabricated.
const history = useChat.getState().chats.flatMap((chat) => chat.messages)
assert.equal(history.length, 0, 'the briefing never writes to the conversation')

// Items are buttons that open the source, never navigations inside the app.
const firstHeadlineButton = document.querySelector('[data-briefing="news"] .briefing-item') as HTMLButtonElement
assert.ok(firstHeadlineButton, 'headlines are interactive')
assert.ok((firstHeadlineButton.getAttribute('aria-label') || '').includes('Monsoon arrives early'), 'accessible headline label')

// Dismiss hands the rail back and leaves the chat untouched.
const dismiss = [...document.querySelectorAll('[data-briefing="news"] button')].find((b) =>
  (b.textContent || '').toLowerCase().includes('dismiss'),
) as HTMLButtonElement
assert.ok(dismiss, 'the card can be dismissed')
await act(async () => {
  dismiss.dispatchEvent(new jsdomWindow.MouseEvent('click', { bubbles: true }))
})
await waitFor(() => useBriefing.getState().phase === 'idle')
assert.ok(!document.querySelector('[data-briefing="news"]'), 'the card is gone after dismiss')
assert.equal(useChat.getState().chats.flatMap((chat) => chat.messages).length, 0, 'chat stays empty')

console.log('startup briefing ok: face opens by itself, greets, shows headlines, never touches the chat')
process.exit(0)
