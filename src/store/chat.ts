import { create } from 'zustand'
import { storage, tools } from './bridge.ts'
import { useSettings, activeAdapter } from './settings.ts'
import { cleanModelTitle } from '../lib/title.ts'
import { systemPromptFor, translate } from '../lib/i18n.ts'
import type { ChatMessage, ChatRecord, ToolOpenResult } from '../../shared/ipc.ts'
import type { WireMessage } from '../providers/types.ts'
import type { CodedError } from '../providers/http.ts'

// Strip markdown the model may have used so it doesn't leak into the title.
const stripForTitle = (text: string): string =>
  String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
import { parseJsonLines, streamText, messageFor } from '../providers/http.ts'

// Chats are the only large document, so they are saved as one file with a short
// debounce. Streaming updates land in the message object directly; persistence
// catches up once the answer stops changing.
let saveTimer: ReturnType<typeof setTimeout> | null = null

const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function newChat(): ChatRecord {
  return {
    id: uid(),
    title: 'New chat',
    titleAuto: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providerId: null,
    model: '',
    messages: [],
  }
}

const titleFrom = (text: string): string => {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[#>*\-\s]+/, '')
    .trim()
  if (!clean) return 'New chat'
  const words = clean.split(' ').slice(0, 7).join(' ')
  return words.length > 44 ? `${words.slice(0, 44).trim()}…` : words
}


// "open youtube" and friends never reach the model: they are computer tasks.
// Returns the two messages to append, or null if the text is not a task.
function toolExchange(
  prompt: string,
  opened: ToolOpenResult,
  replyId: string,
  uidFor: () => string,
): ChatMessage[] {
  const userMessage: ChatMessage = { id: uidFor(), role: 'user', content: prompt, at: Date.now(), task: true }
  if (opened.needsConfirmation) {
    return [
      userMessage,
      {
        id: replyId,
        role: 'assistant',
        content: '',
        at: Date.now(),
        tool: {
          type: 'confirm',
          request: prompt,
          label: opened.label || 'this tool',
          confirmText: opened.confirmText || `Open ${opened.label || 'this tool'}?`,
          url: opened.url || null,
        },
      },
    ]
  }
  const ok = opened.ok !== false
  return [
    userMessage,
    ok
      ? {
          id: replyId,
          role: 'assistant',
          content: opened.message || `Opened ${opened.label || 'that'}.`,
          at: Date.now(),
          toolNote: true,
        }
      : {
          id: replyId,
          role: 'assistant',
          content: '',
          at: Date.now(),
          toolNote: true,
          error: opened.message || `Could not open ${opened.label || 'that'}.`,
        },
  ]
}

export interface ChatState {
  chats: ChatRecord[]
  activeId: string | null
  loaded: boolean
  streamingId: string | null
  controllers: Record<string, AbortController>
  error: string | null
  load(): Promise<{ chats: ChatRecord[]; activeId: string | null }>
  flush(): Promise<unknown>
  persist(): void
  createChat(): string
  selectChat(id: string): void
  renameChat(id: string, title: string): void
  deleteChat(id: string): void
  send(text: string): Promise<{ ok: boolean; reason?: string }>
  stop(): void
  confirmTool(messageId: string): Promise<{ ok: boolean }>
  cancelTool(messageId: string): { ok: boolean }
  maybeDecideTitle(chatId: string, userText: string, assistantText: string): Promise<void>
  applyDecidedTitle(chatId: string, title: string): void
  clear(): void
}

export const useChat = create<ChatState>()((set, get) => ({
  chats: [],
  activeId: null,
  loaded: false,
  streamingId: null,
  controllers: {},
  error: null,

  async load() {
    const saved = await storage.read<{ chats?: ChatRecord[]; activeId?: string | null }>('chats')
    const chats = Array.isArray(saved?.chats) ? saved.chats : []
    const activeId = saved?.activeId && chats.some((chat) => chat.id === saved.activeId)
      ? saved.activeId
      : chats[0]?.id || null
    set({ chats, activeId, loaded: true })
    if (activeId) get().flush()
    return { chats, activeId }
  },

  flush() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    return storage.write('chats', { chats: get().chats, activeId: get().activeId })
  },

  persist() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => get().flush(), 400)
  },

  createChat() {
    const chat = newChat()
    set((state) => ({ chats: [chat, ...state.chats], activeId: chat.id }))
    get().persist()
    return chat.id
  },

  selectChat(id: string) {
    if (get().streamingId) return
    set({ activeId: id })
    get().persist()
  },

  renameChat(id: string, title: string) {
    const next = String(title || '').trim() || 'Untitled chat'
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, title: next, titleAuto: false, updatedAt: Date.now() } : chat,
      ),
    }))
    get().persist()
  },

  deleteChat(id: string) {
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

  async send(text: string) {
    const prompt = String(text || '').trim()
    if (!prompt) return { ok: false, reason: 'empty' }
    if (get().streamingId) return { ok: false, reason: 'busy' }

    // Computer tasks go first: "open YouTube" works without a model picked.
    const opened = await tools.open(prompt)
    if (opened?.matched) {
      let chatId = get().activeId
      if (!chatId) chatId = get().createChat()
      const title = get().chats.find((chat) => chat.id === chatId)?.messages.length === 0
      const replyId = uid()
      const pair = toolExchange(prompt, opened, replyId, uid)
      set((state) => ({
        error: null,
        chats: state.chats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                title: title ? opened.title || titleFrom(prompt) : chat.title,
                titleAuto: title ? false : chat.titleAuto,
                messages: [...chat.messages, ...pair],
                updatedAt: Date.now(),
              }
            : chat,
        ),
      }))
      get().persist()
      return { ok: true, reason: 'tool' }
    }

    const settingsState = useSettings.getState()
    const active = activeAdapter(settingsState)
    const model = settingsState.settings.providers[active.providerId]?.model
    if (!model) {
      set({ error: translate(useSettings.getState().settings.language, 'err_pick_model') })
      return { ok: false, reason: 'no-model' }
    }

    let chatId = get().activeId
    if (!chatId) chatId = get().createChat()

    const userMessage: ChatMessage = { id: uid(), role: 'user', content: prompt, at: Date.now() }
    const replyId = uid()
    const emptyReply: ChatMessage = { id: replyId, role: 'assistant', content: '', at: Date.now(), model, providerId: active.providerId }

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
          titleAuto: chat.messages.length === 0 ? true : chat.titleAuto,
          messages: [...messages, emptyReply],
          updatedAt: Date.now(),
        }
      }),
      streamingId: replyId,
    }))
    get().persist()

    const controller = new AbortController()
    set((state) => ({ controllers: { ...state.controllers, [chatId]: controller } }))

    const currentChat = get().chats.find((chat) => chat.id === chatId)
    const history: WireMessage[] = (currentChat?.messages || [])
      .slice(0, -1)
      .filter((message) => message.content)
      .map(({ role, content }) => ({ role, content }))
    const language = useSettings.getState().settings.language || 'hinglish'
    history.unshift({ role: 'system', content: systemPromptFor(language) })

    const update = (patch: Partial<ChatMessage>) =>
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

    if (!active.adapter) {
      update({ error: translate(language, 'err_something') })
      set((state) => ({
        controllers: Object.fromEntries(Object.entries(state.controllers).filter(([id]) => id !== chatId)),
        streamingId: null,
      }))
      return { ok: false, reason: 'no-adapter' }
    }

    try {
      let received = ''
      const adapter = active.adapter
      const stream = adapter.streamChat(history, model, controller.signal)
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
        update({ content: '', error: translate(useSettings.getState().settings.language, 'err_empty_answer') })
      }
      if (!controller.signal.aborted && received) {
        void get().maybeDecideTitle(chatId, prompt, received)
      }
    } catch (rawError) {
      const error = rawError as CodedError | null | undefined
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

  async confirmTool(messageId) {
    const state = get()
    for (const chat of state.chats) {
      const message = chat.messages.find((candidate) => candidate.id === messageId)
      if (message?.tool?.type !== 'confirm') continue
      const result = await tools.open(message.tool.request, { confirmed: true })
      const patch = result?.ok !== false
        ? {
            content: result?.message || `Opened ${result?.label || message.tool.label}.`,
            error: undefined,
            tool: undefined,
            toolNote: true,
          }
        : {
            content: '',
            error: result?.message || `Could not open ${message.tool.label}.`,
            tool: undefined,
            toolNote: true,
          }
      set((current) => ({
        chats: current.chats.map((candidate) =>
          candidate.id === chat.id
            ? {
                ...candidate,
                updatedAt: Date.now(),
                messages: candidate.messages.map((candidateMessage) =>
                  candidateMessage.id === messageId ? { ...candidateMessage, ...patch } : candidateMessage,
                ),
              }
            : candidate,
        ),
      }))
      get().persist()
      return { ok: true }
    }
    return { ok: false }
  },

  cancelTool(messageId) {
    set((current) => ({
      chats: current.chats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.id === messageId
            ? { ...message, content: 'Cancelled — nothing was opened.', error: undefined, tool: undefined, toolNote: true }
            : message,
        ),
      })),
    }))
    get().persist()
    return { ok: true }
  },

  async maybeDecideTitle(chatId: string, userText: string, assistantText: string) {
    // Only the first exchange of an auto-titled chat gets renamed; anything else
    // (titleAuto false, or already past the first reply) is left alone.
    const chat = get().chats.find((candidate) => candidate.id === chatId)
    if (!chat?.titleAuto || chat.messages.length !== 2) return
    const settingsState = useSettings.getState()
    const active = activeAdapter(settingsState)
    const model = settingsState.settings.providers[active.providerId]?.model
    if (!model) {
      get().applyDecidedTitle(chatId, '')
      return
    }
    const prompt = [
      'Give a short title (2 to 6 words) for the conversation below. Reply with only the title: no quotes, no trailing punctuation. Use the same language the user wrote in.',
      '',
      `User: ${stripForTitle(userText).slice(0, 280)}`,
      `Assistant: ${stripForTitle(assistantText).slice(0, 280)}`,
    ].join('\n')
    let out = ''
    try {
      if (!active.adapter) {
      get().applyDecidedTitle(chatId, '')
      return
    }
    const titleAdapter = active.adapter
    const stream = titleAdapter.streamChat([{ role: 'user', content: prompt }], model, AbortSignal.timeout(20000))
      for await (const chunk of stream) out += chunk
    } catch {
      out = ''
    }
    get().applyDecidedTitle(chatId, cleanModelTitle(out))
  },

  applyDecidedTitle(chatId: string, title: string) {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId && chat.titleAuto
          ? { ...chat, title: title || chat.title, titleAuto: false, updatedAt: Date.now() }
          : chat,
      ),
    }))
    get().persist()
  },

  clear() {
    set({ chats: [], activeId: null })
    get().persist()
  },
}))

