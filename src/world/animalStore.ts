import { tileAt } from './tileMap'
import { ANIMAL_CONFIG, type AnimalSpecies } from './animalConfig'
import type { AnimalFaction } from './factions'

// Shared store for the wild animals (wolf/deer/boar/rabbit). Mirrors the
// orkStore/bearStore conventions: a module array, getAlive/reset/damage,
// collision query. Species-specific stats come from ANIMAL_CONFIG.

export interface AnimalState {
  id: number
  species: AnimalSpecies
  faction: AnimalFaction
  x: number
  y: number
  z: number
  facing: number
  hp: number
  maxHp: number
  hurtFlashUntil: number
  seed: number
  collisionRadius: number
  blocks: boolean
  // AI scratch
  target: { x: number; z: number } | null
  idleUntil: number
  moving: boolean
  /** boar: time (sec) until it calms down from a charge */
  enragedUntil: number
  attackingSince: number
  attackReadyAt: number
  attackHitDealt: boolean
  // Predator/boar chase pathfinding
  path: { x: number; z: number }[]
  pathIndex: number
  pathRecomputeAt: number
}

const animals: AnimalState[] = []
let nextId = 0

export function createAnimal(
  species: AnimalSpecies,
  x: number,
  z: number,
  seed: number,
): AnimalState {
  const cfg = ANIMAL_CONFIG[species]
  const t = tileAt(Math.floor(x), Math.floor(z))
  const y = t ? t.height : 1
  const a: AnimalState = {
    id: nextId++,
    species,
    faction: cfg.faction,
    x,
    y,
    z,
    facing: seed,
    hp: cfg.hp,
    maxHp: cfg.hp,
    hurtFlashUntil: 0,
    seed,
    collisionRadius: cfg.collisionRadius,
    blocks: cfg.blocks,
    target: null,
    idleUntil: 0,
    moving: false,
    enragedUntil: 0,
    attackingSince: 0,
    attackReadyAt: 0,
    attackHitDealt: false,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
  }
  animals.push(a)
  return a
}

export function resetAnimals(): void {
  animals.length = 0
  nextId = 0
}

export function getAnimals(): AnimalState[] {
  return animals
}

export function getAliveAnimals(): AnimalState[] {
  return animals.filter((a) => a.hp > 0)
}

/** Returns true if the animal dies on this hit. Boars enrage when struck. */
export function damageAnimal(a: AnimalState, amount: number, now: number): boolean {
  if (a.hp <= 0) return false
  a.hp = Math.max(0, a.hp - amount)
  a.hurtFlashUntil = now + 0.25
  if (a.faction === 'boar') {
    a.enragedUntil = now + 8 // a struck boar charges
  } else if (a.faction === 'prey') {
    a.target = null // panic — abandon current wander and bolt
    a.idleUntil = now + 0.2
  }
  return a.hp <= 0
}

/** Nearest living prey animal (deer/rabbit) to (x,z) within range, or null. */
export function nearestPrey(x: number, z: number, range: number): AnimalState | null {
  let best: AnimalState | null = null
  let bestD = range * range
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i]
    if (a.hp <= 0 || a.faction !== 'prey') continue
    const dx = a.x - x
    const dz = a.z - z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

/** Distance² to the nearest predator animal (wolf) within range, plus the
 * predator position — used by prey to flee. Returns null if none in range. */
export function nearestPredatorAnimal(
  x: number,
  z: number,
  range: number,
): AnimalState | null {
  let best: AnimalState | null = null
  let bestD = range * range
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i]
    if (a.hp <= 0 || a.faction !== 'predator') continue
    const dx = a.x - x
    const dz = a.z - z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

/** Player-vs-animal blocking check (only species flagged `blocks`). */
export function animalCollidesAt(x: number, z: number, r: number): boolean {
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i]
    if (a.hp <= 0 || !a.blocks) continue
    const dx = x - a.x
    const dz = z - a.z
    const rsum = r + a.collisionRadius
    if (dx * dx + dz * dz < rsum * rsum) return true
  }
  return false
}
