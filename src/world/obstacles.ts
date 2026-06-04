import { tileAt, tileTopY, standable, isMountainRampTile, COLS, ROWS, type Biome } from './tileMap'
import { isInsideCastle, snapToCardinal } from './cityPlan'
import { isRoadTile } from './roads'
import { LANDMARKS } from './landmarks'

export type ObstacleKind =
  | 'tree'
  | 'birch'
  | 'snowPine'
  | 'deadTree'
  | 'bush'
  | 'rock'
  | 'boulder'
  | 'mushroom'
  | 'flower'
  | 'tuft'
  | 'cactus'
  // New themed props (one per signature biome): icy crystals on the snow massif,
  // sun-bleached skeletons across the dunes, marsh reeds clumping in the swamp.
  | 'iceShard'
  | 'bones'
  | 'reeds'

export interface Obstacle {
  kind: ObstacleKind
  x: number
  z: number
  y: number
  radius: number
  scale: number
  rot: number
  variant: number
}

// ─── Hand-placed structure anchors (re-derived for the five-big-biome map) ──
// Authoritative ork-camp positions. Re-derived from the new biome layout
// (SNOW NW · DESERT NE · ROCK E · FOREST SW · SWAMP S, castle at 72,54): each
// camp sits on a FLAT, reachable apron at the foot/approach of a different
// biome, well outside the castle safe-zone (radius 18) and clear of every
// mountain cliff core. Verified walkable + reachable by the map-reachability
// test (flood-fill from the castle) and scripts/probe-box.mjs.
//
// NB: World.tsx renders <OrkCamp> at literal coords; keep those in sync with
// this list. Same count + shape as before (3 camps) — only the coordinates and
// guarded biome changed.
export interface CampSlot {
  x: number
  z: number
  /** the biome this camp guards the approach to */
  biome: Biome
}
export const ORK_CAMPS: readonly CampSlot[] = [
  { x: 74, z: 26, biome: 'snow' }, // N — snow/desert frontier (flat grass apron)
  { x: 92, z: 44, biome: 'desert' }, // E — desert dunes at the rock-range foot
  { x: 42, z: 64, biome: 'forest' }, // W — clearing deep in the SW wood
] as const

// Hand-placed structure footprints to keep clear of scatter (camps + hamlet +
// market). The castle interior is handled separately (see isInsideCastle in
// isReserved). Camp boxes are derived from ORK_CAMPS so the cleared clearing
// always tracks the camp; the hamlet/market are fixed frontier spots.
const RESERVED = new Set<string>(
  (() => {
    const r: string[] = []
    const box = (x0: number, x1: number, z0: number, z1: number) => {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) r.push(`${x},${z}`)
    }
    // A 7×7 clearing around each ork camp (matches the camp's local spawn reach).
    for (const c of ORK_CAMPS) box(c.x - 3, c.x + 3, c.z - 3, c.z + 3)
    // Northwest frontier hamlet (flat snow-foot grass, just NW of the castle).
    box(62, 70, 28, 36)
    // Market stall just outside the south gate.
    box(65, 71, 68, 74)
    // NE desert caravan market — the trader village (see TraderVillage.tsx).
    box(90, 102, 28, 38)
    // Biome signature landmarks — clear a margin around each so scatter never
    // grows up through the monument (footprint shared via landmarks.ts).
    for (const l of LANDMARKS) box(l.x - l.r - 1, l.x + l.r + 1, l.z - l.r - 1, l.z + l.r + 1)
    return r
  })(),
)

