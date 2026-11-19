import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SOURCES } from '../feeds.config'
import { applyFilters, buildCards, NO_FILTERS, type Card, type Filters } from './cards'
import { tagWithClaude } from './claude'
import { fetchAll } from './fetchers'
import { keywordTag } from './keywords'
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

export function App() {
  const [items, setItems] = useState<Record<string, NewsItem>>(() => load('items', {}))
  const [tags, setTags] = useState<Record<string, Tag>>(() => load('tags', {}))
  const [starred, setStarred] = useState<Set<string>>(() => new Set(load<string[]>('starred', [])))
  const [status, setStatus] = useState<Record<string, SourceStatus>>(() => load('status', {}))
  const [apiKey, setApiKey] = useState<string>(() => load('apiKey', ''))
  const [filters, setFilters] = useState<Filters>(() => load('filters', NO_FILTERS))
  // The visit before this one: what "new" is measured against.
  const [prevVisit] = useState<string | null>(() => load<string | null>('lastVisit', null))
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>()
  const started = useRef(false)

  useEffect(() => save('items', items), [items])
  useEffect(() => save('tags', tags), [tags])
  useEffect(() => save('starred', [...starred]), [starred])
  useEffect(() => save('status', status), [status])
  useEffect(() => save('filters', filters), [filters])

  const refresh = useCallback(async () => {
    setBusy('Fetching news…')
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
        setBusy(`Tagging ${untagged.length} stories with Claude…`)
        const existingKeys = [...new Set(Object.values(currentTags).map(t => t.eventKey).filter(Boolean))]
        const result = await tagWithClaude(key, untagged, existingKeys, fallbackTag)
        setTags({ ...currentTags, ...result.tags })
        if (result.error) setNotice(result.error)
      } else {
        setTags(currentTags)
        if (!key) setNotice('No Claude API key set: stories are tagged by keyword rules, without summaries or grouping. Add a key in Settings.')
      }
      const failed = Object.values(st).filter(s => !s.ok).length
      if (failed) setNotice(n => [n, `${failed} source${failed > 1 ? 's' : ''} failed this time (see Sources).`].filter(Boolean).join(' '))
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

  const toggleStar = (card: Card) =>
    setStarred(prev => {
      const next = new Set(prev)
      const isOn = card.items.some(i => next.has(i.id))
      for (const i of card.items) (isOn ? next.delete(i.id) : next.add(i.id))
      return next
    })

  const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value])

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
    <div className="page">
      <header className="top">
        <div>
          <h1>Drone Watch</h1>
          <p className="sub">
            {cards.length} stories · {cards.filter(c => c.isNew).length} new since your last visit
            {prevVisit && <> ({ago(prevVisit)})</>}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => void refresh()} disabled={!!busy} className="primary">
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={() => setShowSources(s => !s)}>
            Sources {Object.keys(status).length ? `${okSources}/${SOURCES.length}` : ''}
          </button>
          <button onClick={() => setShowSettings(s => !s)}>Settings</button>
        </div>
      </header>

      {busy && <div className="banner">{busy}</div>}
      {notice && !busy && <div className="banner warn">{notice}</div>}

      {showSettings && (
        <section className="panel">
          <label>
            Claude API key (kept only in this browser's localStorage)
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
            Stories are tagged with Claude Haiku 5.5, about 25 per request. Anyone with access to this browser profile can read
            the key.
          </p>
          <div className="row">
            <button onClick={exportData}>Export JSON backup</button>
          </div>
        </section>
      )}

      {showSources && (
        <section className="panel">
          {import.meta.env.PROD && (
            <p className="hint">
              Feeds that block browser requests are fetched every 2 hours by a scheduled job
              {snapshotAt ? `; the latest snapshot is from ${ago(snapshotAt)}.` : '; no snapshot found yet.'}
            </p>
          )}
          <table className="sources">
            <tbody>
              {SOURCES.map(s => {
                const st = status[s.id]
                return (
                  <tr key={s.id}>
                    <td>{st ? (st.ok ? '✓' : '✗') : '·'}</td>
                    <td>{s.name}</td>
                    <td className="muted">{!s.proxied ? 'direct' : import.meta.env.PROD ? 'snapshot' : 'via dev proxy'}</td>
                    <td className="muted">{st ? (st.ok ? `${st.count} drone stories` : st.error) : 'not fetched yet'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <nav className="filters">
        <div className="chips">
          {(['all', 'military', 'civilian'] as const).map(d => (
            <button key={d} className={filters.domain === d ? 'chip on' : 'chip'} onClick={() => setFilters(f => ({ ...f, domain: d }))}>
              {d === 'all' ? 'All' : d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
          <span className="sep" />
          <button className={filters.newOnly ? 'chip on' : 'chip'} onClick={() => setFilters(f => ({ ...f, newOnly: !f.newOnly }))}>
            New only
          </button>
          <button className={filters.starredOnly ? 'chip on' : 'chip'} onClick={() => setFilters(f => ({ ...f, starredOnly: !f.starredOnly }))}>
            ★ Starred
          </button>
          <button className={filters.includeSocial ? 'chip on' : 'chip'} onClick={() => setFilters(f => ({ ...f, includeSocial: !f.includeSocial }))}>
            Bluesky posts
          </button>
        </div>
        <div className="chips">
          {CONFLICTS.filter(c => c !== 'None').map(c => (
            <button key={c} className={filters.conflicts.includes(c) ? 'chip on' : 'chip'} onClick={() => setFilters(f => ({ ...f, conflicts: toggleIn(f.conflicts, c) }))}>
              {c}
            </button>
          ))}
        </div>
        <div className="chips">
          {TOPICS.map(t => (
            <button key={t} className={filters.topics.includes(t) ? 'chip on' : 'chip'} onClick={() => setFilters(f => ({ ...f, topics: toggleIn(f.topics, t) }))}>
              {t}
            </button>
          ))}
          {JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) && (
            <button className="chip clear" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </nav>

      <main className="feed">
        {shown.length === 0 && !busy && <p className="empty">No stories match these filters.</p>}
        {shown.map(card => {
          const isStarred = card.items.some(i => starred.has(i.id))
          return (
            <article key={card.key} className={card.isNew ? 'card new' : 'card'}>
              <div className="meta">
                {card.isNew && <span className="badge">NEW</span>}
                <span className={`pill ${card.tag.domain}`}>{card.tag.domain}</span>
                {card.tag.conflict !== 'None' && <span className="pill">{card.tag.conflict}</span>}
                {card.tag.topics.map(t => (
                  <span key={t} className="pill soft">
                    {t}
                  </span>
                ))}
                <span className="muted when">{ago(card.latestAt)}</span>
              </div>
              <h2>
                <a href={card.lead.url} target="_blank" rel="noreferrer">
                  {card.lead.title}
                </a>
              </h2>
              {card.tag.summary && <p className="summary">{card.tag.summary}</p>}
              <div className="foot">
                <span className="muted">
                  {card.items.slice(0, 6).map((i, n) => (
                    <span key={i.id}>
                      {n > 0 && ' · '}
                      <a href={i.url} target="_blank" rel="noreferrer">
                        {i.sourceName}
                      </a>
                    </span>
                  ))}
                  {card.items.length > 6 && ` · +${card.items.length - 6} more`}
                </span>
                <button className={isStarred ? 'star on' : 'star'} onClick={() => toggleStar(card)} aria-label={isStarred ? 'Unstar' : 'Star'}>
                  {isStarred ? '★' : '☆'}
                </button>
              </div>
            </article>
          )
        })}
      </main>
    </div>
  )
}
