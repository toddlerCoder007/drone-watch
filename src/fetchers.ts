import { SOURCES, proxyPath, type SourceDef } from '../feeds.config'
import { isDroneText } from './keywords'
import { parseBluesky, parseFeed, parseGdelt, parseWikipedia } from './parse'
import { load, save } from './storage'
import type { NewsItem, SourceStatus } from './types'

// GDELT asks for at most one request every 5 s and rate-limits hard, so a
// refresh reuses its last answer for 10 minutes.
const GDELT_MIN_GAP_MS = 10 * 60 * 1000

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchSource(src: SourceDef, now: string): Promise<NewsItem[]> {
  const url = src.proxied ? proxyPath(src.id) : src.url
  switch (src.kind) {
    case 'rss': {
      const items = parseFeed(await fetchText(url), src, now)
      return src.droneOnly ? items : items.filter(i => isDroneText(`${i.title} ${i.snippet}`))
    }
    case 'gdelt': {
      const last = load<{ at: number; items: NewsItem[] } | null>('gdeltCache', null)
      if (last && Date.now() - last.at < GDELT_MIN_GAP_MS) return last.items
      const backoffUntil = load<number>('gdeltBackoffUntil', 0)
      if (Date.now() < backoffUntil) {
        throw new Error(`rate-limited; retrying after ${new Date(backoffUntil).toLocaleTimeString()}`)
      }
      let text: string
      try {
        text = await fetchText(url)
      } catch (err) {
        // A 429 from GDELT carries no CORS header, so the browser only says
        // "Failed to fetch". Back off instead of hammering it.
        save('gdeltBackoffUntil', Date.now() + GDELT_MIN_GAP_MS)
        throw new Error(`rate-limited or unreachable (${String((err as Error).message ?? err)}); retrying in 10 min`)
      }
      // GDELT answers rate limits with a plain-text 200 sometimes.
      if (!text.trimStart().startsWith('{')) {
        save('gdeltBackoffUntil', Date.now() + GDELT_MIN_GAP_MS)
        throw new Error(text.slice(0, 120))
      }
      const items = parseGdelt(JSON.parse(text), src, now).filter(i => isDroneText(i.title))
      save('gdeltCache', { at: Date.now(), items })
      return items
    }
    case 'wikipedia':
      return parseWikipedia(JSON.parse(await fetchText(url)), src, now, isDroneText)
    case 'bluesky':
      return parseBluesky(JSON.parse(await fetchText(url)), src, now).filter(i => isDroneText(i.snippet))
  }
}

export type FetchResult = { items: NewsItem[]; status: Record<string, SourceStatus> }

/** Fetches every source in parallel; one failing source never sinks the rest. */
export async function fetchAll(): Promise<FetchResult> {
  const now = new Date().toISOString()
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s, now)))
  const items: NewsItem[] = []
  const status: Record<string, SourceStatus> = {}
  results.forEach((r, i) => {
    const src = SOURCES[i]
    if (r.status === 'fulfilled') {
      items.push(...r.value)
      status[src.id] = { ok: true, count: r.value.length, at: now }
    } else {
      status[src.id] = { ok: false, count: 0, error: String(r.reason?.message ?? r.reason), at: now }
    }
  })
  return { items, status }
}
