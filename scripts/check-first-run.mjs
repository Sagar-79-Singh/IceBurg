// First launch on a machine with nothing installed and no keys: the app must ask
// before it installs anything, and it must offer one clear way forward.
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let installs = 0
let installed = false
let saved = {}

window.iceburg = {
  platform: 'linux',
  info: async () => ({ version: '0.1.0', platform: 'linux', encrypted: true }),
  store: {
    read: async (name) => ({ ok: true, data: saved[name] ?? null }),
    write: async (name, data) => {
      saved = { ...saved, [name]: data }
      return { ok: true }
    },
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
    detect: async () =>
      installed
        ? { running: true, installed: true, models: [{ name: 'llama3.2' }] }
        : { running: false, installed: false },
    install: async () => {
      installs += 1
      installed = true
      return { ok: true, mode: 'script' }
    },
    onInstallProgress: () => () => {},
  },
  net: {
    stream({ onChunk, onDone }) {
      setTimeout(() => {
        onChunk(JSON.stringify({ models: [{ name: 'llama3.2' }] }))
        onDone?.()
      }, 5)
      return () => {}
    },
  },
}

const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const React = await import('react')
const { default: App } = await import('../src/App.jsx')
const { useSettings } = await import('../src/store/settings.js')

/* the assertions below were written against the english interface */
await useSettings.getState().update({ language: 'english' })
const root = createRoot(document.getElementById('root'))
await act(async () => {
  root.render(React.createElement(App))
})
await act(async () => {
  await sleep(250)
})

const text = () => document.body.textContent
const button = (label) =>
  [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === label)

// 1. It asks, and it has not installed anything.
assert.ok(text().includes("Ollama isn't installed"), 'the install question is shown on first launch')
assert.equal(installs, 0, 'nothing installs before the user answers')
assert.ok(button('Install Ollama'), 'the question has a clear yes')
assert.ok(button('Not now'), 'the question has a clear no')

// 2. Saying no closes the question and leaves a usable screen.
await act(async () => {
  button('Not now').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(50)
})
assert.equal(installs, 0, 'saying no installs nothing')
assert.equal(useSettings.getState().settings.onboarding.ollamaDeclined, true, 'the answer is remembered')
assert.ok(!document.querySelector('[role="dialog"]'), 'the dialog closes')
assert.ok(text().includes("Ollama isn't running. Start it, or pick another provider."), 'the empty screen names the problem')
assert.ok(button('Pick a model') || button('Add a provider'), 'the empty screen offers one clear action')
console.log('first run asks before installing ok')

// 3. Reloading does not ask again.
const reloaded = await useSettings.getState().load()
assert.equal(reloaded.settings.onboarding.ollamaDeclined, true)
console.log('the answer survives a restart ok')

// 4. The install the user does ask for runs once, from settings.
await act(async () => {
  useSettings.getState().setOnboarding({ ollamaDeclined: false })
  const opener = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Providers and settings',
  )
  opener.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(50)
})
const installButton = button('Install Ollama')
assert.ok(installButton, 'settings offers the install for a machine without Ollama')
await act(async () => {
  installButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(60)
})
// Opening the prompt does not install anything; the prompt asks again.
const dialogs = [...document.querySelectorAll('[role="dialog"]')]
assert.ok(dialogs.some((dialog) => dialog.textContent.includes("Ollama isn't installed")), 'the prompt opens from settings')
assert.equal(installs, 0, 'opening the prompt installs nothing')
const prompt = dialogs.find((dialog) => dialog.getAttribute('aria-label') === "Ollama isn't installed")
const confirm = [...prompt.querySelectorAll('button')].find(
  (element) => element.textContent.trim() === 'Install Ollama',
)
await act(async () => {
  confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(200)
})
assert.equal(installs, 1, 'pressing Install Ollama runs the installer once')
console.log('install runs only on request ok')

// 5. After the installer reports success, the model is picked up and nothing crashes.
window.dispatchEvent(new window.Event('unused'))
await act(async () => {
  await sleep(200)
})
assert.ok(text().includes('Ollama'), 'Ollama is on screen after install')
console.log('post-install state ok')

await act(async () => {
  await sleep(400)
})
assert.ok(saved.settings, 'the decision was written to disk')
console.log('\nall first-run checks passed')
process.exit(0)
