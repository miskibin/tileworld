import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { tileAt, tileTopY } from './tileMap'
import { obstacleCollidesAt, findSpawnNear } from './obstacles'
import { houseBlocksAt } from './houseBlockers'
import { bridgeAt } from './bridges'
import { findPath } from './pathfinding'
import { isFrozen } from './pauseStore'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'
import { createBear, getBears, resetBears, type BearState } from './bearStore'
import { playBearRoar, playBearGrowl } from '../audio/sfx'
import { isCulled } from './cull'

const BEAR_AGGRO = 6.5 // turns hostile within this range
const BEAR_LEASH = 14 // gives up chase past this
const BEAR_MELEE = 1.7
const BEAR_SPEED = 2.6 // faster than the player's walk, slower than sprint
const BEAR_WANDER_SPEED = 0.9
const BEAR_TURN = 7
const BEAR_ATTACK_DURATION = 0.7
const BEAR_ATTACK_COOLDOWN = 1.3
const BEAR_ATTACK_DAMAGE = 22 // hits harder than an ork
const ROAR_COOLDOWN = 4
const BEAR_PATH_RECOMPUTE = 0.5 // seconds between A* refreshes while chasing
const BEAR_WAYPOINT_RADIUS = 0.5

const FUR = new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1, flatShading: true })
const FUR_DARK = new THREE.MeshStandardMaterial({ color: '#3e2c20', roughness: 1, flatShading: true })
const SNOUT = new THREE.MeshStandardMaterial({ color: '#caa980', roughness: 0.9 })
const NOSE = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.5 })
const CLAW = new THREE.MeshStandardMaterial({ color: '#e8e0cc', roughness: 0.6 })
const EYE = new THREE.MeshStandardMaterial({ color: '#1a1008', roughness: 0.4 })

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_FG = new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_BAR_W = 1.0
const HP_BAR_H = 0.09

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

