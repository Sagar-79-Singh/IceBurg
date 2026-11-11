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
import { catalog } from './catalog.js'
import { desktopExec, gatherApps, matchLaunchIntent, resolvePlan } from './match.js'

async function openExternal(url) {
  // Only ever hand http(s) links to the user's browser; dashboard URLs are
  // localhost and web fallbacks are https, all constants from the catalog.
  if (!/^https?:\/\//i.test(url)) throw new Error(`Refusing to open "${url}"`)
  await shell.openExternal(url)
}

export function spawnDetached(argv) {
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

const whichOn = (command, env = process.env, platform = process.platform) => {
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

export function defaultGather(platform = process.platform) {
  const home = os.homedir()
  const env = process.env
  const exists = (candidate) => {
    try {
      return fs.existsSync(candidate)
    } catch {
      return false
    }
  }
  const apps = gatherApps(platform, {
    homedir: home,
    env,
    readdirSync: (dir, options) => fs.readdirSync(dir, options),
    readFileSync: (file, encoding) => fs.readFileSync(file, encoding),
  })
  return { exists, which: (command) => whichOn(command, env, platform), apps }
}

// Launching is injectable so the checks never spawn a real process.
export function defaultLaunch(plan, platform = process.platform) {
  if (plan.kind === 'web') {
    return openExternal(plan.target)
  }
  if (platform === 'linux') {
    const entry = typeof plan.target === 'string' ? { exec: plan.target } : plan.target
    const argv = typeof entry.exec === 'string' ? desktopExec(entry.exec) : [plan.target]
    if (!argv.length) throw new Error('That app has no launch command.')
    spawnDetached(argv)
    return Promise.resolve()
  }
  // Windows (.lnk or .exe) and macOS (.app bundle) both open through the shell.
  const target = typeof plan.target === 'string' ? plan.target : plan.target.path
  return Promise.resolve(shell.openPath(target)).then((failure) => {
    if (failure) throw new Error(failure)
  })
}

export function defaultIsRunning(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(timeoutMs, () => done(false))
  })
}

const resultMessage = (tool, plan) => {
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
export async function findAndOpen(rawText, options = {}) {
  const {
    platform = process.platform,
    gather = defaultGather,
    launch = defaultLaunch,
    confirmed = false,
    isRunning = defaultIsRunning,
    spawnProc = spawnDetached,
  } = options

  const matched = matchLaunchIntent(rawText, catalog)
  if (!matched) return { matched: false }

  const { tool } = matched
  const base = { matched: true, tool: tool.id, label: tool.name, url: tool.web }

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
      return { ...base, ok: true, kind: 'service', message: `Opened the ${tool.name} dashboard.` }
    }
    if (tool.service.start) {
      const probe = gather(platform)
      const binary = probe.which?.(tool.service.start[0])
      if (!binary) {
        return {
          ...base,
          ok: false,
          kind: 'service',
          message: `${tool.name} is not installed ("${tool.service.start[0]}" is not on PATH). Install it first: npm install -g ${tool.service.start[0]}`,
        }
      }
      try {
        spawnProc([binary, ...tool.service.start.slice(1)])
      } catch (error) {
        return { ...base, ok: false, kind: 'service', message: `${tool.name} would not start: ${error.message}` }
      }
      await openExternal(dashboard)
      return {
        ...base,
        ok: true,
        kind: 'started',
        message: `Started ${tool.name} and opened its dashboard. Give it a few seconds to come up.`,
      }
    }
    // Cannot be started from here: open the homepage with the reason.
    await openExternal(tool.web)
    return {
      ...base,
      ok: true,
      kind: 'web',
      message: `${tool.name} is not running on port ${port}. Start it with Docker (or its desktop app) and ask again — for now, ${tool.web} is open.`,
    }
  }

  /* ---- everything else: native app -> PWA -> website ---- */
  const plan = resolvePlan(tool, gather(platform), platform)

  if (plan.kind === 'web') {
    try {
      await openExternal(tool.web)
      return { ...base, ok: true, kind: 'web', via: 'web', message: resultMessage(tool, plan) }
    } catch (error) {
      return { ...base, ok: false, kind: 'web', message: `Could not open ${tool.web}: ${error.message}` }
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
      return { ...base, ok: false, kind: plan.kind, message: `Could not open ${tool.name}: ${fallbackError.message}` }
    }
  }
}

export function registerToolsHandlers(options = {}) {
  ipcMain.handle('tools:find-and-open', (_event, rawText, requestOptions = {}) =>
    findAndOpen(rawText, { ...options, confirmed: Boolean(requestOptions?.confirmed) }),
  )
}
