// The chart: a draggable globe or a flat world map, with a ring for every
// place that has stories. Drawn like an aviation chart: graticule, land in
// chart tint, and airspace-style rings sized by how many stories a place has.

import { geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo'
import { Globe, Map as MapIcon, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import landTopo from 'world-atlas/land-110m.json'
import type { Hotspot } from './cards'

const W = 520
const H = 520
// Natural Earth is about twice as wide as tall, so the flat map gets a shorter box.
const FLAT_H = 280
const land = feature(landTopo as unknown as Topology, (landTopo as unknown as Topology).objects.land as GeometryCollection)
const graticule = geoGraticule10()
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

type Props = {
  spots: Hotspot[]
  selected?: string
  highlighted?: string
  onSelect: (place: string | undefined) => void
}

export function MapView({ spots, selected, highlighted, onSelect }: Props) {
  const [mode, setMode] = useState<'globe' | 'flat'>('globe')
  // Start over Europe and the Middle East, where most drone news is.
  const [rotate, setRotate] = useState<[number, number]>([-35, -32])
  const [hover, setHover] = useState<Hotspot | null>(null)
  const drag = useRef<{ x: number; y: number; r: [number, number] } | null>(null)

  const projection: GeoProjection = useMemo(() => {
    if (mode === 'globe') return geoOrthographic().scale(W / 2 - 8).translate([W / 2, H / 2]).rotate(rotate).clipAngle(90)
    return geoNaturalEarth1().fitExtent([[4, 4], [W - 4, FLAT_H - 4]], { type: 'Sphere' })
  }, [mode, rotate])
  const path = useMemo(() => geoPath(projection), [projection])

  // Turn the globe to face a place picked from the feed or the list.
  useEffect(() => {
    if (mode !== 'globe' || !highlighted) return
    const spot = spots.find(s => s.name === highlighted)
    if (!spot) return
    const target: [number, number] = [-spot.lon, -spot.lat]
    if (reduceMotion) return setRotate(target)
    let frame = 0
    const start = rotate
    const step = () => {
      frame++
      const t = Math.min(1, frame / 24)
      const ease = 1 - (1 - t) ** 3
      setRotate([start[0] + (target[0] - start[0]) * ease, start[1] + (target[1] - start[1]) * ease])
      if (t < 1) raf = requestAnimationFrame(step)
    }
    let raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // Only when the highlighted place changes, not on every rotation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted, mode])

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (mode !== 'globe') return
    drag.current = { x: e.clientX, y: e.clientY, r: rotate }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const k = 0.35
    setRotate([d.r[0] + (e.clientX - d.x) * k, Math.max(-80, Math.min(80, d.r[1] - (e.clientY - d.y) * k))])
  }
  const endDrag = () => (drag.current = null)
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (mode !== 'globe') return
    const moves: Record<string, [number, number]> = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    setRotate(([a, b]) => [a + m[0], Math.max(-80, Math.min(80, b + m[1]))])
  }

  const max = Math.max(1, ...spots.map(s => s.count))
  const visible = spots
    .map(s => {
      // Hide points on the far side of the globe.
      if (mode === 'globe' && angularDistance([-rotate[0], -rotate[1]], [s.lon, s.lat]) > 88) return null
      const xy = projection([s.lon, s.lat])
      return xy ? { s, x: xy[0], y: xy[1], r: 5 + 13 * Math.sqrt(s.count / max) } : null
    })
    .filter((v): v is NonNullable<typeof v> => !!v)
    .sort((a, b) => b.r - a.r)

  return (
    <div className="chart">
      <div className="chart-bar">
        <div className="seg" role="group" aria-label="Map style">
          <button className={mode === 'globe' ? 'on' : ''} onClick={() => setMode('globe')} aria-pressed={mode === 'globe'}>
            <Globe size={15} aria-hidden /> Globe
          </button>
          <button className={mode === 'flat' ? 'on' : ''} onClick={() => setMode('flat')} aria-pressed={mode === 'flat'}>
            <MapIcon size={15} aria-hidden /> Flat map
          </button>
        </div>
        {selected && (
          <button className="place-chip" onClick={() => onSelect(undefined)}>
            {selected} <X size={14} aria-label="Show all places" />
          </button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${mode === 'globe' ? H : FLAT_H}`}
        className={`chart-svg ${mode}`}
        role="img"
        aria-label={mode === 'globe' ? 'Globe of drone stories. Drag or use the arrow keys to turn it.' : 'World map of drone stories'}
        tabIndex={mode === 'globe' ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKey}
      >
        {mode === 'globe' && <circle cx={W / 2} cy={H / 2} r={W / 2 - 8} className="sea" />}
        {mode === 'flat' && <path d={path({ type: 'Sphere' }) ?? ''} className="sea" />}
        <path d={path(graticule) ?? ''} className="graticule" />
        <path d={path(land) ?? ''} className="land" />
        {mode === 'globe' && <circle cx={W / 2} cy={H / 2} r={W / 2 - 8} className="rim" />}

        {visible.map(({ s, x, y, r }) => {
          const kind = s.military && s.civilian ? 'both' : s.civilian ? 'civilian' : 'military'
          const isOn = s.name === selected || s.name === highlighted
          return (
            <g
              key={s.name}
              className={`spot ${kind}${isOn ? ' on' : ''}${s.isNew ? ' new' : ''}`}
              transform={`translate(${x},${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${s.name}: ${s.count} ${s.count === 1 ? 'story' : 'stories'}`}
              onClick={e => {
                e.stopPropagation()
                onSelect(s.name === selected ? undefined : s.name)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(s.name === selected ? undefined : s.name)
                }
              }}
              onPointerDown={e => e.stopPropagation()}
              onPointerEnter={() => setHover(s)}
              onPointerLeave={() => setHover(h => (h === s ? null : h))}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(h => (h === s ? null : h))}
            >
              <circle r={r * 1.6} className="ring outer" />
              <circle r={r} className="ring" />
              <circle r={2.4} className="dot" />
            </g>
          )
        })}
      </svg>

      {hover && (
        <p className="chart-tip" aria-live="polite">
          <b>{hover.name}</b> {hover.count} {hover.count === 1 ? 'story' : 'stories'}
          {hover.military > 0 && hover.civilian > 0 ? ', military and civilian' : hover.civilian ? ', civilian' : ', military'}
        </p>
      )}
      {!hover && (
        <p className="chart-tip muted">
          {spots.length
            ? `${spots.length} places in the news. ${mode === 'globe' ? 'Drag to turn the globe, then pick' : 'Pick'} a ring to see its stories.`
            : 'No stories with a known place match these filters.'}
        </p>
      )}
    </div>
  )
}

function angularDistance([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const r = Math.PI / 180
  const a = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r)
  return Math.acos(Math.max(-1, Math.min(1, a))) / r
}
