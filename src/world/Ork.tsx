import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { OrkState } from './orkStore'
import { tileAt } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { bridgeAt } from './bridges'
import { houseBlocksAt } from './houseBlockers'
import { findPath } from './pathfinding'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'
import { isPaused } from './pauseStore'
import { isCulled } from './cull'

const ORK_AGGRO = 9 // grid units to start chase
const ORK_MELEE = 1.5 // grid units to attempt swing
const ORK_SPEED = 2.0 // grid units / sec
const ORK_TURN_RATE = 6
const ORK_ATTACK_DURATION = 0.7 // seconds total swing
const ORK_ATTACK_COOLDOWN = 1.6 // seconds between swings
const ORK_ATTACK_DAMAGE = 12 // hp per landed hit
const ORK_PATH_RECOMPUTE = 0.55 // seconds between A* refreshes
const ORK_WAYPOINT_RADIUS = 0.45 // close enough to advance to next waypoint

const SKIN = '#3a6a2a'
const SKIN_ALT = '#4a7a32'
const SKIN_DARK = '#234017'
const LOINCLOTH = '#5a3a22'
const BELT = '#3a2616'
const CLUB_WOOD = '#4a2a16'
const CLUB_BAND = '#1a1008'
const TUSK = '#ece1c2'
const EYE = '#e6c828'

const SKIN_MATS = [
  new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: SKIN_ALT, roughness: 0.85, flatShading: true }),
]
const SKIN_DARK_MAT = new THREE.MeshStandardMaterial({ color: SKIN_DARK, roughness: 0.9, flatShading: true })
const LOIN_MAT = new THREE.MeshStandardMaterial({ color: LOINCLOTH, roughness: 1 })
const BELT_MAT = new THREE.MeshStandardMaterial({ color: BELT, roughness: 1 })
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: CLUB_WOOD, roughness: 1 })
const BAND_MAT = new THREE.MeshStandardMaterial({ color: CLUB_BAND, roughness: 1 })
const TUSK_MAT = new THREE.MeshStandardMaterial({ color: TUSK, roughness: 0.7 })
const EYE_MAT = new THREE.MeshStandardMaterial({
  color: EYE,
  roughness: 0.4,
  emissive: '#705020',
  emissiveIntensity: 0.5,
})

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_FG = new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_BAR_WIDTH = 0.8
const HP_BAR_HEIGHT = 0.07

interface OrkViewProps {
  state: OrkState
}

