import { tileAt } from './tileMap'

// The central castle the player upgrades via the Keep's upgrade tree. All coords
// are absolute grid coords in the offset-group space used by World.tsx. The
// castle is "fully tree-built": only the Keep exists at the start; the upgrade
// tree raises the walls, gates, towers, houses and farm.
//
// Grid-based design: every placed model uses one of four cardinal rotations
// (0, 90, 180, 270°) — see snapToCardinal — so the layout stays grid-aligned
// and easy to reason about.

export const CITY_CENTER = { x: 56, z: 33 } as const

/** Wall perimeter (also the footprint reserved from scatter). */
export const CASTLE_BOUNDS = { minX: 43, maxX: 69, minZ: 23, maxZ: 43 } as const

/** How close the player must be to the Keep to press E. */
export const INTERACT_DIST = 3.4

const HALF_PI = Math.PI / 2

/** Snap any angle to the nearest cardinal (0, 90, 180, 270°). */
export function snapToCardinal(a: number): number {
  const snapped = Math.round(a / HALF_PI) * HALF_PI
  // Normalise to [0, 2π).
  return ((snapped % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
}

/** Cardinal rotation whose +Z front faces the city centre. */
function faceCenter(x: number, z: number): number {
  return snapToCardinal(Math.atan2(CITY_CENTER.x - x, CITY_CENTER.z - z))
}

// ---- Keep (central, multi-tile, interactable, exists from start) ----
export const KEEP_SLOT = { x: CITY_CENTER.x, z: CITY_CENTER.z, rotation: 0 } as const
export const KEEP_INTERACT = { x: KEEP_SLOT.x, z: KEEP_SLOT.z } as const
/** Keep footprint half-extents (for blocker + scatter keep-clear). */
export const KEEP_HALF = { x: 3.5, z: 3 } as const

export interface HouseSlot {
  x: number
  z: number
  rotation: number
  doorX: number
  doorZ: number
}

export interface WallSlot {
  x: number
  z: number
  rotation: number
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

export interface FarmSlot {
  x: number
  z: number
  rotation: number
  w: number
  d: number
}

/** Door sits ~1.6 tiles out the front (+Z local) of the house. */
function doorInFront(x: number, z: number, rotation: number): { doorX: number; doorZ: number } {
  const off = 1.6
  return { doorX: x + Math.sin(rotation) * off, doorZ: z + Math.cos(rotation) * off }
}

function house(x: number, z: number): HouseSlot {
  const rotation = faceCenter(x, z)
  const { doorX, doorZ } = doorInFront(x, z, rotation)
  return { x, z, rotation, doorX, doorZ }
}

/** Ten houses on a grid ring inside the walls, clear of the Keep and farm. */
export const HOUSE_SLOTS: HouseSlot[] = [
  // north interior row (z=26)
  house(47, 26),
  house(53, 26),
  house(59, 26),
  house(65, 26),
  // south interior row (z=40)
  house(47, 40),
  house(53, 40),
  house(59, 40),
  house(65, 40),
  // mid sides (z=33)
  house(45, 33),
  house(67, 33),
]

const WALL_H = 1.8

// Perimeter walls. rotation 0 = runs along X; 90° = runs along Z. Gate breaks
// the south edge (player side).
export const WALL_SLOTS: WallSlot[] = [
  // North edge (z=23) — full span x43..69
  { x: 56, z: 23, rotation: 0, len: 26 },
  // West edge (x=43) — z23..43
  { x: 43, z: 33, rotation: HALF_PI, len: 20 },
  // East edge (x=69) — z23..43
  { x: 69, z: 33, rotation: HALF_PI, len: 20 },
  // South edge (z=43) — split around the gate (gate gap x54..58)
  { x: 48.5, z: 43, rotation: 0, len: 9 },
  { x: 63.5, z: 43, rotation: 0, len: 9 },
]

export const GATE_SLOT: GateSlot = { x: 56, z: 43, rotation: 0, width: 4 }

export const TOWER_SLOTS: TowerSlot[] = [
  { x: 43, z: 23, rotation: snapToCardinal(Math.PI * 1.25) },
  { x: 69, z: 23, rotation: snapToCardinal(Math.PI * 1.75) },
  { x: 69, z: 43, rotation: snapToCardinal(Math.PI * 0.25) },
  { x: 43, z: 43, rotation: snapToCardinal(Math.PI * 0.75) },
]

/** A tended farm plot in the NE interior. */
export const FARM_SLOT: FarmSlot = { x: 62, z: 28, rotation: 0, w: 5, d: 4 }

export const CITY_WALL_HEIGHT = WALL_H

/** Ground height at a grid coord (1 if off-map / water). */
export function slotGroundY(x: number, z: number): number {
  const tile = tileAt(Math.floor(x), Math.floor(z))
  return tile ? tile.height : 1
}

/** True if a grid tile lies within the castle wall perimeter. */
export function isInsideCastle(x: number, z: number): boolean {
  return x >= CASTLE_BOUNDS.minX && x <= CASTLE_BOUNDS.maxX && z >= CASTLE_BOUNDS.minZ && z <= CASTLE_BOUNDS.maxZ
}
