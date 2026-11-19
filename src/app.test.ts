import { describe, expect, it } from 'vitest'
import { applyFilters, buildCards, NO_FILTERS } from './cards'
import { isDroneText, keywordTag } from './keywords'
import { normaliseUrl, parseBluesky, parseFeed, parseGdelt, parseWikipedia } from './parse'
import { mergeItems } from './storage'
import type { NewsItem, Tag } from './types'

const NOW = '2026-11-19T10:00:00.000Z'
const src = { id: 'test', name: 'Test' }

describe('parseFeed', () => {
  it('reads RSS items', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Drone strike on Kharkiv</title><link>https://ex.com/a?utm_source=x</link>
      <pubDate>Tue, 18 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;Russian &lt;b&gt;Shahed&lt;/b&gt; drones&lt;/p&gt;</description></item>
    </channel></rss>`
    const [item] = parseFeed(xml, src, NOW)
    expect(item.title).toBe('Drone strike on Kharkiv')
    expect(item.url).toBe('https://ex.com/a')
    expect(item.publishedAt).toBe('2026-11-18T08:00:00.000Z')
    expect(item.snippet).toBe('Russian Shahed drones')
  })

  it('reads Atom entries', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>UK sends counter-drone systems</title><link rel="alternate" href="https://gov.uk/x"/>
      <updated>2026-11-18T09:00:00Z</updated><summary>Air defence</summary></entry></feed>`
    const [item] = parseFeed(xml, src, NOW)
    expect(item.url).toBe('https://gov.uk/x')
    expect(item.publishedAt).toBe('2026-11-18T09:00:00.000Z')
  })

  it('rejects non-XML (e.g. a bot-check page)', () => {
    expect(() => parseFeed('<html><body>Just a moment', src, NOW)).toThrow()
  })
})

