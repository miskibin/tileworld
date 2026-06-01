import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// Swamp ambush predator. Long, low-slung quadruped built from boxes.
// Palette: dark olive hide, pale belly, ivory teeth, amber eyes.

const HIDE    = '#3f5a36'
const DARK    = '#2a3d22'
const BELLY   = '#8a9a5a'
const TEETH   = '#e8e4d0'
const EYE_C   = '#d8b020'

const TEETH_MAT = new THREE.MeshStandardMaterial({ color: TEETH, roughness: 0.5 })
const EYE_MAT   = new THREE.MeshStandardMaterial({ color: EYE_C,  roughness: 0.4 })

const HP_BAR_BG  = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

export function BogCrocView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.bog_croc
  const hide    = useMemo(() => new THREE.MeshStandardMaterial({ color: HIDE,  roughness: 1, flatShading: true }), [])
  const dark    = useMemo(() => new THREE.MeshStandardMaterial({ color: DARK,  roughness: 1, flatShading: true }), [])
  const bellyMat= useMemo(() => new THREE.MeshStandardMaterial({ color: BELLY, roughness: 0.9, flatShading: true }), [])
  const hpFg    = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])

  const g       = useRef<THREE.Group>(null!)
  const head    = useRef<THREE.Group>(null!)
  const body    = useRef<THREE.Group>(null!)
  const lf      = useRef<THREE.Group>(null!)
  const rf      = useRef<THREE.Group>(null!)
  const lb      = useRef<THREE.Group>(null!)
  const rb      = useRef<THREE.Group>(null!)
  const tail    = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const bar     = useRef<THREE.Group>(null!)
  const [visible, setVisible] = useState(true)
  const deadFrom = useRef<number | null>(null)

  useFrame(({ clock }, dtFrame) => {
    if (isFrozen()) return
    const tNow = clock.getElapsedTime()
    const t = tNow + state.seed
    const dt = Math.min(0.05, dtFrame)
    const grp = g.current
    if (!grp) return

    if (state.hp > 0 && isCulled(state.x, state.z)) {
      if (grp.visible) grp.visible = false
      return
    } else if (!grp.visible) grp.visible = true

    if (state.hp <= 0) {
      if (deadFrom.current === null) deadFrom.current = tNow
      const e = tNow - deadFrom.current
      grp.position.set(state.x, state.y - Math.min(0.4, e * 0.3), state.z)
      grp.rotation.z = Math.min(Math.PI / 2, e * 2.2)
      if (e > 1.4 && visible) setVisible(false)
      if (bar.current) bar.current.visible = false
      return
    }

    const stp = stepAnimalAI(state, dt, tNow)

    grp.position.set(state.x, state.y, state.z)
    grp.rotation.set(0, state.facing, 0)

    const gait  = stp.moving ? 8 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.5 : Math.sin(t * 0.8) * 0.04
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) * 0.9 : 0
    // Croc legs splay — opposite-side pairs move together (reptile gait)
    if (lf.current) lf.current.rotation.x = stp.attacking ? -lunge : swing
    if (rf.current) rf.current.rotation.x = stp.attacking ? -lunge : -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x = swing
    if (body.current) body.current.rotation.x = lunge * 0.15
    if (head.current) {
      head.current.rotation.x = stp.attacking ? lunge * 0.6 : Math.sin(t * 0.5) * 0.06
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.4 + state.seed) * 0.2
    }
    // Tail sways side to side — wider sweep when moving
    if (tail.current) tail.current.rotation.y = Math.sin(t * (stp.moving ? 7 : 2)) * 0.45
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.02

    const hurting = tNow < state.hurtFlashUntil
    hide.color.set(hurting ? '#c98850' : HIDE)

    if (bar.current) {
      const show = state.hp < state.maxHp
      bar.current.visible = show
      if (show && hpFgRef.current) {
        const r = Math.max(0, state.hp / state.maxHp)
        hpFgRef.current.scale.x = HP_W * r
        hpFgRef.current.position.x = -((1 - r) * HP_W) / 2
        hpFg.color.set(hurting ? '#ffaa20' : '#d63a3a')
      }
    }
  })

  if (!visible) return null

  return (
    <group ref={g} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={cfg.scale}>
      {/* Torso — long, flat body; belly flush to y=0 */}
      <group ref={body} position={[0, 0, 0]}>
        {/* Main body box: 0.5 wide × 0.3 tall × 1.6 long; center at y=0.15 so belly=0 */}
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow material={hide}>
          <boxGeometry args={[0.5, 0.3, 1.6]} />
        </mesh>
        {/* Belly underplate — thin, lighter coloured */}
        <mesh position={[0, 0.02, 0]} castShadow receiveShadow material={bellyMat}>
          <boxGeometry args={[0.38, 0.05, 1.4]} />
        </mesh>
        {/* Shoulder hump — slightly raised torso front */}
        <mesh position={[0, 0.32, 0.45]} castShadow material={dark}>
          <boxGeometry args={[0.44, 0.12, 0.5]} />
        </mesh>

        {/* Back ridge cones — static, run along spine */}
        {/* z offsets spread from rear shoulder to hip, y from top of body */}
        {[0.55, 0.28, 0.0, -0.28, -0.55].map((rz, i) => (
          <mesh key={i} position={[0, 0.33, rz]} rotation={[0, i % 2 === 0 ? 0 : Math.PI, 0]} castShadow material={dark}>
            <coneGeometry args={[0.055, 0.13, 4]} />
          </mesh>
        ))}

        {/* Head group — pivots for jaw open animation */}
        <group ref={head} position={[0, 0.22, 0.88]}>
          {/* Skull box */}
          <mesh castShadow material={hide}>
            <boxGeometry args={[0.3, 0.16, 0.28]} />
          </mesh>
          {/* Upper jaw — broad, flat snout extending forward */}
          <mesh position={[0, -0.02, 0.26]} castShadow material={hide}>
            <boxGeometry args={[0.28, 0.1, 0.28]} />
          </mesh>
          {/* Lower jaw — slightly narrower, sits below upper */}
          <mesh position={[0, -0.1, 0.22]} castShadow material={dark}>
            <boxGeometry args={[0.24, 0.07, 0.24]} />
          </mesh>
          {/* Teeth row — upper */}
          <mesh position={[0, -0.06, 0.36]} material={TEETH_MAT}>
            <boxGeometry args={[0.22, 0.05, 0.04]} />
          </mesh>
          {/* Eyes — raised boxes on top of skull, amber */}
          <mesh position={[-0.1, 0.1, 0.06]} material={EYE_MAT}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
          </mesh>
          <mesh position={[0.1, 0.1, 0.06]} material={EYE_MAT}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
          </mesh>
          {/* Nostril bumps */}
          <mesh position={[-0.07, 0.06, 0.38]} material={dark}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
          </mesh>
          <mesh position={[0.07, 0.06, 0.38]} material={dark}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
          </mesh>
        </group>
      </group>

      {/* Legs — short, splayed wide (hip pivots at body sides, low) */}
      {/* Left front — pivot at left shoulder */}
      <group ref={lf} position={[-0.28, 0.18, 0.45]}>
        <mesh position={[-0.12, -0.1, 0]} castShadow material={dark}>
          <boxGeometry args={[0.25, 0.14, 0.14]} />
        </mesh>
        {/* Lower leg */}
        <mesh position={[-0.22, -0.18, 0]} castShadow material={dark}>
          <boxGeometry args={[0.12, 0.14, 0.12]} />
        </mesh>
      </group>
      {/* Right front */}
      <group ref={rf} position={[0.28, 0.18, 0.45]}>
        <mesh position={[0.12, -0.1, 0]} castShadow material={dark}>
          <boxGeometry args={[0.25, 0.14, 0.14]} />
        </mesh>
        <mesh position={[0.22, -0.18, 0]} castShadow material={dark}>
          <boxGeometry args={[0.12, 0.14, 0.12]} />
        </mesh>
      </group>
      {/* Left rear */}
      <group ref={lb} position={[-0.28, 0.18, -0.45]}>
        <mesh position={[-0.12, -0.1, 0]} castShadow material={dark}>
          <boxGeometry args={[0.25, 0.14, 0.14]} />
        </mesh>
        <mesh position={[-0.22, -0.18, 0]} castShadow material={dark}>
          <boxGeometry args={[0.12, 0.14, 0.12]} />
        </mesh>
      </group>
      {/* Right rear */}
      <group ref={rb} position={[0.28, 0.18, -0.45]}>
        <mesh position={[0.12, -0.1, 0]} castShadow material={dark}>
          <boxGeometry args={[0.25, 0.14, 0.14]} />
        </mesh>
        <mesh position={[0.22, -0.18, 0]} castShadow material={dark}>
          <boxGeometry args={[0.12, 0.14, 0.12]} />
        </mesh>
      </group>

      {/* Tail — 3 overlapping tapering boxes swaying from base */}
      <group ref={tail} position={[0, 0.15, -0.82]}>
        {/* Tail segment 1 — widest, close to body */}
        <mesh position={[0, 0, -0.22]} castShadow material={hide}>
          <boxGeometry args={[0.3, 0.22, 0.44]} />
        </mesh>
        {/* Tail segment 2 — mid, angled slightly down */}
        <mesh position={[0, -0.04, -0.56]} castShadow material={dark}>
          <boxGeometry args={[0.22, 0.16, 0.44]} />
        </mesh>
        {/* Tail tip — narrow */}
        <mesh position={[0, -0.09, -0.88]} castShadow material={dark}>
          <boxGeometry args={[0.12, 0.1, 0.38]} />
        </mesh>
      </group>

      {/* HP bar — lowered to y=0.8 since croc is ground-hugging */}
      <group ref={bar} position={[0, 0.8, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
