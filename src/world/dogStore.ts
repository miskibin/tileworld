import { tileAt, tileTopY } from './tileMap'

export interface DogState {
  id: number
  // World position in grid coords (inside offset group).
  x: number
  y: number
  z: number
  facing: number
  // Animation/AI scratch
  target: { x: number; z: number } | null
  idleUntil: number
  moving: boolean
  // Combat
  hp: number
  maxHp: number
  hurtFlashUntil: number
  // Render side
  paletteIndex: number
  seed: number
}

const dogs: DogState[] = []
let nextId = 0

export function createDog(
  initX: number,
  initZ: number,
  paletteIndex: number,
  seed: number,
): DogState {
  const t = tileAt(Math.floor(initX), Math.floor(initZ))
  const y = t ? tileTopY(Math.floor(initX), Math.floor(initZ)) : 1
  const dog: DogState = {
    id: nextId++,
    x: initX,
    y,
    z: initZ,
    facing: seed,
    target: null,
    idleUntil: 0,
    moving: false,
    hp: 60,
    maxHp: 60,
    hurtFlashUntil: 0,
    paletteIndex,
    seed,
  }
  dogs.push(dog)
  return dog
}

export function resetDogs(): void {
  dogs.length = 0
  nextId = 0
}

export function getDogs(): DogState[] {
  return dogs
}

export function getAliveDogs(): DogState[] {
  return dogs.filter((d) => d.hp > 0)
}

/** Returns true if dog dies on this hit. */
export function damageDog(d: DogState, amount: number, now: number): boolean {
  if (d.hp <= 0) return false
  d.hp = Math.max(0, d.hp - amount)
  d.hurtFlashUntil = now + 0.25
  // On hit, panic — abort current target so it flees / picks new path
  d.target = null
  d.idleUntil = now + 0.3
  return d.hp <= 0
}
