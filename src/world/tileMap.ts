import { bridgeAt } from './bridges'

export type Biome =
  | 'grass'
  | 'sand'
  | 'forest'
  | 'rock'
  | 'snow'
  | 'desert'
  | 'plains'
  | 'swamp'

export interface Tile {
  biome: Biome
  height: number
}

export const COLS = 144
export const ROWS = 108

export const CENTER_X = COLS / 2
export const CENTER_Z = ROWS / 2

// World-Y per height class. One class = half a tile-unit tall, so a terrace
// step reads as ~1m instead of the old ~2m (height was used as world Y 1:1).
// `height` itself stays an integer. With climbable terrain (see canStep), a
// single class step (Δheight = 1) is walkable; only a Δ ≥ 2 face is a cliff.
export const GROUND_STEP = 0.5

// The castle sits at the true map centre now (recentered from the old anchored
// core). A flat grass safe-zone disc is forced around it — no river, lake,
// mountain or biome blob inside — so the player always boots onto open ground
// with nothing menacing crowding the keep.
export const CASTLE_CENTER = { x: CENTER_X, z: CENTER_Z } as const
export const CASTLE_SAFE_R = 18

// Procedural map: single island with noisy coast + interior biomes driven by
// temperature × moisture × elevation noise channels, plus carved rivers and
// inland lakes. Kept deterministic, no external dep.
function noiseA(x: number, z: number): number {
  return (
    Math.sin(x * 0.13 + 1.7) * Math.cos(z * 0.11 - 2.3) +
    Math.sin(x * 0.31 + z * 0.29 + 4.5) * 0.5
  )
}
function noiseB(x: number, z: number): number {
  return (
    Math.sin(x * 0.21 - 3.1) * Math.cos(z * 0.19 + 0.7) +
    Math.sin((x + z) * 0.07 + 5.2) * 0.4
  )
}

/** Distance (tiles) from the castle centre — drives the flat safe-zone. */
function distFromCastle(x: number, z: number): number {
  return Math.hypot(x - CASTLE_CENTER.x, z - CASTLE_CENTER.z)
}

// Hand-placed grassy hills (climbable terraces) dotted across the open frontier
// grass. Each hill is multi-tiered: concentric rings step up by one class from
// the foot to a tall core, so it reads as a rounded stepped hill — and because
// each ring differs from its neighbour by exactly one class, the whole hill is
// climbable (see canStep). Tile tops stay discrete so neighbouring boxes stay
// flush (no grid seams).
const PLATEAUS: ReadonlyArray<{ x: number; z: number; r: number; peak: number }> = [
  { x: 40, z: 30, r: 3, peak: 3 }, // NW frontier grass
  { x: 100, z: 34, r: 4, peak: 4 }, // NE frontier
  { x: 52, z: 80, r: 4, peak: 4 }, // S grass
  { x: 96, z: 78, r: 5, peak: 5 }, // SE big hill
  { x: 30, z: 64, r: 4, peak: 4 }, // W grass
]
/** Plateau height class at (x,z): 0 = none, else 2..peak stepped by distance
 *  to the hill centre (concentric terraces, foot=2, core=peak). One class per
 *  ~one tile of distance keeps every neighbour within Δ1 → climbable. */
function plateauHeightAt(x: number, z: number): number {
  for (const p of PLATEAUS) {
    const d = Math.hypot(x - p.x, z - p.z)
    if (d >= p.r) continue
    // map distance (r → 0) onto height class (2 → peak), stepped by one class
    // per tile so the slope is always climbable.
    const tiers = p.peak - 1
    const cls = 2 + Math.floor((1 - d / p.r) * tiers)
    return Math.min(p.peak, Math.max(2, cls))
  }
  return 0
}

