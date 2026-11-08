const { contextBridge, ipcRenderer } = require('electron')

// The renderer never touches Node, the filesystem or the network directly.
// Everything it is allowed to do is listed here.
const on = (channel, callback) => {
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('iceburg', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('app:info'),

  store: {
    read: (name) => ipcRenderer.invoke('store:read', name),
    write: (name, data) => ipcRenderer.invoke('store:write', name, data),
  },

  secrets: {
    list: () => ipcRenderer.invoke('secrets:list'),
    set: (providerId, key) => ipcRenderer.invoke('secrets:set', providerId, key),
    clear: (providerId) => ipcRenderer.invoke('secrets:clear', providerId),
    encryptionAvailable: () => ipcRenderer.invoke('secrets:available'),
  },

  net: {
    // Starts a streaming request. Resolves with the response status once headers
    // arrive, then pushes decoded text through onChunk. Returns an abort function.
    stream: ({ requestId, url, method, headers, body, auth, onChunk, onError, onDone }) => {
      const offChunk = on('net:chunk', (payload) => {
        if (payload.requestId === requestId) onChunk(payload.text)
      })
      const offError = on('net:error', (payload) => {
        if (payload.requestId !== requestId) return
        cleanup()
        onError(payload)
      })
      const offDone = on('net:done', (payload) => {
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
        .invoke('net:stream', { requestId, url, method, headers, body, auth })
        .then((result) => {
          if (result && result.ok === false) {
            cleanup()
            onError(result)
          }
        })
        .catch((error) => {
          cleanup()
          onError({ message: String(error && error.message), code: 'ipc' })
        })
      return () => {
        ipcRenderer.invoke('net:abort', requestId).catch(() => {})
        cleanup()
      }
    },
  },

  ollama: {
    detect: () => ipcRenderer.invoke('ollama:detect'),
    install: () => ipcRenderer.invoke('ollama:install'),
    cancelInstall: () => ipcRenderer.invoke('ollama:install-cancel'),
    onInstallProgress: (callback) => on('ollama:install-progress', callback),
  },

  clipboard: {
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
  },

  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
})
