import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { TOWER_SLOTS } from './cityPlan'
import { getCity } from './cityStore'
import { spawnBolt } from './projectileStore'
import { getAliveOrks } from './orkStore'
import { tileTopY } from './tileMap'
import { isFrozen } from './pauseStore'

const TOWER_RANGE = 18
const TOWER_DMG = 14
const TOWER_COOLDOWN = 1.4 // seconds between shots per tower
const TOWER_MUZZLE_Y = 6 // bolt origin height above the tower base

/**
 * Built guard towers auto-fire homing bolts at the nearest ork in range. Reuses
 * the shaman bolt system (projectileStore). Only active once towers are built.
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

    for (let i = 0; i < TOWER_SLOTS.length; i++) {
      if (now < readyAt.current[i]) continue
      const tw = TOWER_SLOTS[i]
      // Nearest alive ork within range of this tower.
      let best = null as (typeof orks)[number] | null
      let bestD = TOWER_RANGE * TOWER_RANGE
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
      spawnBolt(tw.x, baseY + TOWER_MUZZLE_Y, tw.z, { kind: 'ork', ref: best }, TOWER_DMG)
      readyAt.current[i] = now + TOWER_COOLDOWN
    }
  })

  return null
}
