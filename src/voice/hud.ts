// Canvas 2D renderers for the HUD: backdrop grid, the face, the reactor orb and
// the waveform bar. Everything is drawn from the app's theme tokens, so the
// HUD retints itself in light and dark themes and takes the accent override.
// No image assets are used — the file weight stays at zero and 60fps is easy.

import type { VoiceMode } from './machine.ts'
import { voiceLevels } from './levels.ts'

export interface HudColors {
  surface: string
  crevasse: string
  glacier: string
  frost: string
  muted: string
  accent: string
  glint: string
  lineStrong: string
  accentRgb: [number, number, number]
  frostRgb: [number, number, number]
}

const parseHex = (value: string): [number, number, number] | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const n = Number.parseInt(match[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const readVar = (name: string): string => {
  const styles = getComputedStyle(document.documentElement)
  const value = styles.getPropertyValue(name).trim()
  return value
}

/** Resolve every colour the HUD paints with, plus the accent override. */
export function resolveHudColors(accentOverride: string): HudColors {
  const surface = readVar('--surface') || '#0a1a26'
  const crevasse = readVar('--crevasse') || '#06101a'
  const glacier = readVar('--glacier') || '#12303f'
  const frost = readVar('--frost') || '#dceff7'
  const muted = readVar('--muted') || '#9ab7c6'
  const glint = readVar('--glint') || '#eaf8ff'
  const accent = accentOverride || readVar('--melt') || '#5bc0de'
  const accentRgb = parseHex(accent) ?? [91, 192, 222]
  const frostRgb = parseHex(frost) ?? [220, 239, 247]
  const lineStrong = readVar('--line-strong') || 'rgba(220,239,247,0.24)'
  return { surface, crevasse, glacier, frost, muted, accent, glint, lineStrong, accentRgb, frostRgb }
}

const rgba = ([r, g, b]: [number, number, number], alpha: number): string =>
  `rgba(${r}, ${g}, ${b}, ${alpha})`

/* ------------------------------------------------------------------ backdrop */

/*
 * The Mark-LVII inspiration: a workshop floor. A low horizon with atmospheric
 * glow above it, a perspective grid receding into it, soft bokeh light
 * scattered along it. Rendered once into an offscreen pass and blitted, so
 * the face/orb frames stay cheap. The slow sensor sweep stays animated.
 */
interface BackdropCache {
  key: string
  canvas: HTMLCanvasElement
}

let backdropCache: BackdropCache | null = null

const seeded = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function buildBackdrop(w: number, h: number, colors: HudColors): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.floor(w))
  canvas.height = Math.max(2, Math.floor(h))
  const ctx = canvas.getContext('2d')!
  const horizon = h * 0.66

  // Base fill: crevasse, darker at the top so the floor reads as lit.
  ctx.fillStyle = colors.crevasse
  ctx.fillRect(0, 0, w, h)

  // Atmospheric glow pooled on the horizon.
  const glow = ctx.createRadialGradient(w / 2, horizon, 10, w / 2, horizon, w * 0.75)
  glow.addColorStop(0, rgba(colors.accentRgb, 0.16))
  glow.addColorStop(0.4, rgba(colors.accentRgb, 0.05))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  // Tactical grid: faint, above the horizon only — the "airspace".
  const step = 46
  ctx.strokeStyle = rgba(colors.accentRgb, 0.05)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = step / 2; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, horizon)
  }
  for (let y = step / 2; y < horizon; y += step) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
  }
  ctx.stroke()

  // Bokeh: soft defocused lights scattered along the horizon band.
  const rand = seeded(1337)
  for (let i = 0; i < 34; i++) {
    const bx = rand() * w
    const by = horizon - rand() * h * 0.16 + rand() * 6
    const r = 2.5 + rand() * 13
    const a = 0.05 + rand() * 0.22
    const dot = ctx.createRadialGradient(bx, by, 0, bx, by, r)
    dot.addColorStop(0, rgba(colors.accentRgb, a))
    dot.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // The floor. Perspective fan from the vanishing point, plus range rings
  // whose spacing compresses toward the horizon.
  const vpX = w / 2
  ctx.strokeStyle = rgba(colors.accentRgb, 0.16)
  ctx.lineWidth = 1
  const fanLines = 22
  for (let i = -fanLines; i <= fanLines; i++) {
    if (i === 0) continue
    const bottomX = vpX + (i / fanLines) * (w * 0.9)
    ctx.beginPath()
    ctx.moveTo(vpX, horizon)
    ctx.lineTo(bottomX, h + 8)
    ctx.stroke()
  }
  const rings = 9
  for (let i = 1; i <= rings; i++) {
    const k = i / rings
    const y = horizon + (h - horizon + 30) * Math.pow(k, 2.6)
    ctx.strokeStyle = rgba(colors.accentRgb, 0.05 + k * 0.14)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
    ctx.stroke()
  }

  // Horizon hairline: bright, with a soft glow beneath it.
  ctx.save()
  ctx.shadowColor = colors.accent
  ctx.shadowBlur = 14
  ctx.strokeStyle = rgba(colors.accentRgb, 0.5)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(0, horizon + 0.5)
  ctx.lineTo(w, horizon + 0.5)
  ctx.stroke()
  ctx.restore()

  return canvas
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  colors: HudColors,
): void {
  const key = `${Math.floor(w)}x${Math.floor(h)}:${colors.accentRgb.join(',')}:${colors.crevasse}`
  if (!backdropCache || backdropCache.key !== key) {
    backdropCache = { key, canvas: buildBackdrop(w, h, colors) }
  }
  ctx.drawImage(backdropCache.canvas, 0, 0)

  // Slow vertical sweep: the "sensor" pass, a band travelling left to right.
  const cycle = 9
  const phase = time % cycle
  if (phase < 1.4) {
    const x = (phase / 1.4) * (w + 240) - 120
    const gradient = ctx.createLinearGradient(x - 90, 0, x + 90, 0)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.5, rgba(colors.accentRgb, 0.06))
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(x - 90, 0, 180, h)
  }
}

