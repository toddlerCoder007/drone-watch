// Turns tagged items into the cards the feed shows: one card per event, with
// every outlet's copy listed under it.

import { placeFor, type Place } from './geo'
import type { Conflict, Domain, NewsItem, Tag, Topic } from './types'

export type Card = {
  key: string
  lead: NewsItem
  items: NewsItem[]
  tag: Tag
  latestAt: string
  isNew: boolean
  place: Place | null
}

export type Filters = {
  domain: 'all' | Exclude<Domain, 'both'>
  conflicts: Conflict[]
  topics: Topic[]
  starredOnly: boolean
  newOnly: boolean
  /** Bluesky posts are mostly commentary, so they're hidden unless asked for. */
  includeSocial?: boolean
  /** A place picked on the map. */
  place?: string
}

export const NO_FILTERS: Filters = { domain: 'all', conflicts: [], topics: [], starredOnly: false, newOnly: false, includeSocial: false }

const time = (i: NewsItem) => Date.parse(i.publishedAt) || Date.parse(i.firstSeenAt) || 0

export function buildCards(
  items: NewsItem[],
  tags: Record<string, Tag>,
  lastVisit: string | null,
  fallback: (item: NewsItem) => Tag,
): Card[] {
  const groups = new Map<string, { items: NewsItem[]; tag: Tag }>()
  for (const item of items) {
    const tag = tags[item.id] ?? fallback(item)
    if (!tag.relevant) continue
    const key = tag.eventKey ? `e:${tag.eventKey}` : `i:${item.id}`
    const g = groups.get(key)
    if (g) g.items.push(item)
    else groups.set(key, { items: [item], tag })
  }

  const visit = lastVisit ? Date.parse(lastVisit) : 0
  return [...groups.entries()]
    .map(([key, g]) => {
      const sorted = [...g.items].sort((a, b) => time(b) - time(a))
      // Lead with a real outlet over a social post or digest line.
      const lead = sorted.find(i => i.sourceId !== 'bluesky' && i.sourceId !== 'wikipedia') ?? sorted[0]
      const latest = sorted[0]
      return {
        key,
        lead,
        items: sorted,
        tag: g.tag,
        latestAt: new Date(time(latest)).toISOString(),
        isNew: sorted.some(i => Date.parse(i.firstSeenAt) > visit),
        place: placeFor(lead, g.tag),
      }
    })
    .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt))
}

export function applyFilters(cards: Card[], f: Filters, starred: Set<string>): Card[] {
  return cards.filter(c => {
    if (!f.includeSocial && c.items.every(i => i.sourceId === 'bluesky')) return false
    if (f.domain !== 'all' && c.tag.domain !== f.domain && c.tag.domain !== 'both') return false
    if (f.conflicts.length && !f.conflicts.includes(c.tag.conflict)) return false
    if (f.topics.length && !c.tag.topics.some(t => f.topics.includes(t))) return false
    if (f.starredOnly && !c.items.some(i => starred.has(i.id))) return false
    if (f.newOnly && !c.isNew) return false
    if (f.place && c.place?.name !== f.place) return false
    return true
  })
}

export type Hotspot = Place & { count: number; keys: string[]; military: number; civilian: number; isNew: boolean }

/** Cards grouped by place, for the map. */
export function hotspots(cards: Card[]): Hotspot[] {
  const byName = new Map<string, Hotspot>()
  for (const c of cards) {
    if (!c.place) continue
    const h = byName.get(c.place.name) ?? { ...c.place, count: 0, keys: [], military: 0, civilian: 0, isNew: false }
    h.count++
    h.keys.push(c.key)
    if (c.tag.domain !== 'civilian') h.military++
    if (c.tag.domain !== 'military') h.civilian++
    h.isNew ||= c.isNew
    byName.set(c.place.name, h)
  }
  return [...byName.values()].sort((a, b) => b.count - a.count)
}
