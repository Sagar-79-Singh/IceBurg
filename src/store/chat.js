import { create } from 'zustand'
import { storage } from './bridge.js'
import { useSettings, activeAdapter } from './settings.js'
import { parseJsonLines, streamText, messageFor } from '../providers/http.js'

// Chats are the only large document, so they are saved as one file with a short
// debounce. Streaming updates land in the message object directly; persistence
// catches up once the answer stops changing.
let saveTimer = null

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function newChat() {
  return {
    id: uid(),
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providerId: null,
    model: '',
    messages: [],
  }
}

const titleFrom = (text) => {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[#>*\-\s]+/, '')
    .trim()
  if (!clean) return 'New chat'
  const words = clean.split(' ').slice(0, 7).join(' ')
  return words.length > 44 ? `${words.slice(0, 44).trim()}…` : words
}

export const useChat = create((set, get) => ({
  chats: [],
  activeId: null,
  loaded: false,
  streamingId: null,
  controllers: {},
  error: null,

  async load() {
    const saved = await storage.read('chats')
    const chats = Array.isArray(saved?.chats) ? saved.chats : []
    const activeId = saved?.activeId && chats.some((chat) => chat.id === saved.activeId)
      ? saved.activeId
      : chats[0]?.id || null
    set({ chats, activeId, loaded: true })
    if (activeId) get().flush()
    return { chats, activeId }
  },

  flush() {
    clearTimeout(saveTimer)
    saveTimer = null
    return storage.write('chats', { chats: get().chats, activeId: get().activeId })
  },

  persist() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => get().flush(), 400)
  },

  createChat() {
    const chat = newChat()
    set((state) => ({ chats: [chat, ...state.chats], activeId: chat.id }))
    get().persist()
    return chat.id
  },

  selectChat(id) {
    if (get().streamingId) return
    set({ activeId: id })
    get().persist()
  },

  renameChat(id, title) {
    const next = String(title || '').trim() || 'Untitled chat'
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, title: next, updatedAt: Date.now() } : chat,
      ),
    }))
    get().persist()
  },

  deleteChat(id) {
    const controller = get().controllers[id]
    if (controller) {
      controller.abort()
      set((state) => {
        const controllers = { ...state.controllers }
        delete controllers[id]
        return { controllers }
      })
    }
    set((state) => {
      const chats = state.chats.filter((chat) => chat.id !== id)
      const activeId =
        state.activeId === id ? chats[0]?.id || null : state.activeId
      return { chats, activeId }
    })
    get().persist()
  },

  setError(error) {
    set({ error })
  },

  clearError() {
    set({ error: null })
  },

  async send(text) {
    const prompt = String(text || '').trim()
    if (!prompt) return { ok: false, reason: 'empty' }
    if (get().streamingId) return { ok: false, reason: 'busy' }

    const settingsState = useSettings.getState()
    const active = activeAdapter(settingsState)
    const model = settingsState.settings.providers[active.providerId]?.model
    if (!model) {
      set({ error: 'Pick a model first. Open the switcher above the composer.' })
      return { ok: false, reason: 'no-model' }
    }

    let chatId = get().activeId
    if (!chatId) chatId = get().createChat()

    const userMessage = { id: uid(), role: 'user', content: prompt, at: Date.now() }
    const replyId = uid()

    set((state) => ({
      error: null,
      chats: state.chats.map((chat) => {
        if (chat.id !== chatId) return chat
        const messages = [...chat.messages, userMessage]
        return {
          ...chat,
          providerId: active.providerId,
          model,
          title: chat.messages.length === 0 ? titleFrom(prompt) : chat.title,
          messages: [...messages, { id: replyId, role: 'assistant', content: '', at: Date.now(), model, providerId: active.providerId }],
          updatedAt: Date.now(),
        }
      }),
      streamingId: replyId,
    }))
    get().persist()

    const controller = new AbortController()
    set((state) => ({ controllers: { ...state.controllers, [chatId]: controller } }))

    const history = get()
      .chats.find((chat) => chat.id === chatId)
      .messages.slice(0, -1)
      .filter((message) => message.content)
      .map(({ role, content }) => ({ role, content }))

    const update = (patch) =>
      set((state) => ({
        chats: state.chats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === replyId ? { ...message, ...patch } : message,
                ),
                updatedAt: Date.now(),
              }
            : chat,
        ),
      }))

    try {
      let received = ''
      const stream = active.adapter.streamChat(history, model, controller.signal)
      for await (const chunk of stream) {
        if (controller.signal.aborted) break
        if (!chunk) continue
        received += chunk
        update({ content: received })
      }
      if (controller.signal.aborted) {
        update({
          content: received,
          stopped: true,
          note: received ? '' : 'Stopped before the answer started.',
        })
      } else if (!received) {
        update({ content: '', error: 'The model returned an empty answer. Try again, or switch models.' })
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'aborted') {
        const current = get()
          .chats.find((chat) => chat.id === chatId)
          ?.messages.find((message) => message.id === replyId)
        update({ stopped: true, note: current?.content ? '' : 'Stopped before the answer started.' })
      } else {
        update({ error: readableError(error) })
        set({ error: null })
      }
    } finally {
      set((state) => {
        const controllers = { ...state.controllers }
        delete controllers[chatId]
        return { controllers, streamingId: null }
      })
      get().persist()
    }

    return { ok: true }
  },

  stop() {
    const state = get()
    const chat = state.chats.find((candidate) => candidate.id === state.activeId)
    const controller = chat ? state.controllers[chat.id] : null
    if (!controller) return
    controller.abort()
  },

  stopAll() {
    for (const controller of Object.values(get().controllers)) {
      try {
        controller.abort()
      } catch {
        /* already stopped */
      }
    }
  },

  clear() {
    set({ chats: [], activeId: null })
    get().persist()
  },
}))

