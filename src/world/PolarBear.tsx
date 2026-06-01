import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// Hulking snow predator. Quadruped built from boxes — bulkier proportions than
// Wolf: wide torso, thick legs, round head with stubby snout, small ears,
// short stub tail. AI runs the predator branch (same as Wolf).

const BODY_C = '#eef2f6'   // off-white pelt
const SHADOW_C = '#c4ccd6' // shaded/underside fur
const SNOUT_C = '#b0b8c2'  // muzzle
const NOSE_C = '#141414'   // nose pad
const EYE_C = '#2a2a2a'    // eyes

const NOSE_MAT = new THREE.MeshStandardMaterial({ color: NOSE_C, roughness: 0.5 })
const EYE_MAT = new THREE.MeshStandardMaterial({ color: EYE_C, roughness: 0.4 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

export function PolarBearView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.polar_bear
  const fur = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BODY_C, roughness: 1, flatShading: true }),
    [],
  )
  const furDark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SHADOW_C, roughness: 1, flatShading: true }),
    [],
  )
  const snoutMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SNOUT_C, roughness: 0.9 }),
    [],
  )
  const hpFg = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }),
    [],
  )

  const g = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const lf = useRef<THREE.Group>(null!)
  const rf = useRef<THREE.Group>(null!)
  const lb = useRef<THREE.Group>(null!)
  const rb = useRef<THREE.Group>(null!)
  const tail = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const bar = useRef<THREE.Group>(null!)
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

    const gait = stp.moving ? 12 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.6 : Math.sin(t * 0.8) * 0.04
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) * 0.9 : 0
    if (lf.current) lf.current.rotation.x = stp.attacking ? -lunge : swing
    if (rf.current) rf.current.rotation.x = stp.attacking ? -lunge : -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x = swing
    if (body.current) body.current.rotation.x = lunge * 0.18
    if (head.current) {
      head.current.rotation.x = stp.attacking ? lunge * 0.5 : Math.sin(t * 0.5) * 0.08
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.4 + state.seed) * 0.25
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * (stp.moving ? 10 : 3)) * 0.4
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.04

    const hurting = tNow < state.hurtFlashUntil
    fur.color.set(hurting ? '#c0d0e0' : BODY_C)

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
      {/* Torso — wider & deeper than a wolf */}
      <group ref={body} position={[0, 0, 0]}>
        {/* Main barrel */}
        <mesh position={[0, 0.68, 0]} castShadow material={fur}>
          <boxGeometry args={[0.62, 0.58, 1.3]} />
        </mesh>
        {/* Shoulder hump */}
        <mesh position={[0, 0.82, 0.38]} castShadow material={fur}>
          <boxGeometry args={[0.58, 0.46, 0.56]} />
        </mesh>

        {/* Head group — broad, round */}
        <group ref={head} position={[0, 0.92, 0.72]}>
          {/* Skull */}
          <mesh castShadow material={fur}>
            <boxGeometry args={[0.42, 0.4, 0.42]} />
          </mesh>
          {/* Snout — short and broad */}
          <mesh position={[0, -0.07, 0.26]} castShadow material={snoutMat}>
            <boxGeometry args={[0.22, 0.18, 0.24]} />
          </mesh>
          {/* Nose pad */}
          <mesh position={[0, -0.05, 0.39]} material={NOSE_MAT}>
            <boxGeometry args={[0.1, 0.07, 0.05]} />
          </mesh>
          {/* Ears — small rounded cones */}
          <mesh position={[-0.16, 0.24, -0.06]} rotation={[0, 0, -0.08]} material={furDark}>
            <coneGeometry args={[0.09, 0.14, 5]} />
          </mesh>
          <mesh position={[0.16, 0.24, -0.06]} rotation={[0, 0, 0.08]} material={furDark}>
            <coneGeometry args={[0.09, 0.14, 5]} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.12, 0.04, 0.21]} material={EYE_MAT}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
          </mesh>
          <mesh position={[0.12, 0.04, 0.21]} material={EYE_MAT}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
          </mesh>
        </group>
      </group>

      {/* Legs — thick, hip-pivot groups (same pivot scheme as Wolf).
          Hip y=0.55, leg mesh at [0,-0.275,0] with height 0.55
          → foot bottom = 0.55 - 0.275 - 0.275 = 0.0  (touches ground) */}
      <group ref={lf} position={[-0.22, 0.55, 0.38]}>
        <mesh position={[0, -0.275, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.18, 0.55, 0.2]} />
        </mesh>
      </group>
      <group ref={rf} position={[0.22, 0.55, 0.38]}>
        <mesh position={[0, -0.275, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.18, 0.55, 0.2]} />
        </mesh>
      </group>
      <group ref={lb} position={[-0.22, 0.55, -0.38]}>
        <mesh position={[0, -0.275, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.18, 0.55, 0.2]} />
        </mesh>
      </group>
      <group ref={rb} position={[0.22, 0.55, -0.38]}>
        <mesh position={[0, -0.275, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.18, 0.55, 0.2]} />
        </mesh>
      </group>

      {/* Tail — short stub, kept as named ref so animation code is safe */}
      <group ref={tail} position={[0, 0.68, -0.66]}>
        <mesh position={[0, 0, -0.08]} castShadow material={furDark}>
          <boxGeometry args={[0.12, 0.12, 0.18]} />
        </mesh>
      </group>

      {/* HP bar */}
      <group ref={bar} position={[0, 1.6, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
