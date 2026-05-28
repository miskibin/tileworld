import { useRef, useMemo, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { tileAt } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { useKeyboard } from './useKeyboard'
import { playSfx } from '../audio/audio'
import { damageDog, getAliveDogs } from './dogStore'
import { damageOrk, getAliveOrks, orkCollidesAt } from './orkStore'
import { bridgeAt } from './bridges'
import {
  getPlayer,
  PLAYER_RESPAWN_DELAY,
  PLAYER_SPAWN,
  respawnPlayer,
  setPlayerPos,
} from './playerStore'

const ARMOR = '#d6d8df'
const ARMOR_LIGHT = '#e6e8ed'
const ARMOR_DARK = '#9aa0aa'
const VISOR = '#1a1a22'
const BELT = '#3a2a1a'
const BLADE = '#c0c6d0'
const HILT = '#3a3a40'
const GRIP = '#5a3a22'
const SHIELD_FACE = '#a8b8d0'
const SHIELD_RIM = '#6a3a22'
const SHIELD_EMBLEM = '#d3b14c'

const SPEED = 3.5 // grid units per second
const TURN_RATE = 12 // higher = snappier rotation
const STEP_FREQ = 7 // walk-cycle radians per second
const GRAVITY = 20 // y units / sec^2
const JUMP_SPEED = 6.5 // initial vertical velocity on jump
const PLAYER_RADIUS = 0.22 // collision radius for obstacle blocking
const ATTACK_DURATION = 0.45 // seconds for full swing
const ATTACK_RANGE = 1.8 // grid units reach
const ATTACK_CONE_DOT = 0.5 // cos(60°) — front cone width
const ATTACK_DAMAGE = 25 // hp per swing (dog has 60 → dies in 3)

// Module-level click counter — survives React strict-mode double-mount.
let attackClickCount = 0
if (typeof window !== 'undefined') {
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const t = e.target
    if (t instanceof Element && t.closest('.hud')) return
    attackClickCount++
  })
}

export interface PlayerStateRef {
  x: number
  z: number
  y: number
  moving: boolean
}

