// Lip-sync from TEXT, one rule set for every language we can transliterate the
// same way. This module is pure (no DOM) so the check suite can exercise it.
//
// The letters are mapped to a small viseme set: closed lips for m/b/p, wide for
// i/e, rounded for u/o, open for a, teeth for f/v. Scripts whose spelling hides
// the pronunciation (Devanagari, Arabic, CJK) fall back to an open/close rhythm
// on word boundaries instead of pretending to know the vowels.

export type Viseme = 'closed' | 'wide' | 'round' | 'open' | 'teeth' | 'mid'
export type ScriptClass = 'latin' | 'devanagari' | 'arabic' | 'cjk' | 'other'

/** Interpolated mouth targets, all in 0..1. */
export interface MouthWeights {
  jaw: number
  round: number
  wide: number
  teeth: number
}

export interface VisemeEvent {
  shape: Viseme
  /** seconds from the start of the utterance */
  start: number
  end: number
  /** letter index in the normalised string, used by onboundary resync */
  fromIdx: number
  toIdx: number
}

const VISEME_TARGETS: Record<Viseme, MouthWeights> = {
  closed: { jaw: 0.03, round: 0, wide: 0.12, teeth: 0.45 },
  wide: { jaw: 0.28, round: 0, wide: 1, teeth: 0.12 },
  round: { jaw: 0.36, round: 1, wide: 0, teeth: 0 },
  open: { jaw: 0.74, round: 0.16, wide: 0.06, teeth: 0 },
  teeth: { jaw: 0.12, round: 0, wide: 0.16, teeth: 1 },
  mid: { jaw: 0.14, round: 0, wide: 0.08, teeth: 0.3 },
}

export function visemeTarget(shape: Viseme): MouthWeights {
  return { ...VISEME_TARGETS[shape] }
}

/* ---------- stripping: never read markup out loud ---------- */

