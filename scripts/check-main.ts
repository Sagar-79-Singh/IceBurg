// Runs the real main-process modules (storage, secrets, streaming HTTP, Ollama
// detection and install) against a stubbed electron module and a local server.
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { BrowserWindow } from 'electron'
import type { PlanProbe } from '../electron/tools/match.ts'

/* This harness drives the real main-process modules through a stubbed electron
   module (see scripts/electron-stub.ts), so the imported 'electron' binds to the
   stub at run time. The cast here is the untyped test boundary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any

const stub = (await import('./electron-stub.ts')) as unknown as {
  handlers: Map<string, (event: unknown, ...args: unknown[]) => AnyResult>
  sent: Array<{ channel: string; payload: any }>
  app: { getPath(name: string): string; getVersion(): string }
  clipboard: { value: string; writeText(text: string): void }
}
const { handlers, sent, app, clipboard } = stub

const { registerStoreHandlers } = await import('../electron/store.ts')
const { registerSecretHandlers, getSecret } = await import('../electron/secrets.ts')
const { registerNetHandlers, abortAllStreams } = await import('../electron/net.ts')
const { registerOllamaHandlers } = await import('../electron/ollama.ts')
const { registerAppHandlers } = await import('../electron/app-info.ts')

const fakeWindow = { isDestroyed: () => false, webContents: { send: (channel: string, payload: unknown) => { sent.push({ channel, payload }) } } }
const getFakeWindow = () => fakeWindow as unknown as BrowserWindow
registerStoreHandlers()
registerSecretHandlers()
registerNetHandlers(getFakeWindow)
registerOllamaHandlers(getFakeWindow)
registerAppHandlers()

const call = (channel: string, ...args: unknown[]): Promise<AnyResult> => Promise.resolve(handlers.get(channel)!({ sender: {} }, ...args))

/* ---------- store ---------- */

assert.equal((await call('store:read', 'chats')).data, null, 'a missing document reads as null')
await call('store:write', 'chats', { chats: [{ id: 'a', messages: [] }], activeId: 'a' })
assert.equal((await call('store:read', 'chats')).data.chats[0].id, 'a')
const unknown = await call('store:read', 'nope')
assert.equal(unknown.ok, false, 'an unknown document is refused')
assert.match(unknown.message, /Unknown store/)
console.log('store round trip ok')

// A truncated file is set aside, not overwritten.
const chatsFile = path.join(app.getPath('userData'), 'chats.json')
fs.writeFileSync(chatsFile, '{"chats": [')
assert.equal((await call('store:read', 'chats')).data, null, 'a damaged file reads as null')
assert.ok(
  fs.readdirSync(app.getPath('userData')).some((name) => name.includes('.corrupt-')),
  'the damaged file is kept for recovery',
)
await call('store:write', 'chats', { chats: [], activeId: null })
console.log('corrupt file handling ok')

/* ---------- secrets ---------- */

await call('secrets:set', 'openrouter', 'sk-test-123')
assert.deepEqual(await call('secrets:list'), { openrouter: true })
assert.equal(await getSecret('openrouter'), 'sk-test-123', 'the main process can read the key')
const onDisk = fs.readFileSync(path.join(app.getPath('userData'), 'secrets.json'), 'utf8')
assert.ok(!onDisk.includes('sk-test-123'), 'the key is not stored as plaintext')
await call('secrets:set', 'openrouter', '')
assert.deepEqual(await call('secrets:list'), {}, 'an empty key removes the entry')
await call('secrets:set', 'openrouter', 'sk-test-456')
console.log('secrets ok, encrypted at rest')

/* ---------- streaming HTTP ---------- */

let noAuthHeader: string | undefined = 'unset'
const server = http.createServer((request, response) => {
  if (request.url === '/sse') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
    setTimeout(() => {
      response.write('data: {"choices":[{"delta":{"content":" sea"}}]}\n\n')
      response.end()
    }, 30)
    return
  }
  if (request.url === '/slow') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n')
    // Never ends on its own: the test aborts it.
    return
  }
  if (request.url === '/bad-key') {
    response.writeHead(401, { 'Content-Type': 'application/json' })
    response.end('{"error":{"message":"invalid api key"}}')
    return
  }
  if (request.url === '/json') {
    const header2 = request.headers.authorization
    noAuthHeader = header2 === undefined ? undefined : String(header2)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'model-a' }] }))
    return
  }
  response.writeHead(404)
  response.end()
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

