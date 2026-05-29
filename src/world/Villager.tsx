import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { VillagerState, VillagerStateName } from './villagerStore'
import { isFrozen } from './pauseStore'
import { getCity, subscribeCity } from './cityStore'
import { findPath } from './pathfinding'
import { getPlayer } from './playerStore'
import { isCulled } from './cull'
import { playVillagerGrunt } from '../audio/sfx'
import { hasBuffer, playSfx } from '../audio/audio'

const VOICE_RANGE = 5 // murmur when the player is within this many tiles
const VOICE_COOLDOWN = 6 // min seconds between a villager's grunts
// Drop your own free clips at these paths to override the synthesized voice.
const VOICE_FILES = ['/audio/villager1.mp3', '/audio/villager2.mp3', '/audio/villager3.mp3']

/** Murmur near the player — uses a dropped-in clip if available, else synth. */
function villagerVoice(seed: number): void {
  const file = VOICE_FILES[Math.floor(Math.abs(seed) * 7) % VOICE_FILES.length]
  if (hasBuffer(file)) void playSfx(file, 0.5, 0.08)
  else playVillagerGrunt()
}

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
// Armour from the Defense upgrade branch. Tier 1 = iron, tier 2+ = brighter steel.
const ARMOR_IRON = new THREE.MeshStandardMaterial({ color: '#9aa0aa', roughness: 0.5, metalness: 0.7, flatShading: true })
const ARMOR_STEEL = new THREE.MeshStandardMaterial({ color: '#c6ccd6', roughness: 0.35, metalness: 0.85, flatShading: true })

const SPEED = 1.6
const WANDER_RADIUS = 3.0
const ARRIVE_DIST = 0.35
const WAYPOINT_DIST = 0.4
const PATH_RECOMPUTE = 0.8 // seconds between A* refreshes while moving
const DOOR_OPEN_DURATION = 1.8 // door stays open this long when entering/leaving

/** Decide which "mode" the villager should be in given the day phase.  */
function scheduledMode(t: number): VillagerStateName {
  const dayPhase = (t / 60) % 1
  if (dayPhase < 0.4) return 'tend'
  if (dayPhase < 0.6) return 'wander'
  if (dayPhase < 0.65) return 'rest' // travelling to door
  return 'home' // inside the house
}

function nextWanderPoint(v: VillagerState, t: number): { x: number; z: number } {
  const ang = (Math.sin(v.id * 12.9898 + t * 0.31) * 43758.5453) % (Math.PI * 2)
  const r = WANDER_RADIUS * (0.4 + Math.abs(Math.sin(t * 0.17 + v.id)) * 0.6)
  return { x: v.homeX + Math.cos(ang) * r, z: v.homeZ + Math.sin(ang) * r }
}

function enterState(v: VillagerState, name: VillagerStateName, t: number, duration: number) {
  if (v.state !== name) {
    // Trigger door open on entering/leaving 'home'
    if (name === 'home' || v.state === 'home') {
      v.doorOpenUntil = t + DOOR_OPEN_DURATION
    }
  }
  v.state = name
  v.stateSince = t
  v.stateUntil = t + duration
  v.path = []
  v.pathIndex = 0
  v.pathRecomputeAt = 0
}

