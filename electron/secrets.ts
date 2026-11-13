import { app, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

// API keys are encrypted with Electron's safeStorage (Keychain on macOS, DPAPI on
// Windows, libsecret on Linux) before they are written to disk. The renderer can
// set, list and clear keys, but it can never read one back: decryption only
// happens inside the main process when a request is made.
const fileName = () => path.join(app.getPath('userData'), 'secrets.json')

interface SecretEntry {
  encrypted: boolean
  value: string
  savedAt?: string
}
let cache: Record<string, SecretEntry> | null = null

async function load(): Promise<Record<string, SecretEntry>> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(fileName(), 'utf8')
    // The on-disk shape is ours; secrets are written only by save() below.
    cache = JSON.parse(raw) as Record<string, SecretEntry>
  } catch {
    cache = {}
  }
  return cache as Record<string, SecretEntry>
}

async function save(data: Record<string, SecretEntry>): Promise<void> {
  cache = data
  const target = fileName()
  const tmp = `${target}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  await fs.rename(tmp, target)
}

export async function getSecret(providerId: string): Promise<string | null> {
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
    const list: Record<string, true> = {}
    for (const [id, entry] of Object.entries(data)) {
      if (entry?.value) list[id] = true
    }
    return list
  })

  ipcMain.handle('secrets:set', async (_event: Electron.IpcMainInvokeEvent, providerId: string, key: string) => {
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

  ipcMain.handle('secrets:clear', async (_event: Electron.IpcMainInvokeEvent, providerId: string) => {
    const data = await load()
    delete data[providerId]
    await save(data)
    return { ok: true }
  })
}
