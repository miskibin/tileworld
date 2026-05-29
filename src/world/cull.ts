import { getPlayer } from './playerStore'

// Distance culling for creatures/props. The camera-centric FogExp2 already
// hides anything beyond ~40 units, so there's no point running AI + animation
// for entities far past that. Far creatures hide their meshes and skip their
// per-frame work, which keeps a larger, denser map cheap.

/** Beyond this many tiles from the player, an entity is fog-hidden anyway. */
export const CULL_DIST = 46
const CULL_DIST_SQ = CULL_DIST * CULL_DIST

/** True if (x, z) is far enough from the player to skip updating/rendering. */
export function isCulled(x: number, z: number): boolean {
  const p = getPlayer()
  const dx = x - p.x
  const dz = z - p.z
  return dx * dx + dz * dz > CULL_DIST_SQ
}
