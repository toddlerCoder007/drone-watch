// Fetches the feeds that block browser requests and writes them as static
// files, so the GitHub Pages build can serve them next to the app.
// Usage: node scripts/fetch-feeds.ts <out-dir>     (Node 23.6+ runs .ts directly)

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SOURCES } from '../feeds.config.ts'

const outDir = process.argv[2] ?? 'dist/feeds'
await mkdir(outDir, { recursive: true })

const results: Record<string, { ok: boolean; bytes?: number; error?: string }> = {}

await Promise.all(
  SOURCES.filter(s => s.proxied).map(async source => {
    try {
      const res = await fetch(source.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (personal drone-news reader; static snapshot)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(text)) throw new Error('response is not a feed')
      await writeFile(join(outDir, `${source.id}.xml`), text, 'utf8')
      results[source.id] = { ok: true, bytes: text.length }
    } catch (err) {
      results[source.id] = { ok: false, error: String((err as Error).message ?? err) }
    }
  }),
)

await writeFile(join(outDir, 'meta.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), results }, null, 2))

for (const [id, r] of Object.entries(results)) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${id} ${r.ok ? `${r.bytes} bytes` : r.error}`)
const failed = Object.values(results).filter(r => !r.ok).length
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} feeds saved to ${outDir}`)
