import { app, clipboard, ipcMain, safeStorage, shell } from 'electron'

export function registerAppHandlers() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    encrypted: safeStorage.isEncryptionAvailable(),
  }))

  ipcMain.handle('clipboard:write', (_event: Electron.IpcMainInvokeEvent, text: unknown) => {
    clipboard.writeText(String(text ?? ''))
    return { ok: true }
  })

  // Only ever hand https links to the user's browser.
  ipcMain.handle('shell:open-external', async (_event: Electron.IpcMainInvokeEvent, url: unknown) => {
    if (!/^https:\/\//i.test(String(url))) return { ok: false }
    await shell.openExternal(String(url))
    return { ok: true }
  })
}
