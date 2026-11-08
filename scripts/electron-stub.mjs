// A stand-in for the `electron` module so the main process can be run and tested
// outside a GUI. Only the surface IceBurg uses is implemented.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'iceburg-test-'))

export const handlers = new Map()
export const sent = []

export const app = {
  getPath: (name) => (name === 'userData' ? userData : os.tmpdir()),
  getVersion: () => '0.1.0',
  whenReady: () => Promise.resolve(),
  on() {},
  quit() {},
  setAppUserModelId() {},
  requestSingleInstanceLock: () => true,
}

export const ipcMain = {
  handle: (channel, fn) => handlers.set(channel, fn),
}

export const safeStorage = {
  // Deterministic stand-in for a real keyring: symmetric, and obviously not the
  // plaintext, which is all the test needs.
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`sealed:${text.split('').reverse().join('')}`, 'utf8'),
  decryptString: (buffer) => {
    const raw = Buffer.from(buffer).toString('utf8')
    if (!raw.startsWith('sealed:')) throw new Error('bad ciphertext')
    return raw.slice(7).split('').reverse().join('')
  },
}

export const net = { fetch: (...args) => globalThis.fetch(...args) }
export const shell = { openExternal: async () => {} }
export const clipboard = {
  value: '',
  writeText(text) {
    this.value = text
  },
}
export const BrowserWindow = class {}
export const dialog = { showMessageBox: async () => ({ response: 1 }) }
