import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// Compact rock-goat. Quadruped built from boxes — same hip-pivot conventions as
// Wolf/Deer. Prey: flees threats, never attacks. Palette: cream wool, horn, hoof.

const WOOL   = '#d8d2c4'
const DARK   = '#b0a894'
const HORN_C = '#8a7a5a'
const HOOF_C = '#2a2018'
const EYE_C  = '#2a2a2a'

const HORN_MAT = new THREE.MeshStandardMaterial({ color: HORN_C, roughness: 0.7 })
const HOOF_MAT = new THREE.MeshStandardMaterial({ color: HOOF_C, roughness: 0.9 })
const EYE_MAT  = new THREE.MeshStandardMaterial({ color: EYE_C,  roughness: 0.5 })

const HP_BAR_BG  = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

// Geometry: torso
const TORSO_W = 0.34
const TORSO_H = 0.36
const TORSO_L = 0.70

// Legs: hip pivot y, leg mesh half-height → bottom = HIP_Y - LEG_HALF*2 ≈ 0
const HIP_Y     = 0.35   // hip pivot height
const LEG_H     = 0.34   // full leg length
const LEG_HALF  = LEG_H / 2
// hoof bottom = HIP_Y - LEG_HALF - LEG_HALF = HIP_Y - LEG_H = 0.35 - 0.34 = 0.01 ✓

export function GoatView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.goat
  const wool = useMemo(
    () => new THREE.MeshStandardMaterial({ color: WOOL, roughness: 1, flatShading: true }), [])
  const woolDark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DARK, roughness: 1, flatShading: true }), [])
  const hpFg = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])

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

    const gait  = stp.moving ? 12 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.6 : Math.sin(t * 0.8) * 0.04
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) * 0.9 : 0
    if (lf.current) lf.current.rotation.x = stp.attacking ? -lunge :  swing
    if (rf.current) rf.current.rotation.x = stp.attacking ? -lunge : -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x =  swing
    if (body.current) body.current.rotation.x = lunge * 0.18
    if (head.current) {
      head.current.rotation.x = stp.attacking
        ? lunge * 0.5
        : Math.sin(t * 0.5) * 0.08
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.4 + state.seed) * 0.25
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * (stp.moving ? 10 : 3)) * 0.4
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.04

    const hurting = tNow < state.hurtFlashUntil
    wool.color.set(hurting ? '#c8b880' : WOOL)

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

  // Torso center y: HIP_Y + LEG_HALF + small gap to clear legs + TORSO_H/2
  // = 0.35 + (hooves clear) + TORSO_H/2  → place torso at y = HIP_Y + TORSO_H/2
  const TORSO_Y = HIP_Y + TORSO_H / 2  // 0.35 + 0.18 = 0.53

  return (
    <group ref={g} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={cfg.scale}>
      {/* Torso + head */}
      <group ref={body} position={[0, 0, 0]}>
        {/* Main torso box */}
        <mesh position={[0, TORSO_Y, 0]} castShadow material={wool}>
          <boxGeometry args={[TORSO_W, TORSO_H, TORSO_L]} />
        </mesh>
        {/* Head group — forward from torso */}
        <group ref={head} position={[0, TORSO_Y + 0.10, TORSO_L * 0.5 + 0.05]}>
          {/* Skull */}
          <mesh castShadow material={wool}>
            <boxGeometry args={[0.22, 0.22, 0.26]} />
          </mesh>
          {/* Muzzle */}
          <mesh position={[0, -0.04, 0.18]} castShadow material={woolDark}>
            <boxGeometry args={[0.14, 0.12, 0.18]} />
          </mesh>
          {/* Beard — hangs under the chin */}
          <mesh position={[0, -0.16, 0.10]} castShadow material={woolDark}>
            <boxGeometry args={[0.08, 0.10, 0.08]} />
          </mesh>
          {/* Left horn — cone curving backward on top */}
          <mesh
            position={[-0.07, 0.14, -0.04]}
            rotation={[-0.5, 0, -0.15]}
            castShadow
            material={HORN_MAT}
          >
            <coneGeometry args={[0.04, 0.18, 5]} />
          </mesh>
          {/* Right horn */}
          <mesh
            position={[0.07, 0.14, -0.04]}
            rotation={[-0.5, 0, 0.15]}
            castShadow
            material={HORN_MAT}
          >
            <coneGeometry args={[0.04, 0.18, 5]} />
          </mesh>
          {/* Left eye */}
          <mesh position={[-0.09, 0.02, 0.12]} material={EYE_MAT}>
            <boxGeometry args={[0.04, 0.04, 0.02]} />
          </mesh>
          {/* Right eye */}
          <mesh position={[0.09, 0.02, 0.12]} material={EYE_MAT}>
            <boxGeometry args={[0.04, 0.04, 0.02]} />
          </mesh>
        </group>
      </group>

      {/* Legs — hip-pivot groups; mesh at local y = -LEG_HALF so bottom = HIP_Y - LEG_H ≈ 0 */}
      {/* Front-left */}
      <group ref={lf} position={[-0.13, HIP_Y, TORSO_L * 0.28]}>
        <mesh position={[0, -LEG_HALF, 0]} castShadow material={woolDark}>
          <boxGeometry args={[0.10, LEG_H, 0.10]} />
        </mesh>
        {/* Hoof */}
        <mesh position={[0, -LEG_H + 0.02, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.10, 0.04, 0.12]} />
        </mesh>
      </group>
      {/* Front-right */}
      <group ref={rf} position={[0.13, HIP_Y, TORSO_L * 0.28]}>
        <mesh position={[0, -LEG_HALF, 0]} castShadow material={woolDark}>
          <boxGeometry args={[0.10, LEG_H, 0.10]} />
        </mesh>
        <mesh position={[0, -LEG_H + 0.02, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.10, 0.04, 0.12]} />
        </mesh>
      </group>
      {/* Back-left */}
      <group ref={lb} position={[-0.13, HIP_Y, -TORSO_L * 0.28]}>
        <mesh position={[0, -LEG_HALF, 0]} castShadow material={woolDark}>
          <boxGeometry args={[0.10, LEG_H, 0.10]} />
        </mesh>
        <mesh position={[0, -LEG_H + 0.02, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.10, 0.04, 0.12]} />
        </mesh>
      </group>
      {/* Back-right */}
      <group ref={rb} position={[0.13, HIP_Y, -TORSO_L * 0.28]}>
        <mesh position={[0, -LEG_HALF, 0]} castShadow material={woolDark}>
          <boxGeometry args={[0.10, LEG_H, 0.10]} />
        </mesh>
        <mesh position={[0, -LEG_H + 0.02, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.10, 0.04, 0.12]} />
        </mesh>
      </group>

      {/* Tail — small upright stub at back of torso */}
      <group ref={tail} position={[0, TORSO_Y + 0.06, -TORSO_L * 0.5]}>
        <mesh position={[0, 0.06, 0]} rotation={[0.3, 0, 0]} castShadow material={wool}>
          <boxGeometry args={[0.08, 0.12, 0.06]} />
        </mesh>
      </group>

      {/* HP bar — lowered vs Wolf since goat is smaller */}
      <group ref={bar} position={[0, 0.95, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
