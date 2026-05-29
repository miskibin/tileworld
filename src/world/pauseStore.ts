import { isShopOpen } from './shopStore'
import { isTreeOpen } from './townHallStore'

// Starts paused so the world is frozen behind the start screen until the
// player clicks Play (see StartScreen + gameStore).
let paused = true
const subs = new Set<(v: boolean) => void>()

export function isPaused(): boolean {
  return paused
}

/**
 * True when the simulation should hold still: hard pause, or a modal panel
 * (shop / upgrade tree) is open. World useFrame loops gate on this so enemies
 * don't keep attacking and the player can't walk behind an open panel.
 */
export function isFrozen(): boolean {
  return paused || isShopOpen() || isTreeOpen()
}

export function setPaused(v: boolean): void {
  if (paused === v) return
  paused = v
  subs.forEach((fn) => fn(v))
}

export function togglePaused(): void {
  setPaused(!paused)
}

export function subscribePaused(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
