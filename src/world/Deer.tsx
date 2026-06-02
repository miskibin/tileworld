import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'

// Tall, slender grazer on long thin legs. Skittish — bolts from threats.

const COAT = '#a9794a'
const COAT_DARK = '#7a5630'
const BELLY = '#d8c2a0'
const NOSE = '#1a1410'
const ANTLER = '#cdbb90'

const NOSE_MAT = new THREE.MeshStandardMaterial({ color: NOSE, roughness: 0.5 })
const EYE_MAT = new THREE.MeshStandardMaterial({ color: NOSE, roughness: 0.4 })
const BELLY_MAT = new THREE.MeshStandardMaterial({ color: BELLY, roughness: 1 })
const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: ANTLER, roughness: 0.8 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

export function DeerView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.deer
  const coat = useMemo(() => new THREE.MeshStandardMaterial({ color: COAT, roughness: 1, flatShading: true }), [])
  const coatDark = useMemo(() => new THREE.MeshStandardMaterial({ color: COAT_DARK, roughness: 1, flatShading: true }), [])
  const hpFg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])

  const g = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
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
      cullVisible(grp, true)
      return
    } else cullVisible(grp, false)

    if (state.hp <= 0) {
      if (deadFrom.current === null) deadFrom.current = tNow
      const e = tNow - deadFrom.current
      grp.position.set(state.x, state.y - Math.min(0.5, e * 0.3), state.z)
      grp.rotation.z = Math.min(Math.PI / 2, e * 2)
      if (e > 1.4 && visible) setVisible(false)
      if (bar.current) bar.current.visible = false
      return
    }

    const stp = stepAnimalAI(state, dt, tNow)

    grp.position.set(state.x, state.y, state.z)
    grp.rotation.set(0, state.facing, 0)

    const gait = stp.moving ? 13 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.7 : Math.sin(t * 0.7) * 0.03
    if (lf.current) lf.current.rotation.x = swing
    if (rf.current) rf.current.rotation.x = -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x = swing
    if (head.current) {
      // Head up + alert when fleeing, grazes down + scans when calm.
      head.current.rotation.x = stp.moving ? -0.2 : 0.15 + Math.sin(t * 0.6) * 0.12
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.5 + state.seed) * 0.3
    }
    if (tail.current) tail.current.rotation.x = stp.moving ? 0.6 : Math.sin(t * 2) * 0.2
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.06

    const hurting = tNow < state.hurtFlashUntil
    coat.color.set(hurting ? '#d8965a' : COAT)

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
      <mesh position={[0, 0.95, 0]} castShadow material={coat}>
        <boxGeometry args={[0.34, 0.36, 0.85]} />
      </mesh>
      <mesh position={[0, 0.8, 0]} material={BELLY_MAT}>
        <boxGeometry args={[0.3, 0.1, 0.78]} />
      </mesh>
      {/* Neck + head (pivot low on the neck base) */}
      <group ref={head} position={[0, 1.05, 0.4]}>
        <mesh position={[0, 0.18, 0.04]} rotation={[-0.5, 0, 0]} castShadow material={coat}>
          <boxGeometry args={[0.15, 0.45, 0.15]} />
        </mesh>
        <mesh position={[0, 0.42, 0.2]} castShadow material={coat}>
          <boxGeometry args={[0.18, 0.2, 0.34]} />
        </mesh>
        <mesh position={[0, 0.38, 0.4]} castShadow material={coatDark}>
          <boxGeometry args={[0.12, 0.12, 0.14]} />
        </mesh>
        <mesh position={[0, 0.38, 0.48]} material={NOSE_MAT}>
          <boxGeometry args={[0.07, 0.06, 0.04]} />
        </mesh>
        <mesh position={[-0.07, 0.5, 0.28]} material={EYE_MAT}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
        </mesh>
        <mesh position={[0.07, 0.5, 0.28]} material={EYE_MAT}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
        </mesh>
        {/* Ears */}
        <mesh position={[-0.13, 0.52, 0.16]} rotation={[0, 0, -0.5]} material={coatDark}>
          <coneGeometry args={[0.05, 0.16, 4]} />
        </mesh>
        <mesh position={[0.13, 0.52, 0.16]} rotation={[0, 0, 0.5]} material={coatDark}>
          <coneGeometry args={[0.05, 0.16, 4]} />
        </mesh>
        {/* Simple antlers */}
        <mesh position={[-0.08, 0.62, 0.12]} rotation={[0.2, 0, -0.3]} material={ANTLER_MAT}>
          <coneGeometry args={[0.022, 0.22, 4]} />
        </mesh>
        <mesh position={[0.08, 0.62, 0.12]} rotation={[0.2, 0, 0.3]} material={ANTLER_MAT}>
          <coneGeometry args={[0.022, 0.22, 4]} />
        </mesh>
      </group>
      {/* Long thin legs */}
      <group ref={lf} position={[-0.13, 0.78, 0.32]}>
        <mesh position={[0, -0.37, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.08, 0.74, 0.08]} />
        </mesh>
      </group>
      <group ref={rf} position={[0.13, 0.78, 0.32]}>
        <mesh position={[0, -0.37, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.08, 0.74, 0.08]} />
        </mesh>
      </group>
      <group ref={lb} position={[-0.13, 0.78, -0.32]}>
        <mesh position={[0, -0.37, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.08, 0.74, 0.08]} />
        </mesh>
      </group>
      <group ref={rb} position={[0.13, 0.78, -0.32]}>
        <mesh position={[0, -0.37, 0]} castShadow material={coatDark}>
          <boxGeometry args={[0.08, 0.74, 0.08]} />
        </mesh>
      </group>
      {/* Tail */}
      <group ref={tail} position={[0, 1.0, -0.42]}>
        <mesh position={[0, -0.04, -0.04]} castShadow material={coat}>
          <boxGeometry args={[0.08, 0.16, 0.08]} />
        </mesh>
      </group>

      {/* HP bar */}
      <group ref={bar} position={[0, 1.75, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