// A normal stream: chunks arrive over IPC and the request finishes.
sent.length = 0
const streamed = await call('net:stream', {
  requestId: 'r1',
  url: `${base}/sse`,
  method: 'POST',
  headers: {},
  body: { hi: true },
})
assert.equal(streamed.ok, true)
await new Promise<void>((resolve) => setTimeout(resolve, 250))
const chunks = sent.filter((event) => event.channel === 'net:chunk').map((event) => event.payload.text)
assert.match(chunks.join(''), /Hello/)
assert.match(chunks.join(''), /sea/)
assert.ok(sent.some((event) => event.channel === 'net:done'), 'the stream reports completion')
console.log('streaming ok:', JSON.stringify(chunks))

// A key is attached from the encrypted store, not from the renderer — but only
// to the address saved for that provider. Save settings that point OpenRouter
// and the custom provider at a local server; note the saved OpenRouter base
// carries a trailing slash, which must still match.
const authServer = http.createServer((request, response) => {
  const header = request.headers.authorization
  seenAuth = header === undefined ? undefined : String(header)
  response.writeHead(200)
  response.end('{"data":[]}')
})
let seenAuth: string | undefined = ''
await new Promise<void>((resolve) => authServer.listen(0, '127.0.0.1', () => resolve()))
const authOrigin = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`
await call('store:write', 'settings', {
  theme: 'dark',
  activeProvider: 'ollama',
  providers: {
    openrouter: { baseUrl: `${authOrigin}/v1/`, model: '' },
    custom: { baseUrl: authOrigin, label: 'CloseRouter', model: 'm' },
  },
})

sent.length = 0
const streamedAuth = await call('net:stream', {
  requestId: 'r2',
  url: `${authOrigin}/models`,
  method: 'GET',
  auth: { providerId: 'openrouter', label: 'OpenRouter' },
})
await new Promise((resolve) => setTimeout(resolve, 120))
assert.equal(streamedAuth.ok, true, 'a provider-matching origin is allowed')
assert.equal(seenAuth, 'Bearer sk-test-456', 'the saved key is attached in the main process')
console.log('auth header ok (matching origin)')

// A different origin is refused before any network call, and the key is not sent.
let otherHits = 0
const otherServer = http.createServer((request, response) => {
  otherHits += 1
  const header = request.headers.authorization
  seenAuth = header === undefined ? undefined : String(header)
  response.writeHead(200)
  response.end('{"data":[]}')
})
await new Promise<void>((resolve) => otherServer.listen(0, '127.0.0.1', () => resolve()))
const otherOrigin = `http://127.0.0.1:${(otherServer.address() as AddressInfo).port}`
sent.length = 0
const refused = await call('net:stream', {
  requestId: 'r2c',
  url: `${otherOrigin}/models`,
  method: 'GET',
  auth: { providerId: 'openrouter', label: 'OpenRouter' },
})
assert.equal(refused.ok, false)
assert.equal(refused.code, 'auth-origin')
assert.match(refused.message, /isn't set for this provider/)
assert.equal(otherHits, 0, 'no request reached the other origin')
assert.ok(
  sent.some((event) => event.channel === 'net:error' && event.payload.code === 'auth-origin'),
  'the refusal is reported to the window',
)
otherServer.close()
console.log('auth origin refused ok')

// The same refusal applies to a different port on the same host.
seenAuth = 'unset'
const sameHostOtherPort = `http://127.0.0.1:1/models`
sent.length = 0
const refusedPort = await call('net:stream', {
  requestId: 'r2d',
  url: sameHostOtherPort,
  method: 'GET',
  auth: { providerId: 'openrouter', label: 'OpenRouter' },
})
assert.equal(refusedPort.ok, false)
assert.equal(refusedPort.code, 'auth-origin')
console.log('auth origin different port refused ok')

// A custom provider with no saved base URL has nothing to match, so it is refused too.
await call('store:write', 'settings', {
  theme: 'dark',
  activeProvider: 'ollama',
  providers: {
    openrouter: { baseUrl: `${authOrigin}/v1/`, model: '' },
    omniroute: { baseUrl: '', model: '' },
  },
})
sent.length = 0
const noBase = await call('net:stream', {
  requestId: 'r2e',
  url: `${authOrigin}/models`,
  method: 'GET',
  auth: { providerId: 'custom', label: 'CloseRouter', optional: true },
})
assert.equal(noBase.ok, false)
assert.equal(noBase.code, 'auth-origin')
console.log('custom without a saved address refused ok')

// Restore the custom base URL for the optional-key case.
await call('store:write', 'settings', {
  theme: 'dark',
  activeProvider: 'ollama',
  providers: {
    openrouter: { baseUrl: `${authOrigin}/v1/`, model: '' },
    custom: { baseUrl: authOrigin, label: 'CloseRouter', model: 'm' },
  },
})

// An optional key means no header at all.
seenAuth = 'unset'
const optionalResult = await call('net:stream', {
  requestId: 'r2b',
  url: `${authOrigin}/models`,
  method: 'GET',
  auth: { providerId: 'custom', label: 'CloseRouter', optional: true },
})
assert.equal(optionalResult.ok, true)
await new Promise((resolve) => setTimeout(resolve, 120))
assert.equal(seenAuth, undefined, 'an optional key sends no header')
console.log('optional key ok')

// A bad key becomes a readable failure, not a crash.
sent.length = 0
await call('net:stream', { requestId: 'r3', url: `${base}/bad-key`, method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 120))
const failure = sent.find((event) => event.channel === 'net:error')
assert.ok(failure, 'the failure is reported')
assert.equal(failure.payload.status, 401)
assert.match(failure.payload.body, /invalid api key/)
console.log('http failure ok')

// Aborting a stream stops it and clears the request.
sent.length = 0
await call('net:stream', { requestId: 'r4', url: `${base}/slow`, method: 'POST' })
await new Promise((resolve) => setTimeout(resolve, 60))
await call('net:abort', 'r4')
await new Promise((resolve) => setTimeout(resolve, 80))
const after = sent.filter((event) => event.payload.requestId === 'r4').length
assert.ok(after >= 1)
await call('net:abort', 'r4') // aborting twice is harmless
abortAllStreams()
console.log('abort ok')

// A refused connection says what is wrong.
sent.length = 0
const dead = await call('net:stream', { requestId: 'r5', url: 'http://127.0.0.1:59999/nope', method: 'GET' })
console.log('refused result:', JSON.stringify(dead), '| events:', JSON.stringify(sent.filter((e) => e.payload?.requestId === 'r5')))
assert.equal(dead.ok, false)
assert.ok(sent.some((event) => event.channel === 'net:error' && event.payload.code === 'refused'))
console.log('refused connection ok')

// Only http and https are allowed.
const bad = await call('net:stream', { requestId: 'r6', url: 'file:///etc/passwd' })
assert.equal(bad.ok, false)
assert.match(bad.message, /http and https/)
console.log('url guard ok')

// The Ollama local path sends no auth field at all; it must work without a key.
noAuthHeader = 'unset'
const ollamaPath = await call('net:stream', {
  requestId: 'r7',
  url: `${base}/json`,
  method: 'GET',
})
assert.equal(ollamaPath.ok, true, 'a request without auth goes through')
assert.equal(noAuthHeader, undefined, 'no Authorization header is invented for the local path')
console.log('ollama local no-key path ok')

/* ---------- ollama detection ---------- */

// Nothing on 11434 yet: the app must say "not running" rather than throw.
const down = await call('ollama:detect')
assert.equal(down.running, false)
assert.equal(typeof down.installed, 'boolean')
console.log('ollama down ok:', JSON.stringify(down))

// Now pretend to be Ollama.
const ollamaServer = http.createServer((request, response) => {
  if (request.url === '/api/tags') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        models: [
          { name: 'llama3.2:latest', size: 2019393189, details: { family: 'llama', parameter_size: '3.2B' } },
        ],
      }),
    )
    return
  }
  response.writeHead(404)
  response.end()
})
let bound = true
await new Promise<void>((resolve) => {
  ollamaServer.once('error', () => {
    bound = false
    resolve()
  })
  ollamaServer.listen(11434, '127.0.0.1', () => resolve())
})
if (bound) {
  const up = await call('ollama:detect')
  assert.equal(up.running, true)
  assert.equal(up.models[0].name, 'llama3.2:latest')
  assert.equal(up.models[0].parameters, '3.2B')
  console.log('ollama detection ok:', JSON.stringify(up.models))
  ollamaServer.close()
} else {
  console.log('ollama detection skipped: port 11434 busy')
}