function BearView({ state }: { state: BearState }) {
  const groupRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const lfRef = useRef<THREE.Group>(null!)
  const rfRef = useRef<THREE.Group>(null!)
  const lbRef = useRef<THREE.Group>(null!)
  const rbRef = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const billboardRef = useRef<THREE.Group>(null!)
  const [visible, setVisible] = useState(true)
  const deadFadeFrom = useRef<number | null>(null)

  const rand = useMemo(() => {
    let s = Math.floor(state.seed * 2237) >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }, [state.seed])

  useFrame(({ clock }, dtFrame) => {
    if (isFrozen()) return
    const tNow = clock.getElapsedTime()
    const t = tNow + state.seed
    const dt = Math.min(0.05, dtFrame)
    const g = groupRef.current
    if (!g) return

    // Distance cull: far bears are fog-hidden — hide + skip AI/animation work.
    if (state.hp > 0 && isCulled(state.x, state.z)) {
      if (g.visible) g.visible = false
      return
    } else if (!g.visible) {
      g.visible = true
    }

    // Death fade
    if (state.hp <= 0) {
      if (deadFadeFrom.current === null) deadFadeFrom.current = tNow
      const elapsed = tNow - deadFadeFrom.current
      const opacity = Math.max(0, 1 - elapsed / 1.5)
      const sink = Math.min(0.5, elapsed * 0.3)
      g.position.set(state.x, state.y - sink, state.z)
      g.rotation.z = Math.min(Math.PI / 2, elapsed * 2)
      if (opacity <= 0 && visible) setVisible(false)
      if (billboardRef.current) billboardRef.current.visible = false
      return
    }

    const player = getPlayer()
    const vx = player.x - state.x
    const vz = player.z - state.z
    const dist = Math.hypot(vx, vz)

    // Aggro toggling: wake within range, give up past the leash.
    if (!state.aggro && dist < BEAR_AGGRO && isPlayerAlive()) {
      state.aggro = true
      if (tNow - state.lastRoarAt > ROAR_COOLDOWN) {
        state.lastRoarAt = tNow
        playBearRoar(dist)
      }
    } else if (state.aggro && (dist > BEAR_LEASH || !isPlayerAlive())) {
      state.aggro = false
    }

    const attacking = state.attackingSince > 0
    const inMelee = dist < BEAR_MELEE && isPlayerAlive()
    let moving = false

    // Face the player when hostile.
    if (state.aggro || attacking) {
      state.facing = lerpAngle(state.facing, Math.atan2(vx, vz), Math.min(1, dt * BEAR_TURN))
    }

    // Start a swing in melee.
    if (!attacking && state.aggro && inMelee && tNow >= state.attackReadyAt) {
      state.attackingSince = tNow
      state.attackHitDealt = false
      playBearGrowl(dist)
    }

    // Chase (hostile) or wander (passive).
    const moveToward = (tx: number, tz: number, speed: number) => {
      const dx = tx - state.x
      const dz = tz - state.z
      const len = Math.hypot(dx, dz)
      if (len < 0.001) return false
      const step = speed * dt
      const nx = state.x + (dx / len) * step
      const nz = state.z + (dz / len) * step
      // Bridges have no land tile beneath, so accept either solid ground OR a
      // bridge span — otherwise the bear wedges on bridges (see screenshot).
      const standable = (sx: number, sz: number) =>
        tileAt(Math.floor(sx), Math.floor(sz)) !== null || bridgeAt(sx, sz) !== null
      const okX =
        standable(nx, state.z) &&
        !obstacleCollidesAt(nx, state.z, state.collisionRadius) &&
        !houseBlocksAt(nx, state.z)
      const okZ =
        standable(state.x, nz) &&
        !obstacleCollidesAt(state.x, nz, state.collisionRadius) &&
        !houseBlocksAt(state.x, nz)
      if (okX) state.x = nx
      if (okZ) state.z = nz
      // Track bridge surface height so the bear rides the deck, not the gorge floor.
      const br = bridgeAt(state.x, state.z)
      if (br) state.y = br.y
      return okX || okZ
    }

    if (state.aggro && !inMelee && !attacking) {
      // Chase via A* so the bear routes around trees/walls instead of wedging.
      if (
        tNow >= state.pathRecomputeAt ||
        state.path.length === 0 ||
        state.pathIndex >= state.path.length
      ) {
        state.path = findPath({ x: state.x, z: state.z }, { x: player.x, z: player.z })
        state.pathIndex = 0
        state.pathRecomputeAt = tNow + BEAR_PATH_RECOMPUTE
      }
      while (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        if (Math.hypot(wp.x - state.x, wp.z - state.z) < BEAR_WAYPOINT_RADIUS) state.pathIndex++
        else break
      }
      // Follow the next waypoint, or close the final gap directly when adjacent.
      const wp = state.pathIndex < state.path.length ? state.path[state.pathIndex] : { x: player.x, z: player.z }
      const moved = moveToward(wp.x, wp.z, BEAR_SPEED)
      moving = moved
      if (!moved) state.pathRecomputeAt = 0 // stuck — recompute next frame
    } else if (!state.aggro) {
      if (!state.target && tNow >= state.idleUntil) {
        for (let i = 0; i < 10; i++) {
          const a = rand() * Math.PI * 2
          const r = 2 + rand() * 5
          const nx = state.x + Math.cos(a) * r
          const nz = state.z + Math.sin(a) * r
          const tile = tileAt(Math.floor(nx), Math.floor(nz))
          if (tile && tile.height < 2) {
            state.target = { x: nx, z: nz }
            break
          }
        }
      }
      if (state.target) {
        if (Math.hypot(state.target.x - state.x, state.target.z - state.z) < 0.4) {
          state.target = null
          state.idleUntil = tNow + 2 + rand() * 4
        } else {
          moving = moveToward(state.target.x, state.target.z, BEAR_WANDER_SPEED)
          state.facing = lerpAngle(state.facing, Math.atan2(state.target.x - state.x, state.target.z - state.z), Math.min(1, dt * 4))
        }
      }
    }
    state.moving = moving

    const tile = tileAt(Math.floor(state.x), Math.floor(state.z))
    if (tile) state.y = tileTopY(Math.floor(state.x), Math.floor(state.z))

    // Resolve swing — deal damage mid-strike.
    let attackArm = 0
    if (attacking) {
      const phase = (tNow - state.attackingSince) / BEAR_ATTACK_DURATION
      if (phase >= 1) {
        state.attackingSince = 0
        state.attackReadyAt = tNow + BEAR_ATTACK_COOLDOWN
      } else {
        attackArm = phase < 0.5 ? -1.4 * (phase / 0.5) : -1.4 + 2.0 * ((phase - 0.5) / 0.5)
        if (!state.attackHitDealt && phase >= 0.5) {
          state.attackHitDealt = true
          if (dist <= BEAR_MELEE + 0.3 && isPlayerAlive())
            damagePlayer(BEAR_ATTACK_DAMAGE, tNow, state.x, state.z)
        }
      }
    }

    // Place + animate.
    g.position.set(state.x, state.y, state.z)
    g.rotation.y = state.facing
    const hurtRemain = state.hurtFlashUntil - tNow
    g.rotation.x = hurtRemain > 0 ? -Math.max(0, hurtRemain / 0.25) * 0.25 : 0

    const gait = moving ? (state.aggro ? 11 : 6) : 0
    const swing = gait > 0 ? Math.sin(t * gait) * 0.6 : Math.sin(t * 0.8) * 0.04
    if (lfRef.current) lfRef.current.rotation.x = attacking ? attackArm : swing
    if (rfRef.current) rfRef.current.rotation.x = attacking ? attackArm : -swing
    if (lbRef.current) lbRef.current.rotation.x = -swing
    if (rbRef.current) rbRef.current.rotation.x = swing
    if (headRef.current) {
      headRef.current.rotation.x = state.aggro ? 0.12 : Math.sin(t * 0.5) * 0.1
      headRef.current.rotation.y = state.aggro ? 0 : Math.sin(t * 0.4) * 0.3
    }
    if (moving) g.position.y = state.y + Math.abs(Math.sin(t * gait)) * 0.05

    // Tint fur on hurt.
    const hurting = tNow < state.hurtFlashUntil
    FUR.color.set(hurting ? '#9a5530' : '#5a4030')

    // HP bar.
    if (billboardRef.current) {
      const show = state.hp < state.maxHp
      billboardRef.current.visible = show
      if (show && hpFgRef.current) {
        const ratio = Math.max(0, state.hp / state.maxHp)
        hpFgRef.current.scale.x = HP_BAR_W * ratio
        hpFgRef.current.position.x = -((1 - ratio) * HP_BAR_W) / 2
        ;(hpFgRef.current.material as THREE.MeshBasicMaterial).color.set(hurting ? '#ffaa20' : '#d63a3a')
      }
    }
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={0.6}>
      {/* Body */}
      <mesh position={[0, 0.7, 0]} castShadow material={FUR}>
        <boxGeometry args={[0.7, 0.6, 1.1]} />
      </mesh>
      <mesh position={[0, 0.95, -0.05]} castShadow material={FUR}>
        <boxGeometry args={[0.66, 0.4, 0.7]} />
      </mesh>
      {/* Head */}
      <group ref={headRef} position={[0, 0.95, 0.6]}>
        <mesh castShadow material={FUR}>
          <boxGeometry args={[0.5, 0.46, 0.46]} />
        </mesh>
        <mesh position={[0, -0.08, 0.28]} material={SNOUT}>
          <boxGeometry args={[0.26, 0.22, 0.22]} />
        </mesh>
        <mesh position={[0, -0.04, 0.4]} material={NOSE}>
          <boxGeometry args={[0.12, 0.09, 0.06]} />
        </mesh>
        <mesh position={[-0.18, 0.26, -0.02]} material={FUR_DARK}>
          <boxGeometry args={[0.16, 0.16, 0.1]} />
        </mesh>
        <mesh position={[0.18, 0.26, -0.02]} material={FUR_DARK}>
          <boxGeometry args={[0.16, 0.16, 0.1]} />
        </mesh>
        <mesh position={[-0.12, 0.05, 0.23]} material={EYE}>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
        </mesh>
        <mesh position={[0.12, 0.05, 0.23]} material={EYE}>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
        </mesh>
      </group>
      {/* Legs (pivot at hip) */}
      <group ref={lfRef} position={[-0.24, 0.5, 0.4]}>
        <mesh position={[0, -0.26, 0]} castShadow material={FUR_DARK}>
          <boxGeometry args={[0.22, 0.5, 0.24]} />
        </mesh>
        <mesh position={[0, -0.52, 0.06]} material={CLAW}>
          <boxGeometry args={[0.22, 0.06, 0.1]} />
        </mesh>
      </group>
      <group ref={rfRef} position={[0.24, 0.5, 0.4]}>
        <mesh position={[0, -0.26, 0]} castShadow material={FUR_DARK}>
          <boxGeometry args={[0.22, 0.5, 0.24]} />
        </mesh>
        <mesh position={[0, -0.52, 0.06]} material={CLAW}>
          <boxGeometry args={[0.22, 0.06, 0.1]} />
        </mesh>
      </group>
      <group ref={lbRef} position={[-0.24, 0.5, -0.4]}>
        <mesh position={[0, -0.26, 0]} castShadow material={FUR_DARK}>
          <boxGeometry args={[0.24, 0.5, 0.26]} />
        </mesh>
      </group>
      <group ref={rbRef} position={[0.24, 0.5, -0.4]}>
        <mesh position={[0, -0.26, 0]} castShadow material={FUR_DARK}>
          <boxGeometry args={[0.24, 0.5, 0.26]} />
        </mesh>
      </group>

      {/* HP bar */}
      <group ref={billboardRef} position={[0, 2.1, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_BAR_W + 0.06, HP_BAR_H + 0.03, 1]} />
          <mesh ref={hpFgRef} material={HP_BAR_FG} geometry={HP_BAR_GEO} position={[0, 0, 0.001]} scale={[HP_BAR_W, HP_BAR_H, 1]} />
        </Billboard>
      </group>
    </group>
  )
}

const BEAR_SPAWNS: Array<{ pos: [number, number]; seed: number }> = [
  { pos: [16, 18], seed: 1.3 },
  { pos: [82, 60], seed: 4.1 },
  { pos: [70, 14], seed: 6.7 },
  // Out in the newly expanded wilds (spawns auto-snap to valid land).
  { pos: [10, 56], seed: 8.2 },
  { pos: [90, 52], seed: 2.9 },
  { pos: [38, 64], seed: 5.5 },
  // Frontier bears roaming the new eastern / southern lands.
  { pos: [104, 58], seed: 9.4 },
  { pos: [70, 84], seed: 11.6 },
  { pos: [108, 78], seed: 3.7 },
]

export function Bears() {
  const [bears, setBears] = useState<BearState[]>([])
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetBears()
      setBears(
        BEAR_SPAWNS.map((b) => {
          const s = findSpawnNear(b.pos[0], b.pos[1])
          return createBear(s.x, s.z, b.seed)
        }),
      )
    })
    return () => {
      cancelAnimationFrame(handle)
      resetBears()
    }
  }, [])
  void getBears
  return (
    <group>
      {bears.map((b) => (
        <BearView key={b.id} state={b} />
      ))}
    </group>
  )
}
