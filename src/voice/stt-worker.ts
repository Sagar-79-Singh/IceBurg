// Web Worker that transcribes microphone audio locally with Whisper. No keys,
// no cloud: the model downloads once from the Hugging Face hub (with the user's
// consent), is cached in the Cache API (on disk in Electron), and runs on the
// CPU through ONNX Runtime's WASM backend — no GPU required.
//
// Messages in:  { type: 'load' } | { type: 'transcribe', audio: Float32Array, language: string }
// Messages out: { type: 'status'|'progress'|'ready'|'transcript'|'error', ... }

/// <reference lib="webworker" />

import { pipeline, env } from '@huggingface/transformers'
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
// The ONNX WASM binaries are loaded from the CDN once, then served from the
// cache (useWasmCache defaults to true). Pinning the exact version keeps the
// binary in lockstep with the installed onnxruntime-web.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths =
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/'
}

const MODEL = 'Xenova/whisper-tiny'

type Incoming =
  | { type: 'load' }
  | { type: 'transcribe'; audio: Float32Array; language: string }

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'english',
  hi: 'hindi',
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null

const post = (message: Record<string, unknown>, transfer?: Transferable[]) => {
  if (transfer) self.postMessage(message, transfer)
  else self.postMessage(message)
}

const load = async (): Promise<AutomaticSpeechRecognitionPipeline> => {
  if (transcriber) return transcriber
  if (!loading) {
    post({ type: 'status', status: 'loading' })
    loading = pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (progress: Record<string, unknown>) => {
        post({
          type: 'progress',
          file: typeof progress.file === 'string' ? progress.file : '',
          status: typeof progress.status === 'string' ? progress.status : '',
          loaded: Number(progress.loaded) || 0,
          total: Number(progress.total) || 0,
          // For single-file progress events transformers.js already gives 0..100.
          progress: Number(progress.progress) || 0,
        })
      },
    }).then((pipe) => {
      transcriber = pipe as AutomaticSpeechRecognitionPipeline
      post({ type: 'ready' })
      return transcriber
    })
  }
  return loading
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const message = event.data
  try {
    if (message.type === 'load') {
      await load()
      return
    }
    if (message.type === 'transcribe') {
      const pipe = await load()
      const options: Record<string, unknown> = {
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      }
      const language = LANGUAGE_NAMES[message.language]
      if (language) options.language = language
      const result = await pipe(message.audio, options)
      const text = ('text' in result ? String(result.text || '') : '').trim()
      post({ type: 'transcript', text })
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    post({ type: 'error', message: detail || 'Speech recognition failed.' })
  }
}
