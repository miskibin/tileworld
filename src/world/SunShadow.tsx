import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer } from './playerStore'
import { isFrozen } from './pauseStore'
import { getQuality, subscribeQuality } from './qualityStore'
import { DAY_START_T, getDay, makeDaySample, sampleDay, sunDirAt } from './timeStore'

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

// How far up-sun the light sits from its target (far/near bracket the target
// so the whole view depth fits). The DIRECTION now comes from the day/night
// clock (timeStore) each frame instead of a fixed golden-hour constant.
const SUN_DIST = 120
// Initial offset at the frozen start (golden hour) for the first commit.
const START_OFFSET = sunDirAt(DAY_START_T, new THREE.Vector3()).multiplyScalar(
  SUN_DIST,
)

// Half-extent of the shadow frustum in world units. Kept just past the FogExp2
// view distance (~40) so casters the player can't see don't get drawn into the
// depth map — fewer casters per shadow pass, and a crisper map (more texels per
// unit at the same 2048 size). Trades a little shadow pop-in at the far fog edge.
const SHADOW_HALF = 38

// Shadow depth-map resolution. Dropped 2048→1024: the shadow pass over ~760
// casters was a top GPU cost on integrated graphics (draw calls spiked 250→806
// whenever it fired), and 1024 is 4× less raster fill. The frustum is already
// tightened to the fog view distance (SHADOW_HALF), so 1024 texels still give a
// crisp enough map at this range; soft (PCF) filtering hides the rest.
const SHADOW_MAP_SIZE = 1024

// Re-aim/re-render the shadow map only after the player drifts this far from
// where it was last centred (world units). Keeps the frustum locked — and the
// shadow pass skipped — while standing still or making small moves.
const RECENTER_DIST = 9
const RECENTER_DIST_SQ = RECENTER_DIST * RECENTER_DIST

// Even when not recentering, refresh every Nth frame so animated casters (orks,
// bears, the knight) get fresh shadows WHILE MOVING. This directly sets how
// smoothly the player's own shadow tracks them — 6 ≈ 10fps updates reads as
// smooth; pushing it higher to save the shadow-pass spikes made the moving player
// shadow visibly lag, so it stays at 6. (The pass redraws ~850 casters: frame
// jumps 380→1230 draw calls. Cheaper shadows need fewer casters, not a lower
// refresh — a separate change.)
const ANIM_REFRESH_INTERVAL = 6
// Standing still, the player isn't moving so their shadow is static; only distant
// critters move, so the soft shadow can refresh far less often with nobody
// noticing. The moment the player walks we drop back to ANIM_REFRESH_INTERVAL so
// their own shadow tracks smoothly.
const IDLE_REFRESH_INTERVAL = 24

interface Props {
  intensity: number
}

export function SunShadow({ intensity }: Props) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
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

  // Quality tier (G key): 'low' drops the sun shadow entirely — one of the two
  // biggest GPU costs (the shadow pass over ~760 casters). shadowMap.enabled is
  // part of every material's compiled program, so a switch needs a one-time
  // recompile across the live scene; that's fine for a manual, rare keypress.
  useEffect(() => {
    return subscribeQuality((q) => {
      const high = q !== 'low'
      gl.shadowMap.enabled = high
      if (lightRef.current) lightRef.current.castShadow = high
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m) return
        if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true))
        else m.needsUpdate = true
      })
      if (high) gl.shadowMap.needsUpdate = true
    })
  }, [gl, scene])

  // World units covered by one shadow-map texel — the snap grid for the frustum
  // centre. SHADOW_MAP_SIZE = shadow map size; SHADOW_HALF*2 = frustum width.
  const texelSize = useMemo(() => (SHADOW_HALF * 2) / SHADOW_MAP_SIZE, [])

  // Scratch reused each frame (no per-frame allocation).
  const sunDir = useMemo(() => new THREE.Vector3(), [])
  const sample = useMemo(() => makeDaySample(), [])

  useFrame(() => {
    // Direction + colour/intensity come from the day/night clock and are
    // applied EVERY frame (even while paused) so the sun shading is correct
    // behind the start screen and tracks the clock as it runs / is scrubbed.
    const day = getDay()
    sunDirAt(day.t, sunDir)
    sampleDay(day.t, sample)
    const light = lightRef.current
    light.intensity = intensity * sample.sunVis // → 0 once the sun sets
    light.color.copy(sample.sunColor)

    // Shadow map only re-renders when the world is live (held still behind any
    // pause/modal) AND shadows are on (Low quality disables them). The light
    // transform below still updates so shading is right.
    if (!isFrozen() && getQuality() !== 'low') {
      frame.current++
      // Sun below the horizon (night, e.g. during a wave) → the directional
      // light is dark and its shadow is invisible, so don't spend a whole
      // shadow pass re-rendering it. Skipping this is what removes the periodic
      // 300→1300 draw-call spikes during night combat. Dawn re-arms it: the
      // player has usually drifted > RECENTER_DIST, so the recenter below fires.
      if (sample.sunVis > 0.001) {
        const p = getPlayer()
        // The light lives inside World's grid-offset group, so player grid coords
        // (p.x, p.z) are the right frame for both the light and its target.
        const px = p.x
        const pz = p.z
        const movedSq =
          (px - lastCenter.current.x) ** 2 + (pz - lastCenter.current.z) ** 2
        if (movedSq > RECENTER_DIST_SQ) {
          // Snap the follow centre to the texel grid so shadow edges don't swim
          // as the frustum slides with the player.
          const snappedX = Math.round(px / texelSize) * texelSize
          const snappedZ = Math.round(pz / texelSize) * texelSize
          target.position.set(snappedX, 0, snappedZ)
          target.updateMatrixWorld()
          lastCenter.current.set(px, 0, pz)
          gl.shadowMap.needsUpdate = true
        } else {
          // Within the recenter threshold: still refresh occasionally so moving
          // casters (mobs) AND the drifting sun get updated shadows, without
          // redrawing every frame. Cadence adapts to whether the player is
          // moving — full rate while walking (smooth self-shadow), half rate
          // when idle (fewer draw-call spikes while standing/shopping/aiming).
          const interval = p.moving ? ANIM_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL
          if (frame.current % interval === 0) gl.shadowMap.needsUpdate = true
        }
      }
    }

    // Aim the light up-sun from the (current) target every frame.
    light.position.set(
      target.position.x + sunDir.x * SUN_DIST,
      sunDir.y * SUN_DIST,
      target.position.z + sunDir.z * SUN_DIST,
    )
    light.updateMatrixWorld()
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        position={[START_OFFSET.x, START_OFFSET.y, START_OFFSET.z]}
        target={target}
        intensity={intensity}
        color="#ffe6b3"
        castShadow
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
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
