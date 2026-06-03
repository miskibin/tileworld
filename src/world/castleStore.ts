import { CITY_CENTER } from './cityPlan'
import { setPhase, getPhase } from './gameStore'
import { addShake } from './fxStore'

// The keep is the thing you defend. Orks march to CASTLE_CORE and chip its HP;
// at 0 the run is lost. Hand-rolled store, same shape as playerStore.
export const CASTLE_CORE = { x: CITY_CENTER.x, z: CITY_CENTER.z } as const
export const CASTLE_MAX_HP = 500

/** Extra max HP granted by the Reinforced Keep upgrade. */
export const REINFORCED_BONUS_HP = 350

export interface CastleState {
  hp: number
  maxHp: number
  /** Reinforced Keep upgrade — raises max HP and slowly self-repairs in prep */
  reinforced: boolean
  /**
   * Wall-clock time (performance.now() * 0.001) until which the keep mesh flashes
   * on being hit. Transient, read per-frame by the Keep view — never notifies.
   */
  hurtFlashUntil: number
}

const state: CastleState = { hp: CASTLE_MAX_HP, maxHp: CASTLE_MAX_HP, reinforced: false, hurtFlashUntil: 0 }
const subs = new Set<(s: CastleState) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getCastle(): CastleState {
  return state
}

export function damageCastle(amount: number): void {
  if (state.hp <= 0) return
  state.hp = Math.max(0, state.hp - amount)
  state.hurtFlashUntil = performance.now() * 0.001 + 0.18
  addShake(0.25, 0.3)
  notify()
  if (state.hp <= 0 && getPhase() === 'wave') setPhase('defeat')
}

/** Reinforced Keep: raise max HP and heal by the same amount. */
export function reinforceCastle(): void {
  if (state.reinforced) return
  state.reinforced = true
  state.maxHp += REINFORCED_BONUS_HP
  state.hp += REINFORCED_BONUS_HP
  notify()
}

/**
 * Slow self-repair (Reinforced Keep, prep phase only). Called per frame, so it
 * notifies the HUD only when the rounded HP actually changes to avoid churn.
 */
export function repairCastle(amount: number): void {
  if (state.hp <= 0 || state.hp >= state.maxHp) return
  const before = Math.round(state.hp)
  state.hp = Math.min(state.maxHp, state.hp + amount)
  if (Math.round(state.hp) !== before) notify()
}

export function resetCastle(): void {
  state.maxHp = CASTLE_MAX_HP
  state.reinforced = false
  state.hp = state.maxHp
  notify()
}

export function subscribeCastle(fn: (s: CastleState) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}
