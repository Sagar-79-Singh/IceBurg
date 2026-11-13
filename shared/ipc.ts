/* Shared contracts between the Electron main process and the renderer.
 *
 * Two kinds of types live here on purpose: domain records that both sides
 * read and write (settings, chats, messages), and the IPC surface itself: the
 * channel names, the payload shapes and the typed view of the preload bridge.
 * Because these are all `type`/`interface` plus `as const` objects, they are
 * erased at bundle time and never shipped as runtime code.
 */

/* ---------- channels ---------- */

export const IPC = {
  appInfo: 'app:info',
  storeRead: 'store:read',
  storeWrite: 'store:write',
  secretsList: 'secrets:list',
  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',
  secretsAvailable: 'secrets:available',
  netStream: 'net:stream',
  netAbort: 'net:abort',
  netChunk: 'net:chunk',
  netError: 'net:error',
  netDone: 'net:done',
  ollamaDetect: 'ollama:detect',
  ollamaInstall: 'ollama:install',
  ollamaInstallProgress: 'ollama:install-progress',
  toolsOpen: 'tools:find-and-open',
  clipboardWrite: 'clipboard:write',
  openExternal: 'shell:open-external',
  ollamaInstallCancel: 'ollama:install-cancel',
  systemControl: 'system:control',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/* ---------- store ---------- */

export type StoreName = 'chats' | 'settings' | 'secrets'
export interface StoreReadOk<T = unknown> {
  ok: true
  data: T | null
}
export interface StoreWriteOk {
  ok: boolean
  message?: string
}
export interface StoreReadResult<T = unknown> {
  ok: boolean
  data?: T | null
  message?: string
}

/* ---------- secrets ---------- */

export type SecretMap = Record<string, true>
export interface SecretWriteResult {
  ok: boolean
  encrypted?: boolean
  message?: string
}

/* ---------- settings (persisted) ---------- */

export interface ProviderSettings {
  baseUrl?: string
  model: string
  label?: string
}

export type ProvidersMap = Record<string, ProviderSettings>

export interface OnboardingSettings {
  ollamaChecked: boolean
  ollamaDeclined: boolean
}

export type ThemeName = 'dark' | 'light'

export interface AppSettings {
  theme: ThemeName
  // 'hinglish' | 'english' | 'hindi' | any other language name the model speaks.
  language: string
  activeProvider: string
  providers: ProvidersMap
  onboarding: OnboardingSettings
}

/* ---------- chats ---------- */

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ToolConfirmPayload {
  type: 'confirm'
  request: string
  label: string
  confirmText: string
  url: string | null
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  at: number
  providerId?: string | null
  model?: string
  task?: boolean
  toolNote?: boolean
  tool?: ToolConfirmPayload
  error?: string
  stopped?: boolean
  note?: string
}

export interface ChatRecord {
  id: string
  title: string
  titleAuto: boolean
  createdAt: number
  updatedAt: number
  providerId: string | null
  model: string
  messages: ChatMessage[]
}

export interface ChatsDocument {
  chats: ChatRecord[]
  activeId: string | null
}

/* ---------- tool tasks ---------- */

export interface ToolOpenResult {
  matched: boolean
  ok?: boolean
  kind?: string
  label?: string
  message?: string
  title?: string
  needsConfirmation?: boolean
  confirmText?: string
  url?: string | null
  /** Catalog id of the tool, when one matched ('youtube', ...). */
  tool?: string
  action?: string
  query?: string
  /** How it was opened: native | desktop | <pwa source> | web | fallback. */
  via?: string
  /** For heavy local services: whether the service answered the port probe. */
  running?: boolean
}

/* ---------- net (streaming over IPC) ---------- */

export interface StreamAuth {
  providerId?: string
  label?: string
  header?: string
  prefix?: string
  /** The provider works without a key; the main process skips the key lookup when one is absent. */
  optional?: boolean
}

export interface StreamErrorPayload {
  code?: string
  status?: number
  body?: string
  message?: string
}

export interface StreamRequest {
  requestId: string
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  auth?: StreamAuth | null
}

export interface StreamHandlers {
  onChunk: (text: string) => void
  onError: (error: StreamErrorPayload) => void
  onDone?: () => void
}

export interface NetStreamOptions extends StreamRequest, StreamHandlers {}

export interface NetChunkPayload {
  requestId: string
  text: string
}

export interface NetErrorPayload extends StreamErrorPayload {
  requestId: string
}

export interface NetDonePayload {
  requestId: string
}

/* What senders pass; the main process attaches requestId itself. */
export type NetChunkContent = Omit<NetChunkPayload, 'requestId'>
export type NetErrorContent = StreamErrorPayload
export type NetDoneContent = Record<string, never>
export type NetSendContent = NetChunkContent | NetErrorContent | NetDoneContent

/* ---------- ollama ---------- */

export interface OllamaModel {
  name: string
  size?: number
  family?: string
  parameters?: string
  modified?: string
}

export interface OllamaDetectResult {
  running: boolean
  installed: boolean
  models?: OllamaModel[]
  host?: string
  message?: string
}

export interface OllamaInstallResult {
  ok: boolean
  message?: string
  code?: string
  /** How the install happened, so the UI can say what is going on. */
  mode?: 'installer' | 'script'
  url?: string
  /** The official script URL, when the UI should offer the manual fallback. */
  script?: string
}

export interface OllamaInstallProgress {
  /** 'download' | 'run' | 'done' | 'error' — the step the main process reports. */
  step: string
  message?: string
}

/* ---------- app info ---------- */

export interface AppInfo {
  version: string
  platform: string
  encrypted: boolean
}

/* ---------- clipboard / external links ---------- */

export interface ClipboardResult {
  ok: boolean
  message?: string
}

/* ---------- the preload bridge (what window.iceburg provides) ---------- */

export interface IceburgBridge {
  platform: NodeJS.Platform
  info: () => Promise<AppInfo>
  store: {
    read: (name: StoreName | string) => Promise<StoreReadResult<unknown>>
    write: (name: StoreName | string, data: unknown) => Promise<StoreWriteOk>
  }
  secrets: {
    list: () => Promise<SecretMap>
    set: (providerId: string, key: string) => Promise<SecretWriteResult>
    clear: (providerId: string) => Promise<SecretWriteResult>
    encryptionAvailable: () => Promise<boolean>
  }
  net: {
    /**
     * Starts a streaming request. Resolves with the HTTP status once headers
     * arrive, then pushes decoded text through onChunk. Returns an abort function.
     */
    stream: (options: NetStreamOptions) => (...args: []) => void
  }
  ollama: {
    detect: () => Promise<OllamaDetectResult>
    install: () => Promise<OllamaInstallResult>
    cancelInstall: () => Promise<OllamaInstallResult>
    onInstallProgress: (callback: (payload: OllamaInstallProgress) => void) => () => void
  }
  tools: {
    open: (text: string, options?: { confirmed?: boolean }) => Promise<ToolOpenResult>
  }
  clipboard: {
    write: (text: string) => Promise<ClipboardResult>
  }
  openExternal: (url: string) => Promise<unknown>
}
