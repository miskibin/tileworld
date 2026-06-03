import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrkView } from './Ork'
import { Grave } from './Grave'
import { subscribePhase } from './gameStore'
import { setWarming } from './warmupStore'
import type { OrkState } from './orkStore'
import type { OrkVariant } from './orkConfig'

// Compiles EVERY shader program gameplay will use, at load, behind the StartScreen
// — so travelling into a new area never compiles a program mid-frame (the
// multi-second "stutter at the edges" a real-GPU profile pinned to shader
// linking). Earlier attempts (gl.compile, offscreen renders) compiled
// APPROXIMATIONS of the programs: the real ones depend on the exact render path
// (the post EffectComposer's HDR target vs the canvas, tone-mapping, the shadow
// pass), so they recompiled on first real draw. The only reliable warm-up is to
// let the REAL render loop draw the whole map: for a handful of frames we suspend
// the culls (warmupStore → everything visible), suspend MouseLookCamera, point
// the game camera straight down over the whole island, and widen the sun's shadow
// frustum to cover every caster. The loop (composer included) then renders it all
// and links the genuine programs. Also mounts one dead ork per variant + a grave
// so their programs warm too. Torn down the moment Play is pressed.

const VARIANTS: OrkVariant[] = ['grunt', 'scout', 'berserker', 'shaman']
const WARM_X = 72
const WARM_Z = 58
// Frames to keep rendering the whole map. The first frame links almost every
// program (it blocks while they compile, behind the start screen); the rest are
// cache hits that catch anything deferred.
const WARM_FRAMES = 8

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
    kbVX: 0,
    kbVZ: 0,
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

interface ShadowSave {
  cam: THREE.OrthographicCamera
  l: number
  r: number
  t: number
  b: number
  f: number
}

export function ShaderWarmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const [active, setActive] = useState(true)
  const groupRef = useRef<THREE.Group>(null!)
  const st = useRef({ started: false, done: false, frame: 0, wait: 0, fov: 0, shadow: null as ShadowSave | null })

  const finish = useCallback(() => {
    if (st.current.done) return
    st.current.done = true
    if (st.current.fov) {
      camera.fov = st.current.fov
      camera.updateProjectionMatrix()
    }
    const sh = st.current.shadow
    if (sh) {
      sh.cam.left = sh.l
      sh.cam.right = sh.r
      sh.cam.top = sh.t
      sh.cam.bottom = sh.b
      sh.cam.far = sh.f
      sh.cam.updateProjectionMatrix()
      gl.shadowMap.needsUpdate = true // re-render the real (tight) shadow next frame
    }
    setWarming(false) // MouseLookCamera + culls resume
    setActive(false)
  }, [camera, gl])

  useEffect(() => {
    setWarming(true)
    // Bail (and restore) if the player hits Play before the warm-up finishes.
    const unsub = subscribePhase((p) => p !== 'menu' && finish())
    return () => {
      setWarming(false)
      unsub()
    }
  }, [finish])

  useFrame(() => {
    const s = st.current
    if (s.done) return

    if (!s.started) {
      // Wait for the async HDRI to land so the envMap program variants warm too
      // (fallback after ~3s so a failed/slow env never deadlocks the warm-up).
      if (!scene.environment && ++s.wait < 180) return
      s.started = true
      s.fov = camera.fov
      // gl.compile covers every material's base program (walks traverse()).
      gl.compile(scene, camera)
      // Widen the sun's shadow frustum to the whole map so the warm-up's shadow
      // pass links every caster's depth program (otherwise they compile as new
      // casters enter the player-following frustum mid-travel).
      let light: THREE.DirectionalLight | null = null
      scene.traverse((o) => {
        if ((o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) light = o as THREE.DirectionalLight
      })
      if (light) {
        const c = (light as THREE.DirectionalLight).shadow.camera
        s.shadow = { cam: c, l: c.left, r: c.right, t: c.top, b: c.bottom, f: c.far }
        c.left = -135
        c.right = 135
        c.top = 135
        c.bottom = -135
        c.far = 800
        c.updateProjectionMatrix()
      }
    }

    s.frame++
    if (s.frame > WARM_FRAMES) {
      finish()
      return
    }

    // Point the game camera straight down over the whole island and let the real
    // loop (post composer in High, direct in Low) render through it. Cull +
    // MouseLookCamera are suspended (warmupStore), so the whole map is in view.
    camera.position.set(0, 440, 150) // world space; map is centred on the origin
    camera.lookAt(0, 0, 0)
    camera.fov = 104
    camera.aspect = size.width / Math.max(1, size.height)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    gl.shadowMap.needsUpdate = true // link the (wide) depth programs this frame
    if (groupRef.current) groupRef.current.visible = true
  })

  if (!active) return null
  return (
    <group ref={groupRef}>
      {VARIANTS.map((v, i) => (
        <OrkView key={v} state={warmOrk(-100 - i, v)} />
      ))}
      <Grave position={[WARM_X, 1, WARM_Z]} rotation={0} lean={0} />
    </group>
  )
}