/* -------------------------------------------------------------- face chrome */

export interface FaceState {
  lid: number
  gazeX: number
  gazeY: number
  nextBlinkAt: number
  blinkStartedAt: number
  blinkPhase: 'open' | 'closing' | 'opening'
  nodStartedAt: number
  lastNodAt: number
  browPulse: number
  saccadeNextAt: number
  saccadeX: number
  saccadeY: number
  saccadeUntil: number
  accentSprite: HTMLCanvasElement | null
  spriteAccentKey: string
  scan: HTMLCanvasElement | null
}

export function createFaceState(): FaceState {
  return {
    lid: 0.5,
    gazeX: 0,
    gazeY: 0.1,
    nextBlinkAt: 1.6,
    blinkStartedAt: 0,
    blinkPhase: 'open',
    nodStartedAt: -10,
    lastNodAt: -10,
    browPulse: 0,
    saccadeNextAt: 1.2,
    saccadeX: 0,
    saccadeY: 0,
    saccadeUntil: 0,
    accentSprite: null,
    spriteAccentKey: '',
    scan: null,
  }
}

const makeGlowSprite = (rgb: [number, number, number]): HTMLCanvasElement => {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, rgba(rgb, 0.85))
  gradient.addColorStop(0.35, rgba(rgb, 0.32))
  gradient.addColorStop(1, rgba(rgb, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return canvas
}

const makeScanPattern = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 4, 4)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'
  ctx.fillRect(0, 3, 4, 1)
  return canvas
}

