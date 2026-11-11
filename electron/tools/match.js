// Tool detection and resolution. Pure Node: no electron imports, so the check
// suite can exercise every branch against synthetic file layouts.
import os from 'node:os'
import path from 'node:path'

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_\-+.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Words that carry no intent of their own. Only these may appear BEFORE the
// verb — anything else (how, what, why, never, don't...) sends the message to
// the model instead of opening things. Never add negations here.
const FILLERS = new Set((
  'can cna colud could would woudl will may shall yu you ya youa yall ' +
  'please pls plz plese kindly just hey hi yo iceburg i me id im ' +
  'want wants wanna need needs to a an the so ok okay like love let ' +
  'ahead and um uh mind please would_you ive got have get'
).split(' ').filter(Boolean))

// Allowed after the target, e.g. "can you open youtube please for me".
const TRAILING_FILLERS = new Set([
  'please', 'pls', 'plz', 'for', 'me', 'now', 'app', 'application',
  'website', 'web', 'site', 'page', 'link', 'okay', 'ok', 'thanks', 'browser',
])

const VERBS = ['open', 'opening', 'launch', 'launching', 'start', 'starting', 'run', 'running', 'goto']
const LEADING_DROPS = ['the', 'my', 'a', 'an', 'this', 'that', 'up']

/**
 * Computer tasks in conversation, not just bare commands:
 * "open youtube", "Can you open youtube please??", "could you please open up
 * the gmail app", "/open spotify", "I want to open youtube for me"...
 * Only a single, known tool name is ever accepted — anything else goes to the model.
 */
