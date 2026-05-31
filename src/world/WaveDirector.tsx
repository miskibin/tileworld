import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { createOrk, getAliveOrks, WAVE_FACTION } from './orkStore'
import { CASTLE_CORE } from './castleStore'
import { ORK_CONFIG, type OrkVariant } from './orkConfig'
import { findSpawnNear } from './obstacles'
import { getPhase, setPhase } from './gameStore'
import {
  WAVES,
  PREP_DURATION,
  getWave,
  beginWave,
  markSpawned,
  setEnemiesAlive,
} from './waveStore'
import { isFrozen } from './pauseStore'

// Orks enter from a ring around the keep — far enough to read as "incoming",
// close enough to stay inside the player's cull radius while they defend.
const SPAWN_RING = 30

function ringPoint(i: number): { x: number; z: number } {
  // Deterministic spread: golden-angle around the keep so successive spawns
  // don't stack. (No Math.random — matches the project's deterministic style.)
  const a = i * 2.39996
  return {
    x: CASTLE_CORE.x + Math.cos(a) * SPAWN_RING,
    z: CASTLE_CORE.z + Math.sin(a) * SPAWN_RING,
  }
}

/**
 * Drives the assault: counts down the prep timer, spawns the current wave's
 * orks on an interval, and advances to the next wave (or victory) once the wave
 * is cleared. One useFrame, gated on the global freeze like every other entity.
 */
export function WaveDirector() {
  const prepEndsAt = useRef(0)
  const nextSpawnAt = useRef(0)
  const spawnIndex = useRef(0)

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const now = clock.getElapsedTime()
    const phase = getPhase()
    const wave = getWave()

    if (phase === 'prep') {
      if (prepEndsAt.current === 0) prepEndsAt.current = now + PREP_DURATION
      if (now >= prepEndsAt.current) {
        beginWave(wave.index + 1)
        spawnIndex.current = 0
        nextSpawnAt.current = now
        prepEndsAt.current = 0
        setPhase('wave')
      }
      return
    }

    if (phase === 'wave') {
      const def = WAVES[wave.index]
      if (!def) return
      // Spawn on interval until the wave's quota is met.
      if (wave.spawned < def.count && now >= nextSpawnAt.current) {
        const variant: OrkVariant = def.variants[spawnIndex.current % def.variants.length]
        const p = ringPoint(spawnIndex.current + wave.index * 7)
        const spawn = findSpawnNear(p.x, p.z)
        const facing = Math.atan2(CASTLE_CORE.x - spawn.x, CASTLE_CORE.z - spawn.z)
        const o = createOrk(spawn.x, spawn.z, facing, variant, WAVE_FACTION, spawnIndex.current * 1.7)
        o.hp = Math.round(ORK_CONFIG[variant].hp * def.hpScale)
        o.maxHp = o.hp
        spawnIndex.current += 1
        markSpawned()
        nextSpawnAt.current = now + def.spawnInterval
      }
      // Track alive count for the HUD.
      const alive = getAliveOrks().length
      setEnemiesAlive(alive)
      // Wave cleared once everything has spawned and nothing is left alive.
      if (wave.spawned >= def.count && alive === 0) {
        if (wave.index >= WAVES.length - 1) {
          setPhase('victory')
        } else {
          setPhase('prep') // breather, then the next wave
        }
      }
    }
  })

  return null
}
