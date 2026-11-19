// localStorage with a prefix, JSON, and no throwing: private windows and full
// storage just fall back to the default.

import type { NewsItem, Tag } from './types'

const PREFIX = 'droneWatch:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the app still works for this visit.
  }
}

export const KEEP_DAYS = 7

/** Merge new items in by id, keeping the first-seen copy; drop old unstarred ones. */
export function mergeItems(
  existing: Record<string, NewsItem>,
  incoming: NewsItem[],
  starred: Set<string>,
  nowMs = Date.now(),
): Record<string, NewsItem> {
  const out: Record<string, NewsItem> = { ...existing }
  for (const item of incoming) if (!out[item.id]) out[item.id] = item
  const cutoff = nowMs - KEEP_DAYS * 24 * 60 * 60 * 1000
  for (const [id, item] of Object.entries(out)) {
    const t = Date.parse(item.publishedAt) || Date.parse(item.firstSeenAt)
    if (t < cutoff && !starred.has(id)) delete out[id]
  }
  return out
}

export function pruneTags(tags: Record<string, Tag>, items: Record<string, NewsItem>): Record<string, Tag> {
  return Object.fromEntries(Object.entries(tags).filter(([id]) => id in items))
}
