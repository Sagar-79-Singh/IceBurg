import { contextBridge, ipcRenderer } from 'electron'
import type {
  IceburgBridge,
  NetChunkPayload,
  NetDonePayload,
  NetErrorPayload,
  NetStreamOptions,
  OllamaInstallProgress,
  StoreName,
} from '../shared/ipc.ts'
import { IPC } from '../shared/ipc.ts'

// The renderer never touches Node, the filesystem or the network directly.
// Everything it is allowed to do is listed here, typed end to end: the
// renderer's `window.iceburg` is typed as IceburgBridge, so only these methods
// can be called.

type ListenerPayload<T> = (payload: T) => void

const on = <T,>(channel: string, callback: ListenerPayload<T>): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const bridge: IceburgBridge = {
  platform: process.platform,
  info: () => ipcRenderer.invoke(IPC.appInfo),

  store: {
    read: (name: StoreName | string) => ipcRenderer.invoke(IPC.storeRead, name),
    write: (name: StoreName | string, data: unknown) =>
      ipcRenderer.invoke(IPC.storeWrite, name, data),
  },

  secrets: {
    list: () => ipcRenderer.invoke(IPC.secretsList),
    set: (providerId: string, key: string) => ipcRenderer.invoke(IPC.secretsSet, providerId, key),
    clear: (providerId: string) => ipcRenderer.invoke(IPC.secretsClear, providerId),
    encryptionAvailable: () => ipcRenderer.invoke(IPC.secretsAvailable),
  },

  net: {
    // Starts a streaming request. Arrives back as: status once headers land, then
    // decoded text through onChunk. Returns an abort function.
    stream: ({ requestId, url, method, headers, body, auth, onChunk, onError, onDone }: NetStreamOptions) => {
      const offChunk = on<NetChunkPayload>(IPC.netChunk, (payload) => {
        if (payload.requestId === requestId) onChunk(payload.text)
      })
      const offError = on<NetErrorPayload>(IPC.netError, (payload) => {
        if (payload.requestId !== requestId) return
        cleanup()
        onError(payload)
      })
      const offDone = on<NetDonePayload>(IPC.netDone, (payload) => {
        if (payload.requestId !== requestId) return
        cleanup()
        onDone?.()
      })
      const cleanup = () => {
        offChunk()
        offError()
        offDone()
      }
      ipcRenderer
        .invoke(IPC.netStream, { requestId, url, method, headers, body, auth })
        .then((result: { ok?: boolean }) => {
          if (result && result.ok === false) {
            cleanup()
            onError(result as NetErrorPayload)
          }
        })
        .catch((error: unknown) => {
          cleanup()
          onError({ message: String((error as Error)?.message ?? error), code: 'ipc' })
        })
      return () => {
        ipcRenderer.invoke(IPC.netAbort, requestId).catch(() => {})
        cleanup()
      }
    },
  },

  ollama: {
    detect: () => ipcRenderer.invoke(IPC.ollamaDetect),
    install: () => ipcRenderer.invoke(IPC.ollamaInstall),
    cancelInstall: () => ipcRenderer.invoke(IPC.ollamaInstallCancel),
    onInstallProgress: (callback: (payload: OllamaInstallProgress) => void) =>
      on<OllamaInstallProgress>(IPC.ollamaInstallProgress, callback),
  },

  clipboard: {
    write: (text: string) => ipcRenderer.invoke(IPC.clipboardWrite, text),
  },

  tools: {
    // "open youtube" and friends. Heavy services confirm only via options.confirmed.
    open: (text: string, options?: { confirmed?: boolean }) =>
      ipcRenderer.invoke(IPC.toolsOpen, String(text || ''), options || {}),
  },

  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),
}

contextBridge.exposeInMainWorld('iceburg', bridge)