/* ---------- install never runs unasked ---------- */

assert.equal(sent.filter((event) => event.channel === 'ollama:install-progress').length, 0, 'no install on launch')
if (process.platform === 'linux') {
  // No terminal in this sandbox: it must say so and offer the script instead.
  const result = await call('ollama:install')
  assert.equal(result.ok, false)
  assert.match(result.message, /terminal/i)
  assert.equal(result.script, 'https://ollama.com/install.sh')
  console.log('linux install fallback ok')
} else {
  console.log('install path skipped on', process.platform)
}

/* ---------- clipboard and links ---------- */

await call('clipboard:write', 'copied code')
assert.equal(clipboard.value, 'copied code')
assert.equal((await call('shell:open-external', 'file:///etc/passwd')).ok, false, 'only https links leave the app')
assert.equal((await call('shell:open-external', 'https://ollama.com')).ok, true)
assert.equal((await call('app:info')).encrypted, true)
console.log('clipboard, links and app info ok')

/* ---------- computer tasks: resolver and the IPC door ---------- */

const { registerToolsHandlers } = await import('../electron/tools/index.ts')
const { gatherApps, matchLaunchIntent, resolvePlan, desktopExec } = await import('../electron/tools/match.ts')

// The matcher only takes a single, known tool name.
const { catalog } = await import('../electron/tools/catalog.ts')
assert.equal(matchLaunchIntent('open youtube', catalog)?.tool.id, 'youtube')
assert.equal(matchLaunchIntent('Open the YouTube app', catalog)?.tool.id, 'youtube')
assert.equal(matchLaunchIntent('/open spotify', catalog)?.tool.id, 'spotify')
assert.equal(matchLaunchIntent('Can you open youtube please??', catalog)?.tool.id, 'youtube')
assert.equal(matchLaunchIntent('Can youa open the yt please??', catalog)?.tool.id, 'youtube')
assert.equal(matchLaunchIntent('could you please open up the gmail app', catalog)?.tool.id, 'gmail')
assert.equal(matchLaunchIntent('I want to open spotify', catalog)?.tool.id, 'spotify')
assert.equal(matchLaunchIntent("i'd like to open spotify", catalog)?.tool.id, 'spotify')
assert.equal(matchLaunchIntent('please can you open the brave browser', catalog)?.tool.id, 'brave')
assert.equal(matchLaunchIntent('would you mind opening claude', catalog)?.tool.id, 'claude')
assert.equal(matchLaunchIntent('hey iceburg open gmail', catalog)?.tool.id, 'gmail')
assert.equal(matchLaunchIntent('open xyzzy-not-a-tool', catalog), null)
assert.equal(matchLaunchIntent('browse the web', catalog), null)
assert.equal(matchLaunchIntent('how do i open youtube on my tv', catalog), null, 'questions go to the model')
assert.equal(matchLaunchIntent('what does open youtube mean', catalog), null)
assert.equal(matchLaunchIntent('open youtube and play lofi', catalog), null, 'compound asks go to the model')
assert.equal(matchLaunchIntent("dont open youtube", catalog), null, 'negations never open anything')
assert.equal(matchLaunchIntent('never open spotify', catalog), null)
const { matchActionIntent } = await import('../electron/tools/match.ts')
const ty = 'Play Koi Mila Gaya song on Youtbe'
assert.equal(matchActionIntent(ty, catalog)?.tool.id, 'youtube')
assert.equal(matchActionIntent(ty, catalog)?.action, 'play')
assert.equal(matchActionIntent(ty, catalog)?.query, 'Koi Mila Gaya song')
assert.equal(matchActionIntent('play never gonna give you up on youtube', catalog)?.query, 'never gonna give you up')
assert.equal(matchActionIntent('search invoices on gmail', catalog)?.tool.id, 'gmail')
assert.equal(matchActionIntent('search for invoices on gmail', catalog)?.query, 'invoices')
assert.equal(matchActionIntent('search koi mila gaya on youtube', catalog)?.action, 'search')
assert.equal(matchActionIntent('find roasts on reddit', catalog)?.tool.id, 'reddit')
assert.equal(matchActionIntent('can you play kashmir jaana on youtube please', catalog)?.query, 'kashmir jaana')
assert.equal(matchActionIntent('play despacito', catalog), null, 'no tool, no task')
assert.equal(matchActionIntent('search something on xyzzy', catalog), null)
assert.equal(matchActionIntent('play on youtube', catalog), null)
assert.equal(matchLaunchIntent('never open spotify', catalog), null)
const { matchCompoundIntent } = await import('../electron/tools/match.ts')
const compound = (text: string) => {
  const m = matchCompoundIntent(text, catalog)
  return m ? { tool: m.tool.id, action: m.action, query: m.query } : null
}
assert.deepEqual(compound('Hey yo bro can you open youtube and play "Koi Mil Gaya" song sung by Tony Kakkar'),
  { tool: 'youtube', action: 'play', query: 'Koi Mil Gaya song sung by Tony Kakkar' })
