// Every news source the app reads. Shared by the Vite dev proxy (vite.config.ts)
// and the app (src/sources.ts), so the proxy only ever forwards these URLs.

export type SourceKind = 'rss' | 'gdelt' | 'wikipedia' | 'bluesky'

export type SourceDef = {
  id: string
  name: string
  kind: SourceKind
  url: string
  /** Blocks browser calls (no CORS), so it goes through the dev proxy. */
  proxied: boolean
  /** Every item is about drones, so skip the keyword pre-filter. */
  droneOnly?: boolean
}

export const SOURCES: SourceDef[] = [
  // Direct: these allow browser calls.
  {
    id: 'gdelt',
    name: 'GDELT news search',
    kind: 'gdelt',
    url:
      'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent(
        '(drone OR drones OR UAV OR "unmanned aerial" OR "counter-drone" OR FPV OR Shahed) sourcelang:eng',
      ) +
      '&mode=artlist&maxrecords=75&format=json&timespan=2d&sort=datedesc',
    proxied: false,
  },
  { id: 'nyt-world', name: 'NYT World', kind: 'rss', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', proxied: false },
  { id: 'uk-mod', name: 'UK Ministry of Defence', kind: 'rss', url: 'https://www.gov.uk/government/organisations/ministry-of-defence.atom', proxied: false },
  {
    id: 'wikipedia',
    name: 'Wikipedia Current Events',
    kind: 'wikipedia',
    url: 'https://en.wikipedia.org/w/api.php?action=parse&page=Portal:Current_events&prop=text&format=json&formatversion=2&origin=*',
    proxied: false,
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    kind: 'bluesky',
    url: 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=' + encodeURIComponent('drone warfare') + '&limit=40&sort=latest',
    proxied: false,
  },

  // Proxied: no CORS, so the Vite dev server fetches them.
  { id: 'twz', name: 'The War Zone', kind: 'rss', url: 'https://www.twz.com/feed', proxied: true },
  { id: 'defense-news', name: 'Defense News', kind: 'rss', url: 'https://www.defensenews.com/feed/', proxied: true },
  { id: 'defense-one', name: 'Defense One', kind: 'rss', url: 'https://www.defenseone.com/rss/all/', proxied: true },
  { id: 'wotr', name: 'War on the Rocks', kind: 'rss', url: 'https://warontherocks.com/feed/', proxied: true },
  { id: 'kyiv-independent', name: 'Kyiv Independent', kind: 'rss', url: 'https://kyivindependent.com/news-archive/rss/', proxied: true },
  { id: 'airwars', name: 'Airwars', kind: 'rss', url: 'https://airwars.org/feed/', proxied: true },
  { id: 'guardian-drones', name: 'Guardian – Drones', kind: 'rss', url: 'https://www.theguardian.com/world/drones/rss', proxied: true, droneOnly: true },
  { id: 'al-jazeera', name: 'Al Jazeera', kind: 'rss', url: 'https://www.aljazeera.com/xml/rss/all.xml', proxied: true },
  { id: 'bbc-world', name: 'BBC World', kind: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', proxied: true },
  { id: 'dronedj', name: 'DroneDJ', kind: 'rss', url: 'https://dronedj.com/feed/', proxied: true, droneOnly: true },
]

/** The path the app calls for a proxied source. */
export const proxyPath = (id: string) => `/feeds/${id}`
