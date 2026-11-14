// The renderer's single door to the outside world.
//
// Inside Electron this forwards to the preload bridge. In a plain browser (used
// for design previews during development) it falls back to localStorage and
// fetch, and it says plainly that keys are not encrypted there. The app itself
// always runs inside Electron, where the real, encrypted path is used.
import type {
  AppInfo,
  ClipboardResult,
  NewsHeadlinesResult,
  OllamaDetectResult,
  OllamaInstallResult,
  NetStreamOptions,
  SecretMap,
  StoreWriteOk,
  ToolOpenResult,
} from '../../shared/ipc.ts'
import type { IceburgBridge } from '../../shared/ipc.ts'

export const isElectron = typeof window !== 'undefined' && Boolean(window.iceburg?.store)

/** The bridge, with the isElectron guard already applied by callers. */
const bridge = (): IceburgBridge => {
  const value = typeof window !== 'undefined' ? window.iceburg : undefined
  if (!value) throw new Error('The Electron bridge is not available in this context.')
  return value
}

interface LocalResult {
  ok: boolean
  message?: string
}

const local = {
  get(key: string, fallback: unknown): unknown {
    try {
      const raw = window.localStorage.getItem(`iceburg:${key}`)
      return raw ? (JSON.parse(raw) as unknown) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown): LocalResult {
    try {
      window.localStorage.setItem(`iceburg:${key}`, JSON.stringify(value))
      return { ok: true }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  },
}

export const storage = {
  async read<T = unknown>(name: string): Promise<T | null> {
    if (isElectron) {
      const result = await bridge().store.read(name)
      return result?.ok ? (result.data as T | null) : null
    }
    return local.get(name, null) as T | null
  },
  async write(name: string, data: unknown): Promise<StoreWriteOk | LocalResult> {
    if (isElectron) return bridge().store.write(name, data)
    return local.set(name, data)
  },
}

// Keys are held in memory only for the browser preview, so nothing secret ends up
// in localStorage. Electron writes them encrypted through safeStorage.
const memoryKeys = new Map<string, string>()

export const secrets = {
  async available(): Promise<boolean> {
    if (isElectron) return bridge().secrets.encryptionAvailable()
    return false
  },
  async list(): Promise<SecretMap> {
    if (isElectron) return bridge().secrets.list()
    return Object.fromEntries([...memoryKeys.keys()].map((id) => [id, true as const]))
  },
  async set(providerId: string, key: string): Promise<{ ok: boolean; encrypted?: boolean }> {
    if (isElectron) return bridge().secrets.set(providerId, key)
    if (key) memoryKeys.set(providerId, key)
    else memoryKeys.delete(providerId)
    return { ok: true, encrypted: false }
  },
  async clear(providerId: string): Promise<{ ok: boolean }> {
    if (isElectron) return bridge().secrets.clear(providerId)
    memoryKeys.delete(providerId)
    return { ok: true }
  },
}

const net = {
  /**
   * Same contract as the Electron bridge: start the request, push decoded text
   * into onChunk, resolve by returning an abort function.
   */
  stream(options: NetStreamOptions): () => void {
    const { requestId, url, method = 'POST', headers = {}, body, auth, onChunk, onError, onDone } = options
    const controller = new AbortController()
    const key = auth?.providerId ? memoryKeys.get(auth.providerId) : null
    const authOptional = Boolean(auth?.optional)
    if (auth?.providerId && !key && !authOptional) {
      queueMicrotask(() =>
        onError({
          code: 'auth',
          message: `No API key saved for ${auth.label || 'this provider'}. Add one in settings.`,
        }),
      )
      return () => {}
    }
    if (auth?.providerId && !key && authOptional) {
      // A local server that takes no key: send the request as it is.
    }
    const finalHeaders: Record<string, string> = { ...headers }
    if (key) finalHeaders[auth?.header || 'Authorization'] = `${auth?.prefix ?? 'Bearer '}${key}`

    void (async () => {
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
        const bodyStream = response.body
        if (!bodyStream) {
          onDone?.()
          return
        }
        const reader = bodyStream.getReader()
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
        onError({ code: 'network', message: (error as Error).message })
      }
    })()

    void requestId
    return () => controller.abort()
  },
}

/** Start a streaming request through whichever transport is available. */
export function openStream(options: NetStreamOptions): () => void {
  const transport = isElectron ? bridge().net : net
  return transport.stream(options)
}

export const ollama = {
  async detect(): Promise<OllamaDetectResult> {
    if (isElectron) return bridge().ollama.detect()
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(2000),
      })
      if (!response.ok) return { running: false, installed: false }
      const data = (await response.json()) as { models?: OllamaDetectResult['models'] }
      return { running: true, installed: true, models: data.models || [] }
    } catch {
      return { running: false, installed: false }
    }
  },
  async install(): Promise<OllamaInstallResult> {
    if (isElectron) return bridge().ollama.install()
    return { ok: false, message: 'Open the app to install Ollama.' }
  },
  onInstallProgress(callback: (payload: import('../../shared/ipc.ts').OllamaInstallProgress) => void): () => void {
    if (isElectron) return bridge().ollama.onInstallProgress(callback)
    return () => {}
  },
}

export async function copyText(text: string): Promise<ClipboardResult> {
  if (isElectron) return bridge().clipboard.write(text)
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
  async open(text: string, options: { confirmed?: boolean } = {}): Promise<ToolOpenResult> {
    if (isElectron && window.iceburg?.tools?.open) {
      try {
        return await bridge().tools.open(text, options)
      } catch (error) {
        return { matched: true, ok: false, label: text, message: String((error as Error)?.message || error) }
      }
    }
    return { matched: false }
  },
}

export async function openExternal(url: string): Promise<unknown> {
  if (isElectron) return bridge().openExternal(url)
  window.open(url, '_blank', 'noopener,noreferrer')
  return undefined
}

/**
 * Headlines for the startup briefing. Inside Electron these come from the main
 * process (the renderer is not allowed to open sockets). In a plain browser the
 * feed cannot be fetched at all — say so, and the briefing falls back to the
 * greeting alone.
 */
export const news = {
  async headlines(language?: string): Promise<NewsHeadlinesResult> {
    if (isElectron) return bridge().news.headlines(language)
    return { ok: false, items: [], message: 'Headlines are only available in the desktop app.' }
  },
}

export async function appInfo(): Promise<AppInfo> {
  if (isElectron) return bridge().info()
  return { version: '0.1.0', platform: 'web', encrypted: false }
}
