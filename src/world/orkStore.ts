import { tileAt, tileTopY } from './tileMap'
import { ORK_CONFIG, type OrkVariant } from './orkConfig'
import { orksHostile, type OrkFaction } from './factions'

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
  /** which variant (grunt/scout/berserker/shaman) — drives stats + look */
  variant: OrkVariant
  /** warband; orks fight rival-faction orks */
  faction: OrkFaction
  /** camp anchor: when set, the ork guards here instead of marching on the keep
   * (wave invaders leave this null so they still assault the castle) */
  home: { x: number; z: number } | null
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
  /** shaman: time (sec) until next ally-heal */
  healReadyAt: number
  /** waypoints toward current goal, in world grid coords (tile centers) */
  path: { x: number; z: number }[]
  /** index into path[] of the next waypoint to walk toward */
  pathIndex: number
  /** time (sec) when path should be recomputed */
  pathRecomputeAt: number
}

const orks: OrkState[] = []
let nextId = 0

// All wave invaders share one warband so they never brawl each other and all
// march on the keep together.
export const WAVE_FACTION: OrkFaction = 'red'

const rosterSubs = new Set<(list: OrkState[]) => void>()

/** Notified whenever an ork is added or reaped, so Mobs re-renders the list. */
export function subscribeOrks(fn: (list: OrkState[]) => void): () => void {
  rosterSubs.add(fn)
  fn(orks)
  return () => {
    rosterSubs.delete(fn)
  }
}

function notifyRoster(): void {
  rosterSubs.forEach((fn) => fn(orks))
}

export function createOrk(
  x: number,
  z: number,
  facing: number,
  variant: OrkVariant,
  faction: OrkFaction,
  seed: number,
  home: { x: number; z: number } | null = null,
): OrkState {
  const t = tileAt(Math.floor(x), Math.floor(z))
  const y = t ? tileTopY(Math.floor(x), Math.floor(z)) : 1
  const cfg = ORK_CONFIG[variant]
  const o: OrkState = {
    id: nextId++,
    x,
    y,
    z,
    facing,
    hp: cfg.hp,
    maxHp: cfg.hp,
    hurtFlashUntil: 0,
    variant,
    faction,
    home,
    seed,
    collisionRadius: cfg.collisionRadius,
    attackingSince: 0,
    attackReadyAt: 0,
    attackHitDealt: false,
    healReadyAt: 0,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
  }
  orks.push(o)
  notifyRoster()
  return o
}

export function resetOrks(): void {
  orks.length = 0
  nextId = 0
  notifyRoster()
}

export function getOrks(): OrkState[] {
  return orks
}

export function getAliveOrks(): OrkState[] {
  return orks.filter((o) => o.hp > 0)
}

/** Remove a dead ork from the roster (called once its death-fade finishes). */
export function reapOrk(id: number): void {
  const i = orks.findIndex((o) => o.id === id)
  if (i === -1) return
  orks.splice(i, 1)
  notifyRoster()
}

/** Returns true if ork dies on this hit. */
export function damageOrk(o: OrkState, amount: number, now: number): boolean {
  if (o.hp <= 0) return false
  o.hp = Math.max(0, o.hp - amount)
  o.hurtFlashUntil = now + 0.25
  return o.hp <= 0
}

/**
 * Nearest living ork of an opposing warband within `range`, or null. Used so
 * rival camps brawl. Allocation-free scan — fine at our ork counts.
 */
export function nearestEnemyOrk(self: OrkState, range: number): OrkState | null {
  let best: OrkState | null = null
  let bestD = range * range
  for (let i = 0; i < orks.length; i++) {
    const o = orks[i]
    if (o === self || o.hp <= 0) continue
    if (!orksHostile(self.faction, o.faction)) continue
    const dx = o.x - self.x
    const dz = o.z - self.z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/** Nearest wounded ally ork within `range` (for shaman healing), or null. */
export function nearestWoundedAlly(self: OrkState, range: number): OrkState | null {
  let best: OrkState | null = null
  let bestD = range * range
  for (let i = 0; i < orks.length; i++) {
    const o = orks[i]
    if (o === self || o.hp <= 0 || o.hp >= o.maxHp) continue
    if (o.faction !== self.faction) continue
    const dx = o.x - self.x
    const dz = o.z - self.z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/** Heal an ork (clamped to maxHp). */
export function healOrk(o: OrkState, amount: number): void {
  if (o.hp <= 0) return
  o.hp = Math.min(o.maxHp, o.hp + amount)
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
