import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { createOrk, getAliveOrks, WAVE_FACTION } from './orkStore'
import { CASTLE_CORE } from './castleStore'
import { findSpawnNear } from './obstacles'
import { tileAt } from './tileMap'
import { getPhase, setPhase } from './gameStore'
import { getWave, beginWave, markSpawned, setEnemiesAlive } from './waveStore'
import { isFrozen } from './pauseStore'
import { stepWaveDirector, type WaveAction, type WaveTimers } from './waveLogic'

// Orks enter from a ring around the keep — far enough to read as "incoming",
// close enough to stay inside the player's cull radius while they defend.
const SPAWN_RING = 30

function spawnPointFor(i: number): { x: number; z: number } {
  // Golden-angle spread around the keep so successive spawns don't stack.
  const a = i * 2.39996
  const dx = Math.cos(a)
  const dz = Math.sin(a)
  // March outward from the keep (which is on land) along the ray and keep the
  // furthest STANDABLE tile, capped at SPAWN_RING. Ring points can otherwise
  // land in the sea, where A* can't path and the ork strands the wave.
  let best = { x: CASTLE_CORE.x + dx * 6, z: CASTLE_CORE.z + dz * 6 }
  for (let r = 8; r <= SPAWN_RING; r += 2) {
    const x = CASTLE_CORE.x + dx * r
    const z = CASTLE_CORE.z + dz * r
    if (tileAt(Math.floor(x), Math.floor(z)) !== null) best = { x, z }
  }
  return best
}

/** Carry out one reducer action: the side-effecting half of the director. */
function applyWaveAction(a: WaveAction): void {
  switch (a.type) {
    case 'beginWave':
      beginWave(a.index)
      break
    case 'setPhase':
      setPhase(a.phase)
      break
    case 'spawn': {
      const p = spawnPointFor(a.spawnIndex + a.waveIndex * 7)
      const spawn = findSpawnNear(p.x, p.z)
      const facing = Math.atan2(CASTLE_CORE.x - spawn.x, CASTLE_CORE.z - spawn.z)
      const o = createOrk(spawn.x, spawn.z, facing, a.variant, WAVE_FACTION, a.spawnIndex * 1.7)
      o.hp = a.hp
      o.maxHp = a.hp
      markSpawned()
      break
    }
  }
}

/**
 * Drives the assault: counts down the prep timer, spawns the current wave's
 * orks on an interval, and advances to the next wave (or victory) once the wave
 * is cleared. The decision logic lives in stepWaveDirector (pure, tested); this
 * component is the one useFrame that feeds it state and applies its actions.
 */
export function WaveDirector() {
  const timers = useRef<WaveTimers>({ prepEndsAt: 0, nextSpawnAt: 0, spawnIndex: 0 })

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const now = clock.getElapsedTime()
    const alive = getAliveOrks().length
    // Track alive count for the HUD.
    setEnemiesAlive(alive)

    const { actions, timers: next } = stepWaveDirector({
      phase: getPhase(),
      wave: getWave(),
      timers: timers.current,
      now,
      alive,
    })
    timers.current = next
    for (const a of actions) applyWaveAction(a)
  })

  return null
}
