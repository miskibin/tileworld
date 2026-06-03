import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import { isRoadTile } from './roads'
import { isMountainRampTile } from './tileMap'

// Shared anchors for the five biome "signature landmarks" — FrozenSpire (snow),
// SunkenPyramid (desert), StandingStones (rock frontier), GiantDeadTree (swamp),
// RuinedShrine (forest). One source of truth so World.tsx (placement),
// obstacles.ts (scatter reservation) and the collision blockers below can never
// drift apart. Coordinates are grid tiles, matching the <Cullable>/landmark
// positions in World.tsx.

export interface LandmarkSlot {
  x: number
  z: number
  /** half-extent in tiles: footprint reserved from scatter + solid collision box */
  r: number
}

export const LANDMARKS: readonly LandmarkSlot[] = [
  { x: 26, z: 24, r: 2 }, // FrozenSpire — snow massif
  { x: 112, z: 28, r: 3 }, // SunkenPyramid — desert (broad base)
  { x: 118, z: 82, r: 2 }, // StandingStones — SE rock frontier
  { x: 72, z: 92, r: 1 }, // GiantDeadTree — swamp (slim trunk)
  { x: 32, z: 80, r: 2 }, // RuinedShrine — SW forest
] as const

const OWNER = 'landmarks'

/** True if any tile in the landmark's footprint is a road or the climbable
 *  mountain ramp — a blocker there could wall off a critical corridor, so we
 *  skip collision for that landmark (scatter is still reserved separately). */
function footprintHitsCorridor(l: LandmarkSlot): boolean {
  for (let z = l.z - l.r; z <= l.z + l.r; z++) {
    for (let x = l.x - l.r; x <= l.x + l.r; x++) {
      if (isRoadTile(x, z) || isMountainRampTile(x, z)) return true
    }
  }
  return false
}

/** Register a solid collision box for each landmark so the hero and orks route
 *  around the monument instead of clipping through it. Call once on mount; the
 *  returned fn clears them (scoped owner) on unmount. */
export function registerLandmarkBlockers(): () => void {
  for (const l of LANDMARKS) {
    if (footprintHitsCorridor(l)) continue
    registerHouseBlocker({ minX: l.x - l.r, minZ: l.z - l.r, maxX: l.x + l.r, maxZ: l.z + l.r }, OWNER)
  }
  return () => resetHouseBlockers(OWNER)
}
