import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerStoreHandlers } from './store.js'
import { registerSecretHandlers } from './secrets.js'
import { registerNetHandlers, abortAllStreams } from './net.js'
import { registerOllamaHandlers } from './ollama.js'
import { registerAppHandlers } from './app-info.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devServer = process.env.ICBURG_DEV_SERVER

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 790,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#0A1A26',
    title: 'IceBurg',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webviewTag: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // The built renderer is told it may not open sockets of its own. This asserts
  // that promise while developing, so nothing quietly starts calling out from the
  // window instead of going through the main process.
  if (devServer) {
    mainWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        const allowed = details.url.startsWith(devServer)
        if (!allowed) console.warn('[iceburg] blocked a renderer request to', details.url)
        callback({ cancel: !allowed })
      },
    )
  }

  // Any link in a reply opens in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  if (devServer) {
    mainWindow.loadURL(devServer)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('app.iceburg.chat')
  registerStoreHandlers()
  registerSecretHandlers()
  registerNetHandlers(() => mainWindow)
  registerOllamaHandlers(() => mainWindow)
  registerAppHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  abortAllStreams()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => abortAllStreams())

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}
