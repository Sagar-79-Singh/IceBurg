// Fails if the production CSS is missing its Tailwind utilities. The app was
// once silently reduced to unstyled HTML because the Tailwind content globs
// only scanned *.{js,jsx} and the migration rewrote everything to *.{ts,tsx} —
// the build stayed green the whole time. This check rebuilds the renderer the
// same way `npm run build` does, then audits the emitted CSS so that class of
// regression cannot slip through again.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { build } from 'vite'

const root = path.resolve(import.meta.dirname, '..')

const fail = (message: string): never => {
  console.error(`\nstyles check FAILED: ${message}\n`)
  process.exit(1)
}

/* 1. The entry the HTML points at must exist. A stale /src/main.jsx survived
      the *.jsx -> *.tsx rename once; vite still bundled, so nothing complained. */
const html = readFileSync(path.join(root, 'index.html'), 'utf8')
const script = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)
assert.ok(script, 'index.html has no module script entry')
const rawEntry = script[1] ?? ''
const entry = rawEntry.startsWith('/')
  ? path.join(root, rawEntry)
  : rawEntry.startsWith('./')
    ? path.join(root, rawEntry)
    : path.resolve(root, rawEntry)
if (!existsSync(entry)) {
  fail(`index.html points at ${rawEntry}, which does not exist. The file it asks for must be on disk.`)
}

/* 2. Build the renderer, exactly like `npm run build`, and audit the result. */
await build({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'warn',
})

const assetsDir = path.join(root, 'dist', 'assets')
const loadCss = (): string => {
  try {
    const cssFiles = readdirSync(assetsDir).filter((file) => file.endsWith('.css'))
    if (cssFiles.length === 0) return fail('the renderer build emitted no CSS file')
    return cssFiles.map((file) => readFileSync(path.join(assetsDir, file), 'utf8')).join('\n')
  } catch (error) {
    return fail(`could not read the built CSS: ${(error as Error).message}`)
  }
}
const css = loadCss()

/* Utility selectors the app relies on everywhere; all present in the last
   known-good build. If the content globs go stale again these vanish. */
const REQUIRED_UTILITIES = [
  '.flex{',
  '.items-center{',
  '.justify-between{',
  '.hidden{',
  '.text-frost{',
  '.bg-surface{',
  '.px-4{',
  '.font-mono{',
]
const missing = REQUIRED_UTILITIES.filter((marker) => !css.includes(marker))

/* Tailwind's preflight (base layer) is emitted unconditionally, so it alone
   proves nothing about the globs; the theme plumbing below does. */
if (!css.includes('box-sizing:border-box')) missing.push('preflight (box-sizing:border-box)')
/* The themed colors only exist if the utilities were generated from source. */
if (!css.includes('var(--frost-rgb')) missing.push('var(--frost-rgb (themed color utilities)')

if (css.includes('@tailwind')) {
  fail('the emitted CSS still contains raw @tailwind directives; the PostCSS/Tailwind pipeline did not run.')
}

if (missing.length > 0) {
  fail(
    `the built CSS is missing Tailwind-generated content:\n  - ${missing.join('\n  - ')}\n` +
      'Check the `content` globs in tailwind.config.js — they must cover every extension the app is written in (ts, tsx).',
  )
}

console.log('styles ok: the built css contains the tailwind utilities and theme tokens')
