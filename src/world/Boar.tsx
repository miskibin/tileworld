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

// Bulky, low-slung tank with a shoulder hump, tusks, and a bristle ridge.
// Neutral until provoked, then charges and gores (lunge on attackPhase).

const HIDE = '#4a3a2e'
const HIDE_DARK = '#33271f'
const BRISTLE = '#1f1814'
const TUSK = '#e8ddc0'
const SNOUT = '#5a463a'
const NOSE = '#15100c'

const BRISTLE_MAT = new THREE.MeshStandardMaterial({ color: BRISTLE, roughness: 1, flatShading: true })
const TUSK_MAT = new THREE.MeshStandardMaterial({ color: TUSK, roughness: 0.6 })
const SNOUT_MAT = new THREE.MeshStandardMaterial({ color: SNOUT, roughness: 0.9 })
const NOSE_MAT = new THREE.MeshStandardMaterial({ color: NOSE, roughness: 0.5 })
const EYE_MAT = new THREE.MeshStandardMaterial({ color: NOSE, roughness: 0.4 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.9
const HP_H = 0.09

export function BoarView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.boar
  const hide = useMemo(() => new THREE.MeshStandardMaterial({ color: HIDE, roughness: 1, flatShading: true }), [])
  const hideDark = useMemo(() => new THREE.MeshStandardMaterial({ color: HIDE_DARK, roughness: 1, flatShading: true }), [])
  const hpFg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])
  useDisposeOnUnmount(hide, hideDark, hpFg)

  const g = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const lf = useRef<THREE.Group>(null!)
  const rf = useRef<THREE.Group>(null!)
  const lb = useRef<THREE.Group>(null!)
  const rb = useRef<THREE.Group>(null!)
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
      grp.rotation.z = Math.min(Math.PI / 2, e * 2)
      if (e > 1.4 && visible) setVisible(false)
      if (bar.current) bar.current.visible = false
      return
    }

    const stp = stepAnimalAI(state, dt, tNow)

    grp.position.set(state.x, state.y, state.z)
    grp.rotation.set(0, state.facing, 0)

    const gait = stp.moving ? 11 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.5 : Math.sin(t * 0.8) * 0.03
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) : 0
    if (lf.current) lf.current.rotation.x = swing
    if (rf.current) rf.current.rotation.x = -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x = swing
    if (body.current) body.current.rotation.x = -lunge * 0.22 // toss head/shoulders up on gore
    if (head.current) {
      head.current.rotation.x = stp.attacking
        ? -lunge * 0.5
        : (stp.moving ? 0.05 : 0.1 + Math.sin(t * 0.5) * 0.08)
    }
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.04

    const hurting = tNow < state.hurtFlashUntil
    hide.color.set(hurting ? '#8a4a30' : HIDE)

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
      <group ref={body} position={[0, 0, 0]}>
        {/* Barrel body */}
        <mesh position={[0, 0.55, 0]} castShadow material={hide}>
          <boxGeometry args={[0.5, 0.46, 0.9]} />
        </mesh>
        {/* Shoulder hump (front-heavy) */}
        <mesh position={[0, 0.74, 0.2]} castShadow material={hide}>
          <boxGeometry args={[0.46, 0.34, 0.42]} />
        </mesh>
        {/* Bristle ridge */}
        {[0.22, 0.05, -0.12, -0.28].map((z, i) => (
          <mesh key={i} position={[0, 0.92 - i * 0.02, z]} rotation={[-0.3, 0, 0]} material={BRISTLE_MAT}>
            <coneGeometry args={[0.04, 0.16, 4]} />
          </mesh>
        ))}
        {/* Head */}
        <group ref={head} position={[0, 0.6, 0.55]}>
          <mesh castShadow material={hide}>
            <boxGeometry args={[0.38, 0.34, 0.36]} />
          </mesh>
          <mesh position={[0, -0.08, 0.24]} castShadow material={SNOUT_MAT}>
            <boxGeometry args={[0.2, 0.18, 0.22]} />
          </mesh>
          <mesh position={[0, -0.06, 0.36]} material={NOSE_MAT}>
            <boxGeometry args={[0.12, 0.1, 0.05]} />
          </mesh>
          {/* Tusks */}
          <mesh position={[-0.1, -0.12, 0.3]} rotation={[-0.5, 0, -0.2]} material={TUSK_MAT}>
            <coneGeometry args={[0.028, 0.16, 5]} />
          </mesh>
          <mesh position={[0.1, -0.12, 0.3]} rotation={[-0.5, 0, 0.2]} material={TUSK_MAT}>
            <coneGeometry args={[0.028, 0.16, 5]} />
          </mesh>
          {/* Ears */}
          <mesh position={[-0.16, 0.18, -0.02]} rotation={[0, 0, -0.4]} material={hideDark}>
            <coneGeometry args={[0.06, 0.14, 4]} />
          </mesh>
          <mesh position={[0.16, 0.18, -0.02]} rotation={[0, 0, 0.4]} material={hideDark}>
            <coneGeometry args={[0.06, 0.14, 4]} />
          </mesh>
          <mesh position={[-0.1, 0.04, 0.17]} material={EYE_MAT}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
          </mesh>
          <mesh position={[0.1, 0.04, 0.17]} material={EYE_MAT}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
          </mesh>
        </group>
      </group>
      {/* Short stocky legs */}
      <group ref={lf} position={[-0.18, 0.36, 0.3]}>
        <mesh position={[0, -0.17, 0]} castShadow material={hideDark}>
          <boxGeometry args={[0.13, 0.34, 0.14]} />
        </mesh>
      </group>
      <group ref={rf} position={[0.18, 0.36, 0.3]}>
        <mesh position={[0, -0.17, 0]} castShadow material={hideDark}>
          <boxGeometry args={[0.13, 0.34, 0.14]} />
        </mesh>
      </group>
      <group ref={lb} position={[-0.18, 0.36, -0.3]}>
        <mesh position={[0, -0.17, 0]} castShadow material={hideDark}>
          <boxGeometry args={[0.14, 0.34, 0.15]} />
        </mesh>
      </group>
      <group ref={rb} position={[0.18, 0.36, -0.3]}>
        <mesh position={[0, -0.17, 0]} castShadow material={hideDark}>
          <boxGeometry args={[0.14, 0.34, 0.15]} />
        </mesh>
      </group>

      {/* HP bar */}
      <group ref={bar} position={[0, 1.25, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