describe('other parsers', () => {
  it('parses GDELT dates and domains', () => {
    const [item] = parseGdelt({ articles: [{ url: 'https://n.com/1', title: 'Drone hits depot', seendate: '20261118T143000Z', domain: 'n.com' }] }, src, NOW)
    expect(item.publishedAt).toBe('2026-11-18T14:30:00Z')
    expect(item.sourceName).toBe('n.com (via GDELT)')
  })

  it('keeps only drone bullets from Wikipedia', () => {
    const html =
      '<div class="current-events"><div class="current-events-title">November 18, 2026 (2026-11-18) (Wednesday)</div>' +
      '<ul><li>Ukrainian drones strike a refinery in Ryazan. <a class="external" href="https://r.com/x">(Reuters)</a></li><li>An election is held.</li></ul></div>'
    const items = parseWikipedia({ parse: { text: html } }, src, NOW, isDroneText)
    expect(items).toHaveLength(1)
    expect(items[0].publishedAt).toBe('2026-11-18T00:00:00.000Z')
    expect(items[0].url).toBe('https://r.com/x')
    expect(items[0].title).toBe('Ukrainian drones strike a refinery in Ryazan.')
  })

  it('builds Bluesky post links', () => {
    const [item] = parseBluesky(
      { posts: [{ uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', author: { handle: 'osint.bsky.social' }, record: { text: 'FPV drone footage', createdAt: NOW } }] },
      src,
      NOW,
    )
    expect(item.url).toBe('https://bsky.app/profile/osint.bsky.social/post/3kxyz')
  })

  it('normalises tracking params', () => {
    expect(normaliseUrl('https://a.com/x?utm_medium=rss&id=2#top')).toBe('https://a.com/x?id=2')
  })
})

describe('keywords', () => {
  it('spots drone stories and not unrelated ones', () => {
    expect(isDroneText('Iran-made Shahed drones hit Odesa')).toBe(true)
    expect(isDroneText('Counter-drone lasers tested by the Army')).toBe(true)
    expect(isDroneText('Parliament passes the budget')).toBe(false)
  })

  it('tags conflict and domain', () => {
    const t = keywordTag('Russian drones strike Kyiv overnight')
    expect(t.conflict).toBe('Ukraine–Russia')
    expect(t.domain).toBe('military')
    expect(keywordTag('FAA approves drone delivery in Texas').domain).toBe('civilian')
  })
})

const item = (id: string, title: string, publishedAt: string, firstSeenAt = publishedAt, sourceId = 's'): NewsItem => ({
  id,
  title,
  url: `https://x.com/${id}`,
  sourceId,
  sourceName: sourceId,
  publishedAt,
  snippet: '',
  firstSeenAt,
})

const tag = (over: Partial<Tag>): Tag => ({
  relevant: true,
  domain: 'military',
  conflict: 'Ukraine–Russia',
  topics: ['Strikes & combat'],
  summary: '',
  eventKey: '',
  by: 'claude',
  ...over,
})

describe('cards', () => {
  it('groups stories sharing an eventKey and drops irrelevant ones', () => {
    const items = [
      item('a', 'Kyiv drone attack', '2026-11-19T08:00:00Z'),
      item('b', 'Drones hit Kyiv', '2026-11-19T09:00:00Z'),
      item('c', 'Bees', '2026-11-19T09:30:00Z'),
    ]
    const tags = { a: tag({ eventKey: 'kyiv-attack' }), b: tag({ eventKey: 'kyiv-attack' }), c: tag({ relevant: false }) }
    const cards = buildCards(items, tags, null, () => tag({}))
    expect(cards).toHaveLength(1)
    expect(cards[0].items.map(i => i.id)).toEqual(['b', 'a'])
    expect(cards[0].isNew).toBe(true)
  })

  it('marks only stories first seen after the last visit as new', () => {
    const items = [item('a', 'Old drone story', '2026-11-18T08:00:00Z', '2026-11-18T08:00:00Z'), item('b', 'New drone story', '2026-11-19T08:00:00Z')]
    const cards = buildCards(items, {}, '2026-11-18T12:00:00Z', () => tag({}))
    expect(cards.find(c => c.lead.id === 'a')!.isNew).toBe(false)
    expect(cards.find(c => c.lead.id === 'b')!.isNew).toBe(true)
  })

  it('filters by domain, keeping "both"', () => {
    const items = [item('m', 'm', NOW), item('c', 'c', NOW), item('x', 'x', NOW)]
    const tags = { m: tag({ domain: 'military' }), c: tag({ domain: 'civilian', conflict: 'None' }), x: tag({ domain: 'both' }) }
    const cards = buildCards(items, tags, null, () => tag({}))
    const civ = applyFilters(cards, { ...NO_FILTERS, domain: 'civilian' }, new Set())
    expect(civ.map(c => c.lead.id).sort()).toEqual(['c', 'x'])
  })

  it('hides Bluesky-only cards unless social posts are switched on', () => {
    const items = [item('p', 'post', NOW, NOW, 'bluesky'), item('n', 'news', NOW)]
    const cards = buildCards(items, {}, null, () => tag({}))
    expect(applyFilters(cards, NO_FILTERS, new Set()).map(c => c.lead.id)).toEqual(['n'])
    expect(applyFilters(cards, { ...NO_FILTERS, includeSocial: true }, new Set())).toHaveLength(2)
  })
})

describe('mergeItems', () => {
  it('keeps the first-seen copy and drops week-old unstarred stories', () => {
    const now = Date.parse(NOW)
    const old = item('old', 'old', '2026-11-01T00:00:00Z')
    const keep = item('keep', 'keep', '2026-11-01T00:00:00Z')
    const first = item('n', 'first', NOW)
    const merged = mergeItems({ old, keep, n: first }, [{ ...first, title: 'second' }], new Set(['keep']), now)
    expect(Object.keys(merged).sort()).toEqual(['keep', 'n'])
    expect(merged.n.title).toBe('first')
  })
})
