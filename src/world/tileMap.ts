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

export const COLS = 96
export const ROWS = 72

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

// Push the coastline closer to the grid edge so more of the 96×72 grid is
// walkable land (was −8/−6). Existing camps/villages sit well inside, so this
// only adds land around them — no hardcoded placement needs to move.
const islandRx = COLS / 2 - 3
const islandRz = ROWS / 2 - 3

function isLandShape(x: number, z: number): boolean {
  const dx = (x - CENTER_X) / islandRx
  const dz = (z - CENTER_Z) / islandRz
  const r2 = dx * dx + dz * dz
  const coast = noiseA(x, z) * 0.1
  return r2 + coast < 1.0
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

/** Center X of the meandering N-S river at row z. */
function riverX(z: number): number {
  return CENTER_X - 8 + Math.sin(z * 0.18) * 5 + Math.sin(z * 0.07 + 1.4) * 3
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
  if (x > CENTER_X - 2 && x < COLS - 10) {
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
  { x: 16, z: 12, r: 12, biome: 'snow', height: 2 }, // NW
  { x: 80, z: 13, r: 12, biome: 'desert' }, // NE
  { x: 15, z: 58, r: 12, biome: 'swamp' }, // SW
  { x: 80, z: 58, r: 13, biome: 'forest' }, // SE pine wood
  { x: 11, z: 38, r: 9, biome: 'forest' }, // W forest
  { x: 82, z: 37, r: 11, biome: 'rock', height: 2 }, // E stone highlands
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
