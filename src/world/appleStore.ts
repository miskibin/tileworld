import { tileAt, tileTopY } from './tileMap'

// Forest apples: foragable fruit dotted through the western wood. Like marsh
// herbs (and unlike ore, which you mine by hitting) you gather an apple just by
// walking up to it — the forest's easy "forage" reward to pair with the hunt, so
// the hero's "might find some apples too" line actually pays off.
// Pure store; AppleTrees.tsx places + renders them.

export interface AppleState {
  id: number
  x: number
  y: number
  z: number
  seed: number
  collected: boolean
}

const apples: AppleState[] = []
let nextId = 0

export function createApple(x: number, z: number, seed: number): AppleState {
  const fx = Math.floor(x)
  const fz = Math.floor(z)
  const t = tileAt(fx, fz)
  const a: AppleState = {
    id: nextId++,
    x,
    y: t ? tileTopY(fx, fz) : 1,
    z,
    seed,
    collected: false,
  }
  apples.push(a)
  return a
}

export function resetApples(): void {
  apples.length = 0
  nextId = 0
}

export function getApples(): AppleState[] {
  return apples
}

export function getActiveApples(): AppleState[] {
  return apples.filter((a) => !a.collected)
}

/** Mark an apple foraged. Returns false if it was already taken. */
export function collectApple(a: AppleState): boolean {
  if (a.collected) return false
  a.collected = true
  return true
}
