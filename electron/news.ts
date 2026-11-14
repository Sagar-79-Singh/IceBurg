import { ipcMain } from 'electron'
import { IPC, type NewsHeadlinesResult } from '../shared/ipc.ts'
import { parseGoogleNewsRss, feedUrlForLanguage } from '../shared/news.ts'

// Startup briefing news: top headlines from the public Google News RSS feed.
// No key, no account, fetched in the main process because the renderer is not
// allowed to open sockets of its own. Any failure is reported, never thrown:
// the face says the news is unavailable and the app goes on as usual.

const TIMEOUT_MS = 6000

async function fetchHeadlines(language: string): Promise<NewsHeadlinesResult> {
  const url = feedUrlForLanguage(language)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Google News RSS serves everyone; identify honestly.
        'User-Agent': 'Mozilla/5.0 (compatible; IceBurg/0.7; startup briefing)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
    if (!response.ok) {
      return { ok: false, items: [], message: `News feed answered with HTTP ${response.status}.` }
    }
    const xml = await response.text()
    const items = parseGoogleNewsRss(xml, 8)
    if (items.length === 0) {
      return { ok: false, items: [], message: 'The news feed came back empty.' }
    }
    return { ok: true, items }
  } catch (error) {
    const reason = (error as Error)?.name === 'AbortError' ? 'timed out' : String((error as Error)?.message || error)
    return { ok: false, items: [], message: `Could not fetch the news (${reason}).` }
  } finally {
    clearTimeout(timer)
  }
}

export function registerNewsHandlers(): void {
  ipcMain.handle(IPC.newsHeadlines, (_event, language?: string) => fetchHeadlines(String(language || 'english')))
}