function isReserved(x: number, z: number): boolean {
  // Trim any scatter inside the castle walls so structures place cleanly.
  if (isInsideCastle(x, z)) return true
  // Never scatter props on a road tile.
  if (isRoadTile(x, z)) return true
  // Keep the climbable ramp up each mountain clear so a prop can never wall off
  // the one guaranteed path to the summit (reads as a cleared switchback).
  if (isMountainRampTile(x, z)) return true
  return RESERVED.has(`${x},${z}`)
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Smaller-than-visual radii; small props are walk-through.
const RADIUS_BY_KIND: Record<ObstacleKind, number> = {
  tree: 0.16,
  birch: 0.14,
  snowPine: 0.16,
  deadTree: 0.12,
  bush: 0, // small bushes are walk-through
  rock: 0,
  boulder: 0.34,
  mushroom: 0,
  flower: 0,
  tuft: 0,
  cactus: 0.18,
  // A tall ice spire reads as a small obstacle; bones lie flat on the sand and
  // reeds are flimsy low growth, so both are walk-through (radius 0).
  iceShard: 0.12,
  bones: 0,
  reeds: 0,
}

let cached: Obstacle[] | null = null

export function getObstacles(): Obstacle[] {
  if (cached) return cached
  cached = generate()
  return cached
}

function push(out: Obstacle[], kind: ObstacleKind, x: number, z: number, scale: number, rot: number, variant: number) {
  const baseTile = tileAt(Math.floor(x), Math.floor(z))
  const y = baseTile ? tileTopY(Math.floor(x), Math.floor(z)) : 1
  out.push({
    kind,
    x,
    z,
    y,
    radius: RADIUS_BY_KIND[kind],
    scale,
    rot,
    variant,
  })
}

// Per-biome cumulative roll table: a single rand() in [0,1) picks the first
// entry whose `until` it falls under, so each entry's slice width = its spawn
// chance and the LAST `until` per biome ≈ that biome's overall scatter density.
// Retuned so every biome reads as a distinct "adventure": each has signature
// props + a deliberately different density (FOREST densest, SNOW/DESERT sparse).
type Roll = { kind: ObstacleKind; until: number; clusterMin?: number; clusterMax?: number }
const ROLLS: Record<Biome, Roll[]> = {
  // GRASS frontier — open meadow: tufts + flowers with a touch of life
  // (occasional tree/bush/mushroom). Light density (~0.34).
  grass: [
    { kind: 'tree', until: 0.05 },
    { kind: 'birch', until: 0.08 },
    { kind: 'bush', until: 0.12 },
    { kind: 'rock', until: 0.14 },
    { kind: 'boulder', until: 0.15 },
    { kind: 'mushroom', until: 0.17, clusterMin: 1, clusterMax: 2 },
    { kind: 'flower', until: 0.25, clusterMin: 2, clusterMax: 4 },
    { kind: 'tuft', until: 0.5, clusterMin: 1, clusterMax: 2 },
  ],
  // FOREST — the DENSEST biome: thick trees + birch, heavy undergrowth of
  // bushes + mushrooms, scattered flowers/tufts. Should feel hard to see through.
  forest: [
    { kind: 'tree', until: 0.34 },
    { kind: 'birch', until: 0.48 },
    { kind: 'deadTree', until: 0.52 },
    { kind: 'bush', until: 0.68 },
    { kind: 'mushroom', until: 0.8, clusterMin: 2, clusterMax: 3 },
    { kind: 'flower', until: 0.85, clusterMin: 1, clusterMax: 2 },
    { kind: 'tuft', until: 0.97, clusterMin: 1, clusterMax: 2 },
  ],
  // SAND beach ring — almost bare: a few tufts, the odd rock or bone washed up.
  sand: [
    { kind: 'rock', until: 0.04 },
    { kind: 'bones', until: 0.05 },
    { kind: 'tuft', until: 0.1 },
  ],
  // ROCK highlands — rugged + DENSE stone: boulders + rocks everywhere, a few
  // dead trees clinging on, sparse moss-tufts. (Ramp corridor stays reserved.)
  rock: [
    { kind: 'boulder', until: 0.16 },
    { kind: 'rock', until: 0.4 },
    { kind: 'deadTree', until: 0.45 },
    { kind: 'bush', until: 0.48 },
    { kind: 'tuft', until: 0.55 },
  ],
  // SNOW massif — sparse + cold: snow-pines and glinting ice shards, the odd
  // frosted rock/boulder. Low density so the white slopes read clean.
  snow: [
    { kind: 'snowPine', until: 0.18 },
    { kind: 'iceShard', until: 0.28, clusterMin: 1, clusterMax: 2 },
    { kind: 'rock', until: 0.33 },
    { kind: 'boulder', until: 0.35 },
    { kind: 'deadTree', until: 0.37 },
  ],
  // DESERT dunes — sparse + sun-bleached: cacti, scattered bones (skulls/ribs),
  // the occasional rock. Lots of empty sand between props.
  desert: [
    { kind: 'cactus', until: 0.07 },
    { kind: 'bones', until: 0.13, clusterMin: 1, clusterMax: 2 },
    { kind: 'rock', until: 0.17 },
    { kind: 'deadTree', until: 0.18 },
  ],
  // PLAINS — unused by the current map, kept for export-shape stability: open
  // grassland feel (flowers + tufts).
  plains: [
    { kind: 'flower', until: 0.18, clusterMin: 2, clusterMax: 4 },
    { kind: 'tuft', until: 0.55, clusterMin: 1, clusterMax: 3 },
    { kind: 'rock', until: 0.58 },
    { kind: 'tree', until: 0.6 },
  ],
  // SWAMP — murky + cluttered low growth: dead trees, clumps of reeds, mushroom
  // patches, the odd bush. Dense at ground level, gnarled overhead — but kept
  // just under the forest's thickness so the wood stays the densest biome.
  swamp: [
    { kind: 'deadTree', until: 0.14 },
    { kind: 'reeds', until: 0.34, clusterMin: 2, clusterMax: 3 },
    { kind: 'mushroom', until: 0.48, clusterMin: 1, clusterMax: 3 },
    { kind: 'bush', until: 0.54 },
    { kind: 'tuft', until: 0.66, clusterMin: 1, clusterMax: 2 },
  ],
}

function generate(): Obstacle[] {
  const rand = rng(2027)
  const out: Obstacle[] = []
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      const tile = tileAt(x, z)
      if (!tile) continue
      if (isReserved(x, z)) continue

      const rolls = ROLLS[tile.biome]
      const r = rand()
      let picked: Roll | null = null
      for (const roll of rolls) {
        if (r < roll.until) {
          picked = roll
          break
        }
      }
      if (!picked) continue

      // Thin collidable props so the map reads full but stays easy to move
      // through (user: ~30% too dense). Trees drop ~65%, other body-blocking
      // props (boulders, cactus) drop ~30%. Walk-through decor is untouched.
      if (picked.kind === 'tree' || picked.kind === 'birch' || picked.kind === 'snowPine') {
        if (rand() < 0.65) continue
      } else if (RADIUS_BY_KIND[picked.kind] > 0) {
        if (rand() < 0.3) continue
      }

      const cx = x + 0.5 + (rand() - 0.5) * 0.4
      const cz = z + 0.5 + (rand() - 0.5) * 0.4
      // Grid-based: every placed model snaps to a cardinal rotation.
      const rot = snapToCardinal(rand() * Math.PI * 2)
      const scale = 0.85 + rand() * 0.45
      const variant = Math.floor(rand() * 4)

      if (picked.clusterMin !== undefined) {
        const count = picked.clusterMin + Math.floor(rand() * (picked.clusterMax! - picked.clusterMin + 1))
        for (let i = 0; i < count; i++) {
          push(
            out,
            picked.kind,
            x + rand(),
            z + rand(),
            0.7 + rand() * 0.5,
            snapToCardinal(rand() * Math.PI * 2),
            Math.floor(rand() * 4),
          )
        }
      } else {
        push(out, picked.kind, cx, cz, scale, rot, variant)
      }
    }
  }
  return out
}

