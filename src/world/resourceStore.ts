// Crafting resources gathered out in the wild and spent on city upgrades.
// Currently just `stone` — mined from ore boulders in the rock highlands (see
// oreStore) and spent on defense upgrades alongside gold (see upgradeStore). A
// hand-rolled module store like playerStore's gold: discrete changes notify the
// HUD; there is no per-frame channel here (stone only ever changes on a mine /
// purchase event, never every frame).
import { sayHeroLine } from './voiceStore'

export interface Resources {
  stone: number
}

const state: Resources = { stone: 0 }
const subs = new Set<(r: Resources) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getStone(): number {
  return state.stone
}

export function addStone(n: number): void {
  if (n <= 0) return
  state.stone += n
  notify()
  // First ore broken this run — explain stone goes into the castle's defenses.
  sayHeroLine('first-stone', '/audio/vo/stone.mp3')
}

/** Spend stone if affordable. Returns false and changes nothing when short. */
export function spendStone(n: number): boolean {
  if (n <= 0) return true
  if (state.stone < n) return false
  state.stone -= n
  notify()
  return true
}

/** Subscribe to stone changes; fires once immediately with current state.
 *  Returns an unsubscribe fn. HUD panels wire this in a useEffect. */
export function subscribeResources(fn: (r: Resources) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}

export function resetResources(): void {
  state.stone = 0
  notify()
}
