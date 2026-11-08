// Bundles the two check scripts (they import .jsx and browser modules) and runs
// them. `npm run check` is the whole story.
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
// check-app mounts the whole UI in jsdom, so component markup, effects, and the
// conversation loop are all exercised together.
const suites = [
  { file: 'scripts/check-providers.mjs' },
  { file: 'scripts/check-main.mjs', aliasElectron: true },
  { file: 'scripts/check-app.mjs' },
  { file: 'scripts/check-first-run.mjs' },
]

for (const suite of suites) {
  const suitePath = suite.file
  const outfile = path.join(root, 'scripts', `.${path.basename(suitePath, '.mjs')}.build.mjs`)
  console.log(`\n=== ${path.basename(suitePath)} ===`)
  execFileSync(
    path.join(root, 'node_modules', '.bin', 'esbuild'),
    [
      suitePath,
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${outfile}`,
      '--loader:.jsx=jsx',
      '--jsx=automatic',
      '--external:jsdom',
      '--external:react',
      '--external:react-dom',
      '--external:react/jsx-runtime',
      ...(suite.aliasElectron
        ? ['--external:electron', `--alias:electron=${path.join(root, 'scripts', 'electron-stub.mjs')}`]
        : []),
      '--log-level=warning',
    ],
    { cwd: root, stdio: 'inherit' },
  )
  execFileSync(process.execPath, [outfile], { cwd: root, stdio: 'inherit' })
}

console.log('\nAll checks passed.')
