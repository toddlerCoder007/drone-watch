// Keyword rules: the pre-filter for mixed feeds, and the fallback tagger
// when no Claude API key is set.

import type { Conflict, Domain, Tag, Topic } from './types'

const DRONE = /\b(drones?|uavs?|uas|unmanned (aerial|aircraft|surface|underwater|ground)|quadcopters?|fpv|loitering munitions?|kamikaze drones?|shaheds?|geran|lancet|bayraktar|tb2|reaper|mq-9|counter-drone|anti-drone|c-uas|drone (strike|attack|swarm|wall|delivery))\b/i

export const isDroneText = (s: string) => DRONE.test(s)

const RULES: { conflict: Conflict; re: RegExp }[] = [
  { conflict: 'Ukraine–Russia', re: /\b(ukrain\w*|russia\w*|kyiv|kiev|kharkiv|odesa|odessa|crimea|donbas|donetsk|zaporizhzhia|moscow|kursk|belgorod|kremlin|zelensky|putin)\b/i },
  { conflict: 'Middle East', re: /\b(israel\w*|gaza|hamas|hezbollah|lebanon|iran\w*|houthis?|yemen\w*|red sea|syria\w*|iraq\w*|idf)\b/i },
  { conflict: 'Sudan', re: /\b(sudan\w*|khartoum|darfur|rsf|el fasher|port sudan)\b/i },
  { conflict: 'Myanmar', re: /\b(myanmar|burm\w*|junta|tatmadaw|rakhine|naypyidaw)\b/i },
]

const TOPIC_RULES: { topic: Topic; re: RegExp }[] = [
  { topic: 'Strikes & combat', re: /\b(strikes?|attacks?|shot down|killed|bomb\w*|front ?line|offensive|barrage)\b/i },
  { topic: 'Counter-drone', re: /\b(counter-drone|anti-drone|c-uas|intercept\w*|jamm\w*|electronic warfare|air defen[cs]e|laser)\b/i },
  { topic: 'Technology & autonomy', re: /\b(autonom\w*|\bai\b|swarm\w*|fibre-optic|fiber-optic|prototype|unveil\w*|test(ed|s)?|sensor|battery)\b/i },
  { topic: 'Policy & regulation', re: /\b(faa|easa|regulat\w*|law|ban\w*|rules?|policy|sanction\w*|export control\w*|airspace)\b/i },
  { topic: 'Industry & procurement', re: /\b(contract\w*|order\w*|procure\w*|production|factory|startup|funding|raises|acquisition|billion|million)\b/i },
  { topic: 'Commercial & delivery', re: /\b(delivery|deliveries|agricultur\w*|inspection|consumer|dji|wing|zipline|amazon prime air|mapping|photography)\b/i },
  { topic: 'Incidents & safety', re: /\b(sighting\w*|airport|crash\w*|incident|near miss|closed|disrupt\w*|safety)\b/i },
]

const MILITARY = /\b(military|army|forces|troops|war|strike|attack|missile|munition\w*|defen[cs]e|combat|soldiers?|navy|air force|pentagon|nato|weapon\w*)\b/i
const CIVILIAN = /\b(delivery|agricultur\w*|consumer|faa|easa|commercial|hobby\w*|photography|inspection|dji|recreational|police|firefight\w*)\b/i

export function keywordTag(text: string): Tag {
  const conflict = RULES.find(r => r.re.test(text))?.conflict ?? 'None'
  const topics = TOPIC_RULES.filter(r => r.re.test(text)).map(r => r.topic).slice(0, 3)
  const mil = MILITARY.test(text) || conflict !== 'None'
  const civ = CIVILIAN.test(text)
  const domain: Domain = mil && civ ? 'both' : civ ? 'civilian' : 'military'
  return {
    relevant: isDroneText(text),
    domain,
    conflict,
    topics,
    summary: '',
    eventKey: '',
    by: 'keywords',
  }
}
