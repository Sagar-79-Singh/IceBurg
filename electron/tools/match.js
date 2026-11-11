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

const OPEN_RE = /^(?:please\s+)?(?:open|launch|start|run|go\s+to|goto)\s+(?:the\s+|my\s+|a\s+|an\s+)?(.+)$/i
const TRAILING_NOISE = /\s+(app|application|website|web ?site|site|page|link)$/i

/**
 * "open youtube", "open the YouTube app", "/open youtube", "launch spotify"...
 * Only a single, known tool name is accepted; anything else goes to the model.
 */
export function matchLaunchIntent(text, catalogList) {
  const input = String(text || '').trim().replace(/^\/?\s*open\s+/i, 'open ')
  const match = OPEN_RE.exec(input.replace(/[?!.,]+$/, ''))
  if (!match) return null
  let phrase = normalizeName(match[1])
  phrase = phrase.replace(TRAILING_NOISE, '').trim()
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
