import type { OrkVariant } from './orkConfig'
import { getCity } from './cityStore'
import { addGold } from './playerStore'

// Escalating assault waves. `variants` is the pool sampled (round-robin by spawn
// index) for that wave; `hpScale` multiplies each ork's base HP; `count` orks
// spawn `spawnInterval` seconds apart. The final wave is the boss push.
export interface WaveDef {
  count: number
  hpScale: number
  variants: OrkVariant[]
  spawnInterval: number
}

// Tuned harder than the first pass: early waves carry a scout/berserker so
// they're a real fight, and counts/HP ramp steeper to match the stronger
// defenses (keep archers, reinforced keep, tower mastery, militia).
// Ork base HP compounds +15% per night (g_h = 1.15): hpScale[n] = 1.1 * 1.15^n.
export const WAVES: WaveDef[] = [
  // Night 1 is an easy opener — grunts + one scout, no berserker, base HP — so a
  // fresh hero isn't overwhelmed before earning any upgrades.
  { count: 6, hpScale: 1.0, variants: ['grunt', 'grunt', 'scout', 'grunt'], spawnInterval: 1.2 },
  { count: 8, hpScale: 1.18, variants: ['grunt', 'scout', 'grunt', 'berserker'], spawnInterval: 1.1 },
  { count: 12, hpScale: 1.45, variants: ['grunt', 'scout', 'berserker', 'shaman'], spawnInterval: 1.1 },
  { count: 15, hpScale: 1.67, variants: ['grunt', 'berserker', 'scout', 'shaman'], spawnInterval: 1.0 },
  { count: 18, hpScale: 1.92, variants: ['berserker', 'scout', 'grunt', 'shaman'], spawnInterval: 0.95 },
  { count: 22, hpScale: 2.21, variants: ['berserker', 'scout', 'shaman', 'grunt'], spawnInterval: 0.85 },
  { count: 26, hpScale: 2.54, variants: ['berserker', 'shaman', 'scout', 'grunt'], spawnInterval: 0.75 },
  { count: 1, hpScale: 14.0, variants: ['berserker'], spawnInterval: 0.5 }, // boss
]

// The day is a free-roam window: long enough to ride out to a biome (mine stone,
// clear a camp for heirs, hunt, forage) AND get back before the siege. Ring the
// war bell (WarBell) to summon the night early when you're ready.
export const PREP_DURATION = 180 // seconds — a full "day" to explore + rebuild

/** Gold paid by the Tax Office (Economy upgrade) each time a wave is cleared. */
export const TAX_STIPEND = 25

/**
 * Pay the Tax Office stipend on a wave clear. Called by the wave director at the
 * wave→prep transition (the only "wave cleared" event). No-op unless the Tax
 * Office has been purchased. Returns the gold paid (0 if not owned).
 */
export function payWaveClearStipend(): number {
  if (!getCity().taxOffice) return 0
  addGold(TAX_STIPEND)
  return TAX_STIPEND
}

export interface WaveProgress {
  /** 0-based index into WAVES; -1 before the first wave starts. */
  index: number
  total: number
  /** orks still alive in the current wave */
  enemiesAlive: number
  /** orks spawned so far this wave */
  spawned: number
  /** whole seconds left in the prep breather (drives the HUD countdown) */
  prepSecondsLeft: number
}

const state: WaveProgress = {
  index: -1,
  total: WAVES.length,
  enemiesAlive: 0,
  spawned: 0,
  prepSecondsLeft: 0,
}
// Set by the HUD "Skip" button; consumed by the wave director next frame.
let skipRequested = false
const subs = new Set<(s: WaveProgress) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getWave(): WaveProgress {
  return state
}

/** True while the final wave — the boss push — is the active one. */
export function isBossWave(): boolean {
  return state.index === WAVES.length - 1
}

/** Begin wave `i`: reset per-wave counters. */
export function beginWave(i: number): void {
  state.index = i
  state.spawned = 0
  state.enemiesAlive = 0
  notify()
}

export function markSpawned(): void {
  state.spawned += 1
  notify()
}

/** Update the alive count; notify only when it actually changes (HUD churn). */
export function setEnemiesAlive(n: number): void {
  if (state.enemiesAlive === n) return
  state.enemiesAlive = n
  notify()
}

/** Prep countdown: set whole seconds left; notify only when the number changes. */
export function setPrepSecondsLeft(n: number): void {
  if (state.prepSecondsLeft === n) return
  state.prepSecondsLeft = n
  notify()
}

/** HUD "Skip" button → start the next wave immediately. */
export function requestPrepSkip(): void {
  skipRequested = true
}

/** Director reads + clears the skip flag once per check. */
export function consumePrepSkip(): boolean {
  if (!skipRequested) return false
  skipRequested = false
  return true
}

export function resetWaves(): void {
  state.index = -1
  state.enemiesAlive = 0
  state.spawned = 0
  state.prepSecondsLeft = 0
  skipRequested = false
  notify()
}

export function subscribeWave(fn: (s: WaveProgress) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}
