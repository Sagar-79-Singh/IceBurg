import { ipcMain, net as electronNet } from 'electron'
import type { BrowserWindow } from 'electron'
import { getSecret } from './secrets.ts'
import { readDocument } from './store.ts'
import type { NetErrorContent, NetSendContent, StreamAuth } from '../shared/ipc.ts'
import { IPC } from '../shared/ipc.ts'

// All outbound HTTP traffic goes through here. Two reasons:
// 1. API keys are decrypted here and never enter the renderer.
// 2. No CORS, no mixed-content rules, and the adapters in /src/providers can be
//    written as plain fetch-style logic.
interface StreamEntry {
  controller: AbortController
  timer: ReturnType<typeof setTimeout> | null
  done: boolean
}
const active = new Map<string, StreamEntry>()

/** Structural view of network failures: code/errno/message plus the cause chain. */
interface NetFailure {
  code?: string | number
  errno?: string | number
  message?: string
  name?: string
  errors?: NetFailure[]
  cause?: unknown
}

const IDLE_TIMEOUT = 180_000
const CONNECT_TIMEOUT = 120_000

// A provider's saved API key may only ever leave for the address saved for that
// provider (or its built-in default). Anything else is refused before a byte
// goes on the wire, so a compromised or mistaken request target cannot be used
// to collect keys. Defaults mirror the adapters in src/providers; 'custom' has
// none on purpose — it only sends where the user explicitly pointed it.
const PROVIDER_DEFAULTS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  omniroute: 'http://127.0.0.1:20128/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
}

function originOf(raw: unknown): string | null {
  try {
    // URL.origin normalises away paths and default ports (https://h:443 -> https://h).
    return new URL(String(raw)).origin
  } catch {
    return null
  }
}

async function expectedOriginFor(providerId: string): Promise<string | null> {
  let saved = null
  try {
    const document = await readDocument('settings')
    saved = String(document?.providers?.[providerId]?.baseUrl || '').trim() || null
  } catch {
    saved = null
  }
  const base = saved || PROVIDER_DEFAULTS[providerId]
  return base ? originOf(base) : null
}

type UrlCheck = { valid: true; url: URL } | { valid: false; message: string }
function validateUrl(raw: unknown): UrlCheck {
  try {
    const url = new URL(String(raw))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, message: 'Only http and https addresses are supported.' }
    }
    return { valid: true, url }
  } catch {
    return { valid: false, message: `"${String(raw)}" isn't a valid address.` }
  }
}

// Every code and message in the failure, from the error and its causes: a refused
// connection can arrive as a plain TypeError wrapping an AggregateError.
function failureText(error: unknown): string {
  const parts: string[] = []
  let current = error as NetFailure | null | undefined
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.code) parts.push(String(current.code))
    if (current.errno) parts.push(String(current.errno))
    if (current.message) parts.push(String(current.message))
    if (Array.isArray(current.errors)) {
      for (const inner of current.errors) {
        if (inner?.code) parts.push(String(inner.code))
        if (inner?.message) parts.push(String(inner.message))
      }
    }
    current = current.cause as NetFailure | null | undefined
  }
  return parts.join(' | ')
}

function describeNetworkError(error: unknown): { code: string; message: string } {
  const text = failureText(error)
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(text)) {
    return {
      code: 'refused',
      message: 'Nothing is listening at that address. Is the service running?',
    }
  }
  if (/ENOTFOUND|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(text)) {
    return { code: 'offline', message: "Can't reach the network. Check your connection." }
  }
  if (/ECONNRESET|UND_ERR_SOCKET|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/i.test(text)) {
    return { code: 'reset', message: 'The connection dropped mid-answer.' }
  }
  if (/CERT|SSL|TLS|ERR_CERT/i.test(text)) {
    return { code: 'tls', message: 'The secure connection was rejected by this machine.' }
  }
  if ((error as NetFailure | null | undefined)?.name === 'TimeoutError' || /ERR_TIMED_OUT|UND_ERR_CONNECT_TIMEOUT/i.test(text)) {
    return { code: 'timeout', message: 'No response in time. The service may be asleep or busy.' }
  }
  return { code: 'network', message: (error as NetFailure | null | undefined)?.message || 'The request failed.' }
}

export function abortAllStreams() {
  for (const entry of active.values()) {
    try {
      entry.controller.abort()
    } catch {
      /* already gone */
    }
    if (entry.timer) clearTimeout(entry.timer)
  }
  active.clear()
}

