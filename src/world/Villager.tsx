import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { VillagerState, VillagerStateName } from './villagerStore'
import { isPaused } from './pauseStore'

interface Props {
  state: VillagerState
}

const SKIN_TONES = ['#dca78a', '#c08866', '#a36b4a']
const TUNIC_COLORS = ['#5a8fc8', '#7a3a26', '#4a6a3a', '#8a6a3a']
const PANT_COLOR = '#3a2a18'
const HAT_COLOR = '#a02a26'
const HAIR_COLOR = '#3a2418'

const SKIN_MATS = SKIN_TONES.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }),
)
const TUNIC_MATS = TUNIC_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }),
)
const PANT_MAT = new THREE.MeshStandardMaterial({ color: PANT_COLOR, roughness: 1 })
const HAT_MAT = new THREE.MeshStandardMaterial({ color: HAT_COLOR, roughness: 0.85 })
const HAIR_MAT = new THREE.MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.85 })

const SPEED = 1.6
const WANDER_RADIUS = 3.0
const ARRIVE_DIST = 0.35

function nextWanderPoint(v: VillagerState, t: number): { x: number; z: number } {
  // Cheap pseudo-random in a ring around home
  const ang = (Math.sin(v.id * 12.9898 + t * 0.31) * 43758.5453) % (Math.PI * 2)
  const r = WANDER_RADIUS * (0.4 + Math.abs(Math.sin(t * 0.17 + v.id)) * 0.6)
  return { x: v.homeX + Math.cos(ang) * r, z: v.homeZ + Math.sin(ang) * r }
}

function setState(v: VillagerState, name: VillagerStateName, t: number, duration: number) {
  v.state = name
  v.stateSince = t
  v.stateUntil = t + duration
}

function tickStateMachine(v: VillagerState, t: number): void {
  // Hourly-ish schedule via a slow cycle (60s real seconds = full day).
  const dayPhase = ((t / 60) % 1) // 0..1
  // 0.0 - 0.4 day work in garden; 0.4 - 0.6 wander; 0.6 - 1 rest near home
  const wantState: VillagerStateName =
    dayPhase < 0.4 ? 'tend' : dayPhase < 0.6 ? 'wander' : 'rest'

  // Honor current state until completion, then transition to scheduled goal.
  if (t < v.stateUntil) return

  switch (wantState) {
    case 'tend': {
      v.targetX = v.gardenX + (Math.sin(v.seed + t * 0.5) * 0.4)
      v.targetZ = v.gardenZ + (Math.cos(v.seed + t * 0.7) * 0.4)
      setState(v, 'tend', t, 3.5 + Math.random() * 2)
      break
    }
    case 'wander': {
      const wp = nextWanderPoint(v, t)
      v.targetX = wp.x
      v.targetZ = wp.z
      setState(v, 'wander', t, 4 + Math.random() * 3)
      break
    }
    case 'rest': {
      v.targetX = v.doorX
      v.targetZ = v.doorZ
      setState(v, 'rest', t, 5 + Math.random() * 3)
      break
    }
  }
}