function tickStateMachine(v: VillagerState, t: number): void {
  if (t < v.stateUntil) return
  const want = scheduledMode(t)
  switch (want) {
    case 'tend': {
      v.targetX = v.gardenX + Math.sin(v.seed + t * 0.5) * 0.4
      v.targetZ = v.gardenZ + Math.cos(v.seed + t * 0.7) * 0.4
      enterState(v, 'tend', t, 3.5 + Math.random() * 2)
      break
    }
    case 'wander': {
      const wp = nextWanderPoint(v, t)
      v.targetX = wp.x
      v.targetZ = wp.z
      enterState(v, 'wander', t, 4 + Math.random() * 3)
      break
    }
    case 'rest': {
      v.targetX = v.doorX
      v.targetZ = v.doorZ
      enterState(v, 'rest', t, 2 + Math.random() * 1.5)
      break
    }
    case 'home': {
      v.targetX = v.doorX
      v.targetZ = v.doorZ
      enterState(v, 'home', t, 6 + Math.random() * 4)
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
  const nextVoiceAt = useRef(2 + Math.abs(state.seed) * 3)

  // Global villager armour tier (Defense upgrade branch).
  const [armorTier, setArmorTier] = useState(() => getCity().villagerArmorTier)
  useEffect(() => subscribeCity((s) => setArmorTier(s.villagerArmorTier)), [])
  const armorMat = armorTier >= 2 ? ARMOR_STEEL : ARMOR_IRON

  useFrame(({ clock }, dt) => {
    if (isFrozen()) return
    const tNow = clock.getElapsedTime()

    // Distance cull: far villagers are fog-hidden — hide + skip update work.
    if (ref.current && isCulled(state.x, state.z)) {
      if (ref.current.visible) ref.current.visible = false
      return
    }

    tickStateMachine(state, tNow)

    // Proximity murmur: grunt when the player lingers nearby, on a cooldown.
    if (state.state !== 'home' && tNow >= nextVoiceAt.current) {
      const p = getPlayer()
      if (Math.hypot(p.x - state.x, p.z - state.z) < VOICE_RANGE) {
        villagerVoice(state.seed)
        nextVoiceAt.current = tNow + VOICE_COOLDOWN + Math.random() * 4
      } else {
        // Re-check soon without resetting the full cooldown.
        nextVoiceAt.current = tNow + 0.7
      }
    }

    // Inside the house: hide and skip movement.
    const inside = state.state === 'home'
    if (ref.current) ref.current.visible = !inside

    let moving = false
    if (!inside) {
      // Refresh A* path on a timer or when stale.
      if (
        tNow >= state.pathRecomputeAt ||
        state.path.length === 0 ||
        state.pathIndex >= state.path.length
      ) {
        state.path = findPath(
          { x: state.x, z: state.z },
          { x: state.targetX, z: state.targetZ },
        )
        state.pathIndex = 0
        state.pathRecomputeAt = tNow + PATH_RECOMPUTE
      }

      // Skip arrived waypoints.
      while (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        if (Math.hypot(wp.x - state.x, wp.z - state.z) < WAYPOINT_DIST) {
          state.pathIndex++
        } else break
      }

      // Pick current step target — next waypoint, or final target if path empty.
      let stepTargetX = state.targetX
      let stepTargetZ = state.targetZ
      if (state.pathIndex < state.path.length) {
        stepTargetX = state.path[state.pathIndex].x
        stepTargetZ = state.path[state.pathIndex].z
      }
      const dxFinal = state.targetX - state.x
      const dzFinal = state.targetZ - state.z
      const distFinal = Math.hypot(dxFinal, dzFinal)
      if (distFinal > ARRIVE_DIST) {
        const dx = stepTargetX - state.x
        const dz = stepTargetZ - state.z
        const dist = Math.hypot(dx, dz)
        if (dist > 0.0001) {
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
      }
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
        bodyTilt = 0.35
        armOverride = -0.6 + Math.sin(tNow * 4) * 0.5
      } else if (state.state === 'rest') {
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
      headRef.current.rotation.y =
        Math.sin(tNow * 0.7 + state.seed) * 0.18 * (moving ? 0 : 1)
    }
  })

  return (
    <group ref={ref} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={0.55}>
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

      <group ref={bodyRef} position={[0, 0.7, 0]}>
        <mesh castShadow material={tunicMat}>
          <boxGeometry args={[0.42, 0.48, 0.26]} />
        </mesh>
        {/* Chestplate (armour tier 1+) */}
        {armorTier > 0 && (
          <mesh castShadow material={armorMat}>
            <boxGeometry args={[0.46, 0.4, 0.3]} />
          </mesh>
        )}
      </group>

      <group ref={armRRef} position={[0.27, 0.92, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={tunicMat}>
          <boxGeometry args={[0.13, 0.36, 0.22]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.1, 0.2]} />
        </mesh>
        {/* Pauldron (armour tier 2+) */}
        {armorTier >= 2 && (
          <mesh position={[0, 0.02, 0]} castShadow material={armorMat}>
            <boxGeometry args={[0.18, 0.16, 0.26]} />
          </mesh>
        )}
      </group>
      <group ref={armLRef} position={[-0.27, 0.92, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={tunicMat}>
          <boxGeometry args={[0.13, 0.36, 0.22]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.1, 0.2]} />
        </mesh>
        {armorTier >= 2 && (
          <mesh position={[0, 0.02, 0]} castShadow material={armorMat}>
            <boxGeometry args={[0.18, 0.16, 0.26]} />
          </mesh>
        )}
      </group>

      <group ref={headRef} position={[0, 1.12, 0]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
        </mesh>
        <mesh position={[0, 0.13, 0]} castShadow material={HAIR_MAT}>
          <boxGeometry args={[0.31, 0.08, 0.31]} />
        </mesh>
        {/* Helmet (armour tier 1+) replaces the peasant hat */}
        {armorTier > 0 ? (
          <>
            <mesh position={[0, 0.16, 0]} castShadow material={armorMat}>
              <boxGeometry args={[0.34, 0.16, 0.34]} />
            </mesh>
            {armorTier >= 2 && (
              <mesh position={[0, 0.28, 0]} castShadow material={armorMat}>
                <coneGeometry args={[0.12, 0.16, 6]} />
              </mesh>
            )}
          </>
        ) : (
          state.id % 2 === 0 && (
            <mesh position={[0, 0.22, 0]} castShadow material={HAT_MAT}>
              <coneGeometry args={[0.22, 0.2, 6]} />
            </mesh>
          )
        )}
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
