import { tileAt, tileTopY } from './tileMap'
import { frontierFactor } from './frontier'

// Bears: neutral wildlife that turn hostile when the player gets close, then
// chase and maul. Heavier and tougher than orks; give good XP/gold.

export interface BearState {
  id: number
  x: number
  y: number
  z: number
  facing: number
  hp: number
  maxHp: number
  hurtFlashUntil: number
  seed: number
  collisionRadius: number
  // AI
  /** wander target while passive */
  target: { x: number; z: number } | null
  idleUntil: number
  moving: boolean
  aggro: boolean
  attackingSince: number
  attackReadyAt: number
  attackHitDealt: boolean
  /** time of last roar so we don't spam it */
  lastRoarAt: number
  // Chase pathfinding (A*), mirrors the ork fields.
  path: { x: number; z: number }[]
  pathIndex: number
  pathRecomputeAt: number
}

const bears: BearState[] = []
let nextId = 0

export function createBear(x: number, z: number, seed: number): BearState {
  const t = tileAt(Math.floor(x), Math.floor(z))
  const y = t ? tileTopY(Math.floor(x), Math.floor(z)) : 1
  // Frontier danger gradient: bears spawned far out are tougher (rim ≈ 2× HP).
  const hp = Math.round(180 * (1 + frontierFactor(x, z)))
  const b: BearState = {
    id: nextId++,
    x,
    y,
    z,
    facing: seed,
    hp,
    maxHp: hp,
    hurtFlashUntil: 0,
    seed,
    collisionRadius: 0.45,
    target: null,
    idleUntil: 0,
    moving: false,
    aggro: false,
    attackingSince: 0,
    attackReadyAt: 0,
    attackHitDealt: false,
    lastRoarAt: 0,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
  }
  bears.push(b)
  return b
}

export function resetBears(): void {
  bears.length = 0
  nextId = 0
}

/** Remove a dead bear from the array (called once its death-fade is done) so a
 *  fresh one can respawn in its slot without the array growing unbounded. */
export function reapBear(id: number): void {
  const i = bears.findIndex((b) => b.id === id)
  if (i !== -1) bears.splice(i, 1)
}

export function getBears(): BearState[] {
  return bears
}

export function getAliveBears(): BearState[] {
  return bears.filter((b) => b.hp > 0)
}

/** Returns true if the bear dies on this hit. */
export function damageBear(b: BearState, amount: number, now: number): boolean {
  if (b.hp <= 0) return false
  b.hp = Math.max(0, b.hp - amount)
  b.hurtFlashUntil = now + 0.25
  b.aggro = true // hitting a bear always enrages it
  return b.hp <= 0
}

/** Player-vs-bear blocking check (used in movement collision). */
export function bearCollidesAt(x: number, z: number, r: number): boolean {
  for (let i = 0; i < bears.length; i++) {
    const b = bears[i]
    if (b.hp <= 0) continue
    const dx = x - b.x
    const dz = z - b.z
    const rsum = r + b.collisionRadius
    if (dx * dx + dz * dz < rsum * rsum) return true
  }
  return false
}