export function VillagerView({ state }: Props) {
  const ref = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const armRRef = useRef<THREE.Group>(null!)
  const armLRef = useRef<THREE.Group>(null!)
  const legRRef = useRef<THREE.Group>(null!)
  const legLRef = useRef<THREE.Group>(null!)

  const skinMat = useMemo(
    () => SKIN_MATS[state.paletteIndex % SKIN_MATS.length],
    [state.paletteIndex],
  )
  const tunicMat = useMemo(
    () => TUNIC_MATS[(state.paletteIndex + 1) % TUNIC_MATS.length],
    [state.paletteIndex],
  )

  const walkPhase = useRef(0)
  const [, setTick] = useState(0)

  useFrame(({ clock }, dt) => {
    if (isPaused()) return
    const tNow = clock.getElapsedTime()
    tickStateMachine(state, tNow)

    // Move toward target
    const dx = state.targetX - state.x
    const dz = state.targetZ - state.z
    const dist = Math.hypot(dx, dz)
    let moving = false
    if (dist > ARRIVE_DIST) {
      const step = Math.min(SPEED * dt, dist)
      state.x += (dx / dist) * step
      state.z += (dz / dist) * step
      const targetFacing = Math.atan2(dx, dz)
      let d = targetFacing - state.facing
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      state.facing += d * Math.min(1, dt * 8)
      moving = true
    }

    walkPhase.current += dt * (moving ? 8 : 0)
    const wp = walkPhase.current

    // Animation per state
    let armSwing = Math.sin(wp) * 0.5
    let legSwing = Math.sin(wp) * 0.55
    let bodyTilt = 0
    let armOverride: number | null = null

    if (!moving) {
      armSwing = 0
      legSwing = 0
      if (state.state === 'tend') {
        // Hoeing motion: both arms reach down and pump.
        bodyTilt = 0.35
        armOverride = -0.6 + Math.sin(tNow * 4) * 0.5
      } else if (state.state === 'rest') {
        // Light idle sway
        armSwing = Math.sin(tNow * 1.3) * 0.06
      } else {
        armSwing = Math.sin(tNow * 1.4) * 0.08
      }
    }

    if (ref.current) {
      ref.current.position.set(state.x, state.y, state.z)
      ref.current.rotation.y = state.facing
    }
    if (bodyRef.current) bodyRef.current.rotation.x = bodyTilt
    if (legRRef.current) legRRef.current.rotation.x = legSwing
    if (legLRef.current) legLRef.current.rotation.x = -legSwing
    if (armRRef.current) armRRef.current.rotation.x = armOverride ?? -armSwing
    if (armLRef.current) armLRef.current.rotation.x = armOverride ?? armSwing
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(tNow * 0.7 + state.seed) * 0.18 * (moving ? 0 : 1)
    }

    // Force occasional re-render so React re-syncs (no heavy state here, cheap).
    setTick((n) => (n + 1) & 0xff)
  })

  return (
    <group ref={ref} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={0.55}>
      {/* Legs */}
      <group ref={legRRef} position={[0.11, 0.34, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={PANT_MAT}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>
      <group ref={legLRef} position={[-0.11, 0.34, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={PANT_MAT}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>

      {/* Body */}
      <group ref={bodyRef} position={[0, 0.7, 0]}>
        <mesh castShadow material={tunicMat}>
          <boxGeometry args={[0.42, 0.48, 0.26]} />
        </mesh>
      </group>

      {/* Arms */}
      <group ref={armRRef} position={[0.27, 0.92, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={tunicMat}>
          <boxGeometry args={[0.13, 0.36, 0.22]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.1, 0.2]} />
        </mesh>
      </group>
      <group ref={armLRef} position={[-0.27, 0.92, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={tunicMat}>
          <boxGeometry args={[0.13, 0.36, 0.22]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.1, 0.2]} />
        </mesh>
      </group>

      {/* Head */}
      <group ref={headRef} position={[0, 1.12, 0]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
        </mesh>
        {/* Hair */}
        <mesh position={[0, 0.13, 0]} castShadow material={HAIR_MAT}>
          <boxGeometry args={[0.31, 0.08, 0.31]} />
        </mesh>
        {/* Hat (every other villager) */}
        {state.id % 2 === 0 && (
          <mesh position={[0, 0.22, 0]} castShadow material={HAT_MAT}>
            <coneGeometry args={[0.22, 0.2, 6]} />
          </mesh>
        )}
        {/* Eyes */}
        <mesh position={[-0.07, 0.03, 0.16]} material={HAIR_MAT}>
          <boxGeometry args={[0.04, 0.04, 0.005]} />
        </mesh>
        <mesh position={[0.07, 0.03, 0.16]} material={HAIR_MAT}>
          <boxGeometry args={[0.04, 0.04, 0.005]} />
        </mesh>
      </group>
    </group>
  )
}
