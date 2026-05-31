import { setPaused } from './pauseStore'

// The game's top-level phase. The world boots in 'menu' (paused behind the
// StartScreen). 'prep' is the between-wave breather (world live, shop allowed);
// 'wave' is an active assault; 'victory'/'defeat' are end states.
export type GamePhase = 'menu' | 'prep' | 'wave' | 'victory' | 'defeat'

let phase: GamePhase = 'menu'
const subs = new Set<(p: GamePhase) => void>()

export function getPhase(): GamePhase {
  return phase
}

export function setPhase(p: GamePhase): void {
  if (phase === p) return
  phase = p
  // The world freezes behind the menu and the end screens; it runs during
  // prep + wave. This keeps every `if (isFrozen()) return` gate untouched.
  setPaused(p === 'menu' || p === 'victory' || p === 'defeat')
  subs.forEach((fn) => fn(phase))
}

export function subscribePhase(fn: (p: GamePhase) => void): () => void {
  subs.add(fn)
  fn(phase)
  return () => {
    subs.delete(fn)
  }
}

// Back-compat helper for existing call sites that only asked "has the game
// started?" — true once we've left the menu.
export function isStarted(): boolean {
  return phase !== 'menu'
}