export function OrkView({ state }: OrkViewProps) {
  const skinMat = useMemo(() => SKIN_MATS[state.paletteIndex % SKIN_MATS.length], [state.paletteIndex])
  const groupRef = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const rightArmRef = useRef<THREE.Group>(null!)
  const leftArmRef = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const billboardGroupRef = useRef<THREE.Group>(null!)
  const skinFlashRef = useRef<THREE.Color>(new THREE.Color(state.paletteIndex === 0 ? SKIN : SKIN_ALT))

  const [visible, setVisible] = useState(true)
  const deadFadeFrom = useRef<number | null>(null)

  useFrame(({ clock }, dtFrame) => {
    if (isPaused()) return
    const t = clock.getElapsedTime() + state.seed
    const tNow = clock.getElapsedTime()
    const dt = Math.min(0.05, dtFrame)
    const g = groupRef.current
    if (!g) return

    // Distance cull: far orks are fog-hidden — hide + skip AI/animation work.
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
      const opacity = Math.max(0, 1 - elapsed / 1.4)
      const sink = Math.min(0.4, elapsed * 0.3)
      g.position.set(state.x, state.y - sink, state.z)
      g.rotation.z = Math.min(Math.PI / 2, elapsed * 2.2)
      if (opacity <= 0 && visible) setVisible(false)
      if (billboardGroupRef.current) billboardGroupRef.current.visible = false
      return
    }

    // ─── AI: chase + attack ────────────────────────────────────────
    const player = getPlayer()
    const vx = player.x - state.x
    const vz = player.z - state.z
    const dist = Math.hypot(vx, vz)
    const inAggro = dist < ORK_AGGRO && isPlayerAlive()
    const inMelee = dist < ORK_MELEE && isPlayerAlive()
    const attacking = state.attackingSince > 0

    // Face the player when aggroed or attacking
    if (inAggro || attacking) {
      const targetFacing = Math.atan2(vx, vz)
      let d = targetFacing - state.facing
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      // dt not available directly; approximate per-frame turn step
      const turnStep = Math.min(1, dt * ORK_TURN_RATE)
      state.facing += d * turnStep
    }

    // Start a swing
    if (!attacking && inMelee && tNow >= state.attackReadyAt) {
      state.attackingSince = tNow
      state.attackHitDealt = false
    }

    // Chase: walk toward player via A* path
    let walking = false
    if (inAggro && !inMelee && !attacking) {
      // Refresh path on a timer (or when current path is empty / consumed)
      if (
        tNow >= state.pathRecomputeAt ||
        state.path.length === 0 ||
        state.pathIndex >= state.path.length
      ) {
        state.path = findPath({ x: state.x, z: state.z }, { x: player.x, z: player.z })
        state.pathIndex = 0
        state.pathRecomputeAt = tNow + ORK_PATH_RECOMPUTE
      }

      // Pick the current waypoint; skip ones we've already reached.
      while (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        const dxw = wp.x - state.x
        const dzw = wp.z - state.z
        if (Math.hypot(dxw, dzw) < ORK_WAYPOINT_RADIUS) {
          state.pathIndex++
        } else break
      }

      if (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        const dxw = wp.x - state.x
        const dzw = wp.z - state.z
        const lenW = Math.hypot(dxw, dzw)
        if (lenW > 0.001) {
          const step = ORK_SPEED * dt
          const nx = state.x + (dxw / lenW) * step
          const nz = state.z + (dzw / lenW) * step
          const cxFloor = Math.floor(state.x)
          const czFloor = Math.floor(state.z)
          const standingOk = (cx: number, cz: number) =>
            tileAt(cx, cz) !== null || bridgeAt(cx + 0.5, cz + 0.5) !== null
          const canMoveX =
            standingOk(Math.floor(nx), czFloor) &&
            !obstacleCollidesAt(nx, state.z, state.collisionRadius) &&
            !houseBlocksAt(nx, state.z)
          const canMoveZ =
            standingOk(cxFloor, Math.floor(nz)) &&
            !obstacleCollidesAt(state.x, nz, state.collisionRadius) &&
            !houseBlocksAt(state.x, nz)
          if (canMoveX) state.x = nx
          if (canMoveZ) state.z = nz
          if (!canMoveX && !canMoveZ) {
            // Stuck — force a recompute next frame
            state.pathRecomputeAt = 0
          }
          // Use bridge surface y when on a bridge, else tile height.
          const bridge = bridgeAt(state.x, state.z)
          if (bridge) {
            state.y = bridge.y
          } else {
            const tileNow = tileAt(Math.floor(state.x), Math.floor(state.z))
            if (tileNow) state.y = tileNow.height
          }
          walking = canMoveX || canMoveZ
        }
      }
    }

    // Finalize swing: deal damage at mid-swing, end at ATTACK_DURATION
    let attackArmRot = 0
    if (attacking) {
      const phase = (tNow - state.attackingSince) / ORK_ATTACK_DURATION
      if (phase >= 1) {
        state.attackingSince = 0
        state.attackReadyAt = tNow + ORK_ATTACK_COOLDOWN
      } else {
        // Smooth overhead chop: arm raises (0..0.45), strike (0.45..0.7), recover (0.7..1)
        if (phase < 0.45) attackArmRot = -1.6 * (phase / 0.45)
        else if (phase < 0.75) attackArmRot = -1.6 + 2.4 * ((phase - 0.45) / 0.3)
        else attackArmRot = 0.8 * (1 - (phase - 0.75) / 0.25)
        // Land damage mid-strike
        if (!state.attackHitDealt && phase >= 0.55) {
          state.attackHitDealt = true
          if (dist <= ORK_MELEE + 0.2 && isPlayerAlive()) {
            damagePlayer(ORK_ATTACK_DAMAGE, tNow)
          }
        }
      }
    }

    // Hit recoil: brief upper-body flinch right after taking damage. Kept on
    // the torso/head (NOT the whole group) so it reads as a stagger, not a
    // topple/death.
    const hurtRemain = state.hurtFlashUntil - tNow
    const recoil = hurtRemain > 0 ? Math.max(0, hurtRemain / 0.25) : 0

    // Position + sway — body stays upright (no group-level lean).
    g.position.set(state.x, state.y, state.z)
    g.rotation.y = state.facing + Math.sin(t * 0.55) * 0.04
    g.rotation.z = 0
    g.rotation.x = 0

    if (bodyRef.current) {
      const s = 1 + Math.sin(t * 1.2) * 0.04
      bodyRef.current.scale.set(s, 1 + Math.sin(t * 1.2) * 0.025, s)
      // Small backward jolt of the torso on recoil.
      bodyRef.current.rotation.x = 0.2 - recoil * 0.3
    }
    if (headRef.current) {
      headRef.current.rotation.y = inAggro
        ? 0
        : Math.sin(t * 0.3 + state.seed) * 0.32
      // Snap the head back briefly when struck.
      headRef.current.rotation.x = Math.sin(t * 0.4) * 0.06 - recoil * 0.4
    }
    if (rightArmRef.current) {
      if (attacking) {
        rightArmRef.current.rotation.x = attackArmRot
        rightArmRef.current.rotation.z = 0
      } else if (walking) {
        rightArmRef.current.rotation.x = Math.sin(t * 8) * 0.4
        rightArmRef.current.rotation.z = 0
      } else {
        rightArmRef.current.rotation.x = Math.sin(t * 0.8) * 0.05
        rightArmRef.current.rotation.z = Math.sin(t * 0.9) * 0.04
      }
    }
    if (leftArmRef.current) {
      if (walking) {
        leftArmRef.current.rotation.x = Math.sin(t * 8 + Math.PI) * 0.4
      } else {
        leftArmRef.current.rotation.x = Math.sin(t * 0.8 + Math.PI) * 0.05
      }
    }
    if (walking) {
      // Body bob while chasing
      g.position.y = state.y + Math.abs(Math.sin(t * 8)) * 0.06
    }

    // Hurt flash → tint skin material briefly. Mutates shared material; OK since
    // all damaged orks of same palette flash together for brief moments.
    const hurting = tNow < state.hurtFlashUntil
    const baseColor = state.paletteIndex === 0 ? SKIN : SKIN_ALT
    if (hurting) {
      skinFlashRef.current.set('#ffb060')
      skinMat.color.copy(skinFlashRef.current)
    } else {
      skinMat.color.set(baseColor)
    }

    // HP bar
    if (billboardGroupRef.current) {
      const showBar = state.hp < state.maxHp
      billboardGroupRef.current.visible = showBar
      if (showBar && hpFgRef.current) {
        const ratio = Math.max(0, state.hp / state.maxHp)
        hpFgRef.current.scale.x = HP_BAR_WIDTH * ratio
        hpFgRef.current.position.x = -((1 - ratio) * HP_BAR_WIDTH) / 2
        ;(hpFgRef.current.material as THREE.MeshBasicMaterial).color.set(
          hurting ? '#ffaa20' : '#d63a3a',
        )
      }
    }
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={0.7}>
      {/* Legs */}
      <mesh position={[-0.13, 0.18, 0]} castShadow material={skinMat}>
        <boxGeometry args={[0.2, 0.36, 0.22]} />
      </mesh>
      <mesh position={[0.13, 0.18, 0]} castShadow material={skinMat}>
        <boxGeometry args={[0.2, 0.36, 0.22]} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow material={LOIN_MAT}>
        <boxGeometry args={[0.55, 0.2, 0.3]} />
      </mesh>
      <mesh position={[0, 0.49, 0]} castShadow material={BELT_MAT}>
        <boxGeometry args={[0.56, 0.06, 0.31]} />
      </mesh>
      <group ref={bodyRef} position={[0, 0.74, 0.05]} rotation={[0.2, 0, 0]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.55, 0.42, 0.34]} />
        </mesh>
        <mesh position={[0, 0, 0.175]} material={SKIN_DARK_MAT}>
          <boxGeometry args={[0.4, 0.32, 0.005]} />
        </mesh>
      </group>
      <group ref={headRef} position={[0, 1.1, 0.06]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.36, 0.34, 0.34]} />
        </mesh>
        <mesh position={[0, 0.06, 0.175]} material={SKIN_DARK_MAT}>
          <boxGeometry args={[0.32, 0.06, 0.01]} />
        </mesh>
        <mesh position={[-0.08, 0.02, 0.175]} material={EYE_MAT}>
          <boxGeometry args={[0.05, 0.04, 0.008]} />
        </mesh>
        <mesh position={[0.08, 0.02, 0.175]} material={EYE_MAT}>
          <boxGeometry args={[0.05, 0.04, 0.008]} />
        </mesh>
        <mesh position={[-0.08, -0.1, 0.17]} rotation={[0, 0, -0.15]} castShadow material={TUSK_MAT}>
          <coneGeometry args={[0.026, 0.13, 5]} />
        </mesh>
        <mesh position={[0.08, -0.1, 0.17]} rotation={[0, 0, 0.15]} castShadow material={TUSK_MAT}>
          <coneGeometry args={[0.026, 0.13, 5]} />
        </mesh>
        <mesh position={[-0.2, 0, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.06, 0.12, 0.14]} />
        </mesh>
        <mesh position={[0.2, 0, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.06, 0.12, 0.14]} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.36, 0.95, 0.05]}>
        <mesh position={[0, -0.02, 0]} castShadow material={SKIN_DARK_MAT}>
          <boxGeometry args={[0.2, 0.1, 0.3]} />
        </mesh>
        <mesh position={[0.02, -0.25, 0.04]} rotation={[0.2, 0, 0.05]} castShadow material={skinMat}>
          <boxGeometry args={[0.17, 0.5, 0.24]} />
        </mesh>
        <mesh position={[0.04, -0.52, 0.08]} rotation={[0.2, 0, 0.05]} castShadow material={SKIN_DARK_MAT}>
          <boxGeometry args={[0.16, 0.1, 0.22]} />
        </mesh>
        <group position={[0.05, -0.65, 0.1]} rotation={[0.4, 0, 0.1]}>
          <mesh position={[0, -0.1, 0]} castShadow material={WOOD_MAT}>
            <cylinderGeometry args={[0.04, 0.04, 0.26, 6]} />
          </mesh>
          <mesh position={[0, -0.36, 0]} castShadow material={WOOD_MAT}>
            <cylinderGeometry args={[0.1, 0.08, 0.34, 7]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              position={[
                Math.cos((i * Math.PI) / 2) * 0.1,
                -0.36,
                Math.sin((i * Math.PI) / 2) * 0.1,
              ]}
              rotation={[0, (i * Math.PI) / 2, Math.PI / 2]}
              castShadow
              material={BAND_MAT}
            >
              <coneGeometry args={[0.03, 0.09, 4]} />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={leftArmRef} position={[-0.36, 0.95, 0.05]}>
        <mesh position={[0, -0.02, 0]} castShadow material={SKIN_DARK_MAT}>
          <boxGeometry args={[0.2, 0.1, 0.3]} />
        </mesh>
        <mesh position={[-0.02, -0.25, 0.04]} rotation={[0.2, 0, -0.05]} castShadow material={skinMat}>
          <boxGeometry args={[0.17, 0.5, 0.24]} />
        </mesh>
        <mesh position={[-0.04, -0.52, 0.08]} rotation={[0.2, 0, -0.05]} castShadow material={SKIN_DARK_MAT}>
          <boxGeometry args={[0.18, 0.13, 0.26]} />
        </mesh>
      </group>

      {/* HP bar */}
      <group ref={billboardGroupRef} position={[0, 2.6, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_BAR_WIDTH + 0.05, HP_BAR_HEIGHT + 0.03, 1]} />
          <mesh
            ref={hpFgRef}
            material={HP_BAR_FG}
            geometry={HP_BAR_GEO}
            position={[0, 0, 0.001]}
            scale={[HP_BAR_WIDTH, HP_BAR_HEIGHT, 1]}
          />
        </Billboard>
      </group>
    </group>
  )
}
