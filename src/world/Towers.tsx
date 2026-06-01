import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { TOWER_SLOTS } from './cityPlan'
import { getCity } from './cityStore'
import { getTowers, isTowerAlive } from './towerStore'
import { spawnBolt } from './projectileStore'
import { getAliveOrks } from './orkStore'
import { tileTopY } from './tileMap'
import { isFrozen } from './pauseStore'

// Base watchtower fire profile — deliberately modest so the towers support the
// player rather than auto-clearing waves. Tower Mastery upgrades all three.
const BASE = { range: 18, damage: 7, cooldown: 1.6, maxRange: 22 }
const MASTERY = { range: 24, damage: 12, cooldown: 1.0, maxRange: 28 }
const TOWER_MUZZLE_Y = 6 // bolt origin height above the tower base

/**
 * Built guard towers auto-fire bolts at the nearest ork within their cast range.
 * Bolts are defender-coloured (cyan) and expire after a max travel distance, so
 * an ork can outrun a shot. Only live towers fire (orks can batter them down).
 */
export function Towers() {
  // One independent cooldown clock per tower slot.
  const readyAt = useRef<number[]>(TOWER_SLOTS.map(() => 0))

  useFrame(({ clock }) => {
    if (isFrozen()) return
    if (!getCity().towersBuilt) return
    const now = clock.getElapsedTime()
    const orks = getAliveOrks()
    if (orks.length === 0) return

    const profile = getTowers().mastery ? MASTERY : BASE
    const rangeSq = profile.range * profile.range

    for (let i = 0; i < TOWER_SLOTS.length; i++) {
      if (!isTowerAlive(i)) continue
      if (now < readyAt.current[i]) continue
      const tw = TOWER_SLOTS[i]
      // Nearest alive ork within cast range of this tower.
      let best = null as (typeof orks)[number] | null
      let bestD = rangeSq
      for (const o of orks) {
        const dx = o.x - tw.x
        const dz = o.z - tw.z
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = o
        }
      }
      if (!best) continue
      const baseY = tileTopY(Math.floor(tw.x), Math.floor(tw.z))
      spawnBolt(tw.x, baseY + TOWER_MUZZLE_Y, tw.z, { kind: 'ork', ref: best }, profile.damage, {
        team: 'defender',
        maxRange: profile.maxRange,
        speed: 11,
      })
      readyAt.current[i] = now + profile.cooldown
    }
  })

  return null
}
