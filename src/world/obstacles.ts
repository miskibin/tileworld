import { tileAt, COLS, ROWS, type Biome } from './tileMap'

export type ObstacleKind =
  | 'tree'
  | 'birch'
  | 'deadTree'
  | 'bush'
  | 'rock'
  | 'boulder'
  | 'mushroom'
  | 'flower'
  | 'tuft'
  | 'cactus'

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

// Hand-placed structure footprints to keep clear of scatter (camps).
// Positions chosen for the new 64x48 procedural map; adjust if camps move.
const RESERVED = new Set<string>(
  (() => {
    const r: string[] = []
    // Knight spawn area + friendly camp 1 (center)
    for (let z = 22; z <= 28; z++) for (let x = 28; x <= 36; x++) r.push(`${x},${z}`)
    // Friendly camp 2 (east of center)
    for (let z = 22; z <= 26; z++) for (let x = 40; x <= 46; x++) r.push(`${x},${z}`)
    // Ork camp 1 (SW)
    for (let z = 32; z <= 37; z++) for (let x = 14; x <= 20; x++) r.push(`${x},${z}`)
    // Ork camp 2 (NE)
    for (let z = 12; z <= 17; z++) for (let x = 44; x <= 50; x++) r.push(`${x},${z}`)
    // Bridge approaches — keep clear of trees/bushes so the player can walk on
    for (let z = 24; z <= 27; z++) for (let x = 14; x <= 24; x++) r.push(`${x},${z}`)
    for (let z = 34; z <= 37; z++) for (let x = 17; x <= 27; x++) r.push(`${x},${z}`)
    for (let z = 10; z <= 17; z++) for (let x = 39; x <= 42; x++) r.push(`${x},${z}`)
    return r
  })(),
)

function isReserved(x: number, z: number): boolean {
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
  deadTree: 0.12,
  bush: 0.2,
  rock: 0,
  boulder: 0.34,
  mushroom: 0,
  flower: 0,
  tuft: 0,
  cactus: 0.18,
}

let cached: Obstacle[] | null = null

export function getObstacles(): Obstacle[] {
  if (cached) return cached
  cached = generate()
  return cached
}

function push(out: Obstacle[], kind: ObstacleKind, x: number, z: number, scale: number, rot: number, variant: number) {
  const baseTile = tileAt(Math.floor(x), Math.floor(z))
  const y = baseTile ? baseTile.height : 1
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

// Per-biome cumulative roll table: [kind, cumProb] sorted ascending.
type Roll = { kind: ObstacleKind; until: number; clusterMin?: number; clusterMax?: number }
const ROLLS: Record<Biome, Roll[]> = {
  grass: [
    { kind: 'tree', until: 0.06 },
    { kind: 'birch', until: 0.09 },
    { kind: 'deadTree', until: 0.1 },
    { kind: 'bush', until: 0.15 },
    { kind: 'rock', until: 0.18 },
    { kind: 'boulder', until: 0.19 },
    { kind: 'mushroom', until: 0.22, clusterMin: 1, clusterMax: 2 },
    { kind: 'flower', until: 0.3, clusterMin: 2, clusterMax: 4 },
    { kind: 'tuft', until: 0.55, clusterMin: 1, clusterMax: 2 },
  ],
  forest: [
    { kind: 'tree', until: 0.3 },
    { kind: 'birch', until: 0.42 },
    { kind: 'deadTree', until: 0.47 },
    { kind: 'bush', until: 0.58 },
    { kind: 'mushroom', until: 0.68, clusterMin: 2, clusterMax: 3 },
    { kind: 'flower', until: 0.73, clusterMin: 1, clusterMax: 2 },
    { kind: 'tuft', until: 0.9, clusterMin: 1, clusterMax: 2 },
  ],
  sand: [
    { kind: 'cactus', until: 0.04 },
    { kind: 'deadTree', until: 0.05 },
    { kind: 'rock', until: 0.09 },
    { kind: 'flower', until: 0.11, clusterMin: 1, clusterMax: 1 },
    { kind: 'tuft', until: 0.13 },
  ],
  rock: [
    { kind: 'deadTree', until: 0.08 },
    { kind: 'boulder', until: 0.13 },
    { kind: 'bush', until: 0.16 },
    { kind: 'rock', until: 0.24 },
    { kind: 'mushroom', until: 0.25 },
    { kind: 'tuft', until: 0.32 },
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

      const cx = x + 0.5 + (rand() - 0.5) * 0.4
      const cz = z + 0.5 + (rand() - 0.5) * 0.4
      const rot = rand() * Math.PI * 2
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
            rand() * Math.PI * 2,
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

export function obstacleCollidesAt(x: number, z: number, r: number): boolean {
  const obs = getObstacles()
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i]
    if (o.radius <= 0) continue
    const dx = x - o.x
    const dz = z - o.z
    const rsum = r + o.radius
    if (dx * dx + dz * dz < rsum * rsum) return true
  }
  return false
}
