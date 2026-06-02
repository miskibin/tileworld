import type { OrkFaction } from './factions'

// Per-variant ork stats + look. Ork.tsx reads every tuning constant from here
// so a variant is fully described by one entry. "grunt" keeps the original
// numbers so existing camps feel unchanged.

export type OrkVariant = 'grunt' | 'scout' | 'berserker' | 'shaman'

export interface OrkConfig {
  hp: number
  /** melee (or bolt, for shaman) damage per landed hit */
  damage: number
  speed: number // grid units / sec while chasing
  aggro: number // start chase within this range
  melee: number // attempt a swing within this range
  turnRate: number
  attackDuration: number // seconds, full swing / cast
  attackCooldown: number // seconds between swings / casts
  pathRecompute: number
  waypointRadius: number
  collisionRadius: number
  /** multiplies the base group scale (0.7) used in Ork.tsx */
  scale: number
  skin: string
  bountyGold: number
  bountyXp: number
  // Behaviour flags
  ranged?: boolean // shaman: throw a bolt instead of meleeing
  rangedRange?: number
  healAmount?: number // shaman: heal a wounded ally on a timer
  healCooldown?: number
  healRange?: number
  frenzy?: boolean // berserker: speeds up + swings faster below 40% hp
}

export const ORK_CONFIG: Record<OrkVariant, OrkConfig> = {
  // Baseline — identical to the pre-variant ork.
  grunt: {
    hp: 220,
    damage: 24,
    speed: 2.3,
    aggro: 9,
    melee: 1.5,
    turnRate: 6,
    attackDuration: 0.7,
    attackCooldown: 1.6,
    pathRecompute: 0.55,
    waypointRadius: 0.45,
    collisionRadius: 0.32,
    scale: 1.0,
    skin: '#3a6a2a',
    bountyGold: 8,
    bountyXp: 20,
  },
  // Fast, fragile harasser with a wide aggro range.
  scout: {
    hp: 120,
    damage: 15,
    speed: 3.3,
    aggro: 13,
    melee: 1.4,
    turnRate: 9,
    attackDuration: 0.5,
    attackCooldown: 1.0,
    pathRecompute: 0.4,
    waypointRadius: 0.45,
    collisionRadius: 0.26,
    scale: 0.78,
    skin: '#5f9a3c',
    bountyGold: 6,
    bountyXp: 14,
  },
  // Glass cannon: rapid swings, frenzies (faster) when wounded.
  berserker: {
    hp: 270,
    damage: 30,
    speed: 2.6,
    aggro: 10,
    melee: 1.5,
    turnRate: 7,
    attackDuration: 0.45,
    attackCooldown: 0.85,
    pathRecompute: 0.45,
    waypointRadius: 0.45,
    collisionRadius: 0.34,
    scale: 1.06,
    skin: '#7a3a26',
    bountyGold: 14,
    bountyXp: 30,
    frenzy: true,
  },
  // Ranged caster: lobs magic bolts and heals wounded allies.
  shaman: {
    hp: 175,
    damage: 26, // bolt damage
    speed: 1.8,
    aggro: 15,
    melee: 11, // "melee" = preferred cast distance (keeps its range)
    turnRate: 5,
    attackDuration: 0.6,
    attackCooldown: 2.1,
    pathRecompute: 0.5,
    waypointRadius: 0.45,
    collisionRadius: 0.3,
    scale: 0.96,
    skin: '#6a3f86',
    bountyGold: 18,
    bountyXp: 34,
    ranged: true,
    rangedRange: 12,
    healAmount: 24,
    healCooldown: 5,
    healRange: 8,
  },
}

/** Warband tint shown on loincloth + war-paint so camps read as rivals. */
export const FACTION_COLOR: Record<OrkFaction, string> = {
  red: '#9a2a22',
  blue: '#26468f',
}
