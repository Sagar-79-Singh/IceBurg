// The "computer tasks" feature: open an app, a PWA or a website from the chat
// box by typing "open <thing>". Nothing here asks the model for permission and
// nothing here runs user-supplied shell commands. Only catalogued tools are
// launched, through the OS: shell.openExternal / shell.openPath / a detached
// spawn with an argv array. Resolution order is: native app -> installed PWA ->
// website. Heavy local services (OmniRoute, FreeLLMAPI) always ask first.
import { ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { catalog, type ToolCatalogEntry } from './catalog.ts'
import {
  desktopExec,
  gatherApps,
  matchActionIntent,
  matchCompoundIntent,
  matchLaunchIntent,
  resolvePlan,
  type PlanProbe,
  type ResolvePlanResult,
} from './match.ts'
import type { ToolOpenResult } from '../../shared/ipc.ts'

interface ActionBase {
  matched: true
  tool: string
  label: string
  url: string
  action: string
  query: string
  title: string
}

type OpenParameterizedDeps = {
  platform?: string
  gather?: (platform: string) => PlanProbe
  spawnProc?: (argv: string[]) => void
}

type ActionDeps = {
  platform: string
  gather: (platform: string) => PlanProbe
  spawnProc: (argv: string[]) => void
  fetchImpl: typeof fetch
  openUrl: (url: string, tool: ToolCatalogEntry, deps: OpenParameterizedDeps) => Promise<string>
}

const capTitle = (text: string): string => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean
}
const titleCase = (action: string, query: string): string => (action === 'play' ? `Play ${query}` : `Search ${query}`)

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/* YouTube search pages embed their data as JSON in `ytInitialData`. Reading that
   properly is the whole difference between "plays the first real video" and
   "plays whatever Shorts shelf the HTML happened to open with". The scanner is a
   balanced-brace walk, string-aware, and the walk that collects ids skips the
   Shorts and Reels subtrees entirely. */