// Superellipse (rounded rectangle) island so the grid corners fill with land
// too, giving frontier all the way out to the edges around the centred castle.
const islandRx = COLS / 2 - 1
const islandRz = ROWS / 2 - 1
const ISLAND_EXP = 2.6 // 2 = ellipse; higher = squarer (more corner land)

function isLandShape(x: number, z: number): boolean {
  const dx = Math.abs(x - CENTER_X) / islandRx
  const dz = Math.abs(z - CENTER_Z) / islandRz
  const r = Math.pow(dx, ISLAND_EXP) + Math.pow(dz, ISLAND_EXP)
  const coast = noiseA(x, z) * 0.08
  return r + coast < 1.0
}

function distFromCoast(x: number, z: number): number {
  // Approximate distance (in tile units) from coast or interior water.
  let min = 10
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
  for (const [dx, dz] of dirs) {
    for (let d = 1; d <= 10; d++) {
      if (!isLandShape(x + dx * d, z + dz * d)) {
        if (d < min) min = d
        break
      }
    }
  }
  return min
}

/** Center X of the meandering N-S river at row z. Runs down the western third
 *  of the map (≈x40), well clear of the centred castle's safe-zone. */
function riverX(z: number): number {
  return 40 + Math.sin(z * 0.18) * 5 + Math.sin(z * 0.07 + 1.4) * 3
}

/** Center Z of the E-W river at column x — runs across the north (≈z20). */
function riverZ(x: number): number {
  return 20 + Math.sin(x * 0.13 + 0.7) * 4
}

function isRiverAt(x: number, z: number): boolean {
  // Never carve a channel through the castle safe-zone…
  if (distFromCastle(x, z) < CASTLE_SAFE_R) return false
  // …nor through a mountain mass — the river stops at the mountain foot instead
  // of slicing a gorge straight through the peak.
  if (inMountain(x, z)) return false
  {
    const cx = riverX(z)
    const w = 1.3 + Math.sin(z * 0.5) * 0.3
    if (Math.abs(x - cx) < w) return true
  }
  if (x > 46 && x < COLS - 10) {
    const cz = riverZ(x)
    if (Math.abs(z - cz) < 1.0) return true
  }
  return false
}

// One hand-placed lake in the open grass belt SE of the castle, clear of every
// road, biome region and the castle safe-zone — a small oval pool, not a
// connectivity hazard.
const DELIBERATE_LAKE = { x: 92, z: 80, rx: 5, rz: 3 } as const
function isDeliberateLake(x: number, z: number): boolean {
  const dx = (x - DELIBERATE_LAKE.x) / DELIBERATE_LAKE.rx
  const dz = (z - DELIBERATE_LAKE.z) / DELIBERATE_LAKE.rz
  return dx * dx + dz * dz < 1
}

export function getRiverX(z: number): number {
  return riverX(z)
}
export function getRiverZ(x: number): number {
  return riverZ(x)
}

// Deliberate biome regions arranged in a ring around the centred castle, with
// several mountain masses pushed out toward the map edges (more mountains, not
// forced into a continuous rim). Each region is a soft blob (radius + noise
// wobble) so the edges read organically. Mountains (rock/snow) carry a `peak`
// height class; a gentle climbable apron rises into a steep, partly-cliffed core
// (see mountainHeight). The grass interior (safe-zone) holds the castle.
interface Region {
  x: number
  z: number
  r: number
  biome: Biome
  /** centre height class for mountain biomes (rock/snow) */
  peak?: number
}
const REGIONS: Region[] = [
  // Inner ring around the castle — biomes set back beyond the safe-zone.
  { x: 30, z: 24, r: 20, biome: 'snow', peak: 7 }, // NW snow massif
  { x: 110, z: 26, r: 20, biome: 'desert' }, // NE dunes
  { x: 36, z: 76, r: 18, biome: 'forest' }, // SW deep wood (on solid ground N of the river mouth)
  { x: 116, z: 86, r: 21, biome: 'forest' }, // SE pinewood
  { x: 72, z: 92, r: 17, biome: 'swamp' }, // S marsh
  // Mountain ranges spread around + out toward the edges.
  { x: 20, z: 54, r: 16, biome: 'rock', peak: 8 }, // W range
  { x: 122, z: 56, r: 17, biome: 'rock', peak: 8 }, // E range
  { x: 72, z: 14, r: 15, biome: 'rock', peak: 7 }, // N range
  { x: 134, z: 14, r: 12, biome: 'rock', peak: 6 }, // NE corner peaks
  { x: 12, z: 96, r: 12, biome: 'rock', peak: 6 }, // SW corner peaks
  { x: 96, z: 12, r: 12, biome: 'snow', peak: 6 }, // N snow extension
]