assert.deepEqual(compound('open youtube and play never gonna give you up'),
  { tool: 'youtube', action: 'play', query: 'never gonna give you up' })
assert.deepEqual(compound('open gmail and search invoices'),
  { tool: 'gmail', action: 'search', query: 'invoices' })
assert.deepEqual(compound('open youtube and play no woman no cry'),
  { tool: 'youtube', action: 'play', query: 'no woman no cry' })
assert.deepEqual(compound('open youtube and play koi mil gaya on spotify'),
  { tool: 'spotify', action: 'play', query: 'koi mil gaya' })
assert.deepEqual(compound('open the youtube app and search deno'),
  { tool: 'youtube', action: 'search', query: 'deno' })
assert.equal(compound("dont open youtube and play x"), null, 'negations before the verb are refused')
assert.equal(compound('open youtube later'), null, 'a trailing non-action is not a task')
assert.equal(compound('open xyzzy and play something'), null)
console.log('compound intent ok')
console.log('intent matching ok')

// Short display names: the raw id leaves the window chrome, the store keeps it.
const { shortModelName } = await import('../src/lib/modelName.ts')
assert.equal(shortModelName('R4C3R/qwen2.5-coder-0.5b-heretic:latest'), 'Qwen 2.5 Coder')
assert.equal(shortModelName('llama3.2:3b'), 'Llama 3.2')
assert.equal(shortModelName('deepseek-r1:14b'), 'DeepSeek R1')
assert.equal(shortModelName('gemma-3-27b-it'), 'Gemma 3')
assert.equal(shortModelName('qwen3-coder-30b-a3b-instruct'), 'Qwen 3 Coder')
assert.equal(shortModelName('gpt-4o-mini'), 'GPT 4o Mini')
assert.equal(shortModelName('claude-sonnet-4.5'), 'Claude Sonnet 4.5')
assert.equal(shortModelName('openrouter/meta-llama/llama-3.1-8b-instruct'), 'Llama 3.1')
assert.equal(shortModelName(''), '')
assert.equal(shortModelName(null), '')
console.log('short model names ok')

