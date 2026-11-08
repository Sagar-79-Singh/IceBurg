import { ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Ollama on this machine:
//  - detect: is the daemon answering on 127.0.0.1:11434?
//  - install: only when the user clicks "Install Ollama". Windows and macOS get the
//    official installer opened, Linux gets the official script run in a terminal.
//  - each step reports progress so the UI can show what is actually happening.

const HOST = 'http://127.0.0.1:11434'
const WINDOWS_INSTALLER = 'https://ollama.com/download/OllamaSetup.exe'
const MAC_INSTALLER = 'https://ollama.com/download/Ollama-darwin.zip'
const LINUX_SCRIPT = 'https://ollama.com/install.sh'

let installProcess = null

async function fetchWithTimeout(url, timeout = 2000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function findOllamaBinary() {
  const candidates = [
    '/usr/local/bin/ollama',
    '/usr/bin/ollama',
    '/opt/homebrew/bin/ollama',
    path.join(os.homedir(), '.local', 'bin', 'ollama'),
    '/Applications/Ollama.app/Contents/Resources/ollama',
  ]
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

export function registerOllamaHandlers(getWindow) {
  ipcMain.handle('ollama:detect', async () => {
    try {
      const response = await fetchWithTimeout(`${HOST}/api/tags`)
      if (!response.ok) {
        return {
          running: false,
          installed: Boolean(await findOllamaBinary()),
          message: `Ollama is answering at ${HOST} with status ${response.status}.`,
        }
      }
      const data = await response.json()
      const models = Array.isArray(data.models)
        ? data.models.map((model) => ({
            name: model.name || model.model,
            size: model.size || 0,
            family: model.details?.family || '',
            parameters: model.details?.parameter_size || '',
            modified: model.modified_at || '',
          }))
        : []
      return { running: true, installed: true, models, host: HOST }
    } catch {
      return {
        running: false,
        installed: Boolean(await findOllamaBinary()),
        host: HOST,
      }
    }
  })

  ipcMain.handle('ollama:install', async () => {
    if (installProcess) return { ok: false, message: 'An install is already running.' }
    const send = (payload) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('ollama:install-progress', payload)
    }

    if (process.platform === 'win32') {
      send({ step: 'download', message: 'Opened the official installer. Follow its prompts, then come back here.' })
      await shell.openExternal(WINDOWS_INSTALLER)
      send({ step: 'done', message: 'Download started in your browser.' })
      return { ok: true, mode: 'installer', url: WINDOWS_INSTALLER }
    }

    if (process.platform === 'darwin') {
      send({ step: 'download', message: 'Opened the official macOS download.' })
      await shell.openExternal(MAC_INSTALLER)
      send({ step: 'done', message: 'Unzip it and drag Ollama to Applications.' })
      return { ok: true, mode: 'installer', url: MAC_INSTALLER }
    }

    // Linux: run the official script in the user's terminal so they can see and
    // approve the sudo prompt themselves.
    const terminal = await pickTerminal()
    if (!terminal) {
      send({ step: 'error', message: 'No terminal found. Run the official script yourself.' })
      return { ok: false, message: 'No terminal emulator found.', script: LINUX_SCRIPT }
    }
    send({ step: 'run', message: 'Installing from the official script. Watch your terminal for the sudo prompt.' })
    try {
      installProcess = spawn(terminal.command, [...terminal.args, `curl -fsSL ${LINUX_SCRIPT} | sh`], {
        detached: true,
        stdio: 'ignore',
      })
      installProcess.unref()
      installProcess.on('exit', () => {
        installProcess = null
      })
      send({ step: 'done', message: 'The install is running in your terminal.' })
      return { ok: true, mode: 'script', script: LINUX_SCRIPT }
    } catch (error) {
      installProcess = null
      send({ step: 'error', message: error.message })
      return { ok: false, message: error.message }
    }
  })

  ipcMain.handle('ollama:install-cancel', () => {
    if (!installProcess) return { ok: true }
    try {
      installProcess.kill()
    } catch {
      /* already exited */
    }
    installProcess = null
    return { ok: true }
  })
}

async function pickTerminal() {
  const candidates = [
    { command: 'x-terminal-emulator', args: ['-e', 'bash', '-lc'] },
    { command: 'gnome-terminal', args: ['--', 'bash', '-lc'] },
    { command: 'konsole', args: ['-e', 'bash', '-lc'] },
    { command: 'xfce4-terminal', args: ['-e', 'bash -lc'] },
    { command: 'kitty', args: ['bash', '-lc'] },
    { command: 'alacritty', args: ['-e', 'bash', '-lc'] },
    { command: 'xterm', args: ['-e', 'bash', '-lc'] },
  ]
  for (const candidate of candidates) {
    try {
      const result = spawn(candidate.command, ['--version'], { stdio: 'ignore' })
      await new Promise((resolve, reject) => {
        result.on('error', reject)
        result.on('exit', resolve)
      })
      return candidate
    } catch {
      /* try the next one */
    }
  }
  return null
}