/** True if (x,z) falls inside (or just outside) any mountain region blob
 *  (rock or snow — both are tall now) — used to keep rivers from carving a
 *  channel through the mountains. The +2 margin past the rendered footprint
 *  stops the river cleanly at the foot. */
function inMountain(x: number, z: number): boolean {
  const wob = 2.4 * Math.sin(x * 0.4 + 1.1) + 2.4 * Math.cos(z * 0.36 - 0.7)
  for (const reg of REGIONS) {
    if (reg.peak === undefined) continue
    if (Math.hypot(x - reg.x, z - reg.z) + wob < reg.r + 2) return true
  }
  return false
}

function regionAt(x: number, z: number): Region | null {
  const wob = 2.4 * Math.sin(x * 0.4 + 1.1) + 2.4 * Math.cos(z * 0.36 - 0.7)
  let best: Region | null = null
  let bestEdge = Infinity
  for (const reg of REGIONS) {
    const d = Math.hypot(x - reg.x, z - reg.z) + wob
    const edge = d - reg.r // negative = inside the blob
    if (edge < 0 && edge < bestEdge) {
      bestEdge = edge
      best = reg
    }
  }
  return best
}

/** Mountain height at (x,z): a QUADRATIC profile — gentle near the foot, steep
 *  toward the core. `t` runs 0 at the foot → 1 at the centre; `peak·t²` keeps the
 *  outer apron shallow (≤1-class steps → climbable, so camps/roads at the foot
 *  stay reachable) while the upper core climbs fast enough that many faces jump
 *  ≥2 classes — sheer cliffs you can't scale (but can drop off, with fall
 *  damage; see Character). A mild noise wobble breaks the concentric rings so the
 *  steep bands have occasional climbable notches (passes) instead of a sealed
 *  dome, and gives the silhouette a craggy, uneven look. */
function mountainHeight(x: number, z: number, reg: Region): number {
  const dc = Math.hypot(x - reg.x, z - reg.z)
  const peak = reg.peak ?? 6
  const t = Math.max(0, 1 - dc / reg.r)
  const h = Math.round(peak * t * t + noiseB(x, z) * 0.8)
  return Math.max(1, Math.min(peak, h))
}

function classifyBiome(x: number, z: number): Tile | null {
  if (!isLandShape(x, z)) return null

  // Castle safe-zone: flat open grass, forced before anything else so no river,
  // lake, mountain or biome blob can intrude on the keep's surroundings.
  if (distFromCastle(x, z) < CASTLE_SAFE_R) return { biome: 'grass', height: 1 }

  if (isRiverAt(x, z)) return null

  const d = distFromCoast(x, z)
  // Procedural inland lakes are disabled: they scattered randomly and chopped
  // biomes/mountains into pockets the road network couldn't reach. A single
  // deliberate lake lives in a basin instead (see DELIBERATE_LAKE).
  if (isDeliberateLake(x, z)) return null // carve the one hand-placed lake

  // Beach ring around coastlines and lake edges.
  if (d <= 1) return { biome: 'sand', height: 1 }

  // Hand-placed grassy hills (climbable terraces) before regional biomes.
  const ph = plateauHeightAt(x, z)
  if (ph) return { biome: 'grass', height: ph }

  // Regional biome placement.
  const reg = regionAt(x, z)
  if (reg) {
    if (reg.peak !== undefined) {
      // Mountain biome (rock / snow): tall climbable mass.
      return { biome: reg.biome, height: mountainHeight(x, z, reg) }
    }
    return { biome: reg.biome, height: 1 }
  }

  // Scattered grass-belt forest clumps so the green isn't uniform.
  const forestN = noiseA(x, z) * noiseB(x + 7, z - 3)
  if (forestN > 0.62) return { biome: 'forest', height: 1 }

  return { biome: 'grass', height: 1 }
}