export function matchLaunchIntent(text, catalogList) {
  let s = String(text || '').toLowerCase().trim()
  if (s.startsWith('/')) s = s.slice(1).trim()
  s = s.replace(/['’]/g, '').replace(/[?!.,;:…()"“”`]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return null
  let tokens = s.split(' ')

  // Strip leading filler words; the first real word must be a verb.
  let cursor = 0
  while (cursor < tokens.length && FILLERS.has(tokens[cursor])) cursor += 1
  tokens = tokens.slice(cursor)
  if (tokens[0] === 'go' && tokens[1] === 'to') {
    tokens = tokens.slice(2)
  } else if (tokens[0] && VERBS.includes(tokens[0])) {
    tokens = tokens.slice(1)
  } else {
    return null
  }
  // "open up youtube"
  if (tokens[0] === 'up') tokens = tokens.slice(1)
  while (tokens.length && LEADING_DROPS.includes(tokens[0])) tokens = tokens.slice(1)
  while (tokens.length && TRAILING_FILLERS.has(tokens[tokens.length - 1])) tokens.pop()

  const phrase = normalizeName(tokens.join(' '))
  if (!phrase) return null
  for (const tool of catalogList) {
    if (normalizeName(tool.name) === phrase) return { tool, phrase }
    for (const keyword of tool.keywords || []) {
      if (normalizeName(keyword) === phrase) return { tool, phrase }
    }
  }
  return null
}

export function expandEnv(value, env = process.env) {
  return String(value || '').replace(/%([^%]+)%/g, (_m, name) => env[name] ?? '')
}

export function isPathLike(candidate) {
  return /^([a-zA-Z]:[\\/]|[\\/]|~[\\/])/.test(candidate)
}

// "Exec=flatpak run com.spotify.Client --app-id=x %U" -> ["flatpak", "run", "com.spotify.Client", "--app-id=x"]
export function desktopExec(exec) {
  const tokens = String(exec || '').match(/(?:[^\s"]+|"[^"]*")+/g) || []
  return tokens
    .map((token) => token.replace(/^"|"$/g, ''))
    .filter((token) => token && !/^%[a-zA-Z]$/.test(token))
}

function parseDesktop(raw) {
  const entry = {}
  for (const line of String(raw).split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9-]*)=(.*)$/.exec(line.trim())
    if (match && !entry[match[1]]) entry[match[1]] = match[2].trim()
  }
  return entry
}

/**
 * Scan the places apps live and describe what was found. Each entry is
 * { name, exec, path, source, kind } with kind "pwa" or "native".
 */
export function gatherApps(platform, io = {}) {
  const home = io.homedir || os.homedir()
  const env = io.env || process.env
  const readFileSync = io.readFileSync
  const readdirSync = io.readdirSync
  const apps = []
  const listDir = (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
  }

  if (platform === 'linux') {
    const dirs = [
      path.join(home, '.local', 'share', 'applications'),
      path.join(home, '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
      '/usr/share/applications',
      '/var/lib/flatpak/exports/share/applications',
    ]
    for (const dir of dirs) {
      for (const dirent of listDir(dir)) {
        if (!dirent.isFile?.() && !dirent.name?.endsWith('.desktop')) continue
        if (!dirent.name.endsWith('.desktop')) continue
        let parsed
        try {
          parsed = parseDesktop(readFileSync(path.join(dir, dirent.name), 'utf8'))
        } catch {
          continue
        }
        if (parsed.Type && parsed.Type !== 'Application') continue
        if (!parsed.Name || !parsed.Exec) continue
        apps.push({
          name: parsed.Name,
          exec: parsed.Exec,
          path: path.join(dir, dirent.name),
          source: 'desktop',
          kind: /--app-id=/.test(parsed.Exec) ? 'pwa' : 'native',
        })
      }
    }
    return apps
  }

  if (platform === 'win32') {
    const dirs = [env.APPDATA, env.ProgramData, env.LOCALAPPDATA]
      .filter(Boolean)
      .flatMap((root) => [
        path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Chrome Apps'),
        path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Edge Apps'),
      ])
    for (const dir of dirs) {
      for (const dirent of listDir(dir)) {
        if (!dirent.name?.toLowerCase().endsWith('.lnk')) continue
        apps.push({
          name: dirent.name.replace(/\.lnk$/i, ''),
          exec: null,
          path: path.join(dir, dirent.name),
          source: 'lnk',
          kind: 'pwa',
        })
      }
    }
    return apps
  }

  if (platform === 'darwin') {
    const dirs = ['/Applications', path.join(home, 'Applications')]
    for (const dir of dirs) {
      for (const dirent of listDir(dir)) {
        if (!dirent.name?.endsWith('.app')) continue
        const bundle = path.join(dir, dirent.name)
        let kind = 'native'
        try {
          const plist = readFileSync(path.join(bundle, 'Contents', 'Info.plist'), 'utf8')
          if (plist.includes('app_mode_loader')) kind = 'pwa'
        } catch {
          /* not a plist we can read; treat as a normal app */
        }
        apps.push({
          name: dirent.name.replace(/\.app$/i, ''),
          exec: null,
          path: bundle,
          source: 'app',
          kind,
        })
      }
    }
    return apps
  }

  return apps
}

/**
 * Decide how to open a tool on this machine. Native app first, then an
 * installed PWA, then the website. Returns { kind, label, target }.
 */
export function resolvePlan(tool, probe, platform = process.platform) {
  const { exists, which, apps = [] } = probe

  const candidates = tool.native?.[platform] || []
  for (const raw of candidates) {
    const expanded = expandEnv(raw)
    if (expanded && isPathLike(expanded)) {
      if (exists?.(expanded)) return { kind: 'native', label: tool.name, target: expanded, via: 'path' }
    } else if (expanded) {
      const hit = which?.(expanded)
      if (hit) return { kind: 'native', label: tool.name, target: hit, via: 'path' }
    }
  }

  const wanted = [tool.name, ...(tool.keywords || [])].map(normalizeName)
  const nativeEntry = apps.find(
    (entry) => entry.kind === 'native' && wanted.includes(normalizeName(entry.name)),
  )
  if (nativeEntry) {
    return { kind: 'native', label: tool.name, target: nativeEntry, via: 'desktop' }
  }

  const pwaNames = (tool.pwa || []).map(normalizeName)
  const pwaEntry = apps.find(
    (entry) => entry.kind === 'pwa' && pwaNames.includes(normalizeName(entry.name)),
  )
  if (pwaEntry) {
    return { kind: 'pwa', label: tool.name, target: pwaEntry, via: pwaEntry.source }
  }

  return { kind: 'web', label: tool.name, target: tool.web, via: 'web' }
}
