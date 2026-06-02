import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'

// Tiny round ambient prey. Hops when moving; ears twitch when calm.

const FUR = '#9a8a78'
const FUR_DARK = '#6f6052'
const EAR_IN = '#caa090'
const NOSE = '#c97a7a'

const EAR_MAT = new THREE.MeshStandardMaterial({ color: EAR_IN, roughness: 0.9 })
const NOSE_MAT = new THREE.MeshStandardMaterial({ color: NOSE, roughness: 0.6 })
const EYE_MAT = new THREE.MeshStandardMaterial({ color: '#15100c', roughness: 0.4 })
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: '#efe9e0', roughness: 1 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.5
const HP_H = 0.06

export function RabbitView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.rabbit
  const fur = useMemo(() => new THREE.MeshStandardMaterial({ color: FUR, roughness: 1, flatShading: true }), [])
  const furDark = useMemo(() => new THREE.MeshStandardMaterial({ color: FUR_DARK, roughness: 1, flatShading: true }), [])
  const hpFg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }), [])

  const g = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const earL = useRef<THREE.Group>(null!)
  const earR = useRef<THREE.Group>(null!)
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
      grp.position.set(state.x, state.y - Math.min(0.2, e * 0.25), state.z)
      grp.rotation.z = Math.min(Math.PI / 2, e * 2.5)
      if (e > 1.0 && visible) setVisible(false)
      if (bar.current) bar.current.visible = false
      return
    }

    const stp = stepAnimalAI(state, dt, tNow)

    grp.position.set(state.x, state.y, state.z)
    grp.rotation.set(0, state.facing, 0)

    // Hop: quick bouncy vertical when moving, legs tuck on the up-phase.
    const hopP = stp.moving ? Math.abs(Math.sin(t * 9)) : 0
    grp.position.y = state.y + hopP * 0.12
    const tuck = stp.moving ? hopP * 0.8 : 0
    if (lf.current) lf.current.rotation.x = -tuck
    if (rf.current) rf.current.rotation.x = -tuck
    if (lb.current) lb.current.rotation.x = tuck * 0.6
    if (rb.current) rb.current.rotation.x = tuck * 0.6
    const twitch = stp.moving ? 0 : Math.sin(t * 3 + state.seed) * 0.18
    if (earL.current) earL.current.rotation.z = -0.18 + twitch
    if (earR.current) earR.current.rotation.z = 0.18 - twitch
    if (head.current) head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 1.4 + state.seed) * 0.3

    const hurting = tNow < state.hurtFlashUntil
    fur.color.set(hurting ? '#d09a86' : FUR)

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
      {/* Body */}
      <mesh position={[0, 0.2, -0.02]} castShadow material={fur}>
        <boxGeometry args={[0.26, 0.26, 0.36]} />
      </mesh>
      {/* Head */}
      <group ref={head} position={[0, 0.34, 0.18]}>
        <mesh castShadow material={fur}>
          <boxGeometry args={[0.22, 0.2, 0.2]} />
        </mesh>
        <mesh position={[0, -0.02, 0.11]} material={NOSE_MAT}>
          <boxGeometry args={[0.05, 0.04, 0.03]} />
        </mesh>
        <mesh position={[-0.07, 0.03, 0.09]} material={EYE_MAT}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
        </mesh>
        <mesh position={[0.07, 0.03, 0.09]} material={EYE_MAT}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
        </mesh>
        {/* Long ears (pivot at base) */}
        <group ref={earL} position={[-0.06, 0.1, -0.01]}>
          <mesh position={[0, 0.13, 0]} castShadow material={fur}>
            <boxGeometry args={[0.05, 0.28, 0.03]} />
          </mesh>
          <mesh position={[0, 0.13, 0.016]} material={EAR_MAT}>
            <boxGeometry args={[0.025, 0.22, 0.008]} />
          </mesh>
        </group>
        <group ref={earR} position={[0.06, 0.1, -0.01]}>
          <mesh position={[0, 0.13, 0]} castShadow material={fur}>
            <boxGeometry args={[0.05, 0.28, 0.03]} />
          </mesh>
          <mesh position={[0, 0.13, 0.016]} material={EAR_MAT}>
            <boxGeometry args={[0.025, 0.22, 0.008]} />
          </mesh>
        </group>
      </group>
      {/* Front legs */}
      <group ref={lf} position={[-0.07, 0.16, 0.12]}>
        <mesh position={[0, -0.07, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.06, 0.14, 0.06]} />
        </mesh>
      </group>
      <group ref={rf} position={[0.07, 0.16, 0.12]}>
        <mesh position={[0, -0.07, 0]} castShadow material={furDark}>
          <boxGeometry args={[0.06, 0.14, 0.06]} />
        </mesh>
      </group>
      {/* Big hind legs */}
      <group ref={lb} position={[-0.08, 0.16, -0.1]}>
        <mesh position={[0, -0.08, 0.02]} castShadow material={furDark}>
          <boxGeometry args={[0.1, 0.16, 0.2]} />
        </mesh>
      </group>
      <group ref={rb} position={[0.08, 0.16, -0.1]}>
        <mesh position={[0, -0.08, 0.02]} castShadow material={furDark}>
          <boxGeometry args={[0.1, 0.16, 0.2]} />
        </mesh>
      </group>
      {/* Cotton tail */}
      <mesh position={[0, 0.24, -0.22]} castShadow material={TAIL_MAT}>
        <sphereGeometry args={[0.06, 8, 6]} />
      </mesh>

      {/* HP bar */}
      <group ref={bar} position={[0, 0.8, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.04, HP_H + 0.025, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
