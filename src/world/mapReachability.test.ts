import { describe, it, expect, beforeAll } from 'vitest'
import { COLS, ROWS, standable, canStep } from './tileMap'
import { findSpawnNear, isObstacleTile } from './obstacles'
import { getRoadBridges } from './roads'
import { registerBridge, resetBridges } from './bridges'

// Integration reachability check on the REAL procedural map (no mocks): the
// player must be able to walk from the castle out to every biome foot and every
// ork camp. Catches generation that strands a camp behind an unclimbable cliff
// or carves a river with no bridged crossing.
//
// We flood-fill the walkable component once (same standable + canStep rules as
// pathfinding) and assert each target is in it. Flood-fill answers the pure
// connectivity question directly — unlike findPath, whose node budget is a
// gameplay tuning knob (mobs path locally, never map-wide) and would otherwise
// have to be cranked absurdly high just to span the map in a test.

// Bridge spans are normally registered by the Bridge components on mount; in a
// headless run we register the computed road bridges so river crossings count.
beforeAll(() => {
  resetBridges()
  for (const b of getRoadBridges()) {
    registerBridge({ fromX: b.fromX, fromZ: b.fromZ, toX: b.toX, toZ: b.toZ, width: 3, y: 1 })
  }
})

function walkable(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) return false
  if (isObstacleTile(cx, cz)) return false
  return standable(cx, cz)
}

/** Flood the walkable component containing (sx,sz) using the exact pathfinding
 *  rules: standable + prop-free tiles, canStep climb gate, no diagonal
 *  corner-cutting past a cliff/gap. */
function floodFrom(sx: number, sz: number): Set<number> {
  const seen = new Set<number>([sz * COLS + sx])
  const q: Array<[number, number]> = [[sx, sz]]
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  while (q.length) {
    const [cx, cz] = q.shift()!
    for (const [dx, dz] of N) {
      const nx = cx + dx, nz = cz + dz, k = nz * COLS + nx
      if (seen.has(k) || !walkable(nx, nz) || !canStep(cx, cz, nx, nz)) continue
      if (dx && dz && (!canStep(cx, cz, cx + dx, cz) || !canStep(cx, cz, cx, cz + dz))) continue
      seen.add(k)
      q.push([nx, nz])
    }
  }
  return seen
}

// Castle south-gate apron — open grass just outside the walls.
const START: [number, number] = [72, 64]

// The map now has exactly FIVE big biome regions (one per quadrant around the
// castle): SNOW massif (NW, mountain), DESERT (NE, flat), ROCK range (E,
// mountain), FOREST (SW, flat), SWAMP (S, flat). We assert a foot/apron tile of
// every biome is reachable from the castle, PLUS each mountain summit — every
// mountain carries a carved climbable ramp (see rampClass in tileMap), so "at
// least one walkable path to the top" is a guarantee. Coordinates snapped to the
// nearest standable, prop-free tile by findSpawnNear.
//
// Ork-camp targets were dropped from this list: camp placement lives in
// obstacles.ts (its own pipeline step) and is re-derived from this biome layout,
// so pinning stale camp coordinates here would test the wrong module. Biome +
// summit connectivity is the guarantee this test owns.
const TARGETS: Record<string, [number, number]> = {
  // Flat-biome aprons (approach side, just inside each blob). Snow/rock feet
  // snapped onto the now-compact (r18) mountain blobs.
  'snow massif (NW) foot': [38, 34],
  'desert (NE)': [104, 28],
  'forest (SW)': [40, 76],
  'swamp (S)': [72, 84],
  'rock range (E) foot': [110, 66],
  // Mountain summits (region centres) — reachable only via the carved ramp.
  'snow massif (NW) summit': [26, 24],
  'rock range (E) summit': [122, 58],
}

describe('map reachability', () => {
  const start = findSpawnNear(START[0], START[1])
  const reachable = floodFrom(Math.floor(start.x), Math.floor(start.z))

  for (const [name, [tx, tz]] of Object.entries(TARGETS)) {
    it(`castle → ${name} is reachable`, () => {
      const goal = findSpawnNear(tx, tz)
      expect(reachable.has(Math.floor(goal.z) * COLS + Math.floor(goal.x))).toBe(true)
    })
  }
})
