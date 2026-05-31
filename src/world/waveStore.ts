import type { OrkVariant } from './orkConfig'

// Escalating assault waves. `variants` is the pool sampled (round-robin by spawn
// index) for that wave; `hpScale` multiplies each ork's base HP; `count` orks
// spawn `spawnInterval` seconds apart. The final wave is the boss push.
export interface WaveDef {
  count: number
  hpScale: number
  variants: OrkVariant[]
  spawnInterval: number
}

export const WAVES: WaveDef[] = [
  { count: 5, hpScale: 1.0, variants: ['grunt'], spawnInterval: 1.6 },
  { count: 7, hpScale: 1.0, variants: ['grunt', 'grunt', 'scout'], spawnInterval: 1.4 },
  { count: 9, hpScale: 1.1, variants: ['grunt', 'scout', 'berserker'], spawnInterval: 1.3 },
  { count: 11, hpScale: 1.2, variants: ['grunt', 'scout', 'berserker', 'shaman'], spawnInterval: 1.2 },
  { count: 13, hpScale: 1.3, variants: ['grunt', 'berserker', 'scout', 'shaman'], spawnInterval: 1.1 },
  { count: 15, hpScale: 1.45, variants: ['berserker', 'scout', 'grunt', 'shaman'], spawnInterval: 1.0 },
  { count: 18, hpScale: 1.6, variants: ['berserker', 'shaman', 'scout', 'grunt'], spawnInterval: 0.9 },
  { count: 1, hpScale: 8.0, variants: ['berserker'], spawnInterval: 0.5 }, // boss
]

export const PREP_DURATION = 12 // seconds between waves

export interface WaveProgress {
  /** 0-based index into WAVES; -1 before the first wave starts. */
  index: number
  total: number
  /** orks still alive in the current wave */
  enemiesAlive: number
  /** orks spawned so far this wave */
  spawned: number
}

const state: WaveProgress = { index: -1, total: WAVES.length, enemiesAlive: 0, spawned: 0 }
const subs = new Set<(s: WaveProgress) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getWave(): WaveProgress {
  return state
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

export function resetWaves(): void {
  state.index = -1
  state.enemiesAlive = 0
  state.spawned = 0
  notify()
}

export function subscribeWave(fn: (s: WaveProgress) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}
