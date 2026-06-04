import { tileAt, tileTopY } from './tileMap'

// Ore boulders: static, destructible stone nodes strewn across the rock
// highlands. The player MINES them by hitting them like any creature (the same
// swing cone in Character) — each break yields `stoneReward` stone (resourceStore)
// for the city's defense upgrades. No AI, no movement: this is the bear store
// minus the brain, just HP + a hurt flash. Placement lives in OreNodes.tsx
// (a hand-placed spawn list snapped onto the rock foot), mirroring BEAR_SPAWNS.

export interface OreState {
  id: number
  x: number
  y: number
  z: number
  hp: number
  maxHp: number
  hurtFlashUntil: number
  seed: number
  collisionRadius: number
  /** 0..3 visual variant (vein colour / shape) */
  variant: number
  /** stone granted to the player when this node shatters */
  stoneReward: number
}

const ORE_HP = 60
const ORE_STONE = 4

const ore: OreState[] = []
let nextId = 0

export function createOre(x: number, z: number, seed: number): OreState {
  const fx = Math.floor(x)
  const fz = Math.floor(z)
  const t = tileAt(fx, fz)
  const y = t ? tileTopY(fx, fz) : 1
  const o: OreState = {
    id: nextId++,
    x,
    y,
    z,
    hp: ORE_HP,
    maxHp: ORE_HP,
    hurtFlashUntil: 0,
    seed,
    collisionRadius: 0.4,
    variant: Math.floor(seed * 4) % 4,
    stoneReward: ORE_STONE,
  }
  ore.push(o)
  return o
}

export function resetOre(): void {
  ore.length = 0
  nextId = 0
}

export function getOre(): OreState[] {
  return ore
}

export function getAliveOre(): OreState[] {
  return ore.filter((o) => o.hp > 0)
}

/** Returns true if the ore shatters on this hit. */
export function damageOre(o: OreState, amount: number, now: number): boolean {
  if (o.hp <= 0) return false
  o.hp = Math.max(0, o.hp - amount)
  o.hurtFlashUntil = now + 0.18
  return o.hp <= 0
}

/** Player-vs-ore blocking check (used in movement collision so you bump a
 *  boulder instead of walking through it). */
export function oreCollidesAt(x: number, z: number, r: number): boolean {
  for (let i = 0; i < ore.length; i++) {
    const o = ore[i]
    if (o.hp <= 0) continue
    const dx = x - o.x
    const dz = z - o.z
    const rsum = r + o.collisionRadius
    if (dx * dx + dz * dz < rsum * rsum) return true
  }
  return false
}
