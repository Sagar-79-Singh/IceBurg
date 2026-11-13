// A stand-in for the `electron` module so the main process can be run and tested
// outside a GUI. Only the surface IceBurg uses is implemented. This is an untyped
// test boundary by design: it impersonates the real electron module.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Deliberately untyped: the stub impersonates electron's whole module surface.
export type StubHandler = (event: any, ...args: any[]) => any

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'iceburg-test-'))

export const handlers = new Map<string, StubHandler>()
export const sent: Array<{ channel: string; payload: any }> = []

export const app = {
  getPath: (name: string): string => (name === 'userData' ? userData : os.tmpdir()),
  getVersion: (): string => '0.1.0',
  whenReady: (): Promise<void> => Promise.resolve(),
  on(): void {},
  quit(): void {},
  setAppUserModelId(): void {},
  requestSingleInstanceLock: (): boolean => true,
}

export const ipcMain = {
  handle: (channel: string, fn: StubHandler): void => {
    handlers.set(channel, fn)
  },
}

export const safeStorage = {
  // Deterministic stand-in for a real keyring: symmetric, and obviously not the
  // plaintext, which is all the test needs.
  isEncryptionAvailable: (): boolean => true,
  encryptString: (text: string): Buffer =>
    Buffer.from(`sealed:${text.split('').reverse().join('')}`, 'utf8'),
  decryptString: (buffer: Buffer): string => {
    const raw = Buffer.from(buffer).toString('utf8')
    if (!raw.startsWith('sealed:')) throw new Error('bad ciphertext')
    return raw.slice(7).split('').reverse().join('')
  },
}

export const net = { fetch: (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args) }
export const shell = { openExternal: async (): Promise<void> => {} }
export const clipboard = {
  value: '',
  writeText(text: string): void {
    this.value = text
  },
}
export const BrowserWindow = class {}
export const dialog = { showMessageBox: async (): Promise<{ response: number }> => ({ response: 1 }) }