export function registerNetHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    'net:stream',
    async (_event, { requestId, url, method = 'POST', headers = {}, body, auth }: {
      requestId: string
      url: string
      method?: string
      headers?: Record<string, string>
      body?: unknown
      auth?: StreamAuth | null
    }) => {
      const check = validateUrl(url)
      if (!check.valid) return { ok: false, code: 'url', message: check.message }
      if (active.has(requestId)) return { ok: false, code: 'duplicate', message: 'Duplicate request.' }

      const controller = new AbortController()
      const send = (channel: string, payload: NetSendContent) => {
        const win = getWindow()
        if (win && !win.isDestroyed()) win.webContents.send(channel, { requestId, ...payload })
      }

      const entry: StreamEntry = { controller, timer: null, done: false }
      active.set(requestId, entry)

      const fail = (info: NetErrorContent) => {
        if (entry.done) return
        entry.done = true
        if (entry.timer) clearTimeout(entry.timer)
        active.delete(requestId)
        send('net:error', info)
      }

      // If a provider goes quiet without closing the socket, give up rather than
      // leaving the UI stuck on a spinner forever.
      let idleTimer = setTimeout(() => {
        controller.abort()
        fail({ code: 'timeout', message: 'The model stopped responding after 3 minutes.' })
      }, CONNECT_TIMEOUT)
      entry.timer = idleTimer

      const touch = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          controller.abort()
          fail({ code: 'timeout', message: 'The model stopped responding after 3 minutes.' })
        }, IDLE_TIMEOUT)
        entry.timer = idleTimer
      }

      const finish = (info?: NetErrorContent) => {
        if (entry.done) return
        entry.done = true
        clearTimeout(idleTimer)
        active.delete(requestId)
        if (info) send('net:error', info)
        else send('net:done', {})
      }

      try {
        const requestHeaders = { ...headers }
        if (auth && auth.providerId) {
          // The key goes only to the provider's own address. Origins compare
          // scheme, host and port, so trailing slashes and explicit-vs-default
          // ports (:443, :80) still match their bare-host form.
          const expected = await expectedOriginFor(auth.providerId)
          if (!expected || expected !== originOf(check.url.toString())) {
            const info = {
              code: 'auth-origin',
              message:
                "This request went to an address that isn't set for this provider, so the saved key was not sent.",
            }
            finish(info)
            return { ok: false, ...info }
          }
          const key = await getSecret(auth.providerId)
          if (!key && auth.optional) {
            // A local server that takes no key: send the request as it is.
          } else if (!key) {
            const info = {
              code: 'auth',
              message: `No API key saved for ${auth.label || 'this provider'}. Add one in settings.`,
            }
            finish(info)
            return { ok: false, ...info }
          } else {
            requestHeaders[auth.header || 'Authorization'] = `${auth.prefix ?? 'Bearer '}${key}`
          }
        }

        // Chromium's network stack: it honours the system proxy and the OS
        // certificate store, which a plain fetch in the main process does not.
        const doFetch = typeof electronNet?.fetch === 'function' ? electronNet.fetch : fetch
        const response = await doFetch(check.url.toString(), {
          method,
          headers: requestHeaders,
          body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
          signal: controller.signal,
          redirect: 'follow',
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          entry.done = true
          clearTimeout(idleTimer)
          active.delete(requestId)
          send('net:error', {
            code: 'http',
            status: response.status,
            body: text.slice(0, 2000),
            message: `The provider returned ${response.status}.`,
          })
          return { ok: false, status: response.status }
        }

        touch()
        if (!response.body) {
          const text = await response.text()
          if (text) send('net:chunk', { text })
          finish()
          return { ok: true, status: response.status }
        }

        // Keep reading after the IPC call resolves; the renderer listens for chunks.
        ;(async () => {
          const reader = (response.body as ReadableStream<Uint8Array>).getReader()
          const decoder = new TextDecoder()
          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              touch()
              const text = decoder.decode(value, { stream: true })
              if (text) send('net:chunk', { text })
            }
            const tail = decoder.decode()
            if (tail) send('net:chunk', { text: tail })
            finish()
          } catch (error) {
            if (controller.signal.aborted) return finish({ code: 'aborted', message: 'Stopped.' })
            finish(describeNetworkError(error))
          }
        })()

        return { ok: true, status: response.status }
      } catch (error) {
        if (controller.signal.aborted) {
          finish({ code: 'aborted', message: 'Stopped.' })
          return { ok: false, code: 'aborted' }
        }
        const info = describeNetworkError(error)
        finish(info)
        return { ok: false, ...info }
      }
    },
  )

  ipcMain.handle('net:abort', (_event: Electron.IpcMainInvokeEvent, requestId: string) => {
    const entry = active.get(requestId)
    if (!entry) return { ok: true }
    try {
      entry.controller.abort()
    } catch {
      /* already aborted */
    }
    if (entry.timer) clearTimeout(entry.timer)
    active.delete(requestId)
    return { ok: true }
  })
}
