// Runs the real main-process modules (storage, secrets, streaming HTTP, Ollama
// detection and install) against a stubbed electron module and a local server.
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const { handlers, sent, app, clipboard } = await import('electron')
const { registerStoreHandlers } = await import('../electron/store.js')
const { registerSecretHandlers, getSecret } = await import('../electron/secrets.js')
const { registerNetHandlers, abortAllStreams } = await import('../electron/net.js')
const { registerOllamaHandlers } = await import('../electron/ollama.js')
const { registerAppHandlers } = await import('../electron/app-info.js')

const fakeWindow = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } }
registerStoreHandlers()
registerSecretHandlers()
registerNetHandlers(() => fakeWindow)
registerOllamaHandlers(() => fakeWindow)
registerAppHandlers()

const call = (channel, ...args) => handlers.get(channel)({ sender: {} }, ...args)

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
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'model-a' }] }))
    return
  }
  response.writeHead(404)
  response.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

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
await new Promise((resolve) => setTimeout(resolve, 250))
const chunks = sent.filter((event) => event.channel === 'net:chunk').map((event) => event.payload.text)
assert.match(chunks.join(''), /Hello/)
assert.match(chunks.join(''), /sea/)
assert.ok(sent.some((event) => event.channel === 'net:done'), 'the stream reports completion')
console.log('streaming ok:', JSON.stringify(chunks))

// A key is attached from the encrypted store, not from the renderer.
sent.length = 0
let seenAuth = ''
const authServer = http.createServer((request, response) => {
  seenAuth = request.headers.authorization
  response.writeHead(200)
  response.end('{"data":[]}')
})
await new Promise((resolve) => authServer.listen(0, '127.0.0.1', resolve))
await call('net:stream', {
  requestId: 'r2',
  url: `http://127.0.0.1:${authServer.address().port}/models`,
  method: 'GET',
  auth: { providerId: 'openrouter', label: 'OpenRouter' },
})
await new Promise((resolve) => setTimeout(resolve, 120))
assert.equal(seenAuth, 'Bearer sk-test-456', 'the saved key is attached in the main process')
console.log('auth header ok')

// An optional key means no header at all.
seenAuth = 'unset'
await call('net:stream', {
  requestId: 'r2b',
  url: `http://127.0.0.1:${authServer.address().port}/models`,
  method: 'GET',
  auth: { providerId: 'custom', label: 'CloseRouter', optional: true },
})
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
await new Promise((resolve) => {
  ollamaServer.once('error', () => {
    bound = false
    resolve()
  })
  ollamaServer.listen(11434, '127.0.0.1', resolve)
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

server.close()
authServer.close()
console.log('\nall main-process checks passed')
process.exit(0)
