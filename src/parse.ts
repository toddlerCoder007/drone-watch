// Pure parsers: turn each source's raw response into NewsItems.

import type { NewsItem } from './types'

export function hashId(input: string): string {
  // FNV-1a, 32-bit: short, stable, good enough to key articles by URL.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'at_medium' || key === 'at_campaign') u.searchParams.delete(key)
    }
    return u.toString()
  } catch {
    return url
  }
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function toIso(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const t = Date.parse(value)
  return Number.isNaN(t) ? fallback : new Date(t).toISOString()
}

type Src = { id: string; name: string }

function makeItem(src: Src, title: string, url: string, publishedAt: string, snippet: string, now: string): NewsItem {
  const clean = normaliseUrl(url)
  return {
    id: hashId(clean),
    title: title.trim(),
    url: clean,
    sourceId: src.id,
    sourceName: src.name,
    publishedAt,
    snippet: snippet.slice(0, 400),
    firstSeenAt: now,
  }
}

/** RSS 2.0 or Atom. */
export function parseFeed(xml: string, src: Src, now: string): NewsItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Feed is not valid XML')
  const items: NewsItem[] = []

  for (const el of Array.from(doc.querySelectorAll('item'))) {
    const title = el.querySelector('title')?.textContent ?? ''
    const link = el.querySelector('link')?.textContent?.trim() || el.querySelector('guid')?.textContent?.trim() || ''
    const date = el.querySelector('pubDate')?.textContent ?? el.getElementsByTagName('dc:date')[0]?.textContent
    const desc = el.querySelector('description')?.textContent ?? ''
    if (title && link) items.push(makeItem(src, title, link, toIso(date, now), stripHtml(desc), now))
  }

  for (const el of Array.from(doc.querySelectorAll('entry'))) {
    const title = el.querySelector('title')?.textContent ?? ''
    const linkEl = el.querySelector('link[rel="alternate"]') ?? el.querySelector('link')
    const link = linkEl?.getAttribute('href') ?? ''
    const date = el.querySelector('updated')?.textContent ?? el.querySelector('published')?.textContent
    const desc = el.querySelector('summary')?.textContent ?? el.querySelector('content')?.textContent ?? ''
    if (title && link) items.push(makeItem(src, title, link, toIso(date, now), stripHtml(desc), now))
  }

  return items
}

type GdeltResponse = { articles?: { url: string; title: string; seendate?: string; domain?: string }[] }

/** GDELT seendate looks like 20261118T143000Z. */
function gdeltDate(s: string | undefined, now: string): string {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : now
}

export function parseGdelt(json: GdeltResponse, src: Src, now: string): NewsItem[] {
  return (json.articles ?? [])
    .filter(a => a.url && a.title)
    .map(a => makeItem({ id: src.id, name: a.domain ? `${a.domain} (via GDELT)` : src.name }, a.title, a.url, gdeltDate(a.seendate, now), '', now))
}

type WikiResponse = { parse?: { text?: string } }

/** Current-events portal: one item per bullet that mentions drones. */
export function parseWikipedia(json: WikiResponse, src: Src, now: string, isDroneText: (s: string) => boolean): NewsItem[] {
  const html = json.parse?.text ?? ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items: NewsItem[] = []
  for (const li of Array.from(doc.querySelectorAll('li'))) {
    if (li.querySelector('li')) continue // only leaf bullets
    const text = (li.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text || !isDroneText(text)) continue
    const ext = li.querySelector('a.external') as HTMLAnchorElement | null
    const url = ext?.getAttribute('href') ?? `https://en.wikipedia.org/wiki/Portal:Current_events#${hashId(text)}`
    const title = text.replace(/\s*\([^)]*\)\s*$/, '') // drop trailing "(Reuters)"
    // Each day's block is headed "November 18, 2026 (2026-11-18) (Wednesday)".
    const day = li.closest('.current-events')?.textContent?.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1]
    const published = day ? `${day}T00:00:00.000Z` : now
    items.push(makeItem(src, title.slice(0, 240), url, published, text, now))
  }
  return items
}

type BskyResponse = {
  posts?: { uri: string; author: { handle: string; displayName?: string }; record: { text?: string; createdAt?: string }; indexedAt?: string }[]
}

export function parseBluesky(json: BskyResponse, src: Src, now: string): NewsItem[] {
  return (json.posts ?? [])
    .filter(p => p.record?.text)
    .map(p => {
      const rkey = p.uri.split('/').pop()
      const url = `https://bsky.app/profile/${p.author.handle}/post/${rkey}`
      const text = p.record.text!.replace(/\s+/g, ' ').trim()
      const title = `@${p.author.handle}: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`
      return makeItem(src, title, url, toIso(p.record.createdAt ?? p.indexedAt, now), text, now)
    })
}
