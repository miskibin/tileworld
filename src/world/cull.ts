import type { Object3D } from 'three'
import { getPlayer } from './playerStore'
import { isWarming } from './warmupStore'

// Distance culling for creatures/props. The camera-centric FogExp2 already
// hides anything beyond ~40 units, so there's no point running AI + animation
// for entities far past that. Far creatures hide their meshes and skip their
// per-frame work, which keeps a larger, denser map cheap.

/**
 * Show/hide an entity's group for distance culling, and — critically — FREEZE
 * its matrix while hidden. three's per-frame `updateMatrixWorld`/`compose` (the
 * top scene-graph cost in the profile) does NOT honour `visible`, so a hidden
 * far creature otherwise keeps re-composing its matrix every frame. Setting
 * `matrixWorldAutoUpdate = false` makes the renderer skip its subtree entirely;
 * showing it again re-enables and refreshes. Only does work on the in↔out edge.
 */
export function cullVisible(obj: Object3D, culled: boolean): void {
  const show = !culled
  if (obj.visible === show) return
  obj.visible = show
  obj.matrixWorldAutoUpdate = show
  if (show) obj.updateMatrixWorld(true)
}

/** Beyond this many tiles from the player, an entity is fog-hidden anyway. */
export const CULL_DIST = 46
const CULL_DIST_SQ = CULL_DIST * CULL_DIST

/** True if (x, z) is far enough from the player to skip updating/rendering. */
export function isCulled(x: number, z: number): boolean {
  if (isWarming()) return false // keep everything visible during the at-load warm-up
  const p = getPlayer()
  const dx = x - p.x
  const dz = z - p.z
  return dx * dx + dz * dz > CULL_DIST_SQ
}
