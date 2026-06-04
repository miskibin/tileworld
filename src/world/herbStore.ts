import { tileAt, tileTopY } from './tileMap'

// Marsh herbs: foragable plants strewn through the swamp. Unlike ore (which you
// mine by hitting) you gather a herb just by walking up to it — the "forage" verb.
// Each yields one Marsh Herb item (a heal + resist poultice, see inventoryStore).
// The swamp's slow + poison hazard (see Character) is what makes foraging risky.
// Pure store; HerbPlants.tsx places + renders them.

export interface HerbState {
  id: number
  x: number
  y: number
  z: number
  seed: number
  collected: boolean
}

const herbs: HerbState[] = []
let nextId = 0

export function createHerb(x: number, z: number, seed: number): HerbState {
  const fx = Math.floor(x)
  const fz = Math.floor(z)
  const t = tileAt(fx, fz)
  const h: HerbState = {
    id: nextId++,
    x,
    y: t ? tileTopY(fx, fz) : 1,
    z,
    seed,
    collected: false,
  }
  herbs.push(h)
  return h
}

export function resetHerbs(): void {
  herbs.length = 0
  nextId = 0
}

export function getHerbs(): HerbState[] {
  return herbs
}

export function getActiveHerbs(): HerbState[] {
  return herbs.filter((h) => !h.collected)
}

/** Mark a herb foraged. Returns false if it was already taken. */
export function collectHerb(h: HerbState): boolean {
  if (h.collected) return false
  h.collected = true
  return true
}
