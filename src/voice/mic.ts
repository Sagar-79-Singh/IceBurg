// Microphone capture for push-to-talk and hands-free listening.
//
// The stream is opened only while listening (echoCancellation on, mono, one
// analyser for the level meter, one AudioWorklet for PCM), and every track is
// stopped and the context closed when listening ends — including on errors and
// cancellations. Nothing is persisted; the samples exist only in memory until
// they are handed to the local Whisper worker.

import { voiceLevels } from './levels.ts'

export interface MicSession {
  /** Stop capture and return the recorded 16 kHz mono PCM (may be null if the device refused). */
  stop(): Promise<Float32Array | null>
}

const CAPTURE_WORKLET = `
class IceburgCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length) {
      this.port.postMessage(input[0].slice(0))
    }
    return true
  }
}
registerProcessor('iceburg-capture', IceburgCapture)
`

const TARGET_SAMPLE_RATE = 16000

const resampleLinear = (input: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const a = input[index] ?? 0
    const b = input[index + 1] ?? a
    output[i] = a + (b - a) * fraction
  }
  return output
}

/** Current RMS of a time-domain byte frame, normalised to 0..1. */
export function rmsLevel(frame: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) {
    const value = (frame[i]! - 128) / 128
    sum += value * value
  }
  return Math.min(1, Math.sqrt(sum / frame.length) * 1.6)
}

export async function openMic(options: { deviceId?: string } = {}): Promise<MicSession> {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  }
  if (options.deviceId) constraints.deviceId = { exact: options.deviceId }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
  } catch (error) {
    // A stored device id can go stale (unplugged headset): fall back to default once.
    if (!options.deviceId) throw error
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...constraints, deviceId: undefined } })
  }

  const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  const source = context.createMediaStreamSource(stream)

  // Level meter: time-domain RMS, published to voiceLevels.mic every frame.
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.55
  source.connect(analyser)
  const frame = new Uint8Array(analyser.fftSize)
  const freq = new Uint8Array(analyser.frequencyBinCount)

  // PCM capture in a worklet — no ScriptProcessor, no copies through the main thread beyond the chunk itself.
  const chunks: Float32Array[] = []
  let worklet: AudioWorkletNode | null = null
  let captureOk = true
  try {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }))
    await context.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    worklet = new AudioWorkletNode(context, 'iceburg-capture')
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (event.data && event.data.length) chunks.push(event.data)
    }
    source.connect(worklet)
  } catch {
    // Without the worklet we can still meter, just not record. Don't fail the session.
    captureOk = false
  }

  let raf = 0
  const meter = () => {
    analyser.getByteTimeDomainData(frame)
    voiceLevels.mic = rmsLevel(frame)
    analyser.getByteFrequencyData(freq)
    // 512 bins -> 32 logarithmic-ish groups (linear is fine for a meter).
    const bins = voiceLevels.spectrum
    const per = Math.floor(freq.length / bins.length)
    for (let i = 0; i < bins.length; i++) {
      let sum = 0
      for (let j = i * per; j < (i + 1) * per; j++) sum += freq[j] ?? 0
      bins[i] = Math.min(255, Math.round((sum / per) * 1.35))
    }
    raf = requestAnimationFrame(meter)
  }
  raf = requestAnimationFrame(meter)

  let stopped = false
  return {
    async stop() {
      if (stopped) return null
      stopped = true
      cancelAnimationFrame(raf)
      voiceLevels.mic = 0
      try {
        worklet?.port.close()
        worklet?.disconnect()
        source.disconnect()
        analyser.disconnect()
      } catch {
        // graph already torn down
      }
      for (const track of stream.getTracks()) track.stop()
      const rate = context.sampleRate
      try {
        await context.close()
      } catch {
        // close() can reject on some drivers; the tracks are already stopped
      }
      if (!captureOk || chunks.length === 0) return null
      const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const merged = new Float32Array(size)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }
      return resampleLinear(merged, rate, TARGET_SAMPLE_RATE)
    },
  }
}

export interface AudioInputInfo {
  deviceId: string
  label: string
}

/** List input devices by human-readable name (empty labels get a fallback). */
export async function listMicrophones(): Promise<AudioInputInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label?.trim() || `Microphone ${index + 1}`,
    }))
}
