import { WAVES, PREP_DURATION, MIN_PREP_SECONDS, type WaveProgress } from './waveStore'
import { ORK_CONFIG, type OrkVariant } from './orkConfig'
import type { GamePhase } from './gameStore'
import type { DiffMods } from './difficultyStore'

/** Identity mods (Normal): no scaling. Used as the default so callers/tests that
 *  don't care about difficulty get the tuned baseline. */
const NORMAL_MODS: DiffMods = { countMul: 1, hpMul: 1, prepMul: 1 }

/** Orks in wave `i` after the difficulty count multiplier (min 1). */
export function effectiveCount(i: number, mods: DiffMods = NORMAL_MODS): number {
  return Math.max(1, Math.round(WAVES[i].count * mods.countMul))
}

// ── Stuck-ork safety net ──────────────────────────────────────────────────────
// A wave invader can end up on an isolated tile A* can't leave (knocked into a
// water pocket, or a 1-tile island): it never reaches the keep, so the wave never
// clears and the only escape is losing the Keep. The director tracks each wave
// ork's idle time and reaps any that has sat essentially still, far from the keep,
// past STUCK_TIMEOUT. The SAFE_RANGE gate means an ork legitimately attacking the
// keep/towers — or the slow high-HP boss parked at the wall — is never caught.
export const STUCK_TIMEOUT = 20 // sec a far-out ork may sit still before it's culled
export const STUCK_MOVE_EPS = 0.6 // tiles; movement under this counts as "not moving"
export const STUCK_SAFE_RANGE = 16 // tiles from the keep within which orks are never culled

/** Should a wave ork at `distToKeep` tiles, idle for `idleSeconds`, be culled? */
export function isStuckUnreachable(distToKeep: number, idleSeconds: number): boolean {
  return distToKeep > STUCK_SAFE_RANGE && idleSeconds >= STUCK_TIMEOUT
}

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
  /** player pressed "Skip" — start the next wave now without waiting out prep */
  skip?: boolean
  /** difficulty multipliers (count / hp / prep). Defaults to Normal (no scaling). */
  mods?: DiffMods
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
  const { phase, wave, now, alive, skip } = input
  const mods = input.mods ?? NORMAL_MODS
  const timers: WaveTimers = { ...input.timers }
  const actions: WaveAction[] = []

  if (phase === 'prep') {
    const dur = PREP_DURATION * mods.prepMul
    if (timers.prepEndsAt === 0) timers.prepEndsAt = now + dur
    // Floor the skip: a war-bell / HUD "begin night" skip is honored only once the
    // day has run MIN_PREP_SECONDS. This stops a stale or spam-pressed skip landing
    // on the wave→prep transition frame from collapsing the breather to ~0s.
    // Natural expiry (now >= prepEndsAt) is never floored. prepEndsAt - dur is when
    // the day was armed.
    const skipAllowed = skip === true && now >= timers.prepEndsAt - dur + MIN_PREP_SECONDS
    if (skipAllowed || now >= timers.prepEndsAt) {
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
    // Difficulty scales the head-count and per-ork HP (min 1 ork).
    const count = Math.max(1, Math.round(def.count * mods.countMul))
    // Spawn on interval until the wave's quota is met.
    if (wave.spawned < count && now >= timers.nextSpawnAt) {
      const variant: OrkVariant = def.variants[timers.spawnIndex % def.variants.length]
      const hp = Math.round(ORK_CONFIG[variant].hp * def.hpScale * mods.hpMul)
      actions.push({ type: 'spawn', variant, hp, spawnIndex: timers.spawnIndex, waveIndex: wave.index })
      timers.spawnIndex += 1
      timers.nextSpawnAt = now + def.spawnInterval
    }
    // Wave cleared once everything has spawned and nothing is left alive.
    if (wave.spawned >= count && alive === 0) {
      actions.push({ type: 'setPhase', phase: wave.index >= WAVES.length - 1 ? 'victory' : 'prep' })
    }
  }

  return { actions, timers }
}
