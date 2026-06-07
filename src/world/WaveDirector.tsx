import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { createOrk, countAliveWaveOrks, getOrks, reapOrk, WAVE_FACTION } from './orkStore'
import { CASTLE_CORE, getCastle, repairCastle } from './castleStore'
import { findSpawnNear } from './obstacles'
import { tileAt } from './tileMap'
import { getPhase, setPhase, subscribePhase } from './gameStore'
import {
  getWave,
  beginWave,
  markSpawned,
  setEnemiesAlive,
  setPrepSecondsLeft,
  consumePrepSkip,
  payWaveClearStipend,
  harvestFarm,
} from './waveStore'
import { reviveTowers } from './towerStore'
import { reviveVillagers } from './villagerStore'
import { isFrozen } from './pauseStore'
import { getMods } from './difficultyStore'
import {
  stepWaveDirector,
  isStuckUnreachable,
  STUCK_MOVE_EPS,
  type WaveAction,
  type WaveTimers,
} from './waveLogic'

// Orks enter from a ring around the keep — far enough to read as "incoming",
// close enough to stay inside the player's cull radius while they defend.
const SPAWN_RING = 30
// Reinforced Keep self-repair rate during the prep breather (HP/sec).
const KEEP_REPAIR_RATE = 6

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
      // Tax Office stipend + Granary Farm harvest: both pay out only on a
      // wave-clear → prep transition (the game-start menu→prep goes through
      // StartScreen, not this reducer). Each no-ops unless its building stands.
      if (a.phase === 'prep') {
        payWaveClearStipend()
        harvestFarm()
      }
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
 * Drives the assault: counts down the prep timer (or a Skip), spawns the wave's
 * orks on an interval, and advances to the next wave (or victory) once cleared.
 * The decision logic lives in stepWaveDirector (pure, tested); this component
 * feeds it state, applies its actions, and owns the prep-phase side effects
 * (rebuild towers + revive militia, slow keep self-repair).
 */
export function WaveDirector() {
  const timers = useRef<WaveTimers>({ prepEndsAt: 0, nextSpawnAt: 0, spawnIndex: 0 })
  // Per-wave-ork idle tracking for the stuck safety net (id → last-moved pos + time).
  const stuckTrack = useRef<Map<number, { x: number; z: number; since: number }>>(new Map())

  // Each time we enter prep, rebuild the downed defenders for the next wave.
  useEffect(
    () =>
      subscribePhase((p) => {
        if (p === 'prep') {
          reviveTowers()
          reviveVillagers()
        }
      }),
    [],
  )

  useFrame(({ clock }, dt) => {
    if (isFrozen()) return
    const now = clock.getElapsedTime()
    // Only night-assault orks count — camp warbands (home set) are optional
    // targets and must not block a wave from completing.
    const alive = countAliveWaveOrks()
    // Track alive count for the HUD.
    setEnemiesAlive(alive)

    const { actions, timers: next } = stepWaveDirector({
      phase: getPhase(),
      wave: getWave(),
      timers: timers.current,
      now,
      alive,
      skip: consumePrepSkip(),
      mods: getMods(),
    })
    timers.current = next
    for (const a of actions) applyWaveAction(a)

    // Safety net: cull any night-wave ork stranded far from the keep and motionless
    // past the timeout (e.g. knocked onto an isolated tile A* can't leave). Without
    // this the wave never clears and the only way out is losing the Keep. Reaping
    // drops the alive count so the director's normal clear path then advances.
    if (getPhase() === 'wave') {
      const track = stuckTrack.current
      const toReap: number[] = []
      for (const o of getOrks()) {
        if (o.hp <= 0 || o.home !== null) continue // night invaders only (camps have home)
        const rec = track.get(o.id)
        if (!rec) {
          track.set(o.id, { x: o.x, z: o.z, since: now })
          continue
        }
        if (Math.hypot(o.x - rec.x, o.z - rec.z) > STUCK_MOVE_EPS) {
          rec.x = o.x // moved → reset the idle clock
          rec.z = o.z
          rec.since = now
          continue
        }
        const distKeep = Math.hypot(o.x - CASTLE_CORE.x, o.z - CASTLE_CORE.z)
        if (isStuckUnreachable(distKeep, now - rec.since)) toReap.push(o.id)
      }
      // Reap after the scan so the splice doesn't disturb the iteration above.
      for (const id of toReap) {
        reapOrk(id)
        track.delete(id)
      }
    } else if (stuckTrack.current.size > 0) {
      stuckTrack.current.clear() // between waves: forget all idle tracking
    }

    // Publish the prep countdown + run the keep's slow self-repair.
    if (getPhase() === 'prep') {
      setPrepSecondsLeft(timers.current.prepEndsAt > 0 ? Math.max(0, Math.ceil(timers.current.prepEndsAt - now)) : 0)
      if (getCastle().reinforced) repairCastle(KEEP_REPAIR_RATE * dt)
    } else {
      setPrepSecondsLeft(0)
    }
  })

  return null
}
