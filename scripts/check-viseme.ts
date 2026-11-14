// Exercises the lip-sync rule set: stripping, normalising, script detection,
// letter mapping, plan timing, sampling, smoothing and boundary resync.
// Pure functions only — no DOM, no audio.
import assert from 'node:assert/strict'
import {
  stripForSpeech,
  normalizeLetters,
  detectScript,
  visemeForLetter,
  planVisemes,
  samplePlan,
  smoothWeights,
  boundaryOffset,
  visemeTarget,
} from '../src/voice/visemes.ts'

/* stripping: code is never read out loud */
assert.equal(stripForSpeech('look ```const x = 1``` now').replace(/\s+/g, ' ').trim(), 'look now')
assert.equal(stripForSpeech('see https://example.com/a?b=c please').replace(/\s+/g, ' ').trim(), 'see please')
assert.equal(stripForSpeech('**bold** and _italic_ and `code`').replace(/\s+/g, ' ').trim(), 'bold and italic and code')
assert.equal(stripForSpeech('[click here](https://x.y) now').replace(/\s+/g, ' ').trim(), 'click here now')
assert.equal(stripForSpeech('emoji 🎉🔥 test').replace(/\s+/g, ' ').trim(), 'emoji test')
assert.equal(stripForSpeech('fish &amp; chips').replace(/\s+/g, ' ').trim(), 'fish chips')

/* normalising: accents fold away so one rule set covers every latin script */
assert.equal(normalizeLetters('Héllo Wörld'), 'hello world')
assert.equal(normalizeLetters('Éclair'), 'eclair')

/* script detection */
assert.equal(detectScript('hello world'), 'latin')
assert.equal(detectScript('नमस्ते दुनिया'), 'devanagari')
assert.equal(detectScript('مرحبا بالعالم'), 'arabic')
assert.equal(detectScript('你好世界'), 'cjk')

/* the letter table */
for (const ch of ['m', 'b', 'p']) assert.equal(visemeForLetter(ch), 'closed', `${ch} -> closed`)
for (const ch of ['i', 'e', 'y']) assert.equal(visemeForLetter(ch), 'wide', `${ch} -> wide`)
for (const ch of ['u', 'o', 'w']) assert.equal(visemeForLetter(ch), 'round', `${ch} -> round`)
assert.equal(visemeForLetter('a'), 'open')
for (const ch of ['f', 'v']) assert.equal(visemeForLetter(ch), 'teeth', `${ch} -> teeth`)
for (const ch of ['s', 't', 'z', 'q', 'r', 'n']) assert.equal(visemeForLetter(ch), 'mid', `${ch} -> mid`)

/* plans: monotone non-decreasing, positive durations, starts at 0 */
const plan = planVisemes('Mama', 1)
assert.ok(plan.length >= 4, 'one event per letter minimum')
assert.equal(plan[0]!.shape, 'closed', 'm is closed')
assert.equal(plan[0]!.start, 0)
let cursor = 0
for (const event of plan) {
  assert.ok(event.end > event.start, 'event duration > 0')
  assert.ok(event.start >= cursor, 'events do not overlap backwards')
  cursor = event.end
}

/* rate scales time: twice the rate, half the plan length */
const normal = planVisemes('Hello there, how are you today?', 1)
const fast = planVisemes('Hello there, how are you today?', 2)
const normalEnd = normal[normal.length - 1]!.end
const fastEnd = fast[fast.length - 1]!.end
assert.ok(fastEnd < normalEnd * 0.75, `rate 2 should compress the plan (${fastEnd} vs ${normalEnd})`)

/* non-latin scripts fall back to an open/close word rhythm */
const rhythmic = planVisemes('नमस्ते दुनिया', 1)
assert.ok(rhythmic.length > 0)
assert.ok(rhythmic.every((event) => event.shape === 'open' || event.shape === 'closed'), 'rhythm uses only open/closed')
assert.ok(rhythmic.some((event) => event.shape === 'open'))
assert.ok(rhythmic.some((event) => event.shape === 'closed'))

/* open a round a: the 'a' viseme should be taller than the 'i' viseme */
const openTarget = visemeTarget('open')
const wideTarget = visemeTarget('wide')
const roundTarget = visemeTarget('round')
assert.ok(openTarget.jaw > wideTarget.jaw, 'open jaw > wide jaw')
assert.ok(roundTarget.round > openTarget.round, 'round has the rounding')
assert.ok(wideTarget.wide > roundTarget.wide, 'wide has the stretch')

/* sampling: rest before, rest after, active shape inside */
assert.deepEqual(samplePlan(plan, -1), visemeTarget('closed'))
const mid = samplePlan(plan, 0.05)
assert.ok(mid.jaw >= 0, 'sample inside the timeline is a valid weights object')
assert.deepEqual(samplePlan(plan, 9999), visemeTarget('closed'))

/* smoothing: exponential approach, never overshoots */
let weights = { jaw: 0, round: 0, wide: 0, teeth: 0 }
const target = visemeTarget('open')
for (let frame = 0; frame < 120; frame++) weights = smoothWeights(weights, target, 1 / 60)
assert.ok(Math.abs(weights.jaw - target.jaw) < 0.01, `converges to the target (jaw=${weights.jaw})`)

/* boundary resync: plan time == wall + offset for a given char position */
const boundaryPlan = planVisemes('abc', 1)
const elapsed = 0.5
const offset = boundaryOffset(boundaryPlan, 1, elapsed)
const landing = boundaryPlan.find((event) => event.toIdx > 1)!
assert.ok(Math.abs(elapsed + offset - landing.start) < 1e-9, 'offset resyncs exactly to the boundary event')

console.log('viseme ok: strip, normalise, detect, map, plan, sample, smooth, resync all behave')
