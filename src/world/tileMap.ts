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
// `height` itself stays an integer — cliff logic (height >= 2) is unchanged;
// only the world surface (tileTopY) is rescaled by this.
export const GROUND_STEP = 0.5

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

// Broad-scale moisture: wet patches scattered around.
function moistureAt(x: number, z: number): number {
  return (
    Math.sin(z * 0.04 + 2.4) * 0.6 +
    Math.cos(x * 0.05 - 0.7) * 0.55
  )
}

// Hand-placed grassy hills (impassable terraces) dotted across open frontier
// grass — each verified clear of roads, the castle and every placed entity
// (see scripts/find-plateau-spots.ts). Each hill is multi-tiered: concentric
// rings step up from class 2 at the foot to a tall core, so it reads as a
// rounded stepped hill instead of a flat slab. `peak` sets the core class. Tile
// tops stay discrete (no per-tile jitter) so neighbouring boxes stay flush — no
// grid seams.
const PLATEAUS: ReadonlyArray<{ x: number; z: number; r: number; peak: number }> = [
  { x: 34, z: 18, r: 3, peak: 3 }, // NW frontier grass
  { x: 32, z: 38, r: 3, peak: 3 }, // W grass
  { x: 52, z: 54, r: 4, peak: 4 }, // S grass
  { x: 44, z: 58, r: 5, peak: 5 }, // S grass (big hill)
  { x: 128, z: 58, r: 5, peak: 5 }, // far-E frontier
  { x: 58, z: 68, r: 4, peak: 4 }, // S-central
  { x: 14, z: 76, r: 4, peak: 4 }, // SW coast
  { x: 82, z: 84, r: 5, peak: 6 }, // SE big hill
]
/** Plateau height class at (x,z): 0 = none, else 2..peak stepped by distance
 *  to the hill centre (concentric terraces, foot=2, core=peak). */
function plateauHeightAt(x: number, z: number): number {
  const wob = Math.sin(x * 0.6 + 1) * 0.4 + Math.cos(z * 0.55 - 0.4) * 0.4
  for (const p of PLATEAUS) {
    const d = Math.hypot(x - p.x, z - p.z) + wob
    if (d >= p.r) continue
    // map distance (r → 0) onto height class (2 → peak), stepped.
    const tiers = p.peak - 1 // classes above 1
    const cls = 2 + Math.floor((1 - d / p.r) * tiers)
    return Math.min(p.peak, Math.max(2, cls))
  }
  return 0
}

// Lake mask noise — produces small isolated wet pools.
function lakeAt(x: number, z: number): number {
  return (
    Math.sin(x * 0.18 + 0.3) * Math.cos(z * 0.22 - 1.1) +
    Math.sin((x * 0.41 - z * 0.37) + 2.8) * 0.4
  )
}

// Push the coastline almost to the grid edge AND use a superellipse (rounded
// rectangle) instead of a plain ellipse so the island fills the grid corners
// too. The grid is 124×94; the island grows around its centre while the old
// core (castle, camps, villages, rivers) stays anchored at its original coords,
// so the extra ~30% of land opens up as fresh frontier to the east and south.
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

/** Center X of the meandering N-S river at row z. Anchored to the absolute
 *  x≈40 line (not CENTER_X) so the river stays put when the grid grows — the
 *  castle, gate roads and their bridges are all authored around this crossing. */
function riverX(z: number): number {
  return 40 + Math.sin(z * 0.18) * 5 + Math.sin(z * 0.07 + 1.4) * 3
}

/** Center Z of the E-W river at column x. */
function riverZ(x: number): number {
  return 18 + Math.sin(x * 0.13 + 0.7) * 4
}

