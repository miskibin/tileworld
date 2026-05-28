import { tileAt } from './tileMap'

export interface OrkState {
  id: number
  /** world position in grid coords (inside offset group) */
  x: number
  y: number
  z: number
  facing: number
  hp: number
  maxHp: number
  hurtFlashUntil: number
  paletteIndex: number
  seed: number
  /** radius used for blocking the player */
  collisionRadius: number
  // AI state
  /** time (sec) when current swing started; 0 = idle/chase */
  attackingSince: number
  /** time (sec) until next swing may begin */
  attackReadyAt: number
  /** whether the current swing already dealt damage */
  attackHitDealt: boolean
  /** waypoints toward current goal, in world grid coords (tile centers) */
  path: { x: number; z: number }[]
  /** index into path[] of the next waypoint to walk toward */
  pathIndex: number
  /** time (sec) when path should be recomputed */
  pathRecomputeAt: number
}

const orks: OrkState[] = []
let nextId = 0

export function createOrk(
  x: number,
  z: number,
  facing: number,
  paletteIndex: number,
  seed: number,
): OrkState {
  const t = tileAt(Math.floor(x), Math.floor(z))
  const y = t ? t.height : 1
  const o: OrkState = {
    id: nextId++,
    x,
    y,
    z,
    facing,
    hp: 120,
    maxHp: 120,
    hurtFlashUntil: 0,
    paletteIndex,
    seed,
    collisionRadius: 0.32,
    attackingSince: 0,
    attackReadyAt: 0,
    attackHitDealt: false,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
  }
  orks.push(o)
  return o
}

export function resetOrks(): void {
  orks.length = 0
  nextId = 0
}

export function getOrks(): OrkState[] {
  return orks
}

export function getAliveOrks(): OrkState[] {
  return orks.filter((o) => o.hp > 0)
}

/** Returns true if ork dies on this hit. */
export function damageOrk(o: OrkState, amount: number, now: number): boolean {
  if (o.hp <= 0) return false
  o.hp = Math.max(0, o.hp - amount)
  o.hurtFlashUntil = now + 0.25
  return o.hp <= 0
}

/** Player-vs-ork blocking check (used in movement collision). */
export function orkCollidesAt(x: number, z: number, r: number): boolean {
  for (let i = 0; i < orks.length; i++) {
    const o = orks[i]
    if (o.hp <= 0) continue
    const dx = x - o.x
    const dz = z - o.z
    const rsum = r + o.collisionRadius
    if (dx * dx + dz * dz < rsum * rsum) return true
  }
  return false
}