const { cleanModelTitle } = await import('../src/lib/title.ts')
assert.equal(cleanModelTitle('"Koi Mil Gaya Remake"'), 'Koi Mil Gaya Remake')
assert.equal(cleanModelTitle('Title: Guitar tutorial\nsome trailing prose'), 'Guitar tutorial')
assert.equal(cleanModelTitle('ok'), '')
assert.equal(cleanModelTitle('Got it.'), 'Got it')
console.log('title cleaning ok')

// A fake Linux desktop: a YouTube PWA, a native Discord, a broken entry. Keyed by
// file name only, so the fixture behaves identically on Windows runners.
const desktopFiles = {
  'chrome-abcdefg-YouTube.desktop':
    '[Desktop Entry]\nType=Application\nName=YouTube\nExec=/usr/bin/google-chrome --app-id=abcdefg --profile-directory=Default %U\n',
  'discord.desktop':
    '[Desktop Entry]\nType=Application\nName=Discord\nExec=/opt/discord/Discord %U\n',
  'broken.desktop': '[Desktop Entry]\nName=Broken\n',
}
const fakeIo = {
  homedir: '/home/fake',
  env: {},
  readdirSync: (dir: string) => {
    const names = dir === '/usr/share/applications' ? Object.keys(desktopFiles) : []
    return names.map((name) => ({ name, isFile: () => true }))
  },
  readFileSync: (file: string) => {
    const baseName = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1)
    const content = (desktopFiles as Record<string, string>)[baseName]
    if (content === undefined) throw new Error(`no fake file ${baseName}`)
    return content
  },
}
const linuxApps = gatherApps('linux', fakeIo)
assert.equal(linuxApps.length, 2, 'broken desktop entries are skipped')
assert.equal(linuxApps.find((app) => app.name === 'YouTube')?.kind, 'pwa')
assert.equal(linuxApps.find((app) => app.name === 'Discord')?.kind, 'native')
assert.deepEqual(desktopExec('/usr/bin/google-chrome --app-id=abc %U'), ['/usr/bin/google-chrome', '--app-id=abc'])
console.log('desktop scan ok')

