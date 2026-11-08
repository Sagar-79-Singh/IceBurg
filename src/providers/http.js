// One way to talk to the outside world. Every adapter uses this, and this is the
// only place that knows about IPC and about turning bytes into lines.
import { openStream } from '../store/bridge.js'

let counter = 0

const nextId = () => `req-${Date.now()}-${++counter}`

/**
 * Open a streaming request and yield decoded text as it arrives.
 * Throws an Error with a readable `message` and a `code` when something breaks.
 */
export async function* streamText({ url, method = 'POST', headers = {}, body, auth, signal }) {
  const requestId = nextId()
  const queue = []
  let finished = false
  let failure = null
  let resume = null

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
    onChunk: (text) => {
      queue.push(text)
      wake()
    },
    onError: (error) => {
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
        yield queue.shift()
        continue
      }
      if (finished) {
        if (failure) throw toError(failure)
        return
      }
      await new Promise((resolve) => {
        resume = resolve
      })
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    if (!finished) abort()
  }
}

/** Split a text stream into SSE `data:` payloads, then parse each as JSON. */
export async function* parseSse(source) {
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
export async function* parseJsonLines(source) {
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

export function abortError() {
  const error = new Error('Stopped.')
  error.name = 'AbortError'
  error.code = 'aborted'
  return error
}

export function toError(info = {}) {
  const error = new Error(messageFor(info))
  error.code = info.code || 'unknown'
  error.status = info.status
  return error
}

/** Turn a failure into one sentence that says what to do about it. */
export function messageFor(info = {}) {
  if (info.code === 'aborted') return 'Stopped.'
  if (info.code === 'auth' || info.status === 401 || info.status === 403) {
    return 'The key was rejected. Check it in settings, or pick another provider.'
  }
  if (info.status === 404) return 'That model or address was not found. Check the model name.'
  if (info.status === 429) return 'Rate limited by the provider. Wait a moment, or switch models.'
  if (info.status === 402) return 'That account is out of credit.'
  if (info.status === 400) {
    const detail = errorDetail(info.body)
    return detail || 'The provider rejected the request. Check the model name in settings.'
  }
  if (info.status >= 500) return 'The provider is having trouble. Try again shortly.'
  const detail = errorDetail(info.body)
  if (detail) return detail
  return info.message || 'The request failed.'
}

function errorDetail(body) {
  if (!body) return ''
  try {
    const parsed = JSON.parse(body)
    const detail = parsed?.error?.message || parsed?.message || parsed?.error || parsed?.detail
    if (typeof detail === 'string' && detail.length < 240) return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).slice(0, 240)
  } catch {
    if (typeof body === 'string' && body.length < 240) return body
  }
  return ''
}

/** Normalise a base URL: trim, drop trailing slash, guarantee the /v1 suffix. */
export function baseUrl(url, { forceV1 = true } = {}) {
  let value = String(url || '').trim().replace(/\/+$/, '')
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`
  if (forceV1 && !/\/v1$/i.test(value)) value = `${value}/v1`
  return value
}

export function joinUrl(base, path) {
  return `${String(base || '').replace(/\/+$/, '')}${path}`
}
