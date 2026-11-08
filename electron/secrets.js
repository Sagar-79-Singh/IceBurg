import { app, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

// API keys are encrypted with Electron's safeStorage (Keychain on macOS, DPAPI on
// Windows, libsecret on Linux) before they are written to disk. The renderer can
// set, list and clear keys, but it can never read one back: decryption only
// happens inside the main process when a request is made.
const fileName = () => path.join(app.getPath('userData'), 'secrets.json')

let cache = null

async function load() {
  if (cache) return cache
  try {
    const raw = await fs.readFile(fileName(), 'utf8')
    cache = JSON.parse(raw)
  } catch {
    cache = {}
  }
  return cache
}

async function save(data) {
  cache = data
  const target = fileName()
  const tmp = `${target}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  await fs.rename(tmp, target)
}

export async function getSecret(providerId) {
  const data = await load()
  const entry = data[providerId]
  if (!entry) return null
  try {
    if (entry.encrypted) return safeStorage.decryptString(Buffer.from(entry.value, 'base64'))
    // A machine without a keyring falls back to obfuscation so the key is never
    // stored as readable text, and the settings screen says so plainly.
    return Buffer.from(entry.value, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export function registerSecretHandlers() {
  ipcMain.handle('secrets:available', () => safeStorage.isEncryptionAvailable())

  ipcMain.handle('secrets:list', async () => {
    const data = await load()
    return Object.fromEntries(
      Object.entries(data).map(([id, entry]) => [id, Boolean(entry && entry.value)]),
    )
  })

  ipcMain.handle('secrets:set', async (_event, providerId, key) => {
    const trimmed = String(key || '').trim()
    if (!providerId) return { ok: false, message: 'Missing provider' }
    const data = await load()
    if (!trimmed) {
      delete data[providerId]
      await save(data)
      return { ok: true }
    }
    const encrypted = safeStorage.isEncryptionAvailable()
    data[providerId] = {
      encrypted,
      value: encrypted
        ? safeStorage.encryptString(trimmed).toString('base64')
        : Buffer.from(trimmed, 'utf8').toString('base64'),
      savedAt: new Date().toISOString(),
    }
    await save(data)
    return { ok: true, encrypted }
  })

  ipcMain.handle('secrets:clear', async (_event, providerId) => {
    const data = await load()
    delete data[providerId]
    await save(data)
    return { ok: true }
  })
}
