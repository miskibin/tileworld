// One pure scalar that grades the map by distance from the castle: 0 across the
// safe core, ramping to 1 at the island rim. Every distance-driven system (loot
// tier, drop tier, day-threat toughness) reads this — nothing else encodes
// "how far out" a point is. Because it is 0 near the castle, every consumer
// collapses to the pre-frontier behaviour there, so the gradient is purely
// ADDITIVE and the early game is unchanged.
import { CASTLE_CENTER, CASTLE_SAFE_R, ROWS } from './tileMap'

// Distance (tiles) from the castle at which the factor reaches 1 — about the
// outer reach of the biome blobs. Derived from ROWS so it tracks MAP_SCALE
// automatically. 0.68·ROWS ≈ 103 on the enlarged 152-row map.
export const RIM_DIST = ROWS * 0.68

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 0 inside the safe zone, smoothly → 1 at RIM_DIST and beyond. */
export function frontierFactor(x: number, z: number): number {
  const d = Math.hypot(x - CASTLE_CENTER.x, z - CASTLE_CENTER.z)
  const t = Math.min(1, Math.max(0, (d - CASTLE_SAFE_R) / (RIM_DIST - CASTLE_SAFE_R)))
  return smoothstep(t)
}

/** Loot quality band: 0 near, 1 mid, 2 rim (best). Thresholds tuned in dev. */
export function gearTier(factor: number): 0 | 1 | 2 {
  if (factor > 0.7) return 2
  if (factor > 0.4) return 1
  return 0
}

// Tiered loot pools indexed by gearTier(). Items are existing ITEM_DEFS ids plus
// the rim-only top items. Top tier is the ONLY source of the best gear.
const GEAR_POOLS: Record<0 | 1 | 2, string[]> = {
  0: ['sword_iron', 'leather_armor', 'bread'],
  1: ['axe', 'stone_maul', 'iron_armor', 'potion'],
  2: ['blade_frost', 'dragon_plate', 'sword_gold', 'gold_armor'],
}

/** Pick a loot id for a point's frontier `factor`. `roll` ∈ [0,1) selects within
 *  the tier's pool (pass a deterministic per-source value so loot is stable). */
export function rollGear(factor: number, roll: number): string {
  const pool = GEAR_POOLS[gearTier(factor)]
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]
}

/** Deterministic [0,1) hash of a tile — stable loot per chest across reloads. */
function tileHash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Loot ids + gold for a chest at (x,z): count + quality climb with distance. */
export function chestLootFor(x: number, z: number): { loot: string[]; gold: number } {
  const f = frontierFactor(x, z)
  const h = tileHash(x, z)
  const items = 1 + Math.round(f) // 1 near, 2 at rim
  const loot: string[] = []
  for (let i = 0; i < items; i++) loot.push(rollGear(f, (h + i * 0.37) % 1))
  const gold = Math.round(15 + f * 60 + h * 20) // ~15–95 by distance
  return { loot, gold }
}
