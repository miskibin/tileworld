import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import { isRoadTile } from './roads'
import { isMountainRampTile, fromBase } from './tileMap'

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

// Beacons for the frontier gradient: each flat biome's signature landmark is
// pushed OUT toward its far edge (away from the castle centre 72,54) so it reads
// as a "treasure lives out here" marker for the rim's best loot. The two MOUNTAIN
// landmarks (snow spire / rock stones) stay put — a mountain's far side is cliff
// face (only one climbable ramp), so a far-edge spire would strand on a cliff.
// Pushes are kept inside each region's flat interior (clear of the coast).
// Authored in BASE coords; converted to the enlarged map via fromBase so each
// monument tracks its (bigger, farther) biome. World.tsx reads LANDMARKS for the
// render positions, so both placement and reservation stay in sync.
const BASE_LANDMARKS: readonly LandmarkSlot[] = [
  { x: 26, z: 24, r: 2 }, // FrozenSpire — snow massif summit (mountain: unmoved)
  { x: 122, z: 22, r: 3 }, // SunkenPyramid — desert far NE edge
  { x: 118, z: 82, r: 2 }, // StandingStones — SE rock frontier (mountain-side: unmoved)
  { x: 72, z: 100, r: 1 }, // GiantDeadTree — swamp far S edge
  { x: 22, z: 88, r: 2 }, // RuinedShrine — forest far SW edge
] as const
export const LANDMARKS: readonly LandmarkSlot[] = BASE_LANDMARKS.map((l) => {
  const [x, z] = fromBase(l.x, l.z)
  return { x: Math.round(x), z: Math.round(z), r: l.r }
})

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
