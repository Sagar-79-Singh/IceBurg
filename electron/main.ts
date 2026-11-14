import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerStoreHandlers } from './store.ts'
import { registerSecretHandlers } from './secrets.ts'
import { registerNetHandlers, abortAllStreams } from './net.ts'
import { registerOllamaHandlers } from './ollama.ts'
import { registerAppHandlers } from './app-info.ts'
import { registerToolsHandlers } from './tools/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devServer = process.env.ICBURG_DEV_SERVER

// The same mark the interface shows, so the window on the taskbar, the dock and
// the desktop shortcut are all one iceberg. Installed builds also carry the icon
// in their executable; this covers the window itself and `npm run dev`.
const iconPath = path.join(
  __dirname,
  '..',
  'build',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 790,
    minWidth: 720,
    minHeight: 520,
    show: false,
    // macOS draws its own close/minimise buttons inset into the window; the
    // header below leaves room for them so the mark is never under them.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#0A1A26',
    title: 'IceBurg',
    icon: iconPath,
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

  const win = mainWindow
  win.once('ready-to-show', () => win.show())

  // The built renderer is told it may not open sockets of its own. This asserts
  // that promise while developing, so nothing quietly starts calling out from the
  // window instead of going through the main process.
  if (devServer) {
    mainWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        let allowed = details.url.startsWith(devServer)
        if (!allowed) {
          try {
            const host = new URL(details.url).hostname
            // Voice Mode downloads the local Whisper model with the user's consent.
            allowed =
              host === 'huggingface.co' ||
              host.endsWith('.huggingface.co') ||
              host === 'xethub.hf.co' ||
              host.endsWith('.xethub.hf.co') ||
              host === 'cdn.jsdelivr.net'
          } catch {
            allowed = false
          }
        }
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
  // Windows groups the taskbar button by this id; without it a packaged app can
  // show the Electron icon instead of its own.
  app.setAppUserModelId('app.iceburg.chat')
  // macOS takes the dock icon from the bundle, except when running unpackaged.
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    try {
      app.dock.setIcon(iconPath)
    } catch (error) {
      console.warn('[iceburg] could not set the dock icon', (error as Error)?.message || error)
    }
  }
  registerStoreHandlers()
  registerSecretHandlers()
  registerNetHandlers(() => mainWindow)
  registerOllamaHandlers(() => mainWindow)
  registerAppHandlers()
  registerToolsHandlers()
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
