import type { ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { SOURCES, proxyPath } from './feeds.config.ts'

// One proxy entry per proxied feed: /feeds/<id> forwards to that exact URL and
// nothing else, so the dev server is not an open proxy.
const proxy: Record<string, ProxyOptions> = {}
for (const source of SOURCES.filter(s => s.proxied)) {
  const target = new URL(source.url)
  proxy[proxyPath(source.id)] = {
    target: target.origin,
    changeOrigin: true,
    followRedirects: true,
    rewrite: () => target.pathname + target.search,
    headers: {
      'User-Agent': 'Mozilla/5.0 (personal drone-news reader; local use)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
  }
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  test: { environment: 'jsdom' },
})
