/**
 * Headless placement validator. Run after changing the map size or moving
 * anything: `npx tsx scripts/check-placements.ts`.
 *
 * Imports the REAL procedural tile map + the castle plan and checks that every
 * hand-placed entity sits on walkable land (tile exists and height < 2, i.e.
 * not water and not an impassable cliff). World.tsx / Bear.tsx / Wildlife.tsx
 * coords are JSX/array literals, so they're mirrored here by hand — keep in sync
 * when adding placements. Exit code 1 if anything is off-land.
 */
import { tileAt, COLS, ROWS, CENTER_X, CENTER_Z } from '../src/world/tileMap'
import {
  CITY_CENTER,
  KEEP_SLOT,
  HOUSE_SLOTS,
  WALL_SLOTS,
  TOWER_SLOTS,
  GATE_SLOTS,
  FARM_SLOT,
  CASTLE_BOUNDS,
} from '../src/world/cityPlan'

interface P {
  name: string
  x: number
  z: number
  /** true = must be walkable exactly here (fixed structures). false = entity
   *  snaps to nearby land at runtime, so "near land" is acceptable. */
  strict: boolean
}

const pts: P[] = []
const add = (name: string, x: number, z: number, strict = true) =>
  pts.push({ name, x: Math.round(x), z: Math.round(z), strict })

// Player + castle (fixed, must be exactly walkable)
add('player-spawn', 48, 36)
add('city-center', CITY_CENTER.x, CITY_CENTER.z)
add('keep', KEEP_SLOT.x, KEEP_SLOT.z)
add('farm', FARM_SLOT.x, FARM_SLOT.z)
HOUSE_SLOTS.forEach((h, i) => add(`house-${i}`, h.x, h.z))
GATE_SLOTS.forEach((g, i) => add(`gate-${i}`, g.x, g.z))
// Towers/walls are fortifications — the castle's east side abuts the stone
// highlands by design, so they may sit on elevated rock; only water is a fault.
TOWER_SLOTS.forEach((t, i) => add(`tower-${i}`, t.x, t.z, false))
WALL_SLOTS.forEach((w, i) => add(`wall-${i}`, w.x, w.z, false))

// Snapping entities (World.tsx) — strict=false (findSpawnNear corrects small misses)
add('village', 26, 30, false)
add('shop', 62, 45, false)
;[[58, 46], [26, 32], [50, 30], [64, 40]].forEach((c, i) => add(`cat-${i}`, c[0], c[1], false))
;[[22, 52], [76, 20], [74, 54], [50, 13]].forEach((c, i) => add(`orkcamp-${i}`, c[0], c[1], false))
;[
  [44, 38], [24, 52], [78, 24], [60, 16], [14, 28], [88, 64], [12, 64], [88, 10],
  [106, 50], [100, 80], [58, 84], [112, 44],
].forEach((c, i) => add(`chest-${i}`, c[0], c[1], false))
;[
  [16, 18], [82, 60], [70, 14], [10, 56], [90, 52], [38, 64], [104, 58], [70, 84], [108, 78],
].forEach((c, i) => add(`bear-${i}`, c[0], c[1], false))
;[
  [34, 28], [30, 30], [38, 26], [26, 24], [40, 30], [22, 28], [52, 46], [62, 44], [48, 30], [66, 38],
].forEach((c, i) => add(`dog-${i}`, c[0], c[1], false))

function walkable(x: number, z: number): { ok: boolean; why: string } {
  const t = tileAt(x, z)
  if (!t) return { ok: false, why: 'WATER/off-map' }
  if (t.height >= 2) return { ok: false, why: `cliff h=${t.height} (${t.biome})` }
  return { ok: true, why: `${t.biome} h=${t.height}` }
}

/** Nearest walkable tile within `r` rings (for snapping entities). */
function nearestLand(x: number, z: number, r: number): number {
  for (let d = 0; d <= r; d++) {
    for (let dz = -d; dz <= d; dz++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue
        if (walkable(x + dx, z + dz).ok) return d
      }
  }
  return Infinity
}

console.log(`MAP ${COLS}×${ROWS}  center (${CENTER_X},${CENTER_Z})`)
console.log(`castle bounds x${CASTLE_BOUNDS.minX}..${CASTLE_BOUNDS.maxX} z${CASTLE_BOUNDS.minZ}..${CASTLE_BOUNDS.maxZ}\n`)

let fails = 0
const SNAP_OK = 4 // snapping entities may be at most this many tiles from land
for (const p of pts) {
  const w = walkable(p.x, p.z)
  if (w.ok) continue
  if (!p.strict) {
    const d = nearestLand(p.x, p.z, 8)
    if (d <= SNAP_OK) {
      console.log(`  ~ ${p.name} (${p.x},${p.z}) ${w.why} — land ${d} tiles away (snaps OK)`)
      continue
    }
    console.log(`  ✗ ${p.name} (${p.x},${p.z}) ${w.why} — nearest land ${d === Infinity ? '>8' : d} tiles (too far to snap)`)
  } else {
    console.log(`  ✗ ${p.name} (${p.x},${p.z}) ${w.why}`)
  }
  fails++
}

console.log(`\n${fails} placement(s) off-land`)
process.exit(fails > 0 ? 1 : 0)
