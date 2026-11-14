// Renderer-side handle on the Whisper worker. Owns the worker lifecycle, the
// one-at-a-time transcription queue, and a subscribable progress snapshot for
// the HUD (download bar, ready state, failures). The model itself is downloaded
// by transformers.js inside the worker; here we only watch the numbers.

export type SttStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SttSnapshot {
  status: SttStatus
  /** 0..1 overall download progress, meaningful while loading. */
  progress: number
  file: string
  error: string
}

const initialSnapshot: SttSnapshot = { status: 'idle', progress: 0, file: '', error: '' }

type Listener = (snapshot: SttSnapshot) => void

interface WorkerProgressMessage {
  type: 'progress'
  file?: string
  loaded?: number
  total?: number
  progress?: number
}
type WorkerMessage =
  | WorkerProgressMessage
  | { type: 'status'; status?: string }
  | { type: 'ready' }
  | { type: 'transcript'; text?: string }
  | { type: 'error'; message?: string }

class SttManager {
  private worker: Worker | null = null
  private listeners = new Set<Listener>()
  private snapshot: SttSnapshot = { ...initialSnapshot }
  private pending: { resolve: (text: string) => void; reject: (error: Error) => void } | null = null
  private files = new Map<string, { loaded: number; total: number }>()

  getSnapshot(): SttSnapshot {
    return this.snapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private emit(patch: Partial<SttSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    // Vite bundles the worker (iife, classic) so this survives file:// in production.
    this.worker = new Worker(new URL('./stt-worker.ts', import.meta.url), { name: 'iceburg-stt' })
    this.worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => this.onMessage(event.data))
    this.worker.addEventListener('error', (event: ErrorEvent) => {
      this.fail(event.message || 'The speech worker crashed.')
    })
    return this.worker
  }

  private onMessage(message: WorkerMessage) {
    if (message.type === 'progress') {
      const file = message.file || 'model'
      const loaded = Number(message.loaded) || 0
      const total = Number(message.total) || 0
      if (total > 0) this.files.set(file, { loaded, total })
      let loadedSum = 0
      let totalSum = 0
      for (const entry of this.files.values()) {
        loadedSum += Math.min(entry.loaded, entry.total)
        totalSum += entry.total
      }
      const fraction = totalSum > 0 ? loadedSum / totalSum : Math.min(1, (Number(message.progress) || 0) / 100)
      this.emit({ status: 'loading', progress: fraction, file })
      return
    }
    if (message.type === 'status') {
      this.emit({ status: 'loading' })
      return
    }
    if (message.type === 'ready') {
      this.emit({ status: 'ready', progress: 1 })
      return
    }
    if (message.type === 'transcript') {
      const text = String(message.text || '').trim()
      const pending = this.pending
      this.pending = null
      pending?.resolve(text)
      return
    }
    if (message.type === 'error') {
      this.fail(String(message.message || 'Speech recognition failed.'))
    }
  }

  private fail(message: string) {
    this.emit({ status: 'error', error: message })
    const pending = this.pending
    this.pending = null
    pending?.reject(new Error(message))
  }

  /** Start (or continue) loading the model. Safe to call more than once. */
  load(): void {
    const worker = this.ensureWorker()
    if (this.snapshot.status === 'ready') return
    if (this.snapshot.status !== 'loading') {
      this.files.clear()
      this.emit({ status: 'loading', progress: 0, error: '' })
      worker.postMessage({ type: 'load' })
    }
  }

  isReady(): boolean {
    return this.snapshot.status === 'ready'
  }

  /**
   * Transcribe 16 kHz mono PCM. One job at a time; rejects if a job is already
   * running (the HUD never queues — it disables the mic while transcribing).
   */
  transcribe(audio: Float32Array, language: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (this.pending) {
        reject(new Error('Busy transcribing.'))
        return
      }
      if (audio.length < 1600) {
        // Less than a tenth of a second of audio: nothing to hear.
        resolve('')
        return
      }
      this.pending = { resolve, reject }
      try {
        const worker = this.ensureWorker()
        worker.postMessage({ type: 'transcribe', audio, language }, [audio.buffer])
      } catch (error) {
        this.pending = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /** Terminate the worker. The downloaded model stays cached on disk. */
  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.pending = null
    this.files.clear()
    this.snapshot = { ...initialSnapshot }
  }
}

export const stt = new SttManager()
