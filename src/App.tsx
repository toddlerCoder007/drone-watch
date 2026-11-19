import { Bell, Download, ExternalLink, RefreshCw, Satellite, Settings, Star, Waypoints } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SOURCES } from '../feeds.config'
import { applyFilters, buildCards, hotspots, NO_FILTERS, type Card, type Filters } from './cards'
import { tagWithClaude } from './claude'
import { fetchAll } from './fetchers'
import { DOMAIN_ICON, DOMAIN_LABEL, storyIcon, TOPIC_ICON } from './icons'
import { keywordTag } from './keywords'
import { MapView } from './MapView'
import { load, mergeItems, pruneTags, save } from './storage'
import { CONFLICTS, TOPICS, type NewsItem, type SourceStatus, type Tag } from './types'

const fallbackTag = (i: NewsItem) => keywordTag(`${i.title} ${i.snippet}`)

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value])

export function App() {
  const [items, setItems] = useState<Record<string, NewsItem>>(() => load('items', {}))
  const [tags, setTags] = useState<Record<string, Tag>>(() => load('tags', {}))
  const [starred, setStarred] = useState<Set<string>>(() => new Set(load<string[]>('starred', [])))
  const [status, setStatus] = useState<Record<string, SourceStatus>>(() => load('status', {}))
  const [apiKey, setApiKey] = useState<string>(() => load('apiKey', ''))
  const [filters, setFilters] = useState<Filters>(() => ({ ...NO_FILTERS, ...load<Partial<Filters>>('filters', {}), place: undefined }))
  // The visit before this one: what "new" is measured against.
  const [prevVisit] = useState<string | null>(() => load<string | null>('lastVisit', null))
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [panel, setPanel] = useState<'sources' | 'settings' | null>(null)
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>()
  const [hoverPlace, setHoverPlace] = useState<string | undefined>()
  const started = useRef(false)
  const feedTop = useRef<HTMLDivElement>(null)

  useEffect(() => save('items', items), [items])
  useEffect(() => save('tags', tags), [tags])
  useEffect(() => save('starred', [...starred]), [starred])
  useEffect(() => save('status', status), [status])
  useEffect(() => save('filters', { ...filters, place: undefined }), [filters])

  const refresh = useCallback(async () => {
    setBusy('Fetching news')
    setNotice(null)
    try {
      const { items: fresh, status: st, snapshotAt: snap } = await fetchAll()
      setStatus(st)
      setSnapshotAt(snap)
      const merged = mergeItems(load('items', {}), fresh, new Set(load<string[]>('starred', [])))
      setItems(merged)
      const currentTags = pruneTags(load('tags', {}), merged)

      const key = load<string>('apiKey', '')
      // Keyword tags are only stored when Claude couldn't tag a story, so they
      // count as done; stories with no stored tag go to Claude.
      const untagged = Object.values(merged).filter(i => !currentTags[i.id])
      if (key && untagged.length) {
        setBusy(`Tagging ${untagged.length} stories with Claude`)
        const existingKeys = [...new Set(Object.values(currentTags).map(t => t.eventKey).filter(Boolean))]
        const result = await tagWithClaude(key, untagged, existingKeys, fallbackTag)
        setTags({ ...currentTags, ...result.tags })
        if (result.error) setNotice(result.error)
      } else {
        setTags(currentTags)
        if (!key) setNotice('Stories are tagged by keyword rules. Add a Claude API key in Settings for summaries, places and grouped duplicates.')
      }
      const failed = Object.values(st).filter(s => !s.ok).length
      if (failed) setNotice(n => [n, `${failed} source${failed > 1 ? 's' : ''} didn’t load this time; open Sources for details.`].filter(Boolean).join(' '))
      save('lastVisit', new Date().toISOString())
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void refresh()
  }, [refresh])

  const cards = useMemo(() => buildCards(Object.values(items), tags, prevVisit, fallbackTag), [items, tags, prevVisit])
  const shown = useMemo(() => applyFilters(cards, filters, starred), [cards, filters, starred])
  // The map shows every place that matches the other filters, so picking one
  // place doesn't hide the rest of the world.
  const spots = useMemo(() => hotspots(applyFilters(cards, { ...filters, place: undefined }, starred)), [cards, filters, starred])
  const visibleCards = useMemo(() => applyFilters(cards, { ...NO_FILTERS, includeSocial: filters.includeSocial }, starred), [cards, filters.includeSocial, starred])
  const topicCount = useMemo(() => {
    const n: Record<string, number> = {}
    for (const c of visibleCards) for (const t of c.tag.topics) n[t] = (n[t] ?? 0) + 1
    return n
  }, [visibleCards])
  const newCount = visibleCards.filter(c => c.isNew).length
  const hasFilters = JSON.stringify({ ...filters, includeSocial: false }) !== JSON.stringify({ ...NO_FILTERS, includeSocial: false })

  const selectPlace = (place: string | undefined) => {
    setFilters(f => ({ ...f, place }))
    feedTop.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const toggleStar = (card: Card) =>
    setStarred(prev => {
      const next = new Set(prev)
      const isOn = card.items.some(i => next.has(i.id))
      for (const i of card.items) (isOn ? next.delete(i.id) : next.add(i.id))
      return next
    })

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ items, tags, starred: [...starred] }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `drone-watch-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const okSources = Object.values(status).filter(s => s.ok).length

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <h1>Drone Watch</h1>
          <p>
            {visibleCards.length} stories this week{newCount > 0 && <>, <b>{newCount} new</b> since {prevVisit ? ago(prevVisit) : 'your first visit'}</>}
          </p>
        </div>
        <nav className="tools" aria-label="App">
          <button onClick={() => void refresh()} disabled={!!busy} className="primary">
            <RefreshCw size={16} aria-hidden className={busy ? 'spin' : ''} /> {busy ? 'Refreshing' : 'Refresh'}
          </button>
          <button onClick={() => setPanel(p => (p === 'sources' ? null : 'sources'))} aria-expanded={panel === 'sources'}>
            <Satellite size={16} aria-hidden /> Sources{Object.keys(status).length ? ` ${okSources}/${SOURCES.length}` : ''}
          </button>
          <button onClick={() => setPanel(p => (p === 'settings' ? null : 'settings'))} aria-expanded={panel === 'settings'}>
            <Settings size={16} aria-hidden /> Settings
          </button>
        </nav>
      </header>

      {(busy || notice) && (
        <div className={busy ? 'notice busy' : 'notice'} role="status">
          {busy ? `${busy}…` : notice}
        </div>
      )}

      {panel === 'settings' && (
        <section className="drawer" aria-label="Settings">
          <label>
            Claude API key
            <input
              type="password"
              value={apiKey}
              placeholder="sk-ant-…"
              autoComplete="off"
              onChange={e => {
                setApiKey(e.target.value)
                save('apiKey', e.target.value.trim())
              }}
            />
          </label>
          <p className="hint">
            Kept only in this browser’s storage. Claude Haiku 5.5 tags each new story once, adds a one-line summary and a place, and groups the
            same event from several outlets. Anyone who can use this browser profile can read the key.
          </p>
          <button onClick={exportData}>
            <Download size={16} aria-hidden /> Export a JSON backup
          </button>
        </section>
      )}

      {panel === 'sources' && (
        <section className="drawer" aria-label="Sources">
          {import.meta.env.PROD && (
            <p className="hint">
              Outlets that block browser requests are fetched every 2 hours by a scheduled job
              {snapshotAt ? `; the latest copy is from ${ago(snapshotAt)}.` : '; no copy found yet.'}
            </p>
          )}
          <ul className="source-list">
            {SOURCES.map(s => {
              const st = status[s.id]
              return (
                <li key={s.id} className={st ? (st.ok ? 'ok' : 'bad') : ''}>
                  <span className="dot" aria-hidden />
                  <span className="name">{s.name}</span>
                  <span className="muted">{st ? (st.ok ? `${st.count} drone ${st.count === 1 ? 'story' : 'stories'}` : st.error) : 'Not fetched yet'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="layout">
        <aside className="side">
          <MapView spots={spots} selected={filters.place} highlighted={hoverPlace ?? filters.place} onSelect={selectPlace} />

          <section className="filter-block" aria-label="Topics">
            <h2>Topics</h2>
            <div className="topics">
              {TOPICS.map(t => {
                const Icon = TOPIC_ICON[t]
                const on = filters.topics.includes(t)
                return (
                  <button key={t} className={on ? 'topic on' : 'topic'} aria-pressed={on} onClick={() => setFilters(f => ({ ...f, topics: toggleIn(f.topics, t) }))}>
                    <Icon size={18} aria-hidden />
                    <span>{t}</span>
                    <span className="count">{topicCount[t] ?? 0}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="filter-block" aria-label="Kind of drone">
            <h2>Military or civilian</h2>
            <div className="seg wide" role="group">
              {(['all', 'military', 'civilian'] as const).map(d => {
                const Icon = d === 'all' ? Waypoints : DOMAIN_ICON[d]
                return (
                  <button key={d} className={filters.domain === d ? 'on' : ''} aria-pressed={filters.domain === d} onClick={() => setFilters(f => ({ ...f, domain: d }))}>
                    <Icon size={15} aria-hidden /> {d === 'all' ? 'Both' : DOMAIN_LABEL[d]}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="filter-block" aria-label="Conflicts">
            <h2>Conflict</h2>
            <div className="chips">
              {CONFLICTS.filter(c => c !== 'None').map(c => (
                <button key={c} className={filters.conflicts.includes(c) ? 'chip on' : 'chip'} aria-pressed={filters.conflicts.includes(c)} onClick={() => setFilters(f => ({ ...f, conflicts: toggleIn(f.conflicts, c) }))}>
                  {c}
                </button>
              ))}
            </div>
          </section>

          <section className="filter-block" aria-label="Show">
            <h2>Show</h2>
            <div className="chips">
              <button className={filters.newOnly ? 'chip on' : 'chip'} aria-pressed={filters.newOnly} onClick={() => setFilters(f => ({ ...f, newOnly: !f.newOnly }))}>
                <Bell size={14} aria-hidden /> New only
              </button>
              <button className={filters.starredOnly ? 'chip on' : 'chip'} aria-pressed={filters.starredOnly} onClick={() => setFilters(f => ({ ...f, starredOnly: !f.starredOnly }))}>
                <Star size={14} aria-hidden /> Starred
              </button>
              <button className={filters.includeSocial ? 'chip on' : 'chip'} aria-pressed={!!filters.includeSocial} onClick={() => setFilters(f => ({ ...f, includeSocial: !f.includeSocial }))}>
                Bluesky posts
              </button>
            </div>
            {hasFilters && (
              <button className="clear" onClick={() => setFilters(f => ({ ...NO_FILTERS, includeSocial: f.includeSocial }))}>
                Clear filters
              </button>
            )}
          </section>
        </aside>

        <main className="feed" ref={feedTop} aria-label="Stories">
          <p className="feed-head">
            {filters.place ? (
              <>
                Showing <b>{shown.length}</b> {shown.length === 1 ? 'story' : 'stories'} in <b>{filters.place}</b>
              </>
            ) : (
              <>
                Showing <b>{shown.length}</b> of {visibleCards.length} stories, newest first
              </>
            )}
          </p>

          {shown.length === 0 && !busy && (
            <div className="empty">
              <p>Nothing matches these filters.</p>
              {hasFilters && <button onClick={() => setFilters(f => ({ ...NO_FILTERS, includeSocial: f.includeSocial }))}>Clear filters</button>}
            </div>
          )}

          <ol className="strips">
            {shown.map(card => {
              const isStarred = card.items.some(i => starred.has(i.id))
              const Icon = storyIcon(card.tag.topics, card.tag.domain)
              return (
                <li
                  key={card.key}
                  className={`strip ${card.tag.domain}${card.isNew ? ' new' : ''}${card.place && card.place.name === (hoverPlace ?? filters.place) ? ' lit' : ''}`}
                  onPointerEnter={() => card.place && setHoverPlace(card.place.name)}
                  onPointerLeave={() => setHoverPlace(undefined)}
                >
                  <span className="glyph" title={card.tag.topics[0] ?? DOMAIN_LABEL[card.tag.domain]}>
                    <Icon size={20} aria-hidden />
                  </span>
                  <div className="strip-body">
                    <div className="strip-meta">
                      {card.isNew && <span className="new-tag">New</span>}
                      <span>{DOMAIN_LABEL[card.tag.domain]}</span>
                      {card.place && (
                        <button className="place" onClick={() => selectPlace(card.place!.name)} title={`Show stories in ${card.place.name}`}>
                          {card.place.name}
                        </button>
                      )}
                      <time dateTime={card.latestAt}>{ago(card.latestAt)}</time>
                    </div>
                    <h3>
                      <a href={card.lead.url} target="_blank" rel="noreferrer">
                        {card.lead.title}
                      </a>
                    </h3>
                    {card.tag.summary && <p className="summary">{card.tag.summary}</p>}
                    <div className="strip-foot">
                      <div className="topic-icons">
                        {card.tag.topics.map(t => {
                          const T = TOPIC_ICON[t]
                          return (
                            <span key={t} className="topic-mini" title={t}>
                              <T size={13} aria-hidden /> {t}
                            </span>
                          )
                        })}
                      </div>
                      <div className="outlets">
                        {card.items.slice(0, 4).map(i => (
                          <a key={i.id} href={i.url} target="_blank" rel="noreferrer">
                            {i.sourceName}
                          </a>
                        ))}
                        {card.items.length > 4 && <span className="muted">and {card.items.length - 4} more</span>}
                      </div>
                    </div>
                  </div>
                  <div className="strip-actions">
                    <button className={isStarred ? 'star on' : 'star'} onClick={() => toggleStar(card)} aria-pressed={isStarred} aria-label={isStarred ? 'Unstar this story' : 'Star this story'}>
                      <Star size={18} aria-hidden fill={isStarred ? 'currentColor' : 'none'} />
                    </button>
                    <a className="open" href={card.lead.url} target="_blank" rel="noreferrer" aria-label="Open the article">
                      <ExternalLink size={16} aria-hidden />
                    </a>
                  </div>
                </li>
              )
            })}
          </ol>
        </main>
      </div>
    </div>
  )
}