function readableError(error) {
  if (error?.code === 'auth') return error.message
  if (error?.code === 'refused' || /refused|ECONNREFUSED/i.test(error?.message || '')) {
    return 'Nothing answered at that address. Start the service, or switch provider.'
  }
  if (error?.code === 'offline') return "Can't reach the network. Check your connection."
  if (error?.code === 'timeout') return 'No answer in time. The model may be loading; try again.'
  const message = messageFor({ message: error?.message, body: error?.body, status: error?.status, code: error?.code })
  return message || 'Something went wrong. Try again.'
}

/* ---------- pulling a model from Ollama ---------- */

export const useModels = create((set, get) => ({
  pull: null,

  async pullModel(model, { onDone } = {}) {
    const name = String(model || '').trim()
    if (!name) return
    if (get().pull?.status === 'running') return
    const host = useSettings.getState().settings.providers.ollama?.baseUrl || 'http://127.0.0.1:11434'
    const controller = new AbortController()
    set({
      pull: { model: name, status: 'running', completed: 0, total: 0, percent: 0, message: 'Starting…', controller },
    })

    try {
      let raw = ''
      const source = streamText({
        url: `${host.replace(/\/+$/, '')}/api/pull`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { model: name, stream: true },
        signal: controller.signal,
      })
      for await (const frame of parseJsonLines(source)) {
        if (frame.error) throw new Error(frame.error)
        if (frame.status === 'success') {
          set((state) => ({ pull: { ...state.pull, status: 'done', percent: 100, message: 'Ready.' } }))
          onDone?.(name)
          return
        }
        const completed = Number(frame.completed) || 0
        const total = Number(frame.total) || 0
        const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0
        raw = frame.status || 'Downloading…'
        set((state) => ({
          pull: {
            ...state.pull,
            status: 'running',
            completed,
            total,
            percent,
            message: raw,
          },
        }))
      }
      set((state) => ({ pull: { ...state.pull, status: 'done', percent: 100, message: 'Ready.' } }))
      onDone?.(name)
    } catch (error) {
      if (controller.signal.aborted) {
        set((state) => ({ pull: { ...state.pull, status: 'cancelled', message: 'Cancelled.' } }))
      } else {
        set((state) => ({
          pull: {
            ...state.pull,
            status: 'error',
            message: /refused|connect/i.test(error.message)
              ? "Ollama isn't running. Start it, then pull again."
              : error.message,
          },
        }))
      }
    }
  },

  cancelPull() {
    get().pull?.controller?.abort()
  },

  clearPull() {
    set({ pull: null })
  },
}))

export { uid }
