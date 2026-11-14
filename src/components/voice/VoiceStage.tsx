// The stage: one full-bleed canvas for the face/orb, one thin waveform canvas
// under it. The render loop pauses when the window is hidden or the overlay
// unmounts, and devicePixelRatio is capped so integrated GPUs keep up.
import { useEffect, useRef } from 'react'
import { useVoice } from '../../store/voice.ts'
import { useSettings } from '../../store/settings.ts'
import {
  resolveHudColors,
  drawBackdrop,
  drawFace,
  drawOrb,
  createFaceState,
  createOrbState,
  createWaveState,
  drawWaveform,
  type HudColors,
} from '../../voice/hud.ts'
import { toggleHandsFree } from '../../voice/controller.ts'
import type { VoiceMode } from '../../voice/machine.ts'

const DPR_CAP = 1.5

export default function VoiceStage() {
  const faceRef = useRef<HTMLCanvasElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const faceState = useRef(createFaceState())
  const orbState = useRef(createOrbState())
  const waveState = useRef(createWaveState())
  const colorsRef = useRef<HudColors | null>(null)
  const lastResolveRef = useRef(0)
  const mode = useVoice((state) => state.mode)
  const modeRef = useRef<VoiceMode>(mode)
  modeRef.current = mode
  const accent = useSettings((state) => state.settings.voiceAccent)
  const accentRef = useRef(accent)
  accentRef.current = accent
  const faceMode = useSettings((state) => state.settings.voiceFaceMode)
  const faceModeRef = useRef(faceMode)
  faceModeRef.current = faceMode

  useEffect(() => {
    const stage = faceRef.current
    const wave = waveRef.current
    const wrap = wrapRef.current
    if (!stage || !wave || !wrap) return
    const stageCtx = stage.getContext('2d')
    const waveCtx = wave.getContext('2d')
    if (!stageCtx || !waveCtx) return

    let width = 0
    let height = 0
    let waveHeight = 0
    let waveCssWidth = 0

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1)
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      const waveRect = wave.getBoundingClientRect()
      waveHeight = Math.max(1, Math.floor(waveRect.height))


      stage.width = Math.floor(width * dpr)
      stage.height = Math.floor(height * dpr)
      stage.style.width = `${width}px`
      stage.style.height = `${height}px`
      stageCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const waveWidth = Math.max(1, Math.floor(waveRect.width))
      waveCssWidth = waveWidth
      wave.width = Math.floor(waveWidth * dpr)
      wave.height = Math.floor(waveHeight * dpr)
      wave.style.height = `${waveHeight}px`
      waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      colorsRef.current = null // force colour re-resolve on next frame
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)

    let raf = 0
    let last = performance.now()
    let running = true

    const frame = (now: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const time = now / 1000
      const waveWidth = Math.max(1, waveCssWidth)

      // Re-resolve tokens periodically so a theme flip is picked up live.
      if (!colorsRef.current || now - lastResolveRef.current > 750) {
        colorsRef.current = resolveHudColors(accentRef.current)
        lastResolveRef.current = now
      }
      const colors = colorsRef.current
      const currentMode = modeRef.current

      drawBackdrop(stageCtx, width, height, time, colors)
      if (faceModeRef.current === 'orb') {
        drawOrb(stageCtx, width, height, time, dt, currentMode, colors, orbState.current)
      } else {
        drawFace(stageCtx, width, height, time, dt, currentMode, colors, faceState.current, accentRef.current)
      }
      drawWaveform(waveCtx, waveWidth, waveHeight, time, dt, currentMode, colors, waveState.current)
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Clicking the stage toggles hands-free listening — a big, obvious target.
  return (
    <div ref={wrapRef} className="absolute inset-0 cursor-pointer select-none" onClick={toggleHandsFree} role="button" aria-label="Toggle voice input" tabIndex={-1}>
      <canvas ref={faceRef} className="block h-full w-full" />
      <canvas ref={waveRef} className="pointer-events-none absolute bottom-3 left-1/2 h-14 w-[min(560px,88%)] -translate-x-1/2" />
    </div>
  )
}
