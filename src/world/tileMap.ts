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
  { x: 16, z: 12, r: 15, biome: 'snow', height: 2 }, // NW
  { x: 80, z: 13, r: 16, biome: 'desert' }, // N / NE
  { x: 15, z: 58, r: 15, biome: 'swamp' }, // SW
  { x: 80, z: 58, r: 18, biome: 'forest' }, // S pine wood
  { x: 11, z: 38, r: 12, biome: 'forest' }, // W forest
  { x: 84, z: 38, r: 12, biome: 'rock', height: 2 }, // E stone highlands (nudged east, off the castle wall)
  // Big frontier biomes filling the expanded east / south land (grid 144×108).
  { x: 118, z: 40, r: 19, biome: 'desert' }, // far-east dunes
  { x: 116, z: 84, r: 21, biome: 'forest' }, // SE deep pinewood
  { x: 60, z: 92, r: 17, biome: 'swamp' }, // south marsh
  { x: 120, z: 16, r: 15, biome: 'rock', height: 2 }, // NE highland spur
]

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

  // Regional biome placement.
  const reg = regionAt(x, z)
  if (reg) {
    if (reg.biome === 'snow') {
      // Higher plateau near the core for visual relief.
      const core = Math.hypot(x - reg.x, z - reg.z) < reg.r * 0.5
      return { biome: 'snow', height: core ? 3 : 2 }
    }
    if (reg.biome === 'rock') {
      // East stone highlands read as a distant mountain range: tall, jagged
      // peaks near the core that taper down toward the foothills.
      const dc = Math.hypot(x - reg.x, z - reg.z)
      const t = Math.max(0, 1 - dc / reg.r)
      const peak = 2 + Math.round(t * t * 6 + (noiseB(x, z) + 1) * 1.2)
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
