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

// Heavy boulder brute. Repurposes lf/rf as arm-pivot groups and lb/rb as
// leg-pivot groups. The Wolf "front-leg" lunge animation reads as a golem
// smash; the hind-leg swing reads as walking. Tail ref kept as a stub mossy
// rock so the (guarded) tail animation is harmless.

const STONE = '#7d7e86'
const STONE_DARK = '#5c5d64'
const MOSS = '#5a6a3a'
const CORE_C = '#7ad2ff'

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

export function GolemView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.golem
  // Per-component mutable materials (hurt-flash mutates stone.color)
  const stone = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE, roughness: 1, flatShading: true }),
    [],
  )
  const stoneDark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 1, flatShading: true }),
    [],
  )
  const mossMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MOSS, roughness: 0.9, flatShading: true }),
    [],
  )
  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: CORE_C,
        emissive: CORE_C,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        toneMapped: false,
      }),
    [],
  )
  const hpFg = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false }),
    [],
  )
  useDisposeOnUnmount(stone, stoneDark, mossMat, coreMat, hpFg)

  const g = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  // lf/rf = arm shoulder-pivot groups
  const lf = useRef<THREE.Group>(null!)
  const rf = useRef<THREE.Group>(null!)
  // lb/rb = leg hip-pivot groups
  const lb = useRef<THREE.Group>(null!)
  const rb = useRef<THREE.Group>(null!)
  // tail = mossy stub rock on back (kept so guard code doesn't null-check fail)
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

    const gait = stp.moving ? 8 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.5 : Math.sin(t * 0.7) * 0.03
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) * 0.9 : 0
    // Arms swing on attack (smash), otherwise gentle sway
    if (lf.current) lf.current.rotation.x = stp.attacking ? -lunge : swing
    if (rf.current) rf.current.rotation.x = stp.attacking ? -lunge : -swing
    // Legs plod while walking
    if (lb.current) lb.current.rotation.x = -swing * 0.7
    if (rb.current) rb.current.rotation.x = swing * 0.7
    if (body.current) body.current.rotation.x = lunge * 0.15
    if (head.current) {
      head.current.rotation.x = stp.attacking ? lunge * 0.4 : Math.sin(t * 0.4) * 0.06
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.3 + state.seed) * 0.2
    }
    // tail stub: gentle rock side-to-side (harmless)
    if (tail.current) tail.current.rotation.y = Math.sin(t * (stp.moving ? 6 : 2)) * 0.15
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.02

    const hurting = tNow < state.hurtFlashUntil
    stone.color.set(hurting ? '#c98850' : STONE)

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
      {/* Torso — wide, flat-shaded stone block */}
      <group ref={body} position={[0, 0, 0]}>
        <mesh position={[0, 0.85, 0]} castShadow receiveShadow material={stone}>
          <boxGeometry args={[0.7, 0.7, 0.5]} />
        </mesh>
        {/* Mossy accent patches on shoulders */}
        <mesh position={[-0.32, 1.05, 0]} castShadow material={mossMat}>
          <boxGeometry args={[0.12, 0.1, 0.18]} />
        </mesh>
        <mesh position={[0.32, 1.05, 0]} castShadow material={mossMat}>
          <boxGeometry args={[0.12, 0.1, 0.18]} />
        </mesh>
        {/* Glowing core on chest */}
        <mesh position={[0, 0.85, 0.26]} material={coreMat}>
          <boxGeometry args={[0.18, 0.18, 0.04]} />
        </mesh>
        {/* Head group — small blocky head above torso */}
        <group ref={head} position={[0, 1.28, 0.06]}>
          <mesh castShadow material={stone}>
            <boxGeometry args={[0.4, 0.34, 0.34]} />
          </mesh>
          {/* Glowing eyes */}
          <mesh position={[-0.13, 0.04, 0.17]} material={coreMat}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
          </mesh>
          <mesh position={[0.13, 0.04, 0.17]} material={coreMat}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
          </mesh>
          {/* Brow ridge */}
          <mesh position={[0, 0.12, 0.17]} castShadow material={stoneDark}>
            <boxGeometry args={[0.38, 0.07, 0.06]} />
          </mesh>
        </group>
      </group>

      {/* Arms — lf/rf as shoulder-pivot groups (like Wolf front legs) */}
      {/* Left arm — shoulder pivot at upper torso side */}
      <group ref={lf} position={[-0.42, 1.08, 0.0]}>
        <mesh position={[0, -0.3, 0]} castShadow receiveShadow material={stoneDark}>
          <boxGeometry args={[0.28, 0.6, 0.28]} />
        </mesh>
        {/* Fist block at end of arm */}
        <mesh position={[0, -0.65, 0.02]} castShadow material={stone}>
          <boxGeometry args={[0.26, 0.22, 0.26]} />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rf} position={[0.42, 1.08, 0.0]}>
        <mesh position={[0, -0.3, 0]} castShadow receiveShadow material={stoneDark}>
          <boxGeometry args={[0.28, 0.6, 0.28]} />
        </mesh>
        <mesh position={[0, -0.65, 0.02]} castShadow material={stone}>
          <boxGeometry args={[0.26, 0.22, 0.26]} />
        </mesh>
      </group>

      {/* Legs — lb/rb as hip-pivot groups */}
      {/* Left leg */}
      <group ref={lb} position={[-0.2, 0.5, 0.0]}>
        <mesh position={[0, -0.25, 0]} castShadow receiveShadow material={stone}>
          <boxGeometry args={[0.22, 0.5, 0.22]} />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rb} position={[0.2, 0.5, 0.0]}>
        <mesh position={[0, -0.25, 0]} castShadow receiveShadow material={stone}>
          <boxGeometry args={[0.22, 0.5, 0.22]} />
        </mesh>
      </group>

      {/* Tail — mossy rock stub on lower back (ref kept for Wolf useFrame compat) */}
      <group ref={tail} position={[0, 0.72, -0.26]}>
        <mesh position={[0, 0, 0]} castShadow material={mossMat}>
          <boxGeometry args={[0.16, 0.14, 0.12]} />
        </mesh>
      </group>

      {/* HP bar — raised to clear tall torso */}
      <group ref={bar} position={[0, 1.6, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