const FACE_POLYGON: Array<[number, number]> = [
  [-0.55, -0.82], [0.55, -0.82], [0.7, -0.52], [0.66, 0.05], [0.42, 0.62],
  [0.2, 0.78], [-0.2, 0.78], [-0.42, 0.62], [-0.66, 0.05], [-0.7, -0.52],
]

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Gaze targets per state; listening meets the eyes, thinking looks away, idle drifts down. */
function gazeTarget(mode: VoiceMode, time: number): { x: number; y: number } {
  if (performance.now() < voiceLevels.glanceUntil) return { x: 0.05, y: 0.42 }
  switch (mode) {
    case 'listening':
      return { x: 0, y: 0.06 }
    case 'speaking':
      return { x: Math.sin(time * 0.9) * 0.06, y: 0.08 }
    case 'thinking':
      return { x: 0.52, y: -0.44 }
    default:
      return { x: Math.sin(time * 0.23) * 0.3, y: Math.sin(time * 0.31) * 0.16 + 0.14 }
  }
}

const lidTarget = (mode: VoiceMode, time: number): number => {
  switch (mode) {
    case 'listening': return 0.97
    case 'speaking': return 0.9
    case 'thinking': return 0.72
    default: return 0.46 + 0.06 * Math.sin(time * 0.6)
  }
}

