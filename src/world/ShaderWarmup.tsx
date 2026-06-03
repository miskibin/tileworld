import { useCallback, useEffect, useRef, useState } from 'react'
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

  // The comprehensive precompile — runs ONCE, covering everything currently in
  // the scene (warm-up orks/grave above, PLUS all the entities the world creates
  // lazily at load via requestAnimationFrame+setState: wild animals incl. the
  // biome creatures spread across the map, bears, villagers, and the Cullable
  // structures). Those are exactly the shaders that otherwise compile the first
  // time you explore into their area — a synchronous link wait
  // (getProgramParameter) that stalls the main thread for whole seconds.
  // compileAsync links them in the background (KHR_parallel_shader_compile) with
  // no blocking; sync compile() is the fallback (one hidden hitch behind the
  // start screen). compile()/compileAsync walk the scene with traverse(), so the
  // invisible (culled / visible:false) structures are warmed too.
  const didFull = useRef(false)
  const runFull = useCallback(() => {
    if (didFull.current) return
    didFull.current = true
    const r = gl as unknown as {
      compileAsync?: (s: typeof scene, c: typeof camera) => Promise<unknown>
    }
    if (typeof r.compileAsync === 'function') r.compileAsync(scene, camera).catch(() => {})
    else gl.compile(scene, camera)
  }, [gl, scene, camera])

  useEffect(() => {
    // Fire after the lazily-mounted content (and the HDRI environment) has
    // settled, while the player is still on the start screen; or the instant
    // they press Play, whichever comes first.
    const t = setTimeout(runFull, 1200)
    const unsub = subscribePhase((p) => {
      if (p !== 'menu') {
        runFull()
        setActive(false)
      }
    })
    return () => {
      clearTimeout(t)
      unsub()
    }
  }, [runFull])

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
