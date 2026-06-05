import { isShopOpen } from './shopStore'
import { isTreeOpen } from './townHallStore'
import { isInventoryOpen } from './inventoryStore'

// World runs live by default — the StartScreen is just an overlay, time keeps
// ticking behind it. Only end screens + an explicit Esc pause freeze the sim
// (see gameStore + togglePaused).
let paused = false
const subs = new Set<(v: boolean) => void>()

export function isPaused(): boolean {
  return paused
}

/**
 * True when the simulation should hold still: hard pause, or a modal panel
 * (shop / upgrade tree / inventory) is open. World useFrame loops gate on this so
 * enemies don't keep attacking and the player can't walk behind an open panel.
 */
export function isFrozen(): boolean {
  return paused || isShopOpen() || isTreeOpen() || isInventoryOpen()
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