// Resolution priority: native install -> PWA -> website.
const youtube = catalog.find((tool) => tool.id === 'youtube')
const discord = catalog.find((tool) => tool.id === 'discord')
const spotify = catalog.find((tool) => tool.id === 'spotify')
if (!youtube || !discord || !spotify) throw new Error('catalog is missing youtube/discord/spotify')
const withPwa = { exists: () => false, which: () => null, apps: linuxApps }
assert.equal(resolvePlan(youtube, withPwa, 'linux').kind, 'pwa')
assert.equal(resolvePlan(youtube, { exists: () => false, which: () => null, apps: [] }, 'linux').kind, 'web')
assert.equal(resolvePlan(discord, withPwa, 'linux').kind, 'native')
assert.equal(
  resolvePlan(spotify, { exists: () => false, which: () => '/usr/bin/spotify', apps: [] }, 'linux').kind,
  'native',
  'a bare command found on PATH is a native install',
)
assert.equal(resolvePlan(spotify, { exists: () => false, which: () => null, apps: [] }, 'linux').kind, 'web')
console.log('resolution priority ok')

// The IPC door: heavy services ask first; nothing launches without confirmation.
let probe: { exists: (candidate: string) => boolean; which: (command: string) => string | null; apps: typeof linuxApps } = { exists: () => false, which: () => null, apps: [] }
let running = false
const calls = { launch: [] as Array<{ kind: string }>, spawn: [] as string[][] }
registerToolsHandlers({
  platform: 'linux',
  gather: () => probe,
  isRunning: async () => running,
  launch: async (plan) => {
    calls.launch.push(plan)
  },
  spawnProc: (argv) => {
    calls.spawn.push(argv)
  },
})
const toolCall = (text: string, confirmed?: boolean): Promise<any> =>
  handlers.get('tools:find-and-open')!({ sender: {} }, text, { confirmed })

const notTool = await toolCall('hello there')
assert.equal(notTool.matched, false, 'ordinary chat is not intercepted')

const ask = await toolCall('open omniroute')
assert.equal(ask.needsConfirmation, true, 'a heavy service asks before starting')
assert.equal(calls.spawn.length, 0, 'nothing was started before the confirmation')

probe = { exists: () => false, which: () => '/usr/local/bin/omniroute', apps: [] }
const started = await toolCall('open omniroute', true)
assert.equal(started.ok, true)
assert.equal(started.kind, 'started')
assert.deepEqual(calls.spawn, [['/usr/local/bin/omniroute']])

const askAgain = await toolCall('open freellmapi')
assert.equal(askAgain.needsConfirmation, true)
const freellmapi = await toolCall('open freellmapi', true)
assert.equal(freellmapi.ok, true, 'homepage opens when it cannot be started')
assert.equal(calls.spawn.length, 1, 'FreeLLMAPI is never spawned')

