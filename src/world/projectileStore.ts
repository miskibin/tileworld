import { damageOrk, type OrkState } from './orkStore'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'
import { spawnFloat } from './fxStore'
import { tileAt } from './tileMap'

// Minimal homing-bolt system for the ork shaman. Bolts track their target's
// live position, deal damage on arrival, and expire after a short lifetime.
// Consumers: Projectiles.tsx drives stepProjectiles() once per frame and renders
// the live list.

export type BoltTarget = { kind: 'player' } | { kind: 'ork'; ref: OrkState }

export interface Bolt {
  id: number
  x: number
  y: number
  z: number
  target: BoltTarget
  speed: number
  damage: number
  ttl: number // seconds remaining
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
  speed = 9,
): void {
  bolts.push({ id: nextId++, x, y, z, target, speed, damage, ttl: 3 })
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
      // Arrived — deal damage.
      if (b.target.kind === 'player') {
        damagePlayer(b.damage, now)
      } else {
        const died = damageOrk(b.target.ref, b.damage, now)
        const o = b.target.ref
        spawnFloat(died ? 'KO' : `${b.damage}`, '#c89cff', o.x, o.y + 2.2, o.z)
      }
      bolts.splice(i, 1)
      continue
    }
    const step = b.speed * dt
    b.x += (dx / len) * step
    b.y += (dy / len) * step
    b.z += (dz / len) * step
    // Keep above terrain so bolts don't clip into hills.
    const tile = tileAt(Math.floor(b.x), Math.floor(b.z))
    const floor = (tile ? tile.height : 0) + 0.4
    if (b.y < floor) b.y = floor
  }
}
