import type { AnimalFaction } from './factions'

// Per-species stats + behaviour for the wild animals that share animalStore /
// animalAI. Behaviour class drives which AI branch runs:
//   predator → hunts prey + player (A* chase, melee)
//   prey     → flees predators/bears/player, never attacks
//   boar     → neutral wanderer that enrages (charges + gores) when hit or
//              approached, then calms down

export type AnimalSpecies =
  | 'wolf' | 'deer' | 'boar' | 'rabbit'
  | 'polar_bear' | 'scorpion' | 'bog_croc' | 'elk' | 'goat' | 'golem'
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
  /** item id dropped on death (from ITEM_DEFS); omit for no drop */
  dropItemId?: string
  /** 0..1 chance to drop (default 1 when dropItemId is set) */
  dropChance?: number
  /** optional second, rarer drop rolled independently (e.g. armor off a boss) */
  dropItemId2?: string
  /** 0..1 chance for the second drop (default 1 when dropItemId2 is set) */
  dropChance2?: number
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
  // ─── Biome signature creatures (Phase 2) ──────────────────────
  // Snow: hulking predator — slow, heavy hits.
  polar_bear: {
    faction: 'predator', behavior: 'predator', hp: 200, speed: 3.0, wanderSpeed: 0.9,
    aggro: 13, leash: 20, fear: 0, melee: 1.6, attackDamage: 24, attackDuration: 0.6,
    attackCooldown: 1.4, turnRate: 6, pathRecompute: 0.45, waypointRadius: 0.5,
    scale: 0.62, collisionRadius: 0.42, blocks: true, bountyGold: 28, bountyXp: 40,
    dropItemId: 'fur', dropChance: 0.8,
    dropItemId2: 'leather_armor', dropChance2: 0.5,
  },
  // Desert: fast, fragile, venomous predator.
  scorpion: {
    faction: 'predator', behavior: 'predator', hp: 55, speed: 4.4, wanderSpeed: 1.4,
    aggro: 11, leash: 16, fear: 0, melee: 1.1, attackDamage: 14, attackDuration: 0.4,
    attackCooldown: 0.9, turnRate: 10, pathRecompute: 0.4, waypointRadius: 0.4,
    scale: 0.4, collisionRadius: 0.28, blocks: false, bountyGold: 14, bountyXp: 22,
    dropItemId: 'venom', dropChance: 0.7,
  },
  // Swamp: neutral tank that ambush-charges when approached (boar branch).
  bog_croc: {
    faction: 'boar', behavior: 'boar', hp: 170, speed: 3.6, wanderSpeed: 0.8,
    aggro: 6, leash: 16, fear: 0, melee: 1.5, attackDamage: 20, attackDuration: 0.55,
    attackCooldown: 1.3, turnRate: 6, pathRecompute: 0.45, waypointRadius: 0.5,
    scale: 0.5, collisionRadius: 0.4, blocks: true, bountyGold: 20, bountyXp: 30,
    dropItemId: 'croc_steak', dropChance: 0.9,
  },
  // Forest: large grazer, flees (prey branch).
  elk: {
    faction: 'prey', behavior: 'prey', hp: 60, speed: 3.6, wanderSpeed: 1.2,
    aggro: 0, leash: 0, fear: 9, melee: 0, attackDamage: 0, attackDuration: 0,
    attackCooldown: 0, turnRate: 7, pathRecompute: 0.5, waypointRadius: 0.4,
    scale: 0.58, collisionRadius: 0.32, blocks: false, bountyGold: 12, bountyXp: 18,
    dropItemId: 'elk_jerky', dropChance: 0.9,
  },
  // Rock: nimble grazer, flees (prey branch).
  goat: {
    faction: 'prey', behavior: 'prey', hp: 40, speed: 3.9, wanderSpeed: 1.3,
    aggro: 0, leash: 0, fear: 8, melee: 0, attackDamage: 0, attackDuration: 0,
    attackCooldown: 0, turnRate: 9, pathRecompute: 0.5, waypointRadius: 0.4,
    scale: 0.42, collisionRadius: 0.28, blocks: false, bountyGold: 10, bountyXp: 14,
    dropItemId: 'goat_charm', dropChance: 0.6,
  },
  // Rock: very slow, very tanky; drops a weapon (boar branch).
  golem: {
    faction: 'boar', behavior: 'boar', hp: 280, speed: 2.4, wanderSpeed: 0.6,
    aggro: 5, leash: 14, fear: 0, melee: 1.7, attackDamage: 28, attackDuration: 0.7,
    attackCooldown: 1.6, turnRate: 5, pathRecompute: 0.5, waypointRadius: 0.5,
    scale: 0.6, collisionRadius: 0.46, blocks: true, bountyGold: 36, bountyXp: 55,
    dropItemId: 'stone_maul', dropChance: 0.5,
    dropItemId2: 'iron_armor', dropChance2: 0.4,
  },
}