// Cache full tile grid once.
let cachedTiles: (Tile | null)[][] | null = null

function ensureTiles(): (Tile | null)[][] {
  if (cachedTiles) return cachedTiles
  const rows: (Tile | null)[][] = []
  for (let z = 0; z < ROWS; z++) {
    const row: (Tile | null)[] = []
    for (let x = 0; x < COLS; x++) {
      row.push(classifyBiome(x, z))
    }
    rows.push(row)
  }
  cachedTiles = rows
  return rows
}

export function buildTiles(): (Tile | null)[][] {
  return ensureTiles()
}

export function tileAt(x: number, z: number): Tile | null {
  if (x < 0 || z < 0 || x >= COLS || z >= ROWS) return null
  return ensureTiles()[z][x]
}

export function isLand(x: number, z: number): boolean {
  return tileAt(x, z) !== null
}

/**
 * World-Y of the top (walkable surface) of tile (x,z) — the single source of
 * truth for ground height. Stepped by GROUND_STEP per height class. Base ground
 * (height 1) sits at y=1; water / off-map returns 0. Tile tops are kept flat
 * (no per-tile relief) so neighbouring boxes stay flush.
 */
export function tileTopY(x: number, z: number): number {
  const t = tileAt(x, z)
  if (!t) return 0
  return 1 + (t.height - 1) * GROUND_STEP
}

/** Height class at a tile center, treating a bridge span as class 1 (its deck
 *  sits near base ground). null = not standable (open water / off-map). */
function heightClassAt(cx: number, cz: number): number | null {
  const t = tileAt(cx, cz)
  if (t) return t.height
  if (bridgeAt(cx + 0.5, cz + 0.5) !== null) return 1
  return null
}

/** True if an entity can stand on tile (cx,cz): any land height (all terrain is
 *  climbable now) or a bridge deck. Open water / off-map is not standable. */
export function standable(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) return false
  return heightClassAt(cx, cz) !== null
}

/** Shared climb rule — the single source of truth for terrain step feasibility,
 *  used by pathfinding AND player/mob movement so they always agree. A step
 *  from (fx,fz) to (tx,tz) is allowed when the target is standable and the
 *  height-class difference is at most one (a Δ ≥ 2 face is an impassable cliff).
 *  Does NOT consider props/houses — callers layer those checks on top. */
export function canStep(fx: number, fz: number, tx: number, tz: number): boolean {
  const tc = heightClassAt(tx, tz)
  if (tc === null) return false
  const fc = heightClassAt(fx, fz)
  if (fc === null) return false
  return Math.abs(tc - fc) <= 1
}

/** Player movement rule — like canStep but one-directional. You may DROP off any
 *  height (the caller lets gravity carry you down and applies fall damage on
 *  landing), but you still cannot CLIMB a face taller than one class. Used only
 *  by the player; mobs keep the symmetric canStep so A* never routes them off a
 *  cliff to their death. */
export function canStepOrDrop(fx: number, fz: number, tx: number, tz: number): boolean {
  const tc = heightClassAt(tx, tz)
  if (tc === null) return false
  const fc = heightClassAt(fx, fz)
  if (fc === null) return false
  return tc - fc <= 1 // any drop allowed; climbing limited to one class
}
