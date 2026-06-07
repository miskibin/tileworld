import { TOWER_SLOTS } from './cityPlan'

// Per-tower HP + the Tower Mastery flag. Watchtowers can now be battered down by
// orks (Feature: orks attack defenders) and are rebuilt to full at the start of
// each prep phase. Module-level pub/sub, mirroring cityStore.
//
// Two channels: orks chip HP every frame on the HOT PATH (damageTower mutates +
// notifies ONLY when a tower flips alive→destroyed, so the City view swaps the
// model for rubble without per-hit churn). HP bars read the live array directly.

export const TOWER_MAX_HP = 180

export interface TowerState {
  /** HP per slot (index matches TOWER_SLOTS); <=0 = destroyed */
  hp: number[]
  /** Tower Mastery upgrade — towers fire faster/farther/harder */
  mastery: boolean
}

const state: TowerState = {
  hp: TOWER_SLOTS.map(() => TOWER_MAX_HP),
  mastery: false,
}

const subs = new Set<(s: TowerState) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getTowers(): TowerState {
  return state
}

export function isTowerAlive(i: number): boolean {
  return state.hp[i] > 0
}

/** Chip a tower's HP. Returns true if it was destroyed by this hit. Notifies
 *  only on the alive→destroyed transition (so the City view re-renders once). */
export function damageTower(i: number, amount: number): boolean {
  if (i < 0 || i >= state.hp.length) return false
  if (state.hp[i] <= 0) return false
  state.hp[i] = Math.max(0, state.hp[i] - amount)
  if (state.hp[i] <= 0) {
    notify()
    return true
  }
  return false
}

/** Rebuild every tower to full (called at the start of each prep phase). */
export function reviveTowers(): void {
  let changed = false
  for (let i = 0; i < state.hp.length; i++) {
    if (state.hp[i] !== TOWER_MAX_HP) {
      state.hp[i] = TOWER_MAX_HP
      changed = true
    }
  }
  if (changed) notify()
}

export function setTowerMastery(v: boolean): void {
  if (state.mastery === v) return
  state.mastery = v
  notify()
}

export function resetTowers(): void {
  for (let i = 0; i < state.hp.length; i++) state.hp[i] = TOWER_MAX_HP
  state.mastery = false
  notify()
}

/** Saveable: only the Tower Mastery flag — per-tower HP is rebuilt full each prep. */
export function serializeTowers(): { mastery: boolean } {
  return { mastery: state.mastery }
}

export function hydrateTowers(s: { mastery: boolean }): void {
  state.mastery = s.mastery
  notify()
}

export function subscribeTowers(fn: (s: TowerState) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}
