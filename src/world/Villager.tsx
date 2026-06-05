import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { VillagerState, VillagerStateName } from './villagerStore'
import { isFrozen } from './pauseStore'
import { getCity, subscribeCity } from './cityStore'
import { findPath } from './pathfinding'
import { getPlayer } from './playerStore'
import { cullVisible, isCulled } from './cull'
import { isInsideCastle } from './cityPlan'
import { getAliveOrks, damageOrk } from './orkStore'
import { getAliveBears, damageBear } from './bearStore'
import { wallBetween } from './houseBlockers'
import { getPhase } from './gameStore'
import { spawnFloat } from './fxStore'
import { playVillagerGrunt, playSwing, playHit } from '../audio/sfx'
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
// Guard's sword (shown on armoured castle villagers).
const SWORD_BLADE = new THREE.MeshStandardMaterial({ color: '#d8dde6', roughness: 0.3, metalness: 0.8, flatShading: true })
const SWORD_GUARD = new THREE.MeshStandardMaterial({ color: '#caa23a', roughness: 0.5, metalness: 0.6 })
// Recruited mercenaries wear a green heraldic tabard so the player can pick out
// the warriors they hired (from traders) among the native townsfolk.
const TABARD_MAT = new THREE.MeshStandardMaterial({ color: '#2f7a44', roughness: 0.9, flatShading: true })
const TABARD_TRIM = new THREE.MeshStandardMaterial({ color: '#e8d27a', roughness: 0.6, metalness: 0.3, flatShading: true })

const SPEED = 1.6
const WANDER_RADIUS = 3.0
const ARRIVE_DIST = 0.35
const WAYPOINT_DIST = 0.4
const PATH_RECOMPUTE = 0.8 // seconds between A* refreshes while moving
const DOOR_OPEN_DURATION = 1.8 // door stays open this long when entering/leaving

// ─── Guard combat (deal-damage-only; villagers are invulnerable) ─────────────
// Castle-dwelling villagers act as town guards: they break off their daily
// routine to chase and strike any ork/bear that wanders near, but never take
// damage themselves. Armour (Defense upgrade) makes them braver + hit harder.
// Both aggro and damage scale with the villager-arms tier (Defense branch) so
// EACH tier is a real upgrade: tier 1 (Town Guard Arms), tier 2 (Veteran Guard).
const GUARD_AGGRO = 7.5 // base detection range
const GUARD_AGGRO_PER_TIER = 3.5 // armed guards spot + engage from farther (t1→11, t2→14.5)
const GUARD_DEFEND_RADIUS = 12 // won't chase a foe farther than this from home
const GUARD_MELEE = 1.45
const GUARD_SPEED = 2.4 // chase faster than a stroll
const GUARD_ATTACK_DURATION = 0.55
const GUARD_ATTACK_COOLDOWN = 1.0
const GUARD_DAMAGE = 9 // base hit
const GUARD_DAMAGE_PER_TIER = 7 // each arms tier hits harder (t1→16, t2→23)

interface Foe {
  x: number
  y: number
  z: number
  /** apply damage; returns true if the foe died on this hit */
  hit: (dmg: number, now: number) => boolean
}

/** Nearest alive ork/bear within `aggro` of the villager AND within
 *  `defendR` of their home. Returns null if nothing worth fighting. */
