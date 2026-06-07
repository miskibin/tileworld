import { isShopOpen } from './shopStore'
import { isTreeOpen } from './townHallStore'
import { isInventoryOpen } from './inventoryStore'
import { isSettingsOpen } from './settingsStore'

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
  return paused || isShopOpen() || isTreeOpen() || isInventoryOpen() || isSettingsOpen()
}

export function setPaused(v: boolean): void {
  if (paused === v) return
  paused = v
  subs.forEach((fn) => fn(v))
}

export function togglePaused(): void {
  setPaused(!paused)
}

/**
 * Whether dropping out of fullscreen should open the pause menu. The browser
 * reserves Esc to exit fullscreen and (in Chrome) swallows the keydown, so the
 * normal Esc->togglePaused handler never fires while fullscreen. We treat the
 * fullscreen exit itself as the pause request — but only mid-run, with no modal
 * already owning the screen, and not when we're already paused (avoids a
 * double-toggle on browsers that DO deliver the keydown too, e.g. Firefox).
 */
export function shouldPauseOnFullscreenExit(
  wasFullscreen: boolean,
  nowFullscreen: boolean,
  ctx: { started: boolean; modalOpen: boolean; paused: boolean },
): boolean {
  return (
    wasFullscreen &&
    !nowFullscreen &&
    ctx.started &&
    !ctx.modalOpen &&
    !ctx.paused
  )
}

export function subscribePaused(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
