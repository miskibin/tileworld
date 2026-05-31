import { WAVES, PREP_DURATION, type WaveProgress } from './waveStore'
import { ORK_CONFIG, type OrkVariant } from './orkConfig'
import type { GamePhase } from './gameStore'

// Pure decision core for the assault director. WaveDirector.tsx feeds it the
// current phase/wave/timers each frame and applies the emitted actions; keeping
// the logic here (no useFrame, no store writes) makes wave progression testable.

/** Per-component scratch state the reducer threads frame to frame. */
export interface WaveTimers {
  /** wall-clock (sec) the prep breather ends; 0 = not yet armed */
  prepEndsAt: number
  /** earliest time (sec) the next ork in this wave may spawn */
  nextSpawnAt: number
  /** running count of orks spawned this wave (drives variant rotation + ring) */
  spawnIndex: number
}

export type WaveAction =
  | { type: 'beginWave'; index: number }
  | { type: 'setPhase'; phase: GamePhase }
  | { type: 'spawn'; variant: OrkVariant; hp: number; spawnIndex: number; waveIndex: number }

export interface WaveStepInput {
  phase: GamePhase
  wave: WaveProgress
  timers: WaveTimers
  now: number
  /** living wave orks this frame (from getAliveOrks) */
  alive: number
}

export interface WaveStepResult {
  actions: WaveAction[]
  timers: WaveTimers
}

/**
 * Advance the director one tick. Pure: returns the actions to apply and the
 * next timers, mutating nothing. Mirrors the original WaveDirector useFrame:
 *  - prep: arm a PREP_DURATION countdown, then begin the next wave + go 'wave'
 *  - wave: spawn one ork per spawnInterval until the quota is met; once the
 *    wave is fully spawned and cleared, go 'victory' (last wave) or 'prep'.
 */
export function stepWaveDirector(input: WaveStepInput): WaveStepResult {
  const { phase, wave, now, alive } = input
  const timers: WaveTimers = { ...input.timers }
  const actions: WaveAction[] = []

  if (phase === 'prep') {
    if (timers.prepEndsAt === 0) timers.prepEndsAt = now + PREP_DURATION
    if (now >= timers.prepEndsAt) {
      actions.push({ type: 'beginWave', index: wave.index + 1 })
      timers.spawnIndex = 0
      timers.nextSpawnAt = now
      timers.prepEndsAt = 0
      actions.push({ type: 'setPhase', phase: 'wave' })
    }
    return { actions, timers }
  }

  if (phase === 'wave') {
    const def = WAVES[wave.index]
    if (!def) return { actions, timers }
    // Spawn on interval until the wave's quota is met.
    if (wave.spawned < def.count && now >= timers.nextSpawnAt) {
      const variant: OrkVariant = def.variants[timers.spawnIndex % def.variants.length]
      const hp = Math.round(ORK_CONFIG[variant].hp * def.hpScale)
      actions.push({ type: 'spawn', variant, hp, spawnIndex: timers.spawnIndex, waveIndex: wave.index })
      timers.spawnIndex += 1
      timers.nextSpawnAt = now + def.spawnInterval
    }
    // Wave cleared once everything has spawned and nothing is left alive.
    if (wave.spawned >= def.count && alive === 0) {
      actions.push({ type: 'setPhase', phase: wave.index >= WAVES.length - 1 ? 'victory' : 'prep' })
    }
  }

  return { actions, timers }
}
