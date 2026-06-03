import { useCallback, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
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

  // A tiny offscreen target + a high, wide top-down camera that frames the whole
  // map. We RENDER through these (not just compile()) because gl.compile cannot
  // reproduce three's render-time program selection — the envMap / shadow-receive
  // variants of culled content compile lazily on first real draw otherwise, and
  // three then BLOCKS in getUniforms()→getProgramParameter waiting for the link
  // (the multi-second freeze in the trace). A real render forces every one of
  // those programs to link + fetch its uniforms NOW, at load, behind the start
  // screen. 16×16 so it's pixel-cheap; shader compilation is resolution-free.
  const warm = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(90, 1, 0.5, 1200)
    cam.position.set(0, 400, 80) // world space: the map is centred on the origin
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    return { cam, target: new THREE.WebGLRenderTarget(16, 16) }
  }, [])
  useEffect(() => () => warm.target.dispose(), [warm])

  const runFull = useCallback(() => {
    // compile() covers the base material programs (it walks traverse(), so culled
    // structures are included). The offscreen full-map render then forces the
    // render-time variants (envMap / shadow-receive) to fully link + fetch
    // uniforms, which is the part that otherwise stalls mid-exploration.
    gl.compile(scene, camera)
    const hidden: THREE.Object3D[] = []
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    const prevTarget = gl.getRenderTarget()
    gl.setRenderTarget(warm.target)
    gl.render(scene, warm.cam)
    gl.setRenderTarget(prevTarget)
    for (const o of hidden) o.visible = false
  }, [gl, scene, camera, warm])

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
