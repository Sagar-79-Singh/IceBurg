// Bundles the check suites (they import .ts/.tsx and browser modules) and runs
// them, then audits the production stylesheet. `npm run check` is the whole
// story. esbuild is used through its JavaScript API rather than its CLI shim,
// which differs between Windows and Unix.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')

// check-app mounts the whole UI in jsdom, so component markup, effects, and the
// conversation loop are all exercised together. check-main runs the Electron main
// process against a stub of the electron module.
const suites = [
  { file: 'scripts/check-providers.ts' },
  { file: 'scripts/check-main.ts', aliasElectron: true },
  { file: 'scripts/check-app.ts' },
  { file: 'scripts/check-first-run.ts' },
  { file: 'scripts/check-viseme.ts' },
  { file: 'scripts/check-voice-machine.ts' },
  { file: 'scripts/check-voice-app.ts' },
  { file: 'scripts/check-i18n.ts' },
]

for (const suite of suites) {
  const outfile = path.join(root, 'scripts', `.${path.basename(suite.file, '.ts')}.build.mjs`)
  console.log(`\n=== ${path.basename(suite.file)} ===`)

  await build({
    entryPoints: [suite.file],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'automatic',
    external: ['jsdom', 'react', 'react-dom', 'react/jsx-runtime', 'electron'],
    alias: suite.aliasElectron
      ? { electron: path.join(root, 'scripts', 'electron-stub.ts') }
      : undefined,
    logLevel: 'warning',
  })

  execFileSync(process.execPath, [outfile], { cwd: root, stdio: 'inherit' })
}

// The styles check needs the real vite production build, so it runs directly
// through node's type stripping rather than through the esbuild bundle above.
console.log('\n=== check-styles.ts ===')
execFileSync(
  process.execPath,
  ['--experimental-strip-types', path.join(root, 'scripts', 'check-styles.ts')],
  { cwd: root, stdio: 'inherit' },
)

console.log('\nAll checks passed.')