running = true
calls.spawn.length = 0
const openDashboard = await toolCall('open omniroute')
assert.equal(openDashboard.needsConfirmation, true, 'even the running dashboard asks first')
const dashboard = await toolCall('open omniroute', true)
assert.equal(dashboard.ok, true)
assert.equal(dashboard.kind, 'service')
assert.equal(calls.spawn.length, 0, 'a running service is not spawned again')

// Action intents through the same door: fetch is injected; URLs are captured
// unless we flip to the real PWA-aware opener for one scenario.
const { openParameterizedUrl } = await import('../electron/tools/index.ts')
const openedUrls: string[] = []
const fakeHtml = '<html>{"videoRenderer":{"videoId":"dQw4w9WgXcQ"}}</html>'
let fetchBehavior: (...args: Parameters<typeof fetch>) => Promise<{ ok: boolean; text: () => Promise<string> }> = async () => ({ ok: true, text: async () => fakeHtml })
let useRealOpenUrl = false
registerToolsHandlers({
  platform: 'linux',
  gather: () => probe,
  isRunning: async () => running,
  launch: async (plan) => {
    calls.launch.push(plan)
  },
  spawnProc: (argv) => {
    calls.spawn.push(argv)
  },
  fetchImpl: ((...args: Parameters<typeof fetch>) => fetchBehavior(...args)) as unknown as typeof fetch,
  openUrl: async (url: string, tool: (typeof catalog)[number], args: { platform?: string; gather?: (platform: string) => PlanProbe; spawnProc?: (argv: string[]) => void }) => {
    if (useRealOpenUrl) {
      // openParameterizedUrl returns 'pwa' | 'browser' — the door only cares that it opened.
      return openParameterizedUrl(url, tool, args) as unknown as Promise<string>
    }
    openedUrls.push(url)
    return 'browser'
  },
})
const actionCall = (text: string, confirmed?: boolean): Promise<any> =>
  handlers.get('tools:find-and-open')!({ sender: {} }, text, { confirmed })

