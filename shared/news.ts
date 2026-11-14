/* Google News RSS, parsed by hand. No dependency: the feed is small, the
 * structure is stable, and everything on this path must degrade quietly when
 * the machine is offline or Google returns something unexpected. */
import type { NewsHeadline } from './ipc.ts'

export type { NewsHeadline } from './ipc.ts'

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decode the entities that actually appear in Google News RSS, numeric ones included. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITY_MAP[body.toLowerCase()] ?? match
  })
}

const unwrapCdata = (raw: string): string =>
  raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

const tag = (block: string, name: string): string => {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  if (!match) return ''
  const inner = match[1] ?? ''
  return decodeEntities(unwrapCdata(inner).trim())
}

const collapseWs = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Strip Google's " - Source Name" title suffix when the <source> tag carries the same name. */
const splitTitleSource = (title: string, source: string): string => {
  if (!source) {
    const idx = title.lastIndexOf(' - ')
    return idx > 24 ? title.slice(0, idx) : title
  }
  const suffix = ` - ${source}`
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title
}

export function parseGoogleNewsRss(xml: string, limit = 8): NewsHeadline[] {
  if (typeof xml !== 'string' || !xml.includes('<item')) return []
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  const headlines: NewsHeadline[] = []
  for (const block of items) {
    if (headlines.length >= limit) break
    const rawTitle = collapseWs(tag(block, 'title'))
    const link = collapseWs(tag(block, 'link'))
    const pubDate = collapseWs(tag(block, 'pubDate'))
    const source = collapseWs(tag(block, 'source'))
    const title = collapseWs(splitTitleSource(rawTitle, source))
    if (!title) continue
    headlines.push({
      title: title.slice(0, 220),
      source: source.slice(0, 80),
      link,
      pubDate,
    })
  }
  return headlines
}

/** The edition that matches the UI language: Hindi interface reads the Hindi feed, everything else reads English/India. */
export function feedUrlForLanguage(language: string): string {
  const normalized = (language || '').trim().toLowerCase()
  if (normalized === 'hindi' || normalized === 'hi') {
    return 'https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi'
  }
  return 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en'
}
