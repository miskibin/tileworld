import { tileAt } from './tileMap'

// The central city the player upgrades via the Town Hall tree. All coords are
// absolute grid coords in the offset-group space used by World.tsx (same space
// as villages/shop). Layout is verified on clear land north of the player spawn
// (48,36): clear of the river (~z22), the shop (52,42), tents and chests.

export const CITY_CENTER = { x: 52, z: 30 } as const

/** How close the player must be to the Town Hall to press E. */
export const INTERACT_DIST = 2.6

/** The Town Hall — the interactable core of the city. */
export const TOWN_HALL_SLOT = { x: CITY_CENTER.x, z: CITY_CENTER.z, rotation: 0 } as const
/** Player-facing interaction anchor (same as the building footprint). */
export const TOWN_HALL_INTERACT = { x: TOWN_HALL_SLOT.x, z: TOWN_HALL_SLOT.z } as const

export interface HouseSlot {
  x: number
  z: number
  rotation: number
  /** door position in front of the house (+Z local face) */
  doorX: number
  doorZ: number
}

export interface WallSlot {
  x: number
  z: number
  rotation: number
  /** length of the segment along its local X axis */
  len: number
}

export interface TowerSlot {
  x: number
  z: number
  rotation: number
}

export interface GateSlot {
  x: number
  z: number
  rotation: number
  width: number
}

/** Rotation so a building's +Z front faces the city centre. */
function faceCenter(x: number, z: number): number {
  return Math.atan2(CITY_CENTER.x - x, CITY_CENTER.z - z)
}

/** Door sits ~1.4 tiles out the front (+Z local) of the house. */
function doorInFront(x: number, z: number, rotation: number): { doorX: number; doorZ: number } {
  const off = 1.4
  return { doorX: x + Math.sin(rotation) * off, doorZ: z + Math.cos(rotation) * off }
}

function house(x: number, z: number): HouseSlot {
  const rotation = faceCenter(x, z)
  const { doorX, doorZ } = doorInFront(x, z, rotation)
  return { x, z, rotation, doorX, doorZ }
}

/** Six houses ringing the Town Hall, each fronting toward the centre. */
export const HOUSE_SLOTS: HouseSlot[] = [
  house(52, 26),
  house(56, 28),
  house(56, 32),
  house(52, 34),
  house(48, 32),
  house(48, 28),
]

// Square perimeter at radius 6: corners (46,24) (58,24) (58,36) (46,36).
const WALL_H = 1.6

/** Wall segments (gate breaks the south edge). rotation 0 = runs along X. */
export const WALL_SLOTS: WallSlot[] = [
  // North edge (z=24) — full span
  { x: 52, z: 24, rotation: 0, len: 12 },
  // West edge (x=46) — runs along Z
  { x: 46, z: 30, rotation: Math.PI / 2, len: 12 },
  // East edge (x=58) — runs along Z
  { x: 58, z: 30, rotation: Math.PI / 2, len: 12 },
  // South edge (z=36) — split around the central gate (gate spans x 50..54)
  { x: 48, z: 36, rotation: 0, len: 4 },
  { x: 56, z: 36, rotation: 0, len: 4 },
]

/** Gate breaks the south wall, facing the player approach from spawn. */
export const GATE_SLOT: GateSlot = { x: 52, z: 36, rotation: 0, width: 4 }

/** Watchtowers at the four wall corners. */
export const TOWER_SLOTS: TowerSlot[] = [
  { x: 46, z: 24, rotation: Math.PI * 1.25 },
  { x: 58, z: 24, rotation: Math.PI * 1.75 },
  { x: 58, z: 36, rotation: Math.PI * 0.25 },
  { x: 46, z: 36, rotation: Math.PI * 0.75 },
]

export const CITY_WALL_HEIGHT = WALL_H

/** Ground height at a grid coord (1 if off-map / water). */
export function slotGroundY(x: number, z: number): number {
  const tile = tileAt(Math.floor(x), Math.floor(z))
  return tile ? tile.height : 1
}