const play = await actionCall('Play Koi Mila Gaya song on Youtbe')
assert.equal(play.ok, true)
assert.equal(play.kind, 'play')
assert.match(play.message, /Playing “Koi Mila Gaya song” on YouTube/)
assert.equal(openedUrls.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1')

const search = await actionCall('search invoices on gmail')
assert.equal(search.ok, true)
assert.equal(openedUrls.at(-1), 'https://mail.google.com/mail/u/0/#search/invoices')

const unsupported = await actionCall('search time on omniroute')
assert.equal(unsupported.ok, false)
assert.match(unsupported.message, /can't search/i)

// YouTube unreachable: falls back to the results page.
fetchBehavior = async () => {
  throw new Error('network down')
}
openedUrls.length = 0
const fallbackPlay = await actionCall('play koi mila gaya on youtube')
assert.equal(fallbackPlay.ok, true)
assert.equal(fallbackPlay.kind, 'web')
assert.equal(openedUrls.at(-1), 'https://www.youtube.com/results?search_query=koi%20mila%20gaya')
assert.match(fallbackPlay.message, /search/i)
fetchBehavior = async () => ({ ok: true, text: async () => fakeHtml })

// Installed YouTube PWA: the URL rides the app's own launch command.
calls.spawn.length = 0
openedUrls.length = 0
probe = { exists: () => false, which: () => null, apps: [
  { name: 'YouTube', exec: '/usr/bin/google-chrome --app-id=abcdefg %U', path: '/usr/share/applications/yt.desktop', source: 'desktop', kind: 'pwa' },
] }
useRealOpenUrl = true
const pwaPlay = await actionCall('play koi mila gaya on youtube')
assert.equal(pwaPlay.ok, true)
const pwaArgv = calls.spawn.at(-1)
assert.ok(pwaArgv, 'the PWA spawn happened')
assert.ok(pwaArgv.includes('--app-id=abcdefg'), 'the PWA launch command is reused')
assert.equal(pwaArgv.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1')
assert.equal(openedUrls.length, 0, 'the browser is not involved when the PWA takes it')
useRealOpenUrl = false
probe = { exists: () => false, which: () => null, apps: [] }

// Search-page parsing: first real video wins; Shorts shelves are skipped;
// "random" picks from the top few instead of always #1.
const { extractInitialData, collectVideoIds, pickVideoFromHtml } = await import('../electron/tools/index.ts')
const ytData = {
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  { videoRenderer: { videoId: 'video000001', title: { runs: [{ text: 'First' }] } } },
                  { videoRenderer: { videoId: 'video000002', title: { runs: [{ text: 'Second' }] } } },
                  { reelShelfRenderer: { items: [{ shortsVideoRenderer: { videoId: 'shorts00001' } }] } },
                  { videoRenderer: { videoId: 'video000003', title: { runs: [{ text: 'Third' }] } } },
                ],
              },
            },
            {
              itemSectionRenderer: {
                contents: [{ lockupViewModel: {} }, { videoRenderer: { videoId: 'video000004' } }],
              },
            },
          ],
        },
      },
    },
  },
}
const ytHtml = `<script>window.ytInitialData = ${JSON.stringify(ytData)};</script>`
const parsed = extractInitialData(ytHtml)
assert.ok(parsed, 'ytInitialData parses')
assert.deepEqual(collectVideoIds(parsed), ['video000001', 'video000002', 'video000003', 'video000004'])
assert.equal(pickVideoFromHtml(ytHtml, 'koi mil gaya'), 'video000001')
for (let i = 0; i < 20; i += 1) {
  const pick = pickVideoFromHtml(ytHtml, 'a random song')
  assert.ok(pick !== null && ['video000001', 'video000002', 'video000003', 'video000004'].includes(pick), 'random pick is a real video')
  assert.notEqual(pick, 'shorts00001', 'Shorts are never chosen')
}
assert.equal(pickVideoFromHtml('<html>{"videoId":"dQw4w9WgXcQ"}</html>', 'x'), 'dQw4w9WgXcQ', 'regex fallback still works')
assert.equal(pickVideoFromHtml('<html>nothing</html>', 'x'), null)
console.log('youtube result parsing ok')

const richFetch = async () => ({ ok: true, text: async () => ytHtml })
fetchBehavior = richFetch
openedUrls.length = 0
const parsedPlay = await actionCall('Play whatever on youtube')
assert.equal(parsedPlay.ok, true)
assert.equal(openedUrls.at(-1), 'https://www.youtube.com/watch?v=video000001&autoplay=1')
fetchBehavior = async () => ({ ok: true, text: async () => fakeHtml })

// Compound intents through the same door: the exact message from the report.
const compoundCall = await actionCall('Hey yo bro can you open youtube and play "Koi Mil Gaya" song sung by Tony Kakkar')
assert.equal(compoundCall.ok, true)
assert.equal(compoundCall.kind, 'play')
assert.match(compoundCall.message, /Playing “Koi Mil Gaya song sung by Tony Kakkar”/)
assert.equal(openedUrls.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1')
assert.equal(compoundCall.title, 'Play Koi Mil Gaya song sung by Tony Kakkar')
const compoundSearch = await actionCall('open gmail and search invoices')
assert.equal(compoundSearch.ok, true)
assert.equal(openedUrls.at(-1), 'https://mail.google.com/mail/u/0/#search/invoices')
assert.equal(compoundSearch.title, 'Search invoices')
console.log('compound intent paths ok')

running = false
const webFallback = await toolCall('open youtube')
assert.equal(webFallback.ok, true)
assert.equal(webFallback.kind, 'web')
assert.match(webFallback.message, /No installed YouTube found/)

probe = { exists: () => false, which: () => null, apps: [
  { name: 'YouTube', exec: '/usr/bin/google-chrome --app-id=abcdefg %U', path: '/usr/share/applications/yt.desktop', source: 'desktop', kind: 'pwa' },
] }
const pwa = await toolCall('open youtube')
assert.equal(pwa.kind, 'pwa')
assert.equal(calls.launch.at(-1)?.kind, 'pwa')
console.log('service confirmation and PWA paths ok')

server.close()
authServer.close()
console.log('\nall main-process checks passed')
process.exit(0)
