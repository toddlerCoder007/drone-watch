export type NewsItem = {
  /** Stable id derived from the article URL. */
  id: string
  title: string
  url: string
  sourceId: string
  sourceName: string
  /** ISO timestamp; falls back to when we first saw it. */
  publishedAt: string
  /** Plain-text snippet, may be empty. */
  snippet: string
  firstSeenAt: string
}

export const DOMAINS = ['military', 'civilian', 'both'] as const
export type Domain = (typeof DOMAINS)[number]

export const CONFLICTS = [
  'Ukraine–Russia',
  'Middle East',
  'Sudan',
  'Myanmar',
  'Other conflict',
  'None',
] as const
export type Conflict = (typeof CONFLICTS)[number]

export const TOPICS = [
  'Strikes & combat',
  'Counter-drone',
  'Technology & autonomy',
  'Policy & regulation',
  'Industry & procurement',
  'Commercial & delivery',
  'Incidents & safety',
] as const
export type Topic = (typeof TOPICS)[number]

export type Tag = {
  relevant: boolean
  domain: Domain
  conflict: Conflict
  topics: Topic[]
  /** One line: why the story matters. */
  summary: string
  /** Short slug naming the underlying event, shared by duplicate stories. */
  eventKey: string
  by: 'claude' | 'keywords'
}

export type SourceStatus = {
  ok: boolean
  count: number
  error?: string
  at: string
}