export function drawFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  dt: number,
  mode: VoiceMode,
  colors: HudColors,
  state: FaceState,
  accentOverride: string,
): void {
  const cx = w / 2
  const unit = Math.min(w, h)
  const R = unit * 0.31
  const cy = h * 0.46 + Math.sin(time * 0.5) * unit * 0.008

  // Facing updates: sprite, saccades, blink, lid.
  const accentKey = accentOverride || 'theme'
  if (state.spriteAccentKey !== accentKey) {
    state.accentSprite = makeGlowSprite(colors.accentRgb)
    state.scan = state.scan ?? makeScanPattern()
    state.spriteAccentKey = accentKey
  }
  if (state.scan === null) state.scan = makeScanPattern()
  if (time >= state.nextBlinkAt) {
    state.blinkPhase = 'closing'
    state.blinkStartedAt = time
    state.nextBlinkAt = time + 2.4 + Math.random() * 3.1
  }
  let lidBlink = 0
  if (state.blinkPhase === 'closing') {
    lidBlink = clamp01((time - state.blinkStartedAt) / 0.09)
    if (lidBlink >= 1) state.blinkPhase = 'opening'
  } else if (state.blinkPhase === 'opening') {
    lidBlink = 1 - clamp01((time - state.blinkStartedAt - 0.09) / 0.16)
    if (lidBlink <= 0) state.blinkPhase = 'open'
  }
  const lidGoal = lidTarget(mode, time) * (1 - lidBlink * 0.94)
  state.lid = lerp(state.lid, lidGoal, Math.min(1, dt * 7))

  // Saccades: tiny jumps every so often, except mid-thought when the eyes are parked away.
  if (time >= state.saccadeNextAt && mode !== 'thinking') {
    state.saccadeX = (Math.random() - 0.5) * 0.22
    state.saccadeY = (Math.random() - 0.5) * 0.12
    state.saccadeUntil = time + 0.14
    state.saccadeNextAt = time + 0.9 + Math.random() * 1.5
  }
  const saccadeActive = time < state.saccadeUntil
  const gazeGoal = gazeTarget(mode, time)
  const gazeXGoal = gazeGoal.x + (saccadeActive ? state.saccadeX : 0)
  const gazeYGoal = gazeGoal.y + (saccadeActive ? state.saccadeY : 0)
  state.gazeX = lerp(state.gazeX, gazeXGoal, Math.min(1, dt * 6.5))
  state.gazeY = lerp(state.gazeY, gazeYGoal, Math.min(1, dt * 6.5))

  // Nod impulse on strong open vowels: detect jaw crossing 0.5 upward.
  const jaw = voiceLevels.mouth.jaw
  if (mode === 'speaking' && jaw > 0.52 && time - state.lastNodAt > 1.6) {
    state.nodStartedAt = time
    state.lastNodAt = time
    state.browPulse = 1
  }
  const nodAge = time - state.nodStartedAt
  const nod = nodAge < 0.45 ? Math.sin((nodAge / 0.45) * Math.PI) * R * 0.045 : 0
  state.browPulse = Math.max(0, state.browPulse - dt * 2.2)

  // Inner ring behind the head (thin, glowing) — the HUD "housing".
  ctx.save()
  ctx.translate(cx, cy + nod * 0.4)
  const ringR = R * 1.42
  ctx.strokeStyle = rgba(colors.accentRgb, 0.16)
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(0, 0, ringR, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = rgba(colors.accentRgb, 0.55)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(0, 0, ringR, 0, Math.PI * 2)
  ctx.stroke()
  // rotating arc segments
  const speed = mode === 'thinking' ? 1.9 : mode === 'listening' ? 0.75 : 0.3
  for (let i = 0; i < 3; i++) {
    const base = time * speed + (i * Math.PI * 2) / 3
    ctx.strokeStyle = rgba(colors.accentRgb, 0.75 - i * 0.24)
    ctx.lineWidth = 2.2 - i * 0.6
    ctx.beginPath()
    ctx.arc(0, 0, ringR, base, base + Math.PI * (0.5 - i * 0.12))
    ctx.stroke()
  }
  ctx.restore()

  /* ---------------- head ---------------- */
  ctx.save()
  ctx.translate(cx, cy + nod)
  ctx.rotate(Math.sin(time * 0.33) * 0.012)

  const path = new Path2D()
  FACE_POLYGON.forEach(([px, py], index) => {
    const x = px * R
    const y = py * R
    if (index === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  })
  path.closePath()
  ctx.fillStyle = colors.glacier
  ctx.fill(path)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = rgba(colors.frostRgb, 0.85)
  ctx.stroke(path)

  // Facet seams: two angular cuts that catch the light.
  ctx.strokeStyle = rgba(colors.frostRgb, 0.14)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-0.44 * R, -0.52 * R)
  ctx.lineTo(0, -0.28 * R)
  ctx.lineTo(0.44 * R, -0.52 * R)
  ctx.moveTo(-0.52 * R, 0.18 * R)
  ctx.lineTo(0, 0.02 * R)
  ctx.lineTo(0.52 * R, 0.18 * R)
  ctx.stroke()

  // Forehead diamond: the iceberg facet, glowing softly.
  const gemY = -0.56 * R
  ctx.save()
  ctx.shadowColor = colors.accent
  ctx.shadowBlur = 12
  ctx.fillStyle = colors.accent
  ctx.beginPath()
  ctx.moveTo(0, gemY - R * 0.075)
  ctx.lineTo(R * 0.055, gemY)
  ctx.lineTo(0, gemY + R * 0.075)
  ctx.lineTo(-R * 0.055, gemY)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  /* ---------------- eyes ---------------- */
  const eyeY = -0.08 * R
  const eyeDx = 0.33 * R
  const eyeW = 0.185 * R
  const eyeH = 0.072 * R
  const lid = state.lid

  for (const side of [-1, 1]) {
    const ex = side * eyeDx
    ctx.save()
    ctx.translate(ex, eyeY)

    // Almond outline
    const almond = new Path2D()
    almond.moveTo(-eyeW, 0)
    almond.quadraticCurveTo(0, -eyeH * 1.9, eyeW, 0)
    almond.quadraticCurveTo(0, eyeH * 1.9, -eyeW, 0)
    almond.closePath()

    // Eye white, dimmed by lids
    ctx.fillStyle = rgba(colors.frostRgb, 0.13 + 0.6 * lid)
    ctx.fill(almond)

    // Clip everything inside the almond
    ctx.save()
    ctx.clip(almond)

    // Iris + pupil track the gaze
    const irisX = state.gazeX * eyeW * 0.55
    const irisY = state.gazeY * eyeH * 1.6
    if (state.accentSprite) {
      const spriteSize = eyeH * 7
      ctx.drawImage(state.accentSprite, irisX - spriteSize / 2, irisY - spriteSize / 2, spriteSize, spriteSize)
    }
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.arc(irisX, irisY, eyeH * 0.92, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#04121a'
    ctx.beginPath()
    ctx.arc(irisX, irisY, eyeH * 0.44, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(234,248,255,0.9)'
    ctx.beginPath()
    ctx.arc(irisX - eyeH * 0.16, irisY - eyeH * 0.2, eyeH * 0.13, 0, Math.PI * 2)
    ctx.fill()

    // Lid: dark slab descending from the top of the eye
    const lidCover = (1 - clamp01(lid)) * eyeH * 2.6
    ctx.fillStyle = colors.glacier
    ctx.fillRect(-eyeW - 2, -eyeH * 2.2, eyeW * 2 + 4, lidCover)
    // Lashes line where the lid meets
    ctx.strokeStyle = rgba(colors.frostRgb, 0.5)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-eyeW, -eyeH * 2.2 + lidCover)
    ctx.lineTo(eyeW, -eyeH * 2.2 + lidCover)
    ctx.stroke()
    ctx.restore()

    ctx.strokeStyle = rgba(colors.frostRgb, 0.75)
    ctx.lineWidth = 1.3
    ctx.stroke(almond)
    ctx.restore()
  }

  /* ---------------- brows ---------------- */
  // Angular, low-set ridges: outer edge a hair higher, inner tip dipped, one
  // shallow apex pushed toward the mid third. lift rises with the jaw.
  const lift = (0.1 + jaw * 0.42 + state.browPulse * 0.4) * R
  const browY = eyeY - eyeH * 2.05 - lift * 0.3
  for (const side of [-1, 1]) {
    const bx = side * eyeDx
    const outerX = bx + side * eyeW * 1.02
    const apexX = bx + side * eyeW * 0.18
    const innerX = bx - side * eyeW * 0.88
    ctx.strokeStyle = rgba(colors.frostRgb, 0.92)
    ctx.lineWidth = 3.1
    ctx.lineJoin = 'miter'
    ctx.beginPath()
    ctx.moveTo(outerX, browY + R * 0.018)
    ctx.lineTo(apexX, browY - R * 0.045 - lift * 0.22)
    ctx.lineTo(innerX, browY + R * 0.03)
    ctx.stroke()
  }

  /* ---------------- nose ---------------- */
  ctx.strokeStyle = rgba(colors.frostRgb, 0.4)
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(-R * 0.035, R * 0.13)
  ctx.lineTo(R * 0.045, R * 0.31)
  ctx.lineTo(-R * 0.02, R * 0.33)
  ctx.stroke()

  /* ---------------- mouth ---------------- */
  const mouth = voiceLevels.mouth
  const mouthY = 0.47 * R
  const mouthW = R * 0.15 * (0.78 + mouth.wide * 0.5 - mouth.round * 0.32)
  const openH = Math.max(R * 0.012, mouth.jaw * R * 0.155)
  const teeth = clamp01(mouth.teeth)

  ctx.save()
  ctx.translate(0, mouthY)
  // Cavity
  const cavity = new Path2D()
  cavity.moveTo(-mouthW, 0)
  cavity.quadraticCurveTo(0, -openH * 0.55, mouthW, 0)
  cavity.quadraticCurveTo(0, openH * 1.35, -mouthW, 0)
  cavity.closePath()
  ctx.fillStyle = '#04090f'
  ctx.fill(cavity)
  // Teeth band for f/v/sibilants
  if (teeth > 0.3) {
    ctx.save()
    ctx.clip(cavity)
    ctx.fillStyle = rgba(colors.frostRgb, 0.5 + teeth * 0.45)
    ctx.fillRect(-mouthW, -openH * 0.6, mouthW * 2, openH * 0.62)
    ctx.restore()
  }
  // Lip line: glows while speaking
  ctx.strokeStyle = rgba(colors.accentRgb, mode === 'speaking' ? 0.95 : 0.5)
  ctx.lineWidth = 1.6
  if (mode === 'speaking') {
    ctx.shadowColor = colors.accent
    ctx.shadowBlur = 8
  }
  ctx.stroke(cavity)
  ctx.restore()

  ctx.restore() // end head transform

  // Scanlines over the head silhouette only: cheap, clipped pattern.
  if (state.scan) {
    ctx.save()
    ctx.translate(cx, cy + nod)
    ctx.clip(path)
    ctx.globalAlpha = 0.5
    const pattern = ctx.createPattern(state.scan, 'repeat')
    if (pattern) {
      ctx.fillStyle = pattern
      ctx.fillRect(-R, -R, R * 2, R * 2)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }
}

/* --------------------------------------------------------------------- orb */

export interface OrbState {
  bars: Float32Array
}

export function createOrbState(): OrbState {
  return { bars: new Float32Array(40) }
}

export function drawOrb(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  dt: number,
  mode: VoiceMode,
  colors: HudColors,
  state: OrbState,
): void {
  const cx = w / 2
  const cy = h * 0.44
  const R = Math.min(w, h) * 0.21
  const listening = mode === 'listening'
  const level = listening ? voiceLevels.mic : voiceLevels.voiceEnergy
  const energy = clamp01(level)

  // Update the 40-bin spectrum ring. Mic side reads the real analyser; the
  // speaking side shapes the lip-sync envelope into bands.
  const bins = state.bars
  for (let i = 0; i < bins.length; i++) {
    let target: number
    if (listening) {
      const src = voiceLevels.spectrum
      const at = src[Math.floor((i / bins.length) * src.length)] ?? 0
      target = at / 255
    } else if (mode === 'speaking') {
      const band = i / bins.length
      const shape = 0.55 + 0.45 * Math.sin(band * 9 + time * 7.3) * Math.sin(band * 3.1 - time * 2.2)
      target = energy * clamp01(shape + 0.25)
    } else if (mode === 'thinking') {
      target = 0.28 + 0.2 * Math.sin(time * 2.6 + i * 0.55)
    } else {
      target = 0.05
    }
    bins[i] = lerp(bins[i] ?? 0, target, Math.min(1, dt * 9))
  }

  // Halo behind the core.
  const haloR = R * (2.35 + energy * 0.35)
  const halo = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, haloR)
  halo.addColorStop(0, rgba(colors.accentRgb, 0.32 + energy * 0.25))
  halo.addColorStop(0.55, rgba(colors.accentRgb, 0.08))
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = halo
  ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2)

  // Gauge ring: 56 ticks, lit by mode/energy.
  const gaugeR = R * 1.28
  const ticks = 56
  const lit = mode === 'thinking' ? 0.5 + 0.5 * Math.sin(time * 2.4) : energy
  for (let i = 0; i < ticks; i++) {
    const angle = (i / ticks) * Math.PI * 2 - Math.PI / 2
    const on = i / ticks <= lit
    const inner = gaugeR - R * 0.055
    ctx.strokeStyle = on ? rgba(colors.accentRgb, 0.95) : rgba(colors.frostRgb, 0.14)
    ctx.lineWidth = on ? 2.4 : 1.4
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * gaugeR, cy + Math.sin(angle) * gaugeR)
    ctx.stroke()
  }

  // Outer hairline + inner counter-rotating arcs.
  ctx.strokeStyle = rgba(colors.accentRgb, 0.5)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(cx, cy, gaugeR + R * 0.06, 0, Math.PI * 2)
  ctx.stroke()
  const speed = mode === 'thinking' ? 2.6 : mode === 'listening' ? 0.9 : mode === 'speaking' ? 1.15 : 0.28
  const arcs: Array<[number, number, number, number]> = [
    [0.98, 0.9, 0.32, 1],
    [0.74, 2.1, 0.26, 1.5],
    [0.52, 3.4, 0.2, -0.8],
  ]
  for (const [scale, offset, length, dir] of arcs) {
    const rotation = time * speed * dir + offset
    ctx.strokeStyle = rgba(colors.accentRgb, 0.8)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, R * scale, rotation, rotation + Math.PI * length)
    ctx.stroke()
  }

  // Spectrum ring: the "audio equalizer" crown.
  const spectrumR = R * 1.52
  for (let i = 0; i < bins.length; i++) {
    const angle = (i / bins.length) * Math.PI * 2 - Math.PI / 2
    const len = 3 + (bins[i] ?? 0) * R * 0.36
    ctx.strokeStyle = rgba(colors.accentRgb, 0.28 + (bins[i] ?? 0) * 0.6)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * spectrumR, cy + Math.sin(angle) * spectrumR)
    ctx.lineTo(cx + Math.cos(angle) * (spectrumR + len), cy + Math.sin(angle) * (spectrumR + len))
    ctx.stroke()
  }

  // Core: hot center, accent body, transparent rim.
  const coreR = R * (0.62 + 0.035 * Math.sin(time * 1.7) + energy * 0.12)
  const core = ctx.createRadialGradient(cx, cy, coreR * 0.08, cx, cy, coreR)
  core.addColorStop(0, colors.glint)
  core.addColorStop(0.38, colors.accent)
  core.addColorStop(1, rgba(colors.accentRgb, 0))
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
  ctx.fill()

  // Inner facet diamond pulsing gently.
  const diamondR = coreR * 0.34
  ctx.fillStyle = rgba(colors.frostRgb, 0.85)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(time * 0.4)
  ctx.globalAlpha = 0.55 + energy * 0.4
  ctx.beginPath()
  ctx.moveTo(0, -diamondR)
  ctx.lineTo(diamondR * 0.7, 0)
  ctx.lineTo(0, diamondR)
  ctx.lineTo(-diamondR * 0.7, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.globalAlpha = 1
}