function readableError(rawError: unknown): string {
  const language = useSettings.getState().settings.language || 'hinglish'
  const error = rawError as CodedError | null | undefined
  if (error?.code === 'auth') return error.message || translate(language, 'err_something')
  if (error?.code === 'refused' || /refused|ECONNREFUSED/i.test(error?.message || '')) {
    return translate(language, 'err_nothing_running')
  }
  if (error?.code === 'offline') return translate(language, 'err_offline')
  if (error?.code === 'timeout') return translate(language, 'err_timeout')
  const message = messageFor({ message: error?.message, body: error?.body, status: error?.status, code: error?.code }, language)
  return message || translate(language, 'err_something')
}

/* ---------- pulling a model from Ollama ---------- */

interface PullState {
  model: string
  status: 'running' | 'done' | 'cancelled' | 'error'
  completed: number
  total: number
  percent: number
  message: string
  controller: AbortController
}

export interface ModelsState {
  pull: PullState | null
  pullModel(model: string, options?: { onDone?: (name: string) => void }): Promise<void>
  cancelPull(): void
  clearPull(): void
}

export const useModels = create<ModelsState>()((set, get) => ({
  pull: null,

  async pullModel(model: string, { onDone }: { onDone?: (name: string) => void } = {}) {
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
        if (frame.error) throw new Error(String(frame.error))
        if (frame.status === 'success') {
          set((state) => ({ pull: state.pull ? { ...state.pull, status: 'done', percent: 100, message: 'Ready.' } : state.pull }))
          onDone?.(name)
          return
        }
        const completed = Number(frame.completed) || 0
        const total = Number(frame.total) || 0
        const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0
        raw = frame.status || 'Downloading…'
        set((state) => ({
          pull: state.pull ? { ...state.pull, status: 'running', completed, total, percent, message: raw } : state.pull,
        }))
      }
      set((state) => ({ pull: state.pull ? { ...state.pull, status: 'done', percent: 100, message: 'Ready.' } : state.pull }))
      onDone?.(name)
    } catch (rawError) {
      const error = rawError as Error
      if (controller.signal.aborted) {
        set((state) => ({ pull: state.pull ? { ...state.pull, status: 'cancelled', message: 'Cancelled.' } : state.pull }))
      } else {
        set((state) => ({
          pull: state.pull ? {
            ...state.pull,
            status: 'error',
            message: /refused|connect/i.test((error as Error).message)
              ? "Ollama isn't running. Start it, then pull again."
              : (error as Error).message,
          } : state.pull,
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
