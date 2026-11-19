// Where a story happened. Claude supplies a place when it tags a story; without
// a key (or for stories tagged before places existed) a small gazetteer of
// places that come up in drone news is matched against the text.

import type { Conflict, NewsItem, Tag } from './types'

export type Place = { name: string; lat: number; lon: number }

// Most specific first: a city beats its country.
const GAZETTEER: [RegExp, Place][] = [
  [/\bkyiv|kiev\b/i, { name: 'Kyiv', lat: 50.45, lon: 30.52 }],
  [/\bkharkiv\b/i, { name: 'Kharkiv', lat: 49.99, lon: 36.23 }],
  [/\bodesa|odessa\b/i, { name: 'Odesa', lat: 46.48, lon: 30.72 }],
  [/\bzaporizhzhia\b/i, { name: 'Zaporizhzhia', lat: 47.84, lon: 35.14 }],
  [/\bdnipro\b/i, { name: 'Dnipro', lat: 48.46, lon: 35.05 }],
  [/\blviv\b/i, { name: 'Lviv', lat: 49.84, lon: 24.03 }],
  [/\bdonetsk|donbas|pokrovsk|bakhmut\b/i, { name: 'Donbas', lat: 48.02, lon: 37.8 }],
  [/\bcrimea\w*|kerch|sevastopol\b/i, { name: 'Crimea', lat: 45.0, lon: 34.1 }],
  [/\bkursk\b/i, { name: 'Kursk', lat: 51.73, lon: 36.19 }],
  [/\bbelgorod\b/i, { name: 'Belgorod', lat: 50.6, lon: 36.59 }],
  [/\bmoscow\b/i, { name: 'Moscow', lat: 55.76, lon: 37.62 }],
  [/\btatarstan|kazan\b/i, { name: 'Tatarstan', lat: 55.8, lon: 49.1 }],
  [/\bkrasnodar\b/i, { name: 'Krasnodar', lat: 45.04, lon: 38.98 }],
  [/\bryazan\b/i, { name: 'Ryazan', lat: 54.63, lon: 39.74 }],
  [/\bgaza\b/i, { name: 'Gaza', lat: 31.42, lon: 34.36 }],
  [/\bwest bank\b/i, { name: 'West Bank', lat: 31.95, lon: 35.25 }],
  [/\bisrael\w*|tel aviv\b/i, { name: 'Israel', lat: 31.5, lon: 34.9 }],
  [/\blebanon\w*|beirut|hezbollah\b/i, { name: 'Lebanon', lat: 33.85, lon: 35.86 }],
  [/\bsyria\w*|damascus\b/i, { name: 'Syria', lat: 34.8, lon: 38.99 }],
  [/\biraq\w*|baghdad|erbil\b/i, { name: 'Iraq', lat: 33.3, lon: 44.37 }],
  [/\bqeshm|strait of hormuz|hormuz\b/i, { name: 'Strait of Hormuz', lat: 26.6, lon: 56.3 }],
  [/\btehran|iran\w*\b/i, { name: 'Iran', lat: 35.69, lon: 51.39 }],
  [/\bbahrain\w*\b/i, { name: 'Bahrain', lat: 26.07, lon: 50.55 }],
  [/\bhouthis?|yemen\w*|sanaa|red sea\b/i, { name: 'Yemen & Red Sea', lat: 15.35, lon: 44.2 }],
  [/\bsaudi\w*|riyadh\b/i, { name: 'Saudi Arabia', lat: 24.71, lon: 46.68 }],
  [/\bkhartoum\b/i, { name: 'Khartoum', lat: 15.5, lon: 32.56 }],
  [/\bdarfur|el fasher|nyala\b/i, { name: 'Darfur', lat: 13.5, lon: 24.9 }],
  [/\bport sudan\b/i, { name: 'Port Sudan', lat: 19.62, lon: 37.22 }],
  [/\bsudan\w*\b/i, { name: 'Sudan', lat: 15.5, lon: 30.2 }],
  [/\bmyanmar|burm\w*|rakhine\b/i, { name: 'Myanmar', lat: 19.75, lon: 96.1 }],
  [/\btaiwan\w*\b/i, { name: 'Taiwan', lat: 23.7, lon: 121 }],
  [/\bchina|chinese|beijing|pla\b/i, { name: 'China', lat: 35.86, lon: 104.2 }],
  [/\bnorth korea\w*|pyongyang\b/i, { name: 'North Korea', lat: 39.03, lon: 125.75 }],
  [/\bjapan\w*\b/i, { name: 'Japan', lat: 36.2, lon: 138.25 }],
  [/\bindia\b|indian (army|air)|pakistan\w*/i, { name: 'India–Pakistan', lat: 30.4, lon: 72.6 }],
  [/\bestonia\w*\b/i, { name: 'Estonia', lat: 58.6, lon: 25.0 }],
  [/\bpoland|polish\b/i, { name: 'Poland', lat: 52.0, lon: 19.1 }],
  [/\bdenmark|danish|copenhagen\b/i, { name: 'Denmark', lat: 55.68, lon: 12.57 }],
  [/\bgermany|german|berlin|munich\b/i, { name: 'Germany', lat: 51.17, lon: 10.45 }],
  [/\bbelgium|brussels\b/i, { name: 'Belgium', lat: 50.85, lon: 4.35 }],
  [/\bfrance|french|paris\b/i, { name: 'France', lat: 46.6, lon: 2.2 }],
  [/\b(uk|britain|british|england|london|scotland)\b/i, { name: 'United Kingdom', lat: 52.5, lon: -1.5 }],
  [/\bbangladesh\w*|dhaka\b/i, { name: 'Bangladesh', lat: 23.81, lon: 90.41 }],
  [/\baustralia\w*\b/i, { name: 'Australia', lat: -25.3, lon: 133.8 }],
  [/\bcanada|canadian\b/i, { name: 'Canada', lat: 56.1, lon: -106.3 }],
  [/\bmexic\w*\b/i, { name: 'Mexico', lat: 23.6, lon: -102.5 }],
  [/\bpentagon|washington|faa|\bu\.?s\.? (army|navy|air force|military)|united states|texas|california|new york|florida\b/i, { name: 'United States', lat: 39.5, lon: -98.35 }],
  [/\bukrain\w*\b/i, { name: 'Ukraine', lat: 48.38, lon: 31.17 }],
  [/\brussia\w*|kremlin\b/i, { name: 'Russia', lat: 55.0, lon: 45.0 }],
]

const CONFLICT_CENTRE: Partial<Record<Conflict, Place>> = {
  'Ukraine–Russia': { name: 'Ukraine', lat: 48.38, lon: 31.17 },
  'Middle East': { name: 'Middle East', lat: 31.0, lon: 40.0 },
  Sudan: { name: 'Sudan', lat: 15.5, lon: 30.2 },
  Myanmar: { name: 'Myanmar', lat: 19.75, lon: 96.1 },
}

export function gazetteerPlace(text: string): Place | null {
  for (const [re, place] of GAZETTEER) if (re.test(text)) return place
  return null
}

const valid = (p: Place | undefined | null): p is Place =>
  !!p && !!p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0)

/** Claude's place if it gave one, else the gazetteer, else the conflict's centre. */
export function placeFor(item: NewsItem, tag: Tag): Place | null {
  if (valid(tag.place)) return tag.place
  return gazetteerPlace(`${item.title} ${item.snippet}`) ?? CONFLICT_CENTRE[tag.conflict] ?? null
}
