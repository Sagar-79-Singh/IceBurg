// One way to talk to the outside world. Every adapter uses this, and this is the
// only place that knows about IPC and about turning bytes into lines.
import { openStream } from '../store/bridge.ts'
import { translate, getActiveLanguage } from '../lib/i18n.ts'
import type { StreamAuth, StreamErrorPayload } from '../../shared/ipc.ts'

let counter = 0

const nextId = (): string => `req-${Date.now()}-${++counter}`

export interface StreamTextOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  auth?: StreamAuth | null
  signal?: AbortSignal
}

export interface CodedError extends Error {
  code?: string
  status?: number
  body?: string
}

/* Untyped JSON boundary: provider frames are parsed lazily and each adapter
   narrows exactly the fields it reads. Deliberately not zod-validated — the
   wire formats vary across providers and would fail closed for cosmetic wins. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonFrame = Record<string, any>

/**
 * Open a streaming request and yield decoded text as it arrives.
 * Throws an Error with a readable `message` and a `code` when something breaks.
 */
export async function* streamText({ url, method = 'POST', headers = {}, body, auth, signal }: StreamTextOptions): AsyncGenerator<string, void, unknown> {
  const requestId = nextId()
  const queue: string[] = []
  let finished = false
  let failure: StreamErrorPayload | null = null
  let resume: (() => void) | null = null

  const wake = () => {
    if (resume) {
      const resolve = resume
      resume = null
      resolve()
    }
  }

  const abort = openStream({
    requestId,
    url,
    method,
    headers,
    body,
    auth,
    onChunk: (text: string) => {
      queue.push(text)
      wake()
    },
    onError: (error: StreamErrorPayload) => {
      if (error.code !== 'aborted') failure = error
      finished = true
      wake()
    },
    onDone: () => {
      finished = true
      wake()
    },
  })

  const stop = () => {
    abort()
    finished = true
    wake()
  }

  if (signal?.aborted) stop()
  else signal?.addEventListener('abort', stop, { once: true })

  try {
    while (true) {
      if (queue.length) {
        const next = queue.shift()
        if (next !== undefined) {
          yield next
          continue
        }
      }
      if (finished) {
        if (failure) throw toError(failure)
        return
      }
      await new Promise((resolve) => {
        resume = () => resolve(undefined)
      })
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    if (!finished) abort()
  }
}

/** Split a text stream into SSE `data:` payloads, then parse each as JSON. */
export async function* parseSse(source: AsyncIterable<string>): AsyncGenerator<JsonFrame, void, unknown> {
  let buffer = ''
  for await (const chunk of source) {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        if (payload) {
          try {
            yield JSON.parse(payload)
          } catch {
            /* keep-alive or a partial frame: ignore */
          }
        }
      }
      index = buffer.indexOf('\n')
    }
  }
  const tail = buffer.trim()
  if (tail.startsWith('data:')) {
    const payload = tail.slice(5).trim()
    if (payload && payload !== '[DONE]') {
      try {
        yield JSON.parse(payload)
      } catch {
        /* incomplete last frame */
      }
    }
  }
}

/** Split NDJSON (Ollama) or concatenated JSON objects into parsed values. */
export async function* parseJsonLines(source: AsyncIterable<string>): AsyncGenerator<JsonFrame, void, unknown> {
  let buffer = ''
  for await (const chunk of source) {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) {
        try {
          yield JSON.parse(line)
        } catch {
          /* a frame split across chunks: keep going */
        }
      }
      index = buffer.indexOf('\n')
    }
  }
  const tail = buffer.trim()
  if (tail) {
    try {
      yield JSON.parse(tail)
    } catch {
      /* nothing usable left over */
    }
  }
}

export function abortError(): CodedError {
  const error: CodedError = new Error(translate(getActiveLanguage(), 'err_stopped'))
  error.name = 'AbortError'
  error.code = 'aborted'
  return error
}

export function toError(info: StreamErrorPayload & { code?: string } = {}): CodedError {
  const error: CodedError = new Error(messageFor(info))
  error.code = info.code || 'unknown'
  error.status = info.status
  return error
}

/** Turn a failure into one sentence that says what to do about it. */
export function messageFor(info: StreamErrorPayload & { code?: string } = {}, language: string = getActiveLanguage()): string {
  if (info.code === 'aborted') return translate(language, 'err_stopped')
  if (info.code === 'auth' || info.status === 401 || info.status === 403) {
    return translate(language, 'err_key_rejected')
  }
  if (info.status === 404) return translate(language, 'err_model_not_found')
  if (info.status === 429) return translate(language, 'err_rate_limited')
  if (info.status === 402) return translate(language, 'err_out_of_credit')
  if (info.status === 400) {
    const detail = errorDetail(info.body)
    return detail || translate(language, 'err_rejected_request')
  }
  if (typeof info.status === 'number' && info.status >= 500) return translate(language, 'err_provider_down')
  const detail = errorDetail(info.body)
  if (detail) return detail
  return info.message || translate(language, 'err_request_failed')
}

function errorDetail(body?: string): string {
  if (!body) return ''
  try {
    const parsed = JSON.parse(body) as JsonFrame | null
    const detail = parsed?.error?.message || parsed?.message || parsed?.error || parsed?.detail
    if (typeof detail === 'string' && detail.length < 240) return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).slice(0, 240)
  } catch {
    if (typeof body === 'string' && body.length < 240) return body
  }
  return ''
}

/** Normalise a base URL: trim, drop trailing slash, guarantee the /v1 suffix. */
export function baseUrl(url?: string | null, { forceV1 = true }: { forceV1?: boolean } = {}): string {
  let value = String(url || '').trim().replace(/\/+$/, '')
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`
  if (forceV1 && !/\/v1$/i.test(value)) value = `${value}/v1`
  return value
}

export function joinUrl(base: string | null | undefined, path: string): string {
  return `${String(base || '').replace(/\/+$/, '')}${path}`
}