export function extractInitialData(html: unknown): unknown {
  const source = typeof html === 'string' ? html : String(html || '')
  const at = source.indexOf('ytInitialData')
  if (at === -1) return null
  const equals = source.indexOf('=', at)
  if (equals === -1) return null
  let i = equals + 1
  while (source[i] === ' ' || source[i] === '\n' || source[i] === '\r') i += 1
  if (source[i] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let j = i; j < source.length; j += 1) {
    const ch = source[j]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(i, j + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const SKIP_SUBTREES = new Set([
  'reelShelfRenderer',
  'reelItemRenderer',
  'shortsVideoRenderer',
  'shortsLockupViewModel',
])

export function collectVideoIds(node: unknown, out: string[] = [], depth = 0): string[] {
  if (!node || depth > 64) return out
  if (Array.isArray(node)) {
    for (const item of node) collectVideoIds(item, out, depth + 1)
    return out
  }
  if (typeof node !== 'object') return out
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (SKIP_SUBTREES.has(key)) continue
    const value = (node as Record<string, unknown>)[key]
    const videoId = (value as { videoId?: unknown } | null | undefined)?.videoId
    if (key === 'videoRenderer' && value && typeof videoId === 'string') {
      if (typeof videoId === 'string') out.push(videoId)
      continue
    }
    collectVideoIds(value, out, depth + 1)
  }
  return out
}

/** Pick the best video for a search page: the first real video, or a random one
 *  of the top ones when the user asked for something random. */
export function pickVideoFromHtml(html: string, query: string): string | null {
  const data = extractInitialData(html)
  let ids = data ? [...new Set(collectVideoIds(data))] : []
  if (!ids.length) {
    // Very old pages or mobile HTML: fall back to the first videoId anywhere.
    const match = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/) || html.match(/watch\?v=([A-Za-z0-9_-]{11})/)
    if (match && match[1]) ids = [match[1]]
  }
  if (!ids.length) return null
  if (/\brandom\b/i.test(query) && ids.length > 1) {
    const pool = ids.slice(0, 12)
    return pool[Math.floor(Math.random() * pool.length)] ?? null
  }
  return ids[0] ?? null
}

async function openExternal(url: string): Promise<void> {
  // Only ever hand http(s) links to the user's browser; dashboard URLs are
  // localhost and web fallbacks are https, all constants from the catalog.
  if (!/^https?:\/\//i.test(url)) throw new Error(`Refusing to open "${url}"`)
  await shell.openExternal(url)
}

// Parameterized tasks always open a URL. Where Linux + a chrome-style PWA is
// installed, the URL is handed to that app's window (in-scope). Otherwise the OS
// default browser handles it. Never a shell, never app-specific URI schemes.
export async function openParameterizedUrl(
  url: string,
  tool: ToolCatalogEntry,
  { platform = process.platform, gather = defaultGather, spawnProc = spawnDetached }: OpenParameterizedDeps = {},
): Promise<string> {
  try {
    const plan = resolvePlan(tool, gather(platform), platform)
    const pwaTarget = typeof plan.target === 'string' ? null : plan.target
    if (platform === 'linux' && plan.kind === 'pwa' && pwaTarget && typeof pwaTarget.exec === 'string') {
      spawnProc([...desktopExec(pwaTarget.exec), url])
      return 'pwa'
    }
  } catch {
    /* fall through to the browser */
  }
  await openExternal(url)
  return 'browser'
}

async function playYouTube(
  tool: ToolCatalogEntry,
  query: string,
  encoded: string,
  base: ActionBase,
  { platform, gather, spawnProc, fetchImpl, openUrl }: ActionDeps,
): Promise<ToolOpenResult> {
  let videoId: string | null = null
  try {
    const response = await fetchImpl(`https://www.youtube.com/results?search_query=${encoded}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    if (response?.ok) {
      const html = await response.text()
      videoId = pickVideoFromHtml(html, query)
    }
  } catch {
    videoId = null
  }
  const url = videoId
    ? `https://www.youtube.com/watch?v=${videoId}&autoplay=1`
    : `https://www.youtube.com/results?search_query=${encoded}`
  try {
    await openUrl(url, tool, { platform, gather, spawnProc })
  } catch (error) {
    return { ...base, ok: false, kind: 'play', message: `Could not open YouTube: ${(error as Error)?.message || error}` }
  }
  return {
    ...base,
    ok: true,
    kind: videoId ? 'play' : 'web',
    message: videoId
      ? `Playing “${query}” on YouTube.`
      : `Couldn't fetch the video directly — opened the YouTube search for “${query}” instead.`,
  }
}

export function spawnDetached(argv: string[]): void {
  const [command, ...args] = argv
  if (!command) return
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

const whichOn = (command: string, env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string | null => {
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    const base = path.join(dir, command)
    if (platform === 'win32') {
      for (const ext of ['.exe', '.cmd', '.bat']) {
        if (fs.existsSync(base + ext)) return base + ext
      }
    }
    if (fs.existsSync(base)) return base
    // npm global installs land in <prefix>/bin, which is usually on PATH already.
  }
  return null
}

export function defaultGather(platform: string = process.platform): PlanProbe {
  const home = os.homedir()
  const env = process.env
  const exists = (candidate: string) => {
    try {
      return fs.existsSync(candidate)
    } catch {
      return false
    }
  }
  const apps = gatherApps(platform, {
    homedir: home,
    env,
    readdirSync: (dir: string, options: { withFileTypes: true }) => fs.readdirSync(dir, options),
    readFileSync: (file: string, _encoding: 'utf8') => fs.readFileSync(file, 'utf8'),
  })
  return { exists, which: (command) => whichOn(command, env, platform), apps }
}

// Launching is injectable so the checks never spawn a real process.
export function defaultLaunch(plan: ResolvePlanResult, platform: string = process.platform): Promise<void> {
  if (plan.kind === 'web') {
    const target = typeof plan.target === 'string' ? plan.target : plan.target.path
    return openExternal(target)
  }
  if (platform === 'linux') {
    const exec = typeof plan.target === 'string' ? plan.target : plan.target.exec
    const argv = typeof exec === 'string' ? desktopExec(exec) : []
    if (!argv[0]) throw new Error('That app has no launch command.')
    spawnDetached(argv)
    return Promise.resolve()
  }
  // Windows (.lnk or .exe) and macOS (.app bundle) both open through the shell.
  const target = typeof plan.target === 'string' ? plan.target : plan.target.path
  return Promise.resolve(shell.openPath(target)).then((failure) => {
    if (failure) throw new Error(failure)
  })
}

export function defaultIsRunning(port: number, host = '127.0.0.1', timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (value: boolean): void => {
      socket.destroy()
      resolve(value)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(timeoutMs, () => done(false))
  })
}

const resultMessage = (tool: ToolCatalogEntry, plan: ResolvePlanResult): string => {
  switch (plan.kind) {
    case 'native':
      return `Opened ${tool.name} in your installed app.`
    case 'pwa':
      return `Opened ${tool.name} in its installed app.`
    case 'web':
      return plan.via === 'fallback'
        ? `${tool.name} would not start, so I opened ${tool.web} in your browser.`
        : `No installed ${tool.name} found, so I opened ${tool.web} in your browser.`
    default:
      return `Opened ${tool.name}.`
  }
}

/**
 * Find the tool the text asks for, decide how to open it, open it.
 * Returns a small, human-friendly result the renderer can show as a note.
 */
async function handleAction({ tool, action, query }: { tool: ToolCatalogEntry; action: string; query: string }, deps: ActionDeps): Promise<ToolOpenResult> {
  const { platform, gather, spawnProc, fetchImpl, openUrl } = deps
  const base: ActionBase = {
    matched: true,
    tool: tool.id,
    label: tool.name,
    url: tool.web,
    action,
    query,
    title: capTitle(titleCase(action, query)),
  }
  const encoded = encodeURIComponent(query)
  if (action === 'play' && tool.id === 'youtube') {
    return playYouTube(tool, query, encoded, base, { platform, gather, spawnProc, fetchImpl, openUrl })
  }
  if (!tool.searchUrl) {
    return {
      ...base,
      ok: false,
      kind: 'unsupported',
      message: `I can't ${action} things on ${tool.name} from here yet. I can open it though — say "open ${tool.name.toLowerCase()}".`,
    }
  }
  const url = tool.searchUrl.replace('%s', encoded)
  try {
    await openUrl(url, tool, { platform, gather, spawnProc })
    return {
      ...base,
      ok: true,
      kind: 'web',
      message:
        action === 'play'
          ? `Opened ${tool.name} search for “${query}” — only YouTube can auto-play from here for now.`
          : `Searching ${tool.name} for “${query}”.`,
    }
  } catch (error) {
    return { ...base, ok: false, kind: 'web', message: `Could not open ${tool.name}: ${(error as Error)?.message || error}` }
  }
}

export interface FindAndOpenOptions {
  platform?: string
  gather?: (platform: string) => PlanProbe
  launch?: (plan: ResolvePlanResult, platform: string) => Promise<void>
  confirmed?: boolean
  isRunning?: (port: number, host?: string, timeoutMs?: number) => Promise<boolean>
  spawnProc?: (argv: string[]) => void
  fetchImpl?: typeof fetch
  openUrl?: (url: string, tool: ToolCatalogEntry, deps: OpenParameterizedDeps) => Promise<string>
}

export async function findAndOpen(rawText: string, options: FindAndOpenOptions = {}): Promise<ToolOpenResult> {
  const {
    platform = process.platform,
    gather = defaultGather,
    launch = defaultLaunch,
    confirmed = false,
    isRunning = defaultIsRunning,
    spawnProc = spawnDetached,
    fetchImpl = (url, init) => globalThis.fetch(url, init),
    openUrl = openParameterizedUrl,
  } = options

  const deps: ActionDeps = { platform, gather, spawnProc, fetchImpl, openUrl }

  /* ---- compound: "open youtube and play X" ---- */
  const compound = matchCompoundIntent(rawText, catalog)
  if (compound) return handleAction(compound, deps)

  /* ---- parameterized tasks: "play X on youtube", "search Y on gmail" ---- */
  const action = matchActionIntent(rawText, catalog)
  if (action) return handleAction(action, deps)

  const matched = matchLaunchIntent(rawText, catalog)
  if (!matched) return { matched: false }

  const { tool } = matched
  const base = { matched: true, tool: tool.id, label: tool.name, url: tool.web, title: capTitle(`Open ${tool.name}`) }

  /* ---- heavy local services: always ask first ---- */
  if (tool.service) {
    const { port, dashboard } = tool.service
    let running = false
    try {
      running = await isRunning(port)
    } catch {
      running = false
    }
    if (!confirmed) {
      const confirmText = running
        ? `Open the ${tool.name} dashboard at ${dashboard}?`
        : tool.service.start
          ? `${tool.name} is not running on port ${port}. Start it in the background with "${tool.service.start[0]}" and open its dashboard?`
          : `${tool.name} is not running on port ${port}. Starting it needs Docker or its own desktop app. Open ${tool.web} instead?`
      return { ...base, needsConfirmation: true, kind: 'service', confirmText, running }
    }
    if (running) {
      await openExternal(dashboard)
      return { ...base, ok: true, kind: 'service', message: `Opened the ${tool.name} dashboard.`, title: capTitle(`Open ${tool.name}`) }
    }
    const serviceStart = tool.service.start
    if (serviceStart) {
      const probe = gather(platform)
      const serviceBin = serviceStart[0] ?? ''
      const binary = probe.which?.(serviceBin)
      if (!binary) {
        return {
          ...base,
          ok: false,
          kind: 'service',
          message: `${tool.name} is not installed ("${serviceBin}" is not on PATH). Install it first: npm install -g ${serviceBin}`,
        }
      }
      try {
        spawnProc([binary, ...serviceStart.slice(1)])
      } catch (error) {
        return { ...base, ok: false, kind: 'service', message: `${tool.name} would not start: ${(error as Error)?.message || error}` }
      }
      await openExternal(dashboard)
      return {
        ...base,
        ok: true,
        kind: 'started',
        message: `Started ${tool.name} and opened its dashboard. Give it a few seconds to come up.`,
        title: capTitle(`Open ${tool.name}`),
      }
    }
    // Cannot be started from here: open the homepage with the reason.
    await openExternal(tool.web)
    return {
      ...base,
      ok: true,
      kind: 'web',
      message: `${tool.name} is not running on port ${port}. Start it with Docker (or its desktop app) and ask again — for now, ${tool.web} is open.`,
      title: capTitle(`Open ${tool.name}`),
    }
  }

  /* ---- everything else: native app -> PWA -> website ---- */
  const plan = resolvePlan(tool, gather(platform), platform)

  if (plan.kind === 'web') {
    try {
      await openExternal(tool.web)
      return { ...base, ok: true, kind: 'web', via: 'web', message: resultMessage(tool, plan) }
    } catch (error) {
      return { ...base, ok: false, kind: 'web', message: `Could not open ${tool.web}: ${(error as Error)?.message || error}` }
    }
  }

  try {
    await launch(plan, platform)
    return { ...base, ok: true, kind: plan.kind, message: resultMessage(tool, plan) }
  } catch (error) {
    // It answered the probe but would not start; the website still will.
    try {
      await openExternal(tool.web)
      return {
        ...base,
        ok: true,
        kind: 'web',
        via: 'fallback',
        message: resultMessage(tool, { ...plan, via: 'fallback' }),
      }
    } catch (fallbackError) {
      return { ...base, ok: false, kind: plan.kind, message: `Could not open ${tool.name}: ${(fallbackError as Error)?.message || fallbackError}` }
    }
  }
}

export function registerToolsHandlers(options: FindAndOpenOptions = {}): void {
  ipcMain.handle(
    'tools:find-and-open',
    (_event, rawText: string, requestOptions: { confirmed?: boolean } = {}): Promise<ToolOpenResult> =>
      findAndOpen(String(rawText || ''), { ...options, confirmed: Boolean(requestOptions?.confirmed) }),
  )
}