interface CharacterProps {
  initial: [number, number, number] // grid x, y, z (inside offset group)
  facing0?: number
  posRef?: MutableRefObject<PlayerStateRef>
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

export function Character({ initial, facing0 = 0, posRef }: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const rightArmRef = useRef<THREE.Group>(null!)
  const leftArmRef = useRef<THREE.Group>(null!)
  const rightLegRef = useRef<THREE.Group>(null!)
  const leftLegRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const swordRef = useRef<THREE.Group>(null!)

  const pos = useRef({ x: initial[0], y: initial[1], z: initial[2] })
  const facing = useRef(facing0)
  const walkPhase = useRef(0)
  const movingAmt = useRef(0) // 0..1 smoothly tracks isMoving
  const velY = useRef(0)
  const onGround = useRef(true)
  const lastStepHalfCycle = useRef(0)

  // Attack state — left-click triggers a single swing.
  const attackProcessed = useRef(0)
  const attacking = useRef(false)
  const attackStart = useRef(0)
  const attackHitDealt = useRef(false)

  const keys = useKeyboard()
  const camera = useThree((s) => s.camera)

  // ─── Materials (memoized) ───────────────────────────────────────
  const armorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ARMOR, roughness: 0.65, metalness: 0.25 }), [])
  const armorLightMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ARMOR_LIGHT, roughness: 0.6, metalness: 0.3 }), [])
  const armorDarkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ARMOR_DARK, roughness: 0.75, metalness: 0.2 }), [])
  const visorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: VISOR, roughness: 0.4, metalness: 0.6 }), [])
  const beltMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BELT, roughness: 1 }), [])
  const bladeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BLADE, roughness: 0.25, metalness: 0.85 }), [])
  const hiltMat = useMemo(() => new THREE.MeshStandardMaterial({ color: HILT, roughness: 0.6, metalness: 0.5 }), [])
  const gripMat = useMemo(() => new THREE.MeshStandardMaterial({ color: GRIP, roughness: 1 }), [])
  const shieldFaceMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIELD_FACE, roughness: 0.5, metalness: 0.3 }), [])
  const shieldRimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIELD_RIM, roughness: 0.9 }), [])
  const shieldEmblemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIELD_EMBLEM, roughness: 0.5, metalness: 0.6 }), [])

  // Cached working vectors (avoid per-frame allocation).
  const camFwd = useMemo(() => new THREE.Vector3(), [])
  const camRight = useMemo(() => new THREE.Vector3(), [])
  const moveDir = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const tNow = performance.now() * 0.001
    const player = getPlayer()

    // ─── Death handling: freeze input, lie down, respawn after delay ──
    if (player.deadSince !== null) {
      const elapsed = tNow - player.deadSince
      if (elapsed >= PLAYER_RESPAWN_DELAY) {
        respawnPlayer()
        pos.current.x = PLAYER_SPAWN.x
        pos.current.y = PLAYER_SPAWN.y
        pos.current.z = PLAYER_SPAWN.z
        velY.current = 0
        onGround.current = true
        facing.current = Math.PI
        attacking.current = false
      } else {
        // Lie-down anim; freeze movement & attack input
        if (groupRef.current) {
          const tilt = Math.min(1, elapsed / 0.6) * (Math.PI / 2)
          groupRef.current.position.set(pos.current.x, pos.current.y, pos.current.z)
          groupRef.current.rotation.set(0, facing.current, tilt)
        }
        setPlayerPos(pos.current.x, pos.current.y, pos.current.z, false)
        // Discard queued attack clicks while dead
        attackProcessed.current = attackClickCount
        return
      }
    }

    const k = keys.current

    // Input → camera-relative move vector
    camera.getWorldDirection(camFwd)
    camFwd.y = 0
    if (camFwd.lengthSq() < 1e-6) camFwd.set(0, 0, -1)
    camFwd.normalize()
    // camRight = camFwd × up (right-handed). With up=(0,1,0): right = (-fz, 0, fx).
    camRight.set(-camFwd.z, 0, camFwd.x)

    const fwdAmt = (k.forward ? 1 : 0) - (k.back ? 1 : 0)
    const rgtAmt = (k.right ? 1 : 0) - (k.left ? 1 : 0)

    moveDir
      .copy(camFwd)
      .multiplyScalar(fwdAmt)
      .addScaledVector(camRight, rgtAmt)

    const moving = moveDir.lengthSq() > 1e-6
    if (moving) moveDir.normalize()

    // Smooth moving amount for anim blending
    const targetMoving = moving ? 1 : 0
    movingAmt.current += (targetMoving - movingAmt.current) * Math.min(1, dt * 10)

    // ─── Apply motion with axis-separated collision (tile + props) ──
    if (moving) {
      const step = SPEED * dt
      const nx = pos.current.x + moveDir.x * step
      const nz = pos.current.z + moveDir.z * step
      const cxFloor = Math.floor(pos.current.x)
      const czFloor = Math.floor(pos.current.z)
      const canMoveX =
        (tileAt(Math.floor(nx), czFloor) !== null || bridgeAt(nx, pos.current.z) !== null) &&
        !obstacleCollidesAt(nx, pos.current.z, PLAYER_RADIUS) &&
        !orkCollidesAt(nx, pos.current.z, PLAYER_RADIUS)
      const canMoveZ =
        (tileAt(cxFloor, Math.floor(nz)) !== null || bridgeAt(pos.current.x, nz) !== null) &&
        !obstacleCollidesAt(pos.current.x, nz, PLAYER_RADIUS) &&
        !orkCollidesAt(pos.current.x, nz, PLAYER_RADIUS)
      if (canMoveX) pos.current.x = nx
      if (canMoveZ) pos.current.z = nz

      // Face movement direction
      const targetFacing = Math.atan2(moveDir.x, moveDir.z)
      facing.current = lerpAngle(facing.current, targetFacing, Math.min(1, dt * TURN_RATE))
    }

    // ─── Vertical: gravity + jump + tile-height ground ──────────
    const onBridge = bridgeAt(pos.current.x, pos.current.z)
    const tileBelow = tileAt(Math.floor(pos.current.x), Math.floor(pos.current.z))
    const groundY = onBridge ? onBridge.y : tileBelow ? tileBelow.height : 0
    if (k.jump && onGround.current) {
      velY.current = JUMP_SPEED
      onGround.current = false
    }
    velY.current -= GRAVITY * dt
    pos.current.y += velY.current * dt
    if (pos.current.y <= groundY) {
      pos.current.y = groundY
      velY.current = 0
      onGround.current = true
    } else {
      onGround.current = false
    }

    // ─── Animation drivers ──────────────────────────────────────
    const t = performance.now() * 0.001
    if (moving) walkPhase.current += dt * STEP_FREQ
    const wp = walkPhase.current
    const m = movingAmt.current

    // Footstep audio — fire on each half walk-cycle (one per leg plant) when moving and grounded
    if (moving && onGround.current) {
      const half = Math.floor(wp / Math.PI)
      if (half !== lastStepHalfCycle.current) {
        lastStepHalfCycle.current = half
        void playSfx('/audio/footstep-stone.mp3', 0.015, 0.12)
      }
    } else {
      lastStepHalfCycle.current = Math.floor(wp / Math.PI)
    }

    // Body bob: small idle sway + step bounce when walking
    const idleBob = Math.sin(t * 1.4) * 0.025
    const walkBob = Math.abs(Math.sin(wp)) * 0.05
    const bobY = idleBob * (1 - m) + walkBob * m

    // Leg swing
    const legSwing = Math.sin(wp) * 0.7 * m
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing

    // Arm swing — opposite to corresponding leg; blend with idle sway when still
    const idleSway = Math.sin(t * 1.1) * 0.08 * (1 - m)
    const armSwing = Math.sin(wp + Math.PI) * 0.55 * m

    // ─── Attack: kick off queued swing ──────────────────────────
    if (!attacking.current && attackClickCount > attackProcessed.current) {
      attackProcessed.current = attackClickCount
      attacking.current = true
      attackStart.current = t
      attackHitDealt.current = false
      void playSfx('/audio/sword-swing.mp3', 0.45, 0.1)
    }

    // Attack drive — horizontal slash that's clearly visible.
    // Override rotations on sword arm + small body twist.
    let attackArmX: number | null = null
    let attackArmY: number | null = null
    let attackArmZ: number | null = null
    let attackSwordZ: number | null = null
    let attackBodyTwist = 0
    if (attacking.current) {
      const phase = (t - attackStart.current) / ATTACK_DURATION
      if (phase >= 1) {
        attacking.current = false
      } else {
        // Lift arm forward through whole swing (sword horizontal).
        // Holding arm out so sword sweeps a wide horizontal arc.
        const liftX = -1.1 // arm rotated up so sword points forward
        if (phase < 0.2) {
          // Windup: ramp lift + swing arm to the RIGHT (cross body)
          const u = phase / 0.2
          attackArmX = liftX * u
          attackArmY = 1.4 * u
          attackBodyTwist = 0.25 * u
        } else if (phase < 0.55) {
          // Strike: snap arm from +Y to -Y, sweeping the blade across
          const u = (phase - 0.2) / 0.35
          attackArmX = liftX
          attackArmY = 1.4 - 2.8 * u
          attackBodyTwist = 0.25 - 0.55 * u
        } else {
          // Return: ease back to neutral
          const u = (phase - 0.55) / 0.45
          attackArmX = liftX * (1 - u)
          attackArmY = -1.4 * (1 - u)
          attackBodyTwist = -0.3 * (1 - u)
        }
        // Slight downward bite on the blade so it angles into target
        attackArmZ = -0.25 * Math.sin(phase * Math.PI)
        // Sword angles around its grip on the strike
        attackSwordZ = 0.5 * Math.sin(phase * Math.PI)

        // Hit at strike start — apply damage once
        if (!attackHitDealt.current && phase >= 0.3) {
          attackHitDealt.current = true
          const fx = Math.sin(facing.current)
          const fz = Math.cos(facing.current)
          let killedAny = false
          for (const dog of getAliveDogs()) {
            const vx = dog.x - pos.current.x
            const vz = dog.z - pos.current.z
            const dist = Math.hypot(vx, vz)
            if (dist > ATTACK_RANGE || dist < 0.001) continue
            const dot = (vx / dist) * fx + (vz / dist) * fz
            if (dot < ATTACK_CONE_DOT) continue
            const died = damageDog(dog, ATTACK_DAMAGE, t)
            if (died) killedAny = true
          }
          for (const ork of getAliveOrks()) {
            const vx = ork.x - pos.current.x
            const vz = ork.z - pos.current.z
            const dist = Math.hypot(vx, vz)
            if (dist > ATTACK_RANGE || dist < 0.001) continue
            const dot = (vx / dist) * fx + (vz / dist) * fz
            if (dot < ATTACK_CONE_DOT) continue
            const died = damageOrk(ork, ATTACK_DAMAGE, t)
            if (died) killedAny = true
          }
          if (killedAny) void playSfx('/audio/sword-swing.mp3', 0.3, 0.05)
        }
      }
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = attackArmX !== null ? attackArmX : armSwing + idleSway
      rightArmRef.current.rotation.y = attackArmY !== null ? attackArmY : 0
      rightArmRef.current.rotation.z = attackArmZ !== null ? attackArmZ : 0
    }
    if (leftArmRef.current) leftArmRef.current.rotation.x = -armSwing - idleSway

    // Head — looks around when idle, stays forward when running
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.4) * 0.18 * (1 - m)
      headRef.current.rotation.x = Math.sin(t * 0.6) * 0.04 * (1 - m)
    }

    // Body breathing scale (idle only)
    if (bodyRef.current) {
      const s = 1 + Math.sin(t * 1.8) * 0.025 * (1 - m)
      bodyRef.current.scale.set(s, 1 + Math.sin(t * 1.8) * 0.015 * (1 - m), s)
      // Lean slightly forward when running
      bodyRef.current.rotation.x = 0.18 * m
    }

    // Sword "tap" cycle — only while idle and not attacking
    if (swordRef.current) {
      if (attackSwordZ !== null) {
        swordRef.current.rotation.x = 0
        swordRef.current.rotation.z = attackSwordZ
      } else {
        let lift = 0
        const cyc = (t % 4) / 4
        if (cyc < 0.2) lift = (cyc / 0.2) * 0.18
        else if (cyc < 0.6) lift = (1 - (cyc - 0.2) / 0.4) * 0.18
        swordRef.current.rotation.x = -lift * (1 - m)
        swordRef.current.rotation.z = 0
      }
    }

    // Apply group transform
    if (groupRef.current) {
      groupRef.current.position.set(pos.current.x, pos.current.y + bobY, pos.current.z)
      // Add tiny facing sway when idle + body twist during attack
      const sway = Math.sin(t * 0.55) * 0.04 * (1 - m)
      groupRef.current.rotation.y = facing.current + sway + attackBodyTwist
    }

    // Publish position to parent for camera follow
    if (posRef) {
      posRef.current.x = pos.current.x
      posRef.current.z = pos.current.z
      posRef.current.y = pos.current.y
      posRef.current.moving = moving
    }
    // Publish to module store so ork AI can read it.
    setPlayerPos(pos.current.x, pos.current.y, pos.current.z, moving)
  })

  return (
    <group ref={groupRef} position={initial} rotation={[0, facing0, 0]} scale={0.5}>
      {/* Legs — each pivots at hip (y=0.36) */}
      <group ref={rightLegRef} position={[0.1, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>
      <group ref={leftLegRef} position={[-0.1, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>

      {/* Belt */}
      <mesh position={[0, 0.4, 0]} castShadow material={beltMat}>
        <boxGeometry args={[0.42, 0.08, 0.22]} />
      </mesh>

      {/* Body (breathes + leans) */}
      <group ref={bodyRef} position={[0, 0.66, 0]}>
        <mesh castShadow material={armorMat}>
          <boxGeometry args={[0.42, 0.46, 0.26]} />
        </mesh>
        <mesh position={[0, 0.04, 0.135]} castShadow material={armorLightMat}>
          <boxGeometry args={[0.32, 0.32, 0.02]} />
        </mesh>
      </group>

      {/* Right arm (sword hand) — pivots at shoulder */}
      <group ref={rightArmRef} position={[0.27, 0.87, 0]}>
        <mesh position={[0, -0.02, 0]} castShadow material={armorLightMat}>
          <boxGeometry args={[0.18, 0.1, 0.28]} />
        </mesh>
        <mesh position={[0, -0.21, 0]} castShadow material={armorMat}>
          <boxGeometry args={[0.12, 0.42, 0.22]} />
        </mesh>
        <mesh position={[0, -0.45, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.13, 0.08, 0.23]} />
        </mesh>
        {/* Sword — held forward in hand, blade extending out front */}
        <group ref={swordRef} position={[0, -0.5, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          {/* Pommel (rear, behind hand) */}
          <mesh position={[0, 0.14, 0]} castShadow material={hiltMat}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
          {/* Grip — wrapped around hand */}
          <mesh position={[0, 0.06, 0]} castShadow material={gripMat}>
            <cylinderGeometry args={[0.03, 0.03, 0.14, 8]} />
          </mesh>
          {/* Crossguard */}
          <mesh position={[0, -0.04, 0]} castShadow material={hiltMat}>
            <boxGeometry args={[0.28, 0.06, 0.08]} />
          </mesh>
          {/* Blade extending forward (down in sword-local = +z after rotation) */}
          <mesh position={[0, -0.42, 0]} castShadow material={bladeMat}>
            <boxGeometry args={[0.08, 0.7, 0.025]} />
          </mesh>
          {/* Blade tip */}
          <mesh position={[0, -0.82, 0]} rotation={[Math.PI, 0, 0]} castShadow material={bladeMat}>
            <coneGeometry args={[0.04, 0.1, 4]} />
          </mesh>
        </group>
      </group>

      {/* Left arm (shield hand) — pivots at shoulder */}
      <group ref={leftArmRef} position={[-0.27, 0.87, 0]}>
        <mesh position={[0, -0.02, 0]} castShadow material={armorLightMat}>
          <boxGeometry args={[0.18, 0.1, 0.28]} />
        </mesh>
        <mesh position={[0, -0.21, 0]} castShadow material={armorMat}>
          <boxGeometry args={[0.12, 0.42, 0.22]} />
        </mesh>
        <mesh position={[0, -0.45, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.13, 0.08, 0.23]} />
        </mesh>
        {/* Shield — kite plate strapped to forearm, faces forward (+Z) */}
        <group position={[-0.04, -0.3, 0.16]}>
          {/* Plate */}
          <mesh castShadow material={shieldFaceMat}>
            <boxGeometry args={[0.34, 0.46, 0.04]} />
          </mesh>
          {/* Rim border (thin frame in front of plate) */}
          <mesh position={[0, 0, 0.022]} material={shieldRimMat}>
            <boxGeometry args={[0.36, 0.48, 0.006]} />
          </mesh>
          {/* Front face inset (so emblem sits on a recessed field) */}
          <mesh position={[0, 0, 0.027]} material={shieldFaceMat}>
            <boxGeometry args={[0.28, 0.4, 0.006]} />
          </mesh>
          {/* Cross emblem vertical */}
          <mesh position={[0, 0.02, 0.032]} material={shieldEmblemMat}>
            <boxGeometry args={[0.05, 0.3, 0.006]} />
          </mesh>
          {/* Cross emblem horizontal */}
          <mesh position={[0, 0.08, 0.032]} material={shieldEmblemMat}>
            <boxGeometry args={[0.22, 0.05, 0.006]} />
          </mesh>
        </group>
      </group>

      {/* Head */}
      <group ref={headRef} position={[0, 1.04, 0]}>
        <mesh castShadow material={armorLightMat}>
          <boxGeometry args={[0.32, 0.3, 0.32]} />
        </mesh>
        <mesh position={[0, -0.01, 0.165]} material={visorMat}>
          <boxGeometry args={[0.24, 0.06, 0.01]} />
        </mesh>
        <mesh position={[0, 0.18, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.34, 0.06, 0.34]} />
        </mesh>
      </group>
    </group>
  )
}
