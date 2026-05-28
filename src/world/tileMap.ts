export type Biome = 'grass' | 'sand' | 'forest' | 'rock'

export interface Tile {
  biome: Biome
  height: number
}

export const COLS = 64
export const ROWS = 48

export const CENTER_X = COLS / 2
export const CENTER_Z = ROWS / 2

// Procedural map: single island with noisy coast + interior biomes.
// Layered noise — kept deterministic, no external dep.
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

const islandRx = COLS / 2 - 6
const islandRz = ROWS / 2 - 5

function isLandShape(x: number, z: number): boolean {
  const dx = (x - CENTER_X) / islandRx
  const dz = (z - CENTER_Z) / islandRz
  const r2 = dx * dx + dz * dz
  // Coast noise — perturbs the ellipse for organic edges
  const coast = noiseA(x, z) * 0.08
  return r2 + coast < 1.0
}

function distFromCoast(x: number, z: number): number {
  // Approximate distance (in tile units) from the coast. Larger = deeper inland.
  // Walks outward in 8 directions until water hit.
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
  return 24 + Math.sin(z * 0.18) * 5 + Math.sin(z * 0.07 + 1.4) * 3
}

/** Center Z of the eastern E-W river at column x. */
function riverZ(x: number): number {
  return 14 + Math.sin(x * 0.13 + 0.7) * 3
}

/**
 * Tiles where rivers carve through. Returns null in land where a river bed
 * runs, making them water (and uncrossable except via bridges placed in the
 * World).
 */
function isRiverAt(x: number, z: number): boolean {
  // Main N-S river — runs roughly through x≈19..22 with a meander.
  {
    const cx = riverX(z)
    const w = 1.3 + Math.sin(z * 0.5) * 0.3
    if (Math.abs(x - cx) < w) return true
  }
  // Smaller E-W river in the north-east corner.
  if (x > 30 && x < 55) {
    const cz = riverZ(x)
    if (Math.abs(z - cz) < 1.0) return true
  }
  return false
}

/** Public — used by Bridge placement / debug. */
export function getRiverX(z: number): number {
  return riverX(z)
}
export function getRiverZ(x: number): number {
  return riverZ(x)
}

function classifyBiome(x: number, z: number): Tile | null {
  if (!isLandShape(x, z)) return null
  if (isRiverAt(x, z)) return null // carve river
  const d = distFromCoast(x, z)
  // Sandy beach: tiles within 2 of coast
  if (d <= 1) return { biome: 'sand', height: 1 }
  // Rocky highlands: high noise value + far from coast
  const rockN = noiseB(x, z)
  if (rockN > 1.0 && d >= 4) return { biome: 'rock', height: 2 }
  // Forest patches: secondary noise
  const forestN = noiseA(x, z) * noiseB(x + 7, z - 3)
  if (forestN > 0.6) return { biome: 'forest', height: 1 }
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
