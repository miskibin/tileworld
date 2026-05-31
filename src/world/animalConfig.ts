import type { AnimalFaction } from './factions'

// Per-species stats + behaviour for the wild animals that share animalStore /
// animalAI. Behaviour class drives which AI branch runs:
//   predator → hunts prey + player (A* chase, melee)
//   prey     → flees predators/bears/player, never attacks
//   boar     → neutral wanderer that enrages (charges + gores) when hit or
//              approached, then calms down

export type AnimalSpecies = 'wolf' | 'deer' | 'boar' | 'rabbit'
export type Behavior = 'predator' | 'prey' | 'boar'

export interface AnimalConfig {
  faction: AnimalFaction
  behavior: Behavior
  hp: number
  /** chase (predator/boar) or flee (prey) speed, grid units/sec */
  speed: number
  /** relaxed wander speed */
  wanderSpeed: number
  /** predator: detect target range. boar: charge-trigger proximity. */
  aggro: number
  /** predator/boar: give-up distance */
  leash: number
  /** prey: start fleeing within this range of a threat */
  fear: number
  melee: number
  attackDamage: number
  attackDuration: number
  attackCooldown: number
  turnRate: number
  pathRecompute: number
  waypointRadius: number
  /** outer group scale for the view mesh */
  scale: number
  collisionRadius: number
  /** whether this animal blocks the player's movement */
  blocks: boolean
  bountyGold: number
  bountyXp: number
}

export const ANIMAL_CONFIG: Record<AnimalSpecies, AnimalConfig> = {
  // Pack predator — hunts deer/rabbits and the player.
  wolf: {
    faction: 'predator',
    behavior: 'predator',
    hp: 80,
    speed: 3.8,
    wanderSpeed: 1.1,
    aggro: 12,
    leash: 18,
    fear: 0,
    melee: 1.4,
    attackDamage: 12,
    attackDuration: 0.5,
    attackCooldown: 1.1,
    turnRate: 8,
    pathRecompute: 0.45,
    waypointRadius: 0.5,
    scale: 0.48,
    collisionRadius: 0.32,
    blocks: true,
    bountyGold: 12,
    bountyXp: 22,
  },
  // Skittish grazer — bolts from predators, bears, and the player.
  deer: {
    faction: 'prey',
    behavior: 'prey',
    hp: 45,
    speed: 3.5,
    wanderSpeed: 1.3,
    aggro: 0,
    leash: 0,
    fear: 8,
    melee: 0,
    attackDamage: 0,
    attackDuration: 0,
    attackCooldown: 0,
    turnRate: 7,
    pathRecompute: 0.5,
    waypointRadius: 0.4,
    scale: 0.5,
    collisionRadius: 0.3,
    blocks: false,
    bountyGold: 10,
    bountyXp: 14,
  },
  // Tiny, very skittish ambient prey.
  rabbit: {
    faction: 'prey',
    behavior: 'prey',
    hp: 8,
    speed: 4.0,
    wanderSpeed: 1.4,
    aggro: 0,
    leash: 0,
    fear: 6,
    melee: 0,
    attackDamage: 0,
    attackDuration: 0,
    attackCooldown: 0,
    turnRate: 9,
    pathRecompute: 0.5,
    waypointRadius: 0.35,
    scale: 0.4,
    collisionRadius: 0,
    blocks: false,
    bountyGold: 3,
    bountyXp: 5,
  },
  // Neutral tank — ignores you until provoked, then charges and gores.
  boar: {
    faction: 'boar',
    behavior: 'boar',
    hp: 140,
    speed: 3.2,
    wanderSpeed: 0.9,
    aggro: 5, // proximity that triggers a charge
    leash: 16,
    fear: 0,
    melee: 1.5,
    attackDamage: 18,
    attackDuration: 0.6,
    attackCooldown: 1.4,
    turnRate: 6,
    pathRecompute: 0.45,
    waypointRadius: 0.5,
    scale: 0.48,
    collisionRadius: 0.4,
    blocks: true,
    bountyGold: 16,
    bountyXp: 26,
  },
}