function isRiverAt(x: number, z: number): boolean {
  // Rivers don't flow through mountains — a rock region blocks the carve, so the
  // river stops at the mountain foot instead of slicing a channel through it.
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

function isLakeAt(x: number, z: number, d: number): boolean {
  // Lakes only spawn well inland.
  if (d < 4) return false
  const l = lakeAt(x, z)
  const m = moistureAt(x, z)
  return l > 0.9 && m > 0.2
}

export function getRiverX(z: number): number {
  return riverX(z)
}
export function getRiverZ(x: number): number {
  return riverZ(x)
}

// Deliberate biome regions (centres in grid coords on the 96×72 map), laid out
// like the reference map: snow NW, desert NE, swamp SW, pine/forest SE, dense
// forest W, stone highlands E. The interior stays grass for the castle. Each
// region is a soft blob (radius + noise wobble) so the edges read organically.
interface Region {
  x: number
  z: number
  r: number
  biome: Biome
  /** elevated terrain (snow plateau / rocky highlands) */
  height?: number
}
const REGIONS: Region[] = [
  // Original biome ring around the anchored town — radii enlarged so each biome
  // reads as a big region instead of a small blob.
  { x: 14, z: 11, r: 17, biome: 'snow', height: 2 }, // NW snow-capped massif
  { x: 80, z: 13, r: 16, biome: 'desert' }, // N / NE
  { x: 15, z: 58, r: 15, biome: 'swamp' }, // SW
  { x: 80, z: 58, r: 18, biome: 'forest' }, // S pine wood
  { x: 11, z: 38, r: 12, biome: 'forest' }, // W forest
  { x: 88, z: 38, r: 14, biome: 'rock', height: 2 }, // E stone range (nudged east, off the castle wall)
  // Big frontier biomes filling the expanded east / south land (grid 144×108).
  { x: 122, z: 42, r: 17, biome: 'desert' }, // far-east dunes
  { x: 116, z: 84, r: 21, biome: 'forest' }, // SE deep pinewood
  { x: 60, z: 92, r: 17, biome: 'swamp' }, // south marsh
  { x: 124, z: 15, r: 19, biome: 'rock', height: 2 }, // NE high range
  { x: 126, z: 92, r: 17, biome: 'rock', height: 2 }, // far-SE frontier peaks
]

/** True if (x,z) falls inside (or just outside) any rock (mountain) region blob
 *  — used to keep rivers from carving a channel through the mountains. The +2
 *  margin past the rendered footprint stops the river cleanly at the foot rather
 *  than leaving a stray puddle where the blob's wobbly edge clips the channel. */
function inMountain(x: number, z: number): boolean {
  const wob = 2.4 * Math.sin(x * 0.4 + 1.1) + 2.4 * Math.cos(z * 0.36 - 0.7)
  for (const reg of REGIONS) {
    if (reg.biome !== 'rock') continue
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

function classifyBiome(x: number, z: number): Tile | null {
  if (!isLandShape(x, z)) return null
  if (isRiverAt(x, z)) return null

  const d = distFromCoast(x, z)
  if (isLakeAt(x, z, d)) return null // carve a lake

  // Beach ring around coastlines and lake edges.
  if (d <= 1) return { biome: 'sand', height: 1 }

  // Hand-placed grassy hills (impassable terraces) before regional biomes.
  const ph = plateauHeightAt(x, z)
  if (ph) return { biome: 'grass', height: ph }

  // Regional biome placement.
  const reg = regionAt(x, z)
  if (reg) {
    if (reg.biome === 'snow') {
      // Snow-capped massif: a tall central peak tapering to foothills, like the
      // rock range but a touch lower and rounder. Impassable (height >= 2).
      const dc = Math.hypot(x - reg.x, z - reg.z)
      const t = Math.max(0, 1 - dc / reg.r)
      const peak = 2 + Math.round(t * t * 9 + (noiseB(x, z) + 1) * 1.0)
      return { biome: 'snow', height: peak }
    }
    if (reg.biome === 'rock') {
      // Stone ranges read as real mountains: tall, jagged peaks near the core
      // that taper down toward the foothills. Steep falloff + per-tile noise
      // gives a craggy silhouette. Impassable, so height can run high freely.
      const dc = Math.hypot(x - reg.x, z - reg.z)
      const t = Math.max(0, 1 - dc / reg.r)
      const peak = 2 + Math.round(t * t * 16 + (noiseB(x, z) + 1) * 2.2)
      return { biome: 'rock', height: peak }
    }
    return { biome: reg.biome, height: reg.height ?? 1 }
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
 * (no per-tile relief) so neighbouring boxes stay flush — any per-tile height
 * jitter would expose the box side faces as dark seams along every tile edge.
 * Entities, props and structures sample this instead of reading `tile.height`
 * directly, so the whole world shares one surface.
 */
export function tileTopY(x: number, z: number): number {
  const t = tileAt(x, z)
  if (!t) return 0
  return 1 + (t.height - 1) * GROUND_STEP
}
