import {
  Cpu,
  Crosshair,
  Drone,
  Factory,
  Package,
  Plane,
  Scale,
  ShieldHalf,
  Swords,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { Domain, Topic } from './types'

export const TOPIC_ICON: Record<Topic, LucideIcon> = {
  'Strikes & combat': Crosshair,
  'Counter-drone': ShieldHalf,
  'Technology & autonomy': Cpu,
  'Policy & regulation': Scale,
  'Industry & procurement': Factory,
  'Commercial & delivery': Package,
  'Incidents & safety': TriangleAlert,
}

export const DOMAIN_ICON: Record<Domain, LucideIcon> = {
  military: Swords,
  civilian: Plane,
  both: Drone,
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  military: 'Military',
  civilian: 'Civilian',
  both: 'Military & civilian',
}

/** The icon that best sums up a story: its first topic, else its domain. */
export function storyIcon(topics: Topic[], domain: Domain): LucideIcon {
  return topics.length ? TOPIC_ICON[topics[0]] : DOMAIN_ICON[domain]
}
