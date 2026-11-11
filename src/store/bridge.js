// The renderer's single door to the outside world.
//
// Inside Electron this forwards to the preload bridge. In a plain browser (used
// for design previews during development) it falls back to localStorage and
// fetch, and it says plainly that keys are not encrypted there. The app itself
// always runs inside Electron, where the real, encrypted path is used.

export const isElectron = typeof window !== 'undefined' && Boolean(window.iceburg?.store)

const local = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(`iceburg:${key}`)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(`iceburg:${key}`, JSON.stringify(value))
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error.message }
    }
  },
}

export const storage = {
  async read(name) {
    if (isElectron) {
      const result = await window.iceburg.store.read(name)
      return result?.ok ? result.data : null
    }
    return local.get(name, null)
  },
  async write(name, data) {
    if (isElectron) return window.iceburg.store.write(name, data)
    return local.set(name, data)
  },
}

// Keys are held in memory only for the browser preview, so nothing secret ends up
// in localStorage. Electron writes them encrypted through safeStorage.
const memoryKeys = new Map()

export const secrets = {
  async available() {
    if (isElectron) return window.iceburg.secrets.encryptionAvailable()
    return false
  },
  async list() {
    if (isElectron) return window.iceburg.secrets.list()
    return Object.fromEntries([...memoryKeys.keys()].map((id) => [id, true]))
  },
  async set(providerId, key) {
    if (isElectron) return window.iceburg.secrets.set(providerId, key)
    if (key) memoryKeys.set(providerId, key)
    else memoryKeys.delete(providerId)
    return { ok: true, encrypted: false }
  },
  async clear(providerId) {
    if (isElectron) return window.iceburg.secrets.clear(providerId)
    memoryKeys.delete(providerId)
    return { ok: true }
  },
}

const net = {
  /**
   * Same contract as the Electron bridge: start the request, push decoded text
   * into onChunk, resolve by returning an abort function.
   */
  stream({ requestId, url, method = 'POST', headers = {}, body, auth, onChunk, onError, onDone }) {
    const controller = new AbortController()
    const key = auth?.providerId ? memoryKeys.get(auth.providerId) : null
    if (auth?.providerId && !key) {
      queueMicrotask(() =>
        onError({
          code: 'auth',
          message: `No API key saved for ${auth.label || 'this provider'}. Add one in settings.`,
        }),
      )
      return () => {}
    }
    const finalHeaders = { ...headers }
    if (key) finalHeaders[auth.header || 'Authorization'] = `${auth.prefix ?? 'Bearer '}${key}`

    ;(async () => {
      try {
        const response = await fetch(url, {
          method,
          headers: finalHeaders,
          body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
          signal: controller.signal,
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          onError({ code: 'http', status: response.status, body: text, message: `HTTP ${response.status}` })
          return
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          onChunk(decoder.decode(value, { stream: true }))
        }
        const tail = decoder.decode()
        if (tail) onChunk(tail)
        onDone?.()
      } catch (error) {
        if (controller.signal.aborted) return onError({ code: 'aborted' })
        onError({ code: 'network', message: error.message })
      }
    })()

    void requestId
    return () => controller.abort()
  },
}

/** Start a streaming request through whichever transport is available. */
export function openStream(options) {
  const transport = isElectron ? window.iceburg.net : net
  return transport.stream(options)
}

export const ollama = {
  async detect() {
    if (isElectron) return window.iceburg.ollama.detect()
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(2000),
      })
      if (!response.ok) return { running: false, installed: false }
      const data = await response.json()
      return { running: true, installed: true, models: data.models || [] }
    } catch {
      return { running: false, installed: false }
    }
  },
  async install() {
    if (isElectron) return window.iceburg.ollama.install()
    return { ok: false, message: 'Open the app to install Ollama.' }
  },
  onInstallProgress(callback) {
    if (isElectron) return window.iceburg.ollama.onInstallProgress(callback)
    return () => {}
  },
}

export async function copyText(text) {
  if (isElectron) return window.iceburg.clipboard.write(text)
  try {
    await navigator.clipboard.writeText(text)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// Computer tasks: "open youtube" and friends. In a plain browser there is
// nothing to open, so the resolver reports no match and the message goes to the
// model as usual.
export const tools = {
  async open(text, options = {}) {
    if (isElectron && window.iceburg?.tools?.open) {
      try {
        return await window.iceburg.tools.open(text, options)
      } catch (error) {
        return { matched: true, ok: false, label: text, message: String(error?.message || error) }
      }
    }
    return { matched: false }
  },
}

export async function openExternal(url) {
  if (isElectron) return window.iceburg.openExternal(url)
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function appInfo() {
  if (isElectron) return window.iceburg.info()
  return { version: '0.1.0', platform: 'web', encrypted: false }
}

