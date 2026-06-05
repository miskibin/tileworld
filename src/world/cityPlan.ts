import { tileAt, tileTopY, CENTER_X, CENTER_Z, shiftToCentre } from './tileMap'

// The central castle the player upgrades via the Keep's upgrade tree. All coords
// are absolute grid coords in the offset-group space used by World.tsx. The
// castle is "fully tree-built": only the Keep exists at the start; the upgrade
// tree raises the walls, gates, towers, houses and farm.
//
// The whole layout is anchored on the map centre (CENTER_X, CENTER_Z) = (72,54)
// so the keep sits dead-centre on the island, ringed by the flat grass
// safe-zone (see CASTLE_SAFE_R in tileMap) with biomes/mountains set well back.
//
// Grid-based design: every placed model uses one of four cardinal rotations
// (0, 90, 180, 270°) — see snapToCardinal — so the layout stays grid-aligned
// and easy to reason about.

export const CITY_CENTER = { x: CENTER_X, z: CENTER_Z } as const

/** Wall perimeter (also the footprint reserved from scatter). Centred on the
 *  island's middle, deep inside the castle safe-zone (radius 18), so no river,
 *  lake or mountain comes near. */
// Base castle spanned x59..85, z45..63 around the base centre (72,54). The keep
// stays ABSOLUTE size and just re-centres on the bigger map: every coord below is
// the base layout translated by (CENTER − baseCentre) via shiftToCentre. Derived
// from CENTER so it tracks the map size automatically (half-extents 13 × 9).
export const CASTLE_BOUNDS = {
  minX: CENTER_X - 13,
  maxX: CENTER_X + 13,
  minZ: CENTER_Z - 9,
  maxZ: CENTER_Z + 9,
} as const

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

function house(bx: number, bz: number): HouseSlot {
  const [x, z] = shiftToCentre(bx, bz) // base layout coord → re-centred map coord
  const rotation = faceCenter(x, z)
  const { doorX, doorZ } = doorInFront(x, z, rotation)
  return { x, z, rotation, doorX, doorZ }
}

/** Eight houses in two grid rows inside the walls, clear of the gates, Keep
 *  and farm (≥1.5 tiles from every wall). */
export const HOUSE_SLOTS: HouseSlot[] = [
  // north interior row (z=48) — flanking the north gate
  house(63, 48),
  house(67, 48),
  house(77, 48),
  house(81, 48),
  // south interior row (z=60) — flanking the south gate
  house(63, 60),
  house(67, 60),
  house(77, 60),
  house(81, 60),
]

const WALL_H = 1.35

// Perimeter walls (bounds x59..85, z45..63). rotation 0 = runs along X; 90° =
// runs along Z. Each side is split around its central gate, with segments that
// span exactly tower→gate→tower so there are no gaps. Gate gaps: N/S at x70..74,
// W/E at z52..56.
// Wall/gate/tower/farm slots are authored in BASE coords (around 72,54) then
// translated to the re-centred castle via shiftToCentre — absolute size kept, so
// segments still abut with no gaps.
const sc = <T extends { x: number; z: number }>(s: T): T => {
  const [x, z] = shiftToCentre(s.x, s.z)
  return { ...s, x, z }
}

export const WALL_SLOTS: WallSlot[] = [
  // North edge (z=45)
  { x: 64.5, z: 45, rotation: 0, len: 11 }, // x59..70
  { x: 79.5, z: 45, rotation: 0, len: 11 }, // x74..85
  // South edge (z=63)
  { x: 64.5, z: 63, rotation: 0, len: 11 },
  { x: 79.5, z: 63, rotation: 0, len: 11 },
  // West edge (x=59)
  { x: 59, z: 48.5, rotation: HALF_PI, len: 7 }, // z45..52
  { x: 59, z: 59.5, rotation: HALF_PI, len: 7 }, // z56..63
  // East edge (x=85)
  { x: 85, z: 48.5, rotation: HALF_PI, len: 7 },
  { x: 85, z: 59.5, rotation: HALF_PI, len: 7 },
].map(sc)

/** Four gates, one centred on each wall. */
export const GATE_SLOTS: GateSlot[] = [
  { x: 72, z: 45, rotation: 0, width: GATE_GAP }, // north
  { x: 72, z: 63, rotation: 0, width: GATE_GAP }, // south
  { x: 59, z: 54, rotation: HALF_PI, width: GATE_GAP }, // west
  { x: 85, z: 54, rotation: HALF_PI, width: GATE_GAP }, // east
].map(sc)

export const TOWER_SLOTS: TowerSlot[] = [
  { x: 59, z: 45, rotation: snapToCardinal(Math.PI * 1.25) },
  { x: 85, z: 45, rotation: snapToCardinal(Math.PI * 1.75) },
  { x: 85, z: 63, rotation: snapToCardinal(Math.PI * 0.25) },
  { x: 59, z: 63, rotation: snapToCardinal(Math.PI * 0.75) },
].map(sc)

/** A tended farm plot in the west interior. */
export const FARM_SLOT: FarmSlot = sc({ x: 64, z: 54, rotation: 0, w: 5, d: 4 })

export const CITY_WALL_HEIGHT = WALL_H

/** Ground height at a grid coord (1 if off-map / water). */
export function slotGroundY(x: number, z: number): number {
  const tile = tileAt(Math.floor(x), Math.floor(z))
  return tile ? tileTopY(Math.floor(x), Math.floor(z)) : 1
}

/** True if a grid tile lies within the castle wall perimeter. */
export function isInsideCastle(x: number, z: number): boolean {
  return x >= CASTLE_BOUNDS.minX && x <= CASTLE_BOUNDS.maxX && z >= CASTLE_BOUNDS.minZ && z <= CASTLE_BOUNDS.maxZ
}
