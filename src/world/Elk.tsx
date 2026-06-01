import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// Tall deer-like forest grazer. Quadruped built from boxes:
// long hip-pivot legs, raised neck, branching antlers, short tail. Prey / flees.

const COAT = '#7a5230'
const COAT_DARK = '#5a3a20'
const UNDERSIDE = '#b89a6a'
const ANTLER_C = '#cbb088'
const HOOF_C = '#2a2018'
const EYE_C = '#2a2a2a'

const EYE_MAT = new THREE.MeshStandardMaterial({ color: EYE_C, roughness: 0.4 })
const HOOF_MAT = new THREE.MeshStandardMaterial({ color: HOOF_C, roughness: 0.9 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

// Leg geometry constants (local to hip pivot groups)
const LEG_H = 0.7
const LEG_MESH_Y = -LEG_H / 2          // = -0.35 → leg spans [0 .. -LEG_H] from pivot
const HIP_PIVOT_Y = 0.72               // pivot y; bottom of leg = 0.72 - 0.7 = 0.02 ✓
const HOOF_H = 0.06
const HOOF_Y = LEG_MESH_Y - LEG_H / 2 - HOOF_H / 2   // -0.35 - 0.35 - 0.03 = -0.73

export function ElkView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.elk
  const coat = useMemo(() => new THREE.MeshStandardMaterial({ color: COAT, roughness: 1, flatShading: true }), [])
  const coatDark = useMemo(() => new THREE.MeshStandardMaterial({ color: COAT_DARK, roughness: 1, flatShading: true }), [])
  const underside = useMemo(() => new THREE.MeshStandardMaterial({ color: UNDERSIDE, roughness: 1, flatShading: true }), [])
  const antlerMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ANTLER_C, roughness: 0.8 }), [])
  const hpFg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])

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

    const gait = stp.moving ? 10 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.55 : Math.sin(t * 0.8) * 0.04
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) * 0.9 : 0
    if (lf.current) lf.current.rotation.x = stp.attacking ? -lunge : swing
    if (rf.current) rf.current.rotation.x = stp.attacking ? -lunge : -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x = swing
    if (body.current) body.current.rotation.x = lunge * 0.18
    if (head.current) {
      head.current.rotation.x = stp.attacking ? lunge * 0.5 : Math.sin(t * 0.5) * 0.06
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.4 + state.seed) * 0.2
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * (stp.moving ? 8 : 2)) * 0.35
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.04

    const hurting = tNow < state.hurtFlashUntil
    coat.color.set(hurting ? '#c98850' : COAT)

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
      {/* Torso */}
      <group ref={body} position={[0, 0, 0]}>
        {/* Main barrel */}
        <mesh position={[0, 0.95, 0]} castShadow receiveShadow material={coat}>
          <boxGeometry args={[0.36, 0.4, 1.0]} />
        </mesh>
        {/* Chest / shoulder bulge */}
        <mesh position={[0, 1.0, 0.3]} castShadow material={coat}>
          <boxGeometry args={[0.38, 0.44, 0.38]} />
        </mesh>
        {/* Belly / underside strip */}
        <mesh position={[0, 0.76, 0]} castShadow material={underside}>
          <boxGeometry args={[0.28, 0.06, 0.85]} />
        </mesh>

        {/* Neck — angled forward+up from chest */}
        <group position={[0, 1.12, 0.46]} rotation={[-0.55, 0, 0]}>
          <mesh position={[0, 0.18, 0]} castShadow material={coat}>
            <boxGeometry args={[0.22, 0.4, 0.2]} />
          </mesh>

          {/* Head group (relative to neck top) */}
          <group ref={head} position={[0, 0.38, 0.04]}>
            {/* Skull */}
            <mesh castShadow material={coat}>
              <boxGeometry args={[0.28, 0.26, 0.3]} />
            </mesh>
            {/* Snout / muzzle */}
            <mesh position={[0, -0.06, 0.2]} castShadow material={underside}>
              <boxGeometry args={[0.18, 0.16, 0.22]} />
            </mesh>
            {/* Nose */}
            <mesh position={[0, -0.05, 0.32]} material={HOOF_MAT}>
              <boxGeometry args={[0.09, 0.07, 0.05]} />
            </mesh>
            {/* Eyes */}
            <mesh position={[-0.1, 0.04, 0.14]} material={EYE_MAT}>
              <boxGeometry args={[0.04, 0.04, 0.01]} />
            </mesh>
            <mesh position={[0.1, 0.04, 0.14]} material={EYE_MAT}>
              <boxGeometry args={[0.04, 0.04, 0.01]} />
            </mesh>
            {/* Ears */}
            <mesh position={[-0.16, 0.14, -0.04]} rotation={[0, 0, -0.3]} material={coatDark}>
              <boxGeometry args={[0.06, 0.14, 0.05]} />
            </mesh>
            <mesh position={[0.16, 0.14, -0.04]} rotation={[0, 0, 0.3]} material={coatDark}>
              <boxGeometry args={[0.06, 0.14, 0.05]} />
            </mesh>

            {/* === ANTLERS (attached to skull top, base touching head) === */}
            {/* Left main beam — base at skull top y=+0.13 */}
            <group position={[-0.1, 0.13, -0.06]}>
              {/* Base segment going up+outward */}
              <mesh position={[0, 0.14, 0]} rotation={[0, 0, 0.25]} castShadow material={antlerMat}>
                <boxGeometry args={[0.05, 0.3, 0.05]} />
              </mesh>
              {/* Forward tine — attached to beam at ~0.2 up */}
              <mesh position={[-0.04, 0.25, 0.07]} rotation={[-0.5, 0, 0.2]} castShadow material={antlerMat}>
                <boxGeometry args={[0.04, 0.22, 0.04]} />
              </mesh>
              {/* Upper back tine */}
              <mesh position={[-0.08, 0.36, -0.04]} rotation={[0.2, 0, 0.35]} castShadow material={antlerMat}>
                <boxGeometry args={[0.04, 0.2, 0.04]} />
              </mesh>
              {/* Crown tip */}
              <mesh position={[-0.12, 0.46, 0]} rotation={[0, 0, 0.4]} castShadow material={antlerMat}>
                <boxGeometry args={[0.04, 0.18, 0.04]} />
              </mesh>
            </group>

            {/* Right main beam — mirrored */}
            <group position={[0.1, 0.13, -0.06]}>
              <mesh position={[0, 0.14, 0]} rotation={[0, 0, -0.25]} castShadow material={antlerMat}>
                <boxGeometry args={[0.05, 0.3, 0.05]} />
              </mesh>
              <mesh position={[0.04, 0.25, 0.07]} rotation={[-0.5, 0, -0.2]} castShadow material={antlerMat}>
                <boxGeometry args={[0.04, 0.22, 0.04]} />
              </mesh>
              <mesh position={[0.08, 0.36, -0.04]} rotation={[0.2, 0, -0.35]} castShadow material={antlerMat}>
                <boxGeometry args={[0.04, 0.2, 0.04]} />
              </mesh>
              <mesh position={[0.12, 0.46, 0]} rotation={[0, 0, -0.4]} castShadow material={antlerMat}>
                <boxGeometry args={[0.04, 0.18, 0.04]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Legs (hip pivots — bottom of leg mesh = HIP_PIVOT_Y - LEG_H ≈ 0.02) */}
      {/* Front-left */}
      <group ref={lf} position={[-0.14, HIP_PIVOT_Y, 0.32]}>
        <mesh position={[0, LEG_MESH_Y, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.12, LEG_H, 0.13]} />
        </mesh>
        {/* Hoof */}
        <mesh position={[0, HOOF_Y, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.1, HOOF_H, 0.11]} />
        </mesh>
      </group>

      {/* Front-right */}
      <group ref={rf} position={[0.14, HIP_PIVOT_Y, 0.32]}>
        <mesh position={[0, LEG_MESH_Y, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.12, LEG_H, 0.13]} />
        </mesh>
        <mesh position={[0, HOOF_Y, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.1, HOOF_H, 0.11]} />
        </mesh>
      </group>

      {/* Back-left */}
      <group ref={lb} position={[-0.14, HIP_PIVOT_Y, -0.32]}>
        <mesh position={[0, LEG_MESH_Y, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.13, LEG_H, 0.14]} />
        </mesh>
        <mesh position={[0, HOOF_Y, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.11, HOOF_H, 0.12]} />
        </mesh>
      </group>

      {/* Back-right */}
      <group ref={rb} position={[0.14, HIP_PIVOT_Y, -0.32]}>
        <mesh position={[0, LEG_MESH_Y, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.13, LEG_H, 0.14]} />
        </mesh>
        <mesh position={[0, HOOF_Y, 0]} castShadow material={HOOF_MAT}>
          <boxGeometry args={[0.11, HOOF_H, 0.12]} />
        </mesh>
      </group>

      {/* Short upright tail */}
      <group ref={tail} position={[0, 0.95, -0.5]}>
        <mesh position={[0, 0.1, 0]} rotation={[-0.3, 0, 0]} castShadow material={underside}>
          <boxGeometry args={[0.1, 0.18, 0.06]} />
        </mesh>
      </group>

      {/* HP bar — above antlers */}
      <group ref={bar} position={[0, 1.75, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
