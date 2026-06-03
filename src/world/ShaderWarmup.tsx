import { useCallback, useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { OrkView } from './Ork'
import { Grave } from './Grave'
import { subscribePhase } from './gameStore'
import type { OrkState } from './orkStore'
import type { OrkVariant } from './orkConfig'

// Pre-compiles the shaders of dynamic content that otherwise compiles lazily the
// first time one spawns — which hitches the frame mid-combat (the perf trace
// showed +13 shader programs the instant the first grave appeared, a visible fps
// dip). We mount one of each ork variant plus a grave during the StartScreen so
// their programs are already in three's cache before the real ones spawn.
//
// Safety: the warm-up orks are spawned ALREADY DEAD (hp 0), so OrkView takes its
// death-fade branch — it renders the mesh once (compiling the program) then fades
// out, and returns before any target-acquisition/attack code runs. They're not in
// the ork roster, so nothing targets them and reapOrk() is a no-op on their fake
// ids. gl.compile() additionally warms them frustum-independently. The whole rig
// is torn down the moment the game leaves the menu.

const VARIANTS: OrkVariant[] = ['grunt', 'scout', 'berserker', 'shaman']
// At the castle/player spawn — inside the camera view at menu, hidden behind the
// opaque StartScreen DOM.
const WARM_X = 72
const WARM_Z = 58

function warmOrk(id: number, variant: OrkVariant): OrkState {
  return {
    id,
    x: WARM_X,
    y: 1,
    z: WARM_Z,
    facing: 0,
    hp: 0, // dead → render-then-fade, no AI/combat
    maxHp: 1,
    hurtFlashUntil: 0,
    variant,
    faction: 'red',
    home: null,
    seed: id,
    collisionRadius: 0.4,
    attackingSince: 0,
    attackReadyAt: 0,
    attackHitDealt: false,
    healReadyAt: 0,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
  }
}

export function ShaderWarmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const [active, setActive] = useState(true)

  // The comprehensive precompile. A WebGL shader trace showed this MUST be
  // synchronous compile(), not compileAsync(): compileAsync ran too early and
  // skipped the shadow-map (USE_SHADOWMAP / DEPTH_PACKING), envMap, post and
  // <Text> program variants, which then compiled lazily during play — a
  // getProgramParameter link-wait that froze the main thread for seconds every
  // time a new caster entered the player-following shadow frustum. Sync compile()
  // links ALL of them up front (it walks traverse(), so culled/hidden structures
  // are covered too); with checkShaderErrors off the driver finishes linking in
  // the background, so they're ready by the time you explore. Idempotent (cached)
  // so it's safe — and necessary — to call repeatedly as content + the async HDRI
  // environment settle.
  const runFull = useCallback(() => {
    // compile() walks the scene with traverse(), so it compiles EVERY material —
    // visible, culled, or hidden — and (with shadow-casting lights set up) emits
    // their USE_SHADOWMAP variants too. The one variant it can't get up front is
    // the envMap one, because the HDRI environment loads async: a material
    // compiled before scene.environment exists has to recompile once it arrives.
    // That's why this runs late + repeatedly (below) — by the second pass the
    // environment is loaded, so every standard material's envMap program is in
    // the cache before you ever explore.
    gl.compile(scene, camera)
  }, [gl, scene, camera])

  useEffect(() => {
    // Compile across the start-screen dwell so we catch the rAF-spawned animals
    // and the Cullable structures. Plus the instant Play is pressed, in case they
    // skip through fast.
    const t1 = setTimeout(runFull, 1500)
    const t2 = setTimeout(runFull, 3500)
    // And the instant the async HDRI environment lands — its envMap forces a
    // recompile of every standard material, and we must catch that BEFORE the
    // player explores, regardless of how fast/slow the HDRI loaded.
    let envSeen = !!scene.environment
    const iv = setInterval(() => {
      if (!envSeen && scene.environment) {
        envSeen = true
        runFull()
      }
    }, 250)
    const unsub = subscribePhase((p) => {
      if (p !== 'menu') {
        runFull()
        setActive(false)
      }
    })
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearInterval(iv)
      unsub()
    }
  }, [runFull, scene])

  if (!active) return null
  // visible={false}: the normal render loop never draws these (no artifact behind
  // the semi-transparent StartScreen), but gl.compile() warms their materials
  // anyway — three's compile() walks the scene with traverse(), not
  // traverseVisible(), so hidden objects are still compiled.
  return (
    <group visible={false}>
      {VARIANTS.map((v, i) => (
        <OrkView key={v} state={warmOrk(-100 - i, v)} />
      ))}
      <Grave position={[WARM_X, 1, WARM_Z]} rotation={0} lean={0} />
    </group>
  )
}
