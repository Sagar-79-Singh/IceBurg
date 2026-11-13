import { app, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

// Plain JSON documents in the app's userData directory: one for chats, one for
// settings. Writes are atomic (tmp file then rename) so a crash mid-write cannot
// leave a user with a truncated chat history.
const ALLOWED = new Set(['settings', 'chats'])
const writing = new Map<string, Promise<{ ok: boolean; message?: string }>>()

function fileFor(name: string): string {
  if (!ALLOWED.has(name)) throw new Error(`Unknown store "${name}"`)
  return path.join(app.getPath('userData'), `${name}.json`)
}

// Exported so the streaming layer can read the saved settings document without
// re-implementing the storage format (and the corrupt-file behaviour) here.
export async function readDocument(name: string): Promise<Record<string, any> | null> {
  try {
    const raw = await fs.readFile(fileFor(name), 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    if (error instanceof SyntaxError) {
      // Keep the damaged file for recovery instead of silently overwriting it.
      const backup = `${fileFor(name)}.corrupt-${Date.now()}`
      await fs.copyFile(fileFor(name), backup).catch(() => {})
      return null
    }
    throw error
  }
}
const readFile = readDocument

async function writeFile(name: string, data: unknown): Promise<void> {
  const target = fileFor(name)
  const tmp = `${target}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, target)
}

export function registerStoreHandlers() {
  ipcMain.handle('store:read', async (_event: Electron.IpcMainInvokeEvent, name: string) => {
    try {
      return { ok: true, data: await readFile(name) }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('store:write', async (_event: Electron.IpcMainInvokeEvent, name: string, data: unknown) => {
    // Serialise writes per document: the last write always wins, and no two
    // writes can interleave on the same temporary file.
    const previous = writing.get(name) || Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(() => writeFile(name, data))
      .then(
        () => ({ ok: true }),
        (error: unknown) => ({ ok: false, message: (error as Error).message }),
      )
    writing.set(name, next)
    return next
  })
}