// Spatial index for collision: collidable obstacles (radius > 0) bucketed by
// their tile. A query only needs to test the 3×3 tile block around the point —
// the largest possible collision reach (max query radius ~0.5 + max obstacle
// radius 0.34 < 1 tile) can't pull in a prop more than one tile away. This turns
// obstacleCollidesAt from an O(all-props) scan (it was the #1 CPU cost in the
// profile — every moving entity queried every prop on the map, twice a frame)
// into O(props in 9 tiles) ≈ a handful. Results are identical to the old scan.
let collisionGrid: Map<number, Obstacle[]> | null = null

function buildCollisionGrid(): Map<number, Obstacle[]> {
  const g = new Map<number, Obstacle[]>()
  for (const o of getObstacles()) {
    if (o.radius <= 0) continue
    const key = Math.floor(o.z) * COLS + Math.floor(o.x)
    let cell = g.get(key)
    if (!cell) g.set(key, (cell = []))
    cell.push(o)
  }
  return g
}

export function obstacleCollidesAt(x: number, z: number, r: number): boolean {
  if (!collisionGrid) collisionGrid = buildCollisionGrid()
  const cx = Math.floor(x)
  const cz = Math.floor(z)
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = collisionGrid.get((cz + dz) * COLS + (cx + dx))
      if (!cell) continue
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i]
        const ox = x - o.x
        const oz = z - o.z
        const rsum = r + o.radius
        if (ox * ox + oz * oz < rsum * rsum) return true
      }
    }
  }
  return false
}

// ─── Pathing / spawn helpers ───────────────────────────────────
// Tiles that contain a collidable prop (radius > 0). Used to make A* and spawns
// route around trees/boulders instead of getting wedged against them.
let blockedTiles: Set<number> | null = null

function buildBlockedTiles(): Set<number> {
  const s = new Set<number>()
  for (const o of getObstacles()) {
    if (o.radius > 0) s.add(Math.floor(o.z) * COLS + Math.floor(o.x))
  }
  return s
}

/** True if a collidable obstacle sits in tile (cx, cz). */
export function isObstacleTile(cx: number, cz: number): boolean {
  if (!blockedTiles) blockedTiles = buildBlockedTiles()
  return blockedTiles.has(cz * COLS + cx)
}

/**
 * Find the nearest standable, obstacle-free tile center to (x, z), searching
 * outward in rings. Falls back to the rounded input if nothing is found.
 * Used to validate creature spawns so they never start on water or in a prop.
 */
export function findSpawnNear(x: number, z: number, maxR = 8): { x: number; z: number } {
  const ox = Math.floor(x)
  const oz = Math.floor(z)
  for (let r = 0; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue // current ring only
        const cx = ox + dx
        const cz = oz + dz
        // Any standable tile (incl. climbable mountain shelves where ork camps
        // sit) that isn't holding a prop. Shared rule with pathfinding/movement.
        if (standable(cx, cz) && !isObstacleTile(cx, cz)) {
          return { x: cx + 0.5, z: cz + 0.5 }
        }
      }
    }
  }
  return { x: ox + 0.5, z: oz + 0.5 }
}
