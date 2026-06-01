// "The Blade Passes" — when the hero falls, his body stays on the field as a
// grave and his spirit streaks (a soul wisp) into the nearest townsperson, who
// rises as the new hero with all progression intact. The town's population is
// therefore the run's true pool of lives; when no one is left to inherit, the
// bloodline — and the run — ends.
//
// This store holds the two pieces of persistent/transient state that the scene
// needs to draw: the field of graves, and the single in-flight soul transfer.
// Hand-rolled external store, same shape as the rest of src/world/*Store.ts.

/** Seconds the spirit takes to travel from the fallen body to its heir. The
 *  hero rises (and the wisp lands) when this elapses. */
export const SUCCESSION_DURATION = 1.7

export interface Grave {
  id: number
  x: number
  y: number
  z: number
}

/** A spirit in flight from a fallen body (from) to its chosen heir (to). */
export interface Soul {
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  /** sim time (sec) the transfer began */
  startAt: number
}

const graves: Grave[] = []
let nextGraveId = 0
const graveSubs = new Set<(list: Grave[]) => void>()

let soul: Soul | null = null
const soulSubs = new Set<(s: Soul | null) => void>()

// ─── Graves (discrete: notify on add so the field re-renders) ──────────────

export function addGrave(x: number, y: number, z: number): Grave {
  const g: Grave = { id: nextGraveId++, x, y, z }
  graves.push(g)
  graveSubs.forEach((fn) => fn(graves))
  return g
}

export function getGraves(): Grave[] {
  return graves
}

export function subscribeGraves(fn: (list: Grave[]) => void): () => void {
  graveSubs.add(fn)
  fn(graves)
  return () => {
    graveSubs.delete(fn)
  }
}

export function resetGraves(): void {
  graves.length = 0
  nextGraveId = 0
  graveSubs.forEach((fn) => fn(graves))
}

// ─── Soul transfer (discrete mount/unmount; the wisp animates per-frame off
//     the live object returned by getSoul) ───────────────────────────────────

export function startSoul(s: Soul): void {
  soul = s
  soulSubs.forEach((fn) => fn(soul))
}

export function getSoul(): Soul | null {
  return soul
}

export function clearSoul(): void {
  if (soul === null) return
  soul = null
  soulSubs.forEach((fn) => fn(soul))
}

export function subscribeSoul(fn: (s: Soul | null) => void): () => void {
  soulSubs.add(fn)
  fn(soul)
  return () => {
    soulSubs.delete(fn)
  }
}
