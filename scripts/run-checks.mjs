// Bundles the check scripts (they import .jsx and browser modules) and runs them.
// `npm run check` is the whole story. esbuild is used through its JavaScript API
// rather than its CLI shim, which differs between Windows and Unix.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')

// check-app mounts the whole UI in jsdom, so component markup, effects, and the
// conversation loop are all exercised together. check-main runs the Electron main
// process against a stub of the electron module.
const suites = [
  { file: 'scripts/check-providers.mjs' },
  { file: 'scripts/check-main.mjs', aliasElectron: true },
  { file: 'scripts/check-app.mjs' },
  { file: 'scripts/check-first-run.mjs' },
]

for (const suite of suites) {
  const outfile = path.join(root, 'scripts', `.${path.basename(suite.file, '.mjs')}.build.mjs`)
  console.log(`\n=== ${path.basename(suite.file)} ===`)

  await build({
    entryPoints: [suite.file],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.jsx': 'jsx' },
    jsx: 'automatic',
    external: ['jsdom', 'react', 'react-dom', 'react/jsx-runtime', 'electron'],
    alias: suite.aliasElectron
      ? { electron: path.join(root, 'scripts', 'electron-stub.mjs') }
      : undefined,
    logLevel: 'warning',
  })

  execFileSync(process.execPath, [outfile], { cwd: root, stdio: 'inherit' })
}

console.log('\nAll checks passed.')
