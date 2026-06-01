import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { AnimalState } from './animalStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { stepAnimalAI } from './animalAI'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// LOW and FLAT desert predator. Segmented abdomen, two front claws, six legs
// (4 animated on lf/rf/lb/rb, 2 static), arcing stinger tail.

const CARAPACE = '#3a2a1a'
const DARK = '#241a10'
const CLAW = '#4a3420'
const STINGER_TIP = '#d24a4a'

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_W = 0.8
const HP_H = 0.08

export function ScorpionView({ state }: { state: AnimalState }) {
  const cfg = ANIMAL_CONFIG.scorpion
  const carapaceMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CARAPACE, roughness: 1, flatShading: true }),
    [],
  )
  const darkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DARK, roughness: 1, flatShading: true }),
    [],
  )
  const clawMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CLAW, roughness: 0.9, flatShading: true }),
    [],
  )
  const stingerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STINGER_TIP,
        roughness: 0.4,
        emissive: STINGER_TIP,
        emissiveIntensity: 0.4,
        toneMapped: false,
      }),
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

    // Scuttle gait — faster frequency for the small legs
    const gait = stp.moving ? 14 : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.5 : Math.sin(t * 0.8) * 0.03
    const lunge = stp.attacking ? Math.sin(stp.attackPhase * Math.PI) * 0.8 : 0

    // 4 animated legs scuttle; lf/rf used as front pair for attack lunge
    if (lf.current) lf.current.rotation.x = stp.attacking ? -lunge : swing
    if (rf.current) rf.current.rotation.x = stp.attacking ? -lunge : -swing
    if (lb.current) lb.current.rotation.x = -swing
    if (rb.current) rb.current.rotation.x = swing

    if (body.current) body.current.rotation.x = lunge * 0.14
    if (head.current) {
      head.current.rotation.x = stp.attacking ? lunge * 0.4 : Math.sin(t * 0.5) * 0.06
      head.current.rotation.y = stp.moving ? 0 : Math.sin(t * 0.4 + state.seed) * 0.2
    }
    // Tail sways side-to-side; attack raises it forward
    if (tail.current) {
      tail.current.rotation.y = Math.sin(t * (stp.moving ? 8 : 2.5)) * 0.35
      tail.current.rotation.x = stp.attacking ? -lunge * 0.6 : 0
    }
    if (stp.moving) grp.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.02

    const hurting = tNow < state.hurtFlashUntil
    carapaceMat.color.set(hurting ? '#c86030' : CARAPACE)

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

  // Build proportions:
  //   Body sits at y≈0.16 (height 0.18, so bottom at 0.07 — legs reach y≈0)
  //   Legs: hip pivot at y≈0.14, leg hangs down 0.14 → tips at y≈0
  //   Claws reach forward from the front of the body at roughly the same height
  //   Tail arcs upward, safe above 0

  return (
    <group ref={g} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={cfg.scale}>
      {/* === BODY === */}
      <group ref={body} position={[0, 0, 0]}>
        {/* Rear abdomen segment — slightly larger */}
        <mesh position={[0, 0.16, -0.22]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[0.42, 0.18, 0.32]} />
        </mesh>
        {/* Front cephalothorax (main body mass) */}
        <mesh position={[0, 0.18, 0.1]} castShadow receiveShadow material={carapaceMat}>
          <boxGeometry args={[0.48, 0.2, 0.52]} />
        </mesh>

        {/* === HEAD / FRONT === */}
        <group ref={head} position={[0, 0.22, 0.38]}>
          {/* Small head nub */}
          <mesh castShadow material={carapaceMat}>
            <boxGeometry args={[0.22, 0.14, 0.16]} />
          </mesh>
          {/* Eye bumps */}
          <mesh position={[-0.07, 0.06, 0.06]} material={darkMat}>
            <boxGeometry args={[0.05, 0.05, 0.04]} />
          </mesh>
          <mesh position={[0.07, 0.06, 0.06]} material={darkMat}>
            <boxGeometry args={[0.05, 0.05, 0.04]} />
          </mesh>

          {/* === CLAW ARMS (left and right) — attached to head group so they lunge === */}
          {/* Left claw arm */}
          <group position={[-0.22, -0.04, 0.04]}>
            {/* Upper arm */}
            <mesh position={[0, 0, 0.14]} rotation={[0.2, 0.3, 0]} castShadow material={clawMat}>
              <boxGeometry args={[0.1, 0.1, 0.3]} />
            </mesh>
            {/* Pincer lower */}
            <mesh position={[-0.06, 0, 0.32]} rotation={[0, 0, -0.2]} castShadow material={clawMat}>
              <boxGeometry args={[0.08, 0.08, 0.18]} />
            </mesh>
            {/* Pincer upper tip (cone) */}
            <mesh position={[-0.1, 0.04, 0.44]} rotation={[Math.PI / 2, 0, 0]} castShadow material={darkMat}>
              <coneGeometry args={[0.04, 0.14, 4]} />
            </mesh>
          </group>
          {/* Right claw arm */}
          <group position={[0.22, -0.04, 0.04]}>
            <mesh position={[0, 0, 0.14]} rotation={[0.2, -0.3, 0]} castShadow material={clawMat}>
              <boxGeometry args={[0.1, 0.1, 0.3]} />
            </mesh>
            <mesh position={[0.06, 0, 0.32]} rotation={[0, 0, 0.2]} castShadow material={clawMat}>
              <boxGeometry args={[0.08, 0.08, 0.18]} />
            </mesh>
            <mesh position={[0.1, 0.04, 0.44]} rotation={[Math.PI / 2, 0, 0]} castShadow material={darkMat}>
              <coneGeometry args={[0.04, 0.14, 4]} />
            </mesh>
          </group>
        </group>
      </group>

      {/* === LEGS — hip pivots at body sides, tips reach y≈0 === */}
      {/* Left-front animated leg (lf) */}
      <group ref={lf} position={[-0.24, 0.14, 0.22]}>
        <mesh position={[0, -0.12, 0]} castShadow material={darkMat}>
          <boxGeometry args={[0.08, 0.26, 0.07]} />
        </mesh>
      </group>
      {/* Right-front animated leg (rf) */}
      <group ref={rf} position={[0.24, 0.14, 0.22]}>
        <mesh position={[0, -0.12, 0]} castShadow material={darkMat}>
          <boxGeometry args={[0.08, 0.26, 0.07]} />
        </mesh>
      </group>
      {/* Left-back animated leg (lb) */}
      <group ref={lb} position={[-0.24, 0.14, -0.14]}>
        <mesh position={[0, -0.12, 0]} castShadow material={darkMat}>
          <boxGeometry args={[0.08, 0.26, 0.07]} />
        </mesh>
      </group>
      {/* Right-back animated leg (rb) */}
      <group ref={rb} position={[0.24, 0.14, -0.14]}>
        <mesh position={[0, -0.12, 0]} castShadow material={darkMat}>
          <boxGeometry args={[0.08, 0.26, 0.07]} />
        </mesh>
      </group>
      {/* Static middle-left leg */}
      <mesh position={[-0.26, 0.08, 0.04]} castShadow material={darkMat}>
        <boxGeometry args={[0.18, 0.1, 0.07]} />
      </mesh>
      {/* Static middle-right leg */}
      <mesh position={[0.26, 0.08, 0.04]} castShadow material={darkMat}>
        <boxGeometry args={[0.18, 0.1, 0.07]} />
      </mesh>

      {/* === TAIL — arcs upward over the body === */}
      {/* tail group pivot is at rear of abdomen; rotation.y sways the whole tail */}
      <group ref={tail} position={[0, 0.18, -0.38]}>
        {/* Segment 1 — low, angled up */}
        <mesh position={[0, 0.14, -0.1]} rotation={[-0.7, 0, 0]} castShadow material={carapaceMat}>
          <boxGeometry args={[0.14, 0.14, 0.22]} />
        </mesh>
        {/* Segment 2 — mid arc */}
        <mesh position={[0, 0.38, -0.16]} rotation={[-1.1, 0, 0]} castShadow material={carapaceMat}>
          <boxGeometry args={[0.12, 0.12, 0.2]} />
        </mesh>
        {/* Segment 3 — high, curling forward */}
        <mesh position={[0, 0.55, -0.08]} rotation={[-1.5, 0, 0]} castShadow material={darkMat}>
          <boxGeometry args={[0.1, 0.1, 0.18]} />
        </mesh>
        {/* Stinger tip — emissive red cone */}
        <mesh position={[0, 0.64, 0.06]} rotation={[Math.PI, 0, 0]} castShadow material={stingerMat}>
          <coneGeometry args={[0.06, 0.2, 5]} />
        </mesh>
      </group>

      {/* HP bar — lowered for a short creature */}
      <group ref={bar} position={[0, 0.7, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_W + 0.05, HP_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={hpFg} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_W, HP_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}