function nearestHostile(v: VillagerState, defendR: number, aggro: number): Foe | null {
  let best: Foe | null = null
  let bestD = aggro
  for (const o of getAliveOrks()) {
    const d = Math.hypot(o.x - v.x, o.z - v.z)
    if (d < bestD && Math.hypot(o.x - v.homeX, o.z - v.homeZ) < defendR && !wallBetween(v.x, v.z, o.x, o.z)) {
      bestD = d
      best = { x: o.x, y: o.y, z: o.z, hit: (dmg, now) => damageOrk(o, dmg, now) }
    }
  }
  for (const b of getAliveBears()) {
    const d = Math.hypot(b.x - v.x, b.z - v.z)
    if (d < bestD && Math.hypot(b.x - v.homeX, b.z - v.homeZ) < defendR && !wallBetween(v.x, v.z, b.x, b.z)) {
      bestD = d
      best = { x: b.x, y: b.y, z: b.z, hit: (dmg, now) => damageBear(b, dmg, now) }
    }
  }
  return best
}

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

  // Castle-dwelling villagers double as town guards (see nearestHostile).
  const isGuard = useMemo(() => isInsideCastle(state.homeX, state.homeZ), [state.homeX, state.homeZ])
  const wasFighting = useRef(false)

  useFrame(({ clock }, dt) => {
    if (isFrozen()) return
    const tNow = clock.getElapsedTime()

    // Distance cull: far villagers are fog-hidden — hide AND freeze their matrix
    // (cullVisible flips matrixWorldAutoUpdate off so three skips the subtree),
    // then skip update work.
    if (ref.current && isCulled(state.x, state.z)) {
      cullVisible(ref.current, true)
      return
    }
    if (ref.current) cullVisible(ref.current, false)

    // Downed by orks → lie still on the spot until revived at the next prep.
    if (state.downed) {
      if (ref.current) {
        ref.current.visible = true
        ref.current.position.set(state.x, state.y, state.z)
        ref.current.rotation.set(0, state.facing, Math.PI / 2)
      }
      return
    }

    // ── Guard combat: defend the castle from orks/bears (deal-damage-only) ──
    let attackArm: number | null = null
    let fighting = false
    if (isGuard) {
      const waveActive = getPhase() === 'wave'
      const defendR = GUARD_DEFEND_RADIUS * (waveActive ? 1.8 : 1)
      const aggro = GUARD_AGGRO + armorTier * GUARD_AGGRO_PER_TIER
      const foe = nearestHostile(state, defendR, aggro)
      if (foe) {
        fighting = true
        const dx = foe.x - state.x
        const dz = foe.z - state.z
        const dist = Math.hypot(dx, dz)
        // Face the foe.
        let df = Math.atan2(dx, dz) - state.facing
        while (df > Math.PI) df -= 2 * Math.PI
        while (df < -Math.PI) df += 2 * Math.PI
        state.facing += df * Math.min(1, dt * 9)

        const attacking = state.attackingSince > 0
        const inMelee = dist < GUARD_MELEE
        // Force an immediate path refresh when first engaging.
        if (!wasFighting.current) {
          state.path = []
          state.pathRecomputeAt = 0
        }
        if (!attacking && inMelee && tNow >= state.attackReadyAt) {
          state.attackingSince = tNow
          state.attackHitDealt = false
          // NPC combat fades with distance and is capped below the hero's own
          // swing, so a fight across the field doesn't blast at full volume.
          const pd = Math.hypot(getPlayer().x - state.x, getPlayer().z - state.z)
          playSwing(Math.max(0, 1 - pd / 16) * 0.7)
        }
        // Chase the foe, or hold ground once in melee.
        state.targetX = inMelee ? state.x : foe.x
        state.targetZ = inMelee ? state.z : foe.z
        // Resolve an in-progress swing — deal damage mid-strike.
        if (attacking) {
          const phase = (tNow - state.attackingSince) / GUARD_ATTACK_DURATION
          if (phase >= 1) {
            state.attackingSince = 0
            state.attackReadyAt = tNow + GUARD_ATTACK_COOLDOWN
          } else {
            attackArm = phase < 0.4 ? -1.6 * (phase / 0.4) : -1.6 + 2.4 * ((phase - 0.4) / 0.6)
            if (!state.attackHitDealt && phase >= 0.5) {
              state.attackHitDealt = true
              if (dist <= GUARD_MELEE + 0.4) {
                const dmg = GUARD_DAMAGE + armorTier * GUARD_DAMAGE_PER_TIER
                foe.hit(dmg, tNow)
                const pd = Math.hypot(getPlayer().x - state.x, getPlayer().z - state.z)
                playHit(Math.max(0, 1 - pd / 16) * 0.7)
                spawnFloat(`-${dmg}`, '#ffe6a8', foe.x, foe.y + 2.0, foe.z)
              }
            }
          }
        }
      }
    }
    wasFighting.current = fighting

    if (!fighting) tickStateMachine(state, tNow)

    // Proximity murmur: grunt when the player lingers nearby (not mid-fight).
    if (!fighting && state.state !== 'home' && tNow >= nextVoiceAt.current) {
      const p = getPlayer()
      if (Math.hypot(p.x - state.x, p.z - state.z) < VOICE_RANGE) {
        villagerVoice(state.seed)
        nextVoiceAt.current = tNow + VOICE_COOLDOWN + Math.random() * 4
      } else {
        // Re-check soon without resetting the full cooldown.
        nextVoiceAt.current = tNow + 0.7
      }
    }

    // Inside the house: hide + skip movement (but a guard always comes out).
    const inside = !fighting && state.state === 'home'
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
          const step = Math.min((fighting ? GUARD_SPEED : SPEED) * dt, dist)
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

    // While fighting, drop the daily-task poses so the sword-arm chop reads.
    if (fighting) {
      bodyTilt = 0
      armOverride = null
    }

    if (ref.current) {
      ref.current.position.set(state.x, state.y, state.z)
      ref.current.rotation.y = state.facing
      ref.current.rotation.z = 0 // clear any lie-down tilt after a revive
    }
    if (bodyRef.current) bodyRef.current.rotation.x = bodyTilt
    if (legRRef.current) legRRef.current.rotation.x = legSwing
    if (legLRef.current) legLRef.current.rotation.x = -legSwing
    if (armRRef.current) armRRef.current.rotation.x = attackArm ?? armOverride ?? -armSwing
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
        {/* Recruited mercenary's tabard — front + back panel with gold trim,
            worn over whatever tunic/armour they have. */}
        {state.recruited && (
          <>
            <mesh position={[0, -0.02, 0.15]} castShadow material={TABARD_MAT}>
              <boxGeometry args={[0.34, 0.5, 0.04]} />
            </mesh>
            <mesh position={[0, -0.02, -0.15]} castShadow material={TABARD_MAT}>
              <boxGeometry args={[0.34, 0.5, 0.04]} />
            </mesh>
            <mesh position={[0, -0.26, 0.16]} material={TABARD_TRIM}>
              <boxGeometry args={[0.34, 0.05, 0.03]} />
            </mesh>
          </>
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
        {/* Guard's sword — brandished forward from the fist (armour tier 1+) */}
        {armorTier > 0 && (
          <group position={[0, -0.46, 0.1]}>
            <mesh position={[0, 0, 0]} material={SWORD_GUARD}>
              <boxGeometry args={[0.18, 0.06, 0.05]} />
            </mesh>
            <mesh position={[0, 0, 0.32]} castShadow material={SWORD_BLADE}>
              <boxGeometry args={[0.05, 0.06, 0.5]} />
            </mesh>
          </group>
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
