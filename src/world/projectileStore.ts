import { damageOrk, type OrkState } from './orkStore'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'
import { spawnFloat } from './fxStore'
import { tileAt, tileTopY } from './tileMap'

// Minimal homing-bolt system for the ork shaman. Bolts track their target's
// live position, deal damage on arrival, and expire after a short lifetime.
// Consumers: Projectiles.tsx drives stepProjectiles() once per frame and renders
// the live list.

export type BoltTarget = { kind: 'player' } | { kind: 'ork'; ref: OrkState }

/** Who fired the bolt — drives its colour (ork = arcane purple, defender = bright cyan). */
export type BoltTeam = 'ork' | 'defender'

export interface Bolt {
  id: number
  x: number
  y: number
  z: number
  target: BoltTarget
  team: BoltTeam
  speed: number
  damage: number
  ttl: number // seconds remaining
  /** distance the bolt may travel before it fizzles (max "life" range) */
  maxRange: number
  /** distance travelled so far */
  traveled: number
  /** where it was fired from — the direction a shield blocks against */
  originX: number
  originZ: number
}

export interface BoltOpts {
  speed?: number
  team?: BoltTeam
  /** distance the bolt may fly before it fizzles short of its target */
  maxRange?: number
}

const bolts: Bolt[] = []
let nextId = 0
const HIT_RADIUS = 0.6

export function spawnBolt(
  x: number,
  y: number,
  z: number,
  target: BoltTarget,
  damage: number,
  opts: BoltOpts = {},
): void {
  bolts.push({
    id: nextId++,
    x,
    y,
    z,
    target,
    team: opts.team ?? 'ork',
    speed: opts.speed ?? 9,
    damage,
    ttl: 3,
    maxRange: opts.maxRange ?? 40,
    traveled: 0,
    originX: x,
    originZ: z,
  })
}

export function getBolts(): Bolt[] {
  return bolts
}

export function resetBolts(): void {
  bolts.length = 0
  nextId = 0
}

function targetPos(b: Bolt): { x: number; y: number; z: number; alive: boolean } {
  if (b.target.kind === 'player') {
    const p = getPlayer()
    return { x: p.x, y: p.y + 1, z: p.z, alive: isPlayerAlive() }
  }
  const o = b.target.ref
  return { x: o.x, y: o.y + 1, z: o.z, alive: o.hp > 0 }
}

/** Advance all bolts, apply damage on arrival, prune dead/expired. */
export function stepProjectiles(dt: number, now: number): void {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]
    b.ttl -= dt
    const tp = targetPos(b)
    // Target gone (dead) or bolt expired → fizzle.
    if (!tp.alive || b.ttl <= 0) {
      bolts.splice(i, 1)
      continue
    }
    const dx = tp.x - b.x
    const dy = tp.y - b.y
    const dz = tp.z - b.z
    const len = Math.hypot(dx, dy, dz)
    if (len < HIT_RADIUS) {
      // Arrived — deal damage. The block cone faces the bolt's origin.
      if (b.target.kind === 'player') {
        damagePlayer(b.damage, now, b.originX, b.originZ)
      } else {
        const died = damageOrk(b.target.ref, b.damage, now)
        const o = b.target.ref
        const col = b.team === 'defender' ? '#8fdcff' : '#c89cff'
        spawnFloat(died ? 'KO' : `${b.damage}`, col, o.x, o.y + 2.2, o.z)
      }
      bolts.splice(i, 1)
      continue
    }
    const step = b.speed * dt
    // Fizzle if it has flown its full range without connecting (lets fast/distant
    // targets outrun a bolt instead of every shot being a guaranteed hit).
    b.traveled += step
    if (b.traveled >= b.maxRange) {
      bolts.splice(i, 1)
      continue
    }
    b.x += (dx / len) * step
    b.y += (dy / len) * step
    b.z += (dz / len) * step
    // Keep above terrain so bolts don't clip into hills.
    const tile = tileAt(Math.floor(b.x), Math.floor(b.z))
    const floor = (tile ? tileTopY(Math.floor(b.x), Math.floor(b.z)) : 0) + 0.4
    if (b.y < floor) b.y = floor
  }
}
