// Tags and summarises stories with Claude Haiku, straight from the browser
// with the user's own key. Each story is sent once; results are cached.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { CONFLICTS, DOMAINS, TOPICS, type NewsItem, type Tag } from './types'

export const MODEL = 'claude-haiku-5-5'
const BATCH = 25

const TagSchema = z.object({
  tags: z.array(
    z.object({
      id: z.string(),
      relevant: z.boolean(),
      domain: z.enum(DOMAINS),
      conflict: z.enum(CONFLICTS),
      topics: z.array(z.enum(TOPICS)),
      summary: z.string(),
      eventKey: z.string(),
      placeName: z.string(),
      lat: z.number(),
      lon: z.number(),
    }),
  ),
})

const SYSTEM = `You tag news stories for a personal daily scan of drone news: military drones, counter-drone systems, drone policy, and civilian and commercial drones.

For each story return:
- relevant: true only if the story is substantially about drones (UAVs, unmanned systems, counter-drone). A passing mention in an unrelated story is false.
- domain: "military", "civilian", or "both".
- conflict: the war it belongs to, "Other conflict" for any other war, "None" if not about a war.
- topics: one to three from the allowed list.
- summary: one plain sentence (under 25 words) on what happened and why it matters. Do not invent details beyond the headline and snippet.
- eventKey: a short lowercase slug naming the underlying event, e.g. "kyiv-shahed-attack-2026-11-18". Stories about the same event must share the same eventKey; reuse a key from the "existing event keys" list when a story is about one of those events.

- placeName, lat, lon: where the story happened, as specific as the headline allows (a city, region or country), with approximate coordinates in decimal degrees. If the story has no clear location (e.g. a product launch or a general policy debate), use placeName "" and lat 0, lon 0.

Return one entry per story, using its id exactly.`

export type TagResult = { tags: Record<string, Tag>; error?: string }

export async function tagWithClaude(
  apiKey: string,
  items: NewsItem[],
  existingKeys: string[],
  fallback: (item: NewsItem) => Tag,
): Promise<TagResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const tags: Record<string, Tag> = {}
  const keys = new Set(existingKeys)
  let skipped = 0

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const stories = batch.map(it => ({
      id: it.id,
      source: it.sourceName,
      title: it.title,
      snippet: it.snippet.slice(0, 300),
    }))
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        output_config: { effort: 'low', format: zodOutputFormat(TagSchema) },
        messages: [
          {
            role: 'user',
            content: `Existing event keys: ${JSON.stringify([...keys].slice(-150))}\n\nStories:\n${JSON.stringify(stories)}`,
          },
        ],
      })
      if (response.stop_reason === 'refusal' || !response.parsed_output) {
        // Keep keyword tags for this batch so it isn't re-sent every refresh,
        // and carry on with the next one.
        for (const it of batch) tags[it.id] = fallback(it)
        skipped += batch.length
        continue
      }
      for (const t of response.parsed_output.tags) {
        if (!batch.some(b => b.id === t.id)) continue
        const { placeName, lat, lon, ...rest } = t
        tags[t.id] = {
          ...rest,
          topics: t.topics.slice(0, 3),
          place: placeName ? { name: placeName, lat, lon } : undefined,
          by: 'claude',
        }
        if (t.eventKey) keys.add(t.eventKey)
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { tags, error: 'The API key was rejected. Check it in Settings.' }
      if (err instanceof Anthropic.RateLimitError) return { tags, error: 'Claude rate limit hit; the rest will be tagged next refresh.' }
      if (err instanceof Anthropic.APIError) return { tags, error: `Claude API error ${err.status ?? ''}: ${err.message}` }
      return { tags, error: `Could not reach Claude: ${String(err)}` }
    }
  }
  return skipped ? { tags, error: `Claude couldn't tag ${skipped} stories; they use keyword tags.` } : { tags }
}
