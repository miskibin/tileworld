import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'
import { useDisposeOnUnmount } from './useDisposeOnUnmount'

// Lean grey pack-hunter. Quadruped built from boxes (Bear/Dog conventions):
// hip-pivot leg groups, a head group, a bushy tail. AI lives in animalAI.

const FUR = '#6b6f78'
const FUR_DARK = '#494d55'
const SNOUT = '#3a3e44'
const NOSE = '#141414'
const EYE_C = '#d8c84a'

const NOSE_MAT = new THREE.MeshStandardMaterial({ color: NOSE, roughness: 0.5 })
const EYE_MAT = new THREE.MeshStandardMaterial({ color: EYE_C, roughness: 0.4 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

export function WolfView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.wolf
  const fur = useMemo(() => new THREE.MeshStandardMaterial({ color: FUR, roughness: 1, flatShading: true }), [])
  const furDark = useMemo(() => new THREE.MeshStandardMaterial({ color: FUR_DARK, roughness: 1, flatShading: true }), [])
  const snoutMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SNOUT, roughness: 0.9 }), [])
  const hpFg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])
  useDisposeOnUnmount(fur, furDark, snoutMat, hpFg)

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
      cullVisible(grp, true)
      return
    } else cullVisible(grp, false)

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
    fur.color.set(hurting ? '#c98850' : FUR)

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
        <mesh position={[0, 0.62, 0]} castShadow material={fur}>
          <boxGeometry args={[0.42, 0.42, 1.0]} />
        </mesh>
        <mesh position={[0, 0.7, 0.28]} castShadow material={fur}>
          <boxGeometry args={[0.44, 0.4, 0.42]} />
        </mesh>
        {/* Head */}
        <group ref={head} position={[0, 0.8, 0.56]}>
          <mesh castShadow material={fur}>
            <boxGeometry args={[0.32, 0.3, 0.32]} />
          </mesh>
          <mesh position={[0, -0.06, 0.22]} castShadow material={snoutMat}>
            <boxGeometry args={[0.16, 0.14, 0.22]} />
          </mesh>
          <mesh position={[0, -0.04, 0.34]} material={NOSE_MAT}>
            <boxGeometry args={[0.08, 0.06, 0.05]} />
          </mesh>
          <mesh position={[-0.11, 0.22, -0.02]} rotation={[0, 0, -0.1]} material={furDark}>
            <coneGeometry args={[0.07, 0.18, 4]} />
          </mesh>
          <mesh position={[0.11, 0.22, -0.02]} rotation={[0, 0, 0.1]} material={furDark}>
            <coneGeometry args={[0.07, 0.18, 4]} />
          </mesh>
          <mesh position={[-0.09, 0.03, 0.15]} material={EYE_MAT}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
          </mesh>
          <mesh position={[0.09, 0.03, 0.15]} material={EYE_MAT}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
          </mesh>
        </group>
      </group>
      {/* Legs (hip pivots) */}
      <group ref={lf} position={[-0.16, 0.52, 0.34]}>
        <mesh position={[0, -0.25, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.12, 0.5, 0.13]} />
        </mesh>
      </group>
      <group ref={rf} position={[0.16, 0.52, 0.34]}>
        <mesh position={[0, -0.25, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.12, 0.5, 0.13]} />
        </mesh>
      </group>
      <group ref={lb} position={[-0.16, 0.52, -0.34]}>
        <mesh position={[0, -0.25, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.13, 0.5, 0.14]} />
        </mesh>
      </group>
      <group ref={rb} position={[0.16, 0.52, -0.34]}>
        <mesh position={[0, -0.25, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.13, 0.5, 0.14]} />
        </mesh>
      </group>
      {/* Tail */}
      <group ref={tail} position={[0, 0.62, -0.5]}>
        <mesh position={[0, 0.04, -0.18]} rotation={[0.7, 0, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.13, 0.13, 0.4]} />
        </mesh>
      </group>

      {/* HP bar */}
      <group ref={bar} position={[0, 1.35, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
