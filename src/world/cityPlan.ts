import { tileAt } from './tileMap'

// The central castle the player upgrades via the Keep's upgrade tree. All coords
// are absolute grid coords in the offset-group space used by World.tsx. The
// castle is "fully tree-built": only the Keep exists at the start; the upgrade
// tree raises the walls, gates, towers, houses and farm.
//
// Grid-based design: every placed model uses one of four cardinal rotations
// (0, 90, 180, 270°) — see snapToCardinal — so the layout stays grid-aligned
// and easy to reason about.

export const CITY_CENTER = { x: 57, z: 33 } as const

/** Wall perimeter (also the footprint reserved from scatter). Sits on the
 *  central plain, clear of both rivers (N-S bends to ~x42, E-W reaches ~z23). */
export const CASTLE_BOUNDS = { minX: 44, maxX: 70, minZ: 24, maxZ: 42 } as const

/** How close the player must be to the Keep to press E (keep is multi-tile). */
export const INTERACT_DIST = 4.2

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

/** Gate openings (gap) along a wall: gives the clear span to leave in walls. */
export const GATE_GAP = 4

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

/** Eight houses in two grid rows inside the walls, clear of the gates, Keep
 *  and farm (≥1.5 tiles from every wall). */
export const HOUSE_SLOTS: HouseSlot[] = [
  // north interior row (z=27) — flanking the north gate
  house(48, 27),
  house(52, 27),
  house(62, 27),
  house(66, 27),
  // south interior row (z=39) — flanking the south gate
  house(48, 39),
  house(52, 39),
  house(62, 39),
  house(66, 39),
]

const WALL_H = 1.8

// Perimeter walls (bounds x44..70, z24..42). rotation 0 = runs along X; 90° =
// runs along Z. Each side is split around its central gate, with segments that
// span exactly tower→gate→tower so there are no gaps. Gate gaps: N/S at x55..59,
// W/E at z31..35.
export const WALL_SLOTS: WallSlot[] = [
  // North edge (z=24)
  { x: 49.5, z: 24, rotation: 0, len: 11 }, // x44..55
  { x: 64.5, z: 24, rotation: 0, len: 11 }, // x59..70
  // South edge (z=42)
  { x: 49.5, z: 42, rotation: 0, len: 11 },
  { x: 64.5, z: 42, rotation: 0, len: 11 },
  // West edge (x=44)
  { x: 44, z: 27.5, rotation: HALF_PI, len: 7 }, // z24..31
  { x: 44, z: 38.5, rotation: HALF_PI, len: 7 }, // z35..42
  // East edge (x=70)
  { x: 70, z: 27.5, rotation: HALF_PI, len: 7 },
  { x: 70, z: 38.5, rotation: HALF_PI, len: 7 },
]

/** Four gates, one centred on each wall. */
export const GATE_SLOTS: GateSlot[] = [
  { x: 57, z: 24, rotation: 0, width: GATE_GAP }, // north
  { x: 57, z: 42, rotation: 0, width: GATE_GAP }, // south
  { x: 44, z: 33, rotation: HALF_PI, width: GATE_GAP }, // west
  { x: 70, z: 33, rotation: HALF_PI, width: GATE_GAP }, // east
]

export const TOWER_SLOTS: TowerSlot[] = [
  { x: 44, z: 24, rotation: snapToCardinal(Math.PI * 1.25) },
  { x: 70, z: 24, rotation: snapToCardinal(Math.PI * 1.75) },
  { x: 70, z: 42, rotation: snapToCardinal(Math.PI * 0.25) },
  { x: 44, z: 42, rotation: snapToCardinal(Math.PI * 0.75) },
]

/** A tended farm plot in the NE interior. */
export const FARM_SLOT: FarmSlot = { x: 49, z: 33, rotation: 0, w: 5, d: 4 }

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
