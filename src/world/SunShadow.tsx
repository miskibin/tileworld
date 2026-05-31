import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer } from './playerStore'
import { isFrozen } from './pauseStore'

/**
 * The sun: a shadow-casting directional light whose shadow frustum FOLLOWS the
 * player instead of statically covering the whole 96×72 map.
 *
 * Why this exists (perf): a fixed ±60 shadow camera renders every shadow-caster
 * on the island into the depth map every frame — ~800 of the ~1100 draw calls
 * measured at spawn were the shadow pass. Two cheap, visually-lossless wins:
 *
 *  1. Follow + tighten the shadow frustum to the area the player can actually
 *     see (the FogExp2 hides everything past ~40 units anyway). Off-screen,
 *     fogged casters stop being drawn into the shadow map.
 *  2. Render the shadow map ON DEMAND (`autoUpdate = false`) — the world is
 *     almost entirely static (terrain, trees, buildings never move), so we only
 *     re-render shadows when the player has moved far enough to shift the
 *     frustum, plus a small rolling refresh so animated casters (mobs) still
 *     update. This takes the shadow pass off the per-frame hot path.
 *
 * Texel snapping: when a shadow camera moves continuously, shadow edges
 * "swim"/shimmer because the depth map re-rasterises at sub-texel offsets.
 * Snapping the frustum centre to whole shadow-map texels removes the shimmer,
 * so the moving shadow camera looks as stable as the old static one.
 */

// Sun direction (matches World.tsx SUN_DIR). The light sits this far up-sun
// from its target; far/near bracket the target so the whole view depth fits.
const SUN_OFFSET = new THREE.Vector3(92, 36, 60).normalize().multiplyScalar(120)

// Half-extent of the shadow frustum in world units. At the map centre (spawn)
// this still reaches the island edges, so spawn shadows are unchanged; it only
// trims casters once the player walks toward a corner. 48 also gives a slightly
// crisper map than the old ±60 (more texels per unit) at the same 2048 size.
const SHADOW_HALF = 48

// Re-aim/re-render the shadow map only after the player drifts this far from
// where it was last centred (world units). Keeps the frustum locked — and the
// shadow pass skipped — while standing still or making small moves.
const RECENTER_DIST = 6
const RECENTER_DIST_SQ = RECENTER_DIST * RECENTER_DIST

// Even when not recentering, refresh every Nth frame so animated casters (orks,
// bears, the knight) get fresh shadows. 3 ≈ 20fps shadow updates at 60fps —
// imperceptible for soft shadows, ~⅓ the shadow-pass cost of every-frame.
const ANIM_REFRESH_INTERVAL = 3

interface Props {
  intensity: number
}

export function SunShadow({ intensity }: Props) {
  const gl = useThree((s) => s.gl)
  const lightRef = useRef<THREE.DirectionalLight>(null!)
  // Stable shadow target — memoised (not a ref) so it can be referenced in JSX
  // below without tripping the "no ref access during render" rule.
  const target = useMemo(() => new THREE.Object3D(), [])
  const lastCenter = useRef(new THREE.Vector3(Infinity, 0, Infinity))
  const frame = useRef(0)

  // Take manual control of the shadow map: we decide when it re-renders.
  // (renderer.shadowMap.needsUpdate = true queues exactly one re-render.)
  useEffect(() => {
    const prev = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true // initial render
    return () => {
      gl.shadowMap.autoUpdate = prev
    }
  }, [gl])

  // World units covered by one shadow-map texel — the snap grid for the frustum
  // centre. 2048 = shadow map size; SHADOW_HALF*2 = frustum width.
  const texelSize = useMemo(() => (SHADOW_HALF * 2) / 2048, [])

  useFrame(() => {
    // Hold shadows still behind any pause/modal — the scene is frozen anyway.
    if (isFrozen()) return
    frame.current++

    const p = getPlayer()
    // The light lives inside World's grid-offset group, so player grid coords
    // (p.x, p.z) are the right frame for both the light and its target.
    const px = p.x
    const pz = p.z

    const movedSq =
      (px - lastCenter.current.x) ** 2 + (pz - lastCenter.current.z) ** 2
    const recenter = movedSq > RECENTER_DIST_SQ

    if (recenter) {
      // Snap the follow centre to the texel grid so shadow edges don't swim as
      // the frustum slides with the player.
      const snappedX = Math.round(px / texelSize) * texelSize
      const snappedZ = Math.round(pz / texelSize) * texelSize
      target.position.set(snappedX, 0, snappedZ)
      target.updateMatrixWorld()
      const light = lightRef.current
      light.position.set(
        snappedX + SUN_OFFSET.x,
        SUN_OFFSET.y,
        snappedZ + SUN_OFFSET.z,
      )
      light.updateMatrixWorld()
      lastCenter.current.set(px, 0, pz)
      gl.shadowMap.needsUpdate = true
    } else if (frame.current % ANIM_REFRESH_INTERVAL === 0) {
      // Standing still / small moves: still refresh occasionally so moving
      // casters (mobs) get updated shadows, without redrawing every frame.
      gl.shadowMap.needsUpdate = true
    }
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        position={[SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z]}
        target={target}
        intensity={intensity}
        color="#ffe6b3"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={0.5}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
    </>
  )
}