/* ----------------------------------------------------------------- waveform */

export interface WaveState {
  history: Float32Array
  cursor: number
}

export function createWaveState(length = 96): WaveState {
  return { history: new Float32Array(length), cursor: 0 }
}

const WAVE_BINS = 96

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  dt: number,
  mode: VoiceMode,
  colors: HudColors,
  state: WaveState,
): void {
  ctx.clearRect(0, 0, w, h)
  const target =
    mode === 'listening'
      ? voiceLevels.mic
      : mode === 'speaking'
        ? voiceLevels.voiceEnergy
        : mode === 'thinking'
          ? 0.16 + 0.1 * Math.sin(time * 3.2)
          : 0.05 + 0.025 * Math.sin(time * 0.9)
  // Shift the window left and push the new sample (96 samples over ~1.6s at 60fps).
  state.history.copyWithin(0, 1)
  state.history[WAVE_BINS - 1] = lerp(state.history[WAVE_BINS - 1] ?? 0, clamp01(target), Math.min(1, dt * 14))

  const mid = h / 2
  const slot = w / WAVE_BINS
  // Center hairline
  ctx.strokeStyle = rgba(colors.frostRgb, 0.18)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid + 0.5)
  ctx.lineTo(w, mid + 0.5)
  ctx.stroke()

  for (let i = 0; i < WAVE_BINS; i++) {
    const amp = state.history[i] ?? 0
    const barH = Math.max(1.5, amp * (h * 0.86))
    const x = i * slot + slot / 2
    const edge = Math.min(1, Math.min(i, WAVE_BINS - 1 - i) / 14)
    ctx.strokeStyle = rgba(colors.accentRgb, (0.35 + amp * 0.65) * edge)
    ctx.lineWidth = Math.max(1.5, slot * 0.42)
    ctx.beginPath()
    ctx.moveTo(x, mid - barH / 2)
    ctx.lineTo(x, mid + barH / 2)
    ctx.stroke()
  }
}