/** Remove code fences, URLs, markdown symbols, emoji and HTML entities. */
export function stripForSpeech(raw: string): string {
  let s = String(raw || '')
  // fenced code: drop entirely — code is shown in the panel, not read aloud
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/~~~[\s\S]*?~~~/g, ' ')
  // inline code: keep the words, drop the backticks
  s = s.replace(/`([^`]*)`/g, '$1')
  // html tags
  s = s.replace(/<[^>]+>/g, ' ')
  // markdown links/images [text](url) -> text, ![alt](url) -> alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // bare URLs
  s = s.replace(/https?:\/\/\S+/g, ' ')
  s = s.replace(/www\.\S+/g, ' ')
  // html entities (basic + numeric)
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n)
    return Number.isFinite(code) ? String.fromCodePoint(code) : ' '
  })
  s = s.replace(/&[a-zA-Z]+;/g, ' ')
  // emoji & pictographs & variation selectors & ZWJ
  s = s.replace(/\p{Extended_Pictographic}/gu, ' ')
  s = s.replace(/[\u200D\uFE0F\uFEFF]/g, '')
  // markdown emphasis / heading / table markers / bullets
  s = s.replace(/[*_~#>|]/g, ' ')
  // list markers at line starts
  s = s.replace(/^\s*[-+]\s+/gm, ' ')
  s = s.replace(/^\s*\d+\.\s+/gm, ' ')
  s = s.replace(/[ \t]{2,}/g, ' ')
  return s
}

/** Normalise for letter mapping: NFKD, strip combining marks, lowercase. */
export function normalizeLetters(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const SCRIPT_RANGES: Array<[RegExp, ScriptClass]> = [
  [/[\u0900-\u097F]/, 'devanagari'],
  [/[\u0600-\u06FF]/, 'arabic'],
  [/[\u4E00-\u9FFF\u3400-\u4DBF]/, 'cjk'],
  [/[\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/, 'cjk'],
]

/** Majority script among the letters in the text; 'latin' if unknown. */
export function detectScript(text: string): ScriptClass {
  const counts: Record<ScriptClass, number> = { latin: 0, devanagari: 0, arabic: 0, cjk: 0, other: 0 }
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue
    const hit = SCRIPT_RANGES.find(([re]) => re.test(ch))
    if (hit) counts[hit[1]] += 1
    else if (/[a-zA-Z]/.test(ch)) counts.latin += 1
    else counts.other += 1
  }
  let best: ScriptClass = 'latin'
  let bestN = -1
  for (const key of Object.keys(counts) as ScriptClass[]) {
    if (counts[key] > bestN) {
      bestN = counts[key]
      best = key
    }
  }
  return bestN <= 0 ? 'latin' : best
}

/* ---------- letter -> viseme ---------- */

const LETTER_VISEMES: Record<string, Viseme> = {
  m: 'closed', b: 'closed', p: 'closed',
  i: 'wide', e: 'wide', y: 'wide',
  u: 'round', o: 'round', w: 'round',
  a: 'open',
  f: 'teeth', v: 'teeth',
}

export function visemeForLetter(normalizedChar: string): Viseme {
  return LETTER_VISEMES[normalizedChar] ?? 'mid'
}

const LETTER_SECONDS = 0.078
const WORD_GAP_SECONDS = 0.1
const COMMA_GAP_SECONDS = 0.32
const SENTENCE_GAP_SECONDS = 0.6

/**
 * Build the viseme timeline for a piece of text, in seconds, starting at 0.
 * `rate` is the speech rate multiplier (1 = normal). Non-latin scripts get an
 * open/close rhythm on word boundaries (their spelling hides the vowels).
 */
export function planVisemes(raw: string, rate = 1): VisemeEvent[] {
  const safeRate = Math.min(2, Math.max(0.5, rate || 1))
  const scale = 1 / safeRate
  const text = normalizeLetters(stripForSpeech(raw))
  const script = detectScript(text)
  const events: VisemeEvent[] = []
  let cursor = 0

  if (script !== 'latin' && script !== 'other') {
    // Word-rhythm fallback: open on the stressed part of each word, close between.
    const words = [...text.matchAll(/\S+/g)]
    for (const match of words) {
      const word = match[0] ?? ''
      const fromIdx = match.index ?? 0
      const openFor = Math.min(0.34, Math.max(0.16, word.length * 0.055)) * scale
      events.push({ shape: 'open', start: cursor, end: cursor + openFor, fromIdx, toIdx: fromIdx + word.length })
      cursor += openFor
      events.push({ shape: 'closed', start: cursor, end: cursor + WORD_GAP_SECONDS * scale, fromIdx: fromIdx + word.length, toIdx: fromIdx + word.length })
      cursor += WORD_GAP_SECONDS * scale
    }
    return events
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ''
    if (/[\n;]/.test(ch)) {
      events.push({ shape: 'closed', start: cursor, end: cursor + SENTENCE_GAP_SECONDS * scale, fromIdx: i, toIdx: i + 1 })
      cursor += SENTENCE_GAP_SECONDS * scale
      continue
    }
    if (/[,:]/.test(ch)) {
      events.push({ shape: 'closed', start: cursor, end: cursor + COMMA_GAP_SECONDS * scale, fromIdx: i, toIdx: i + 1 })
      cursor += COMMA_GAP_SECONDS * scale
      continue
    }
    if (/[.!?…]/.test(ch)) {
      events.push({ shape: 'closed', start: cursor, end: cursor + SENTENCE_GAP_SECONDS * scale, fromIdx: i, toIdx: i + 1 })
      cursor += SENTENCE_GAP_SECONDS * scale
      continue
    }
    if (!/\p{L}/u.test(ch)) {
      // spaces and digits: a small neutral gap
      events.push({ shape: 'mid', start: cursor, end: cursor + WORD_GAP_SECONDS * scale, fromIdx: i, toIdx: i + 1 })
      cursor += WORD_GAP_SECONDS * scale
      continue
    }
    const dur = LETTER_SECONDS * scale
    events.push({ shape: visemeForLetter(ch), start: cursor, end: cursor + dur, fromIdx: i, toIdx: i + 1 })
    cursor += dur
  }
  return events
}

/** Sample a plan at elapsed seconds; returns the active viseme target, or 'closed' at rest. */
export function samplePlan(events: VisemeEvent[], elapsedSeconds: number): MouthWeights {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev && elapsedSeconds >= ev.start) {
      return elapsedSeconds <= ev.end ? visemeTarget(ev.shape) : visemeTarget('closed')
    }
  }
  return visemeTarget('closed')
}

/** Exponential smoothing of mouth weights toward a target. tau in seconds. */
export function smoothWeights(current: MouthWeights, target: MouthWeights, dt: number, tau = 0.045): MouthWeights {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau)
  return {
    jaw: current.jaw + (target.jaw - current.jaw) * k,
    round: current.round + (target.round - current.round) * k,
    wide: current.wide + (target.wide - current.wide) * k,
    teeth: current.teeth + (target.teeth - current.teeth) * k,
  }
}

/**
 * Resync helper for onboundary events: speech engines emit word boundaries at
 * character positions; nudge the plan's clock so words land where the engine
 * says they do. Returns the plan time corresponding to `charIndex` minus the
 * wall-clock elapsed time — add it to wall time to get plan time.
 */
export function boundaryOffset(events: VisemeEvent[], charIndex: number, elapsedSeconds: number): number {
  for (const ev of events) {
    if (ev.toIdx > charIndex) {
      return ev.start - elapsedSeconds
    }
  }
  return 0
}
