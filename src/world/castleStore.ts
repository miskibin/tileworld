import { CITY_CENTER } from './cityPlan'
import { setPhase, getPhase } from './gameStore'
import { addShake } from './fxStore'

// The keep is the thing you defend. Orks march to CASTLE_CORE and chip its HP;
// at 0 the run is lost. Hand-rolled store, same shape as playerStore.
export const CASTLE_CORE = { x: CITY_CENTER.x, z: CITY_CENTER.z } as const
export const CASTLE_MAX_HP = 500

export interface CastleState {
  hp: number
  maxHp: number
}

const state: CastleState = { hp: CASTLE_MAX_HP, maxHp: CASTLE_MAX_HP }
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
  addShake(0.25, 0.3)
  notify()
  if (state.hp <= 0 && getPhase() === 'wave') setPhase('defeat')
}

export function resetCastle(): void {
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
