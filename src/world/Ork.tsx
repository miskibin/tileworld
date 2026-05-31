import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import {
  damageOrk,
  healOrk,
  nearestEnemyOrk,
  nearestWoundedAlly,
  type OrkState,
} from './orkStore'
import { ORK_CONFIG, FACTION_COLOR } from './orkConfig'
import { spawnBolt } from './projectileStore'
import { spawnFloat } from './fxStore'
import { tileAt } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { bridgeAt } from './bridges'
import { houseBlocksAt } from './houseBlockers'
import { findPath } from './pathfinding'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'
import { playOrkGrunt } from '../audio/sfx'

const TURN_RATE_FALLBACK = 6

const SKIN_DARK_ACCENT = 0.62 // multiplier off the variant skin for shoulders/accents
const TUSK = '#ece1c2'
const EYE = '#e6c828'
const BELT = '#3a2616'
const CLUB_WOOD = '#4a2a16'
const CLUB_BAND = '#1a1008'
const STAFF_WOOD = '#6a4a2a'

const BELT_MAT = new THREE.MeshStandardMaterial({ color: BELT, roughness: 1 })
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: CLUB_WOOD, roughness: 1 })
const BAND_MAT = new THREE.MeshStandardMaterial({ color: CLUB_BAND, roughness: 1 })
const STAFF_MAT = new THREE.MeshStandardMaterial({ color: STAFF_WOOD, roughness: 1 })
const ORB_MAT = new THREE.MeshStandardMaterial({
  color: '#c89cff',
  emissive: '#7a3aff',
  emissiveIntensity: 1.4,
  roughness: 0.3,
  toneMapped: false,
})
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
  const cfg = ORK_CONFIG[state.variant]
  const isShaman = !!cfg.ranged

  // Per-ork materials so a variant's colour is honoured and a hurt flash only
  // tints THIS ork (the old shared-material flash lit up every ork at once).
  const skinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.85, flatShading: true }),
    [cfg.skin],
  )
  const skinDarkMat = useMemo(() => {
    const c = new THREE.Color(cfg.skin).multiplyScalar(SKIN_DARK_ACCENT)
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true })
  }, [cfg.skin])
  const factionMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: FACTION_COLOR[state.faction], roughness: 1 }),
    [state.faction],
  )

  const groupRef = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const rightArmRef = useRef<THREE.Group>(null!)
  const leftArmRef = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const billboardGroupRef = useRef<THREE.Group>(null!)
  const wasAggroRef = useRef(false)
  const lastGruntRef = useRef(0)

  const [visible, setVisible] = useState(true)
  const deadFadeFrom = useRef<number | null>(null)

  useFrame(({ clock }, dtFrame) => {
    if (isFrozen()) return
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

    // Frenzy (berserker): below 40% hp, hit faster + move faster.
    const frenzied = !!cfg.frenzy && state.hp < state.maxHp * 0.4
    const speed = cfg.speed * (frenzied ? 1.4 : 1)
    const cooldown = cfg.attackCooldown * (frenzied ? 0.6 : 1)
    const turnRate = cfg.turnRate || TURN_RATE_FALLBACK

    // ─── Target acquisition: nearest of {player, rival-camp ork} ──────
    const player = getPlayer()
    const pdx = player.x - state.x
    const pdz = player.z - state.z
    const playerDist = Math.hypot(pdx, pdz)
    const playerValid = isPlayerAlive() && playerDist < cfg.aggro
    const enemy = nearestEnemyOrk(state, cfg.aggro)
    const enemyDist = enemy ? Math.hypot(enemy.x - state.x, enemy.z - state.z) : Infinity

    let tx = 0
    let tz = 0
    let dist = Infinity
    let targetOrk: OrkState | null = null
    let targetIsPlayer = false
    if (playerValid && playerDist <= enemyDist) {
      tx = player.x
      tz = player.z
      dist = playerDist
      targetIsPlayer = true
    } else if (enemy) {
      tx = enemy.x
      tz = enemy.z
      dist = enemyDist
      targetOrk = enemy
    }
    const hasTarget = targetIsPlayer || targetOrk !== null
    const triggerRange = isShaman ? cfg.rangedRange ?? cfg.aggro : cfg.melee
    const inRange = hasTarget && dist < triggerRange
    const attacking = state.attackingSince > 0

    // Grunt when first acquiring a target.
    if (hasTarget && !wasAggroRef.current && tNow - lastGruntRef.current > 1.5) {
      playOrkGrunt(dist)
      lastGruntRef.current = tNow
    }
    wasAggroRef.current = hasTarget

    // Shaman: heal the most-wounded nearby ally on a timer (no target needed).
    if (isShaman && tNow >= state.healReadyAt) {
      const ally = nearestWoundedAlly(state, cfg.healRange ?? 8)
      if (ally) {
        healOrk(ally, cfg.healAmount ?? 20)
        spawnFloat('+' + (cfg.healAmount ?? 20), '#76e08a', ally.x, ally.y + 2.4, ally.z)
        state.healReadyAt = tNow + (cfg.healCooldown ?? 5)
      } else {
        state.healReadyAt = tNow + 1.0 // re-check soon
      }
    }

    // Face target when aggroed or attacking.
    if (hasTarget || attacking) {
      const targetFacing = Math.atan2(tx - state.x, tz - state.z)
      let d = targetFacing - state.facing
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      state.facing += d * Math.min(1, dt * turnRate)
    }

    // Start a swing / cast.
    if (!attacking && inRange && tNow >= state.attackReadyAt) {
      state.attackingSince = tNow
      state.attackHitDealt = false
      if (tNow - lastGruntRef.current > 1.2) {
        playOrkGrunt(dist)
        lastGruntRef.current = tNow
      }
    }

    // Chase: walk toward target via A* path (until in range).
    let walking = false
    if (hasTarget && !inRange && !attacking) {
      if (
        tNow >= state.pathRecomputeAt ||
        state.path.length === 0 ||
        state.pathIndex >= state.path.length
      ) {
        state.path = findPath({ x: state.x, z: state.z }, { x: tx, z: tz })
        state.pathIndex = 0
        state.pathRecomputeAt = tNow + cfg.pathRecompute
      }
      while (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        if (Math.hypot(wp.x - state.x, wp.z - state.z) < cfg.waypointRadius) state.pathIndex++
        else break
      }
      if (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        const dxw = wp.x - state.x
        const dzw = wp.z - state.z
        const lenW = Math.hypot(dxw, dzw)
        if (lenW > 0.001) {
          const step = speed * dt
          const nx = state.x + (dxw / lenW) * step
          const nz = state.z + (dzw / lenW) * step
          const standingOk = (cx: number, cz: number) =>
            tileAt(cx, cz) !== null || bridgeAt(cx + 0.5, cz + 0.5) !== null
          const canMoveX =
            standingOk(Math.floor(nx), Math.floor(state.z)) &&
            !obstacleCollidesAt(nx, state.z, state.collisionRadius) &&
            !houseBlocksAt(nx, state.z)
          const canMoveZ =
            standingOk(Math.floor(state.x), Math.floor(nz)) &&
            !obstacleCollidesAt(state.x, nz, state.collisionRadius) &&
            !houseBlocksAt(state.x, nz)
          if (canMoveX) state.x = nx
          if (canMoveZ) state.z = nz
          if (!canMoveX && !canMoveZ) state.pathRecomputeAt = 0
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

    // Resolve swing / cast — deliver effect mid-animation, end at duration.
    let attackArmRot = 0
    if (attacking) {
      const phase = (tNow - state.attackingSince) / cfg.attackDuration
      if (phase >= 1) {
        state.attackingSince = 0
        state.attackReadyAt = tNow + cooldown
      } else {
        if (phase < 0.45) attackArmRot = -1.6 * (phase / 0.45)
        else if (phase < 0.75) attackArmRot = -1.6 + 2.4 * ((phase - 0.45) / 0.3)
        else attackArmRot = 0.8 * (1 - (phase - 0.75) / 0.25)
        if (!state.attackHitDealt && phase >= 0.55) {
          state.attackHitDealt = true
          if (isShaman) {
            // Lob a homing bolt from the staff orb toward the target.
            const oy = state.y + 1.7
            if (targetIsPlayer && isPlayerAlive()) {
              spawnBolt(state.x, oy, state.z, { kind: 'player' }, cfg.damage)
            } else if (targetOrk && targetOrk.hp > 0) {
              spawnBolt(state.x, oy, state.z, { kind: 'ork', ref: targetOrk }, cfg.damage)
            }
          } else if (dist <= cfg.melee + 0.2) {
            if (targetIsPlayer && isPlayerAlive()) {
              damagePlayer(cfg.damage, tNow)
            } else if (targetOrk && targetOrk.hp > 0) {
              damageOrk(targetOrk, cfg.damage, tNow)
            }
          }
        }
      }
    }

    // Hit recoil — brief torso flinch.
    const hurtRemain = state.hurtFlashUntil - tNow
    const recoil = hurtRemain > 0 ? Math.max(0, hurtRemain / 0.25) : 0

    g.position.set(state.x, state.y, state.z)
    g.rotation.y = state.facing + Math.sin(t * 0.55) * 0.04
    g.rotation.z = 0
    g.rotation.x = 0

    if (bodyRef.current) {
      const s = 1 + Math.sin(t * 1.2) * 0.04
      bodyRef.current.scale.set(s, 1 + Math.sin(t * 1.2) * 0.025, s)
      bodyRef.current.rotation.x = 0.2 - recoil * 0.3
    }
    if (headRef.current) {
      headRef.current.rotation.y = hasTarget ? 0 : Math.sin(t * 0.3 + state.seed) * 0.32
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
      leftArmRef.current.rotation.x = walking
        ? Math.sin(t * 8 + Math.PI) * 0.4
        : Math.sin(t * 0.8 + Math.PI) * 0.05
    }
    if (walking) g.position.y = state.y + Math.abs(Math.sin(t * 8)) * 0.06

    // Hurt flash → tint this ork's skin briefly.
    if (tNow < state.hurtFlashUntil) skinMat.color.set('#ffb060')
    else skinMat.color.set(cfg.skin)

    // HP bar
    if (billboardGroupRef.current) {
      const showBar = state.hp < state.maxHp
      billboardGroupRef.current.visible = showBar
      if (showBar && hpFgRef.current) {
        const ratio = Math.max(0, state.hp / state.maxHp)
        hpFgRef.current.scale.x = HP_BAR_WIDTH * ratio
        hpFgRef.current.position.x = -((1 - ratio) * HP_BAR_WIDTH) / 2
        ;(hpFgRef.current.material as THREE.MeshBasicMaterial).color.set(
          tNow < state.hurtFlashUntil ? '#ffaa20' : '#d63a3a',
        )
      }
    }
  })

  if (!visible) return null

  return (
    <group
      ref={groupRef}
      position={[state.x, state.y, state.z]}
      rotation={[0, state.facing, 0]}
      scale={0.7 * cfg.scale}
    >
      {/* Legs */}
      <mesh position={[-0.13, 0.18, 0]} castShadow material={skinMat}>
        <boxGeometry args={[0.2, 0.36, 0.22]} />
      </mesh>
      <mesh position={[0.13, 0.18, 0]} castShadow material={skinMat}>
        <boxGeometry args={[0.2, 0.36, 0.22]} />
      </mesh>
      {/* Loincloth carries the warband colour */}
      <mesh position={[0, 0.4, 0]} castShadow material={factionMat}>
        <boxGeometry args={[0.55, 0.2, 0.3]} />
      </mesh>
      <mesh position={[0, 0.49, 0]} castShadow material={BELT_MAT}>
        <boxGeometry args={[0.56, 0.06, 0.31]} />
      </mesh>
      <group ref={bodyRef} position={[0, 0.74, 0.05]} rotation={[0.2, 0, 0]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.55, 0.42, 0.34]} />
        </mesh>
        {/* War-paint chest stripe in the warband colour */}
        <mesh position={[0, 0, 0.175]} material={factionMat}>
          <boxGeometry args={[0.12, 0.32, 0.006]} />
        </mesh>
        <mesh position={[0, 0, 0.176]} material={skinDarkMat}>
          <boxGeometry args={[0.4, 0.06, 0.004]} />
        </mesh>
      </group>
      <group ref={headRef} position={[0, 1.1, 0.06]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.36, 0.34, 0.34]} />
        </mesh>
        <mesh position={[0, 0.06, 0.175]} material={skinDarkMat}>
          <boxGeometry args={[0.32, 0.06, 0.01]} />
        </mesh>
        <mesh position={[-0.08, 0.02, 0.175]} material={EYE_MAT}>
          <boxGeometry args={[0.05, 0.04, 0.008]} />
        </mesh>
        <mesh position={[0.08, 0.02, 0.175]} material={EYE_MAT}>
          <boxGeometry args={[0.05, 0.04, 0.008]} />
        </mesh>
        <mesh position={[-0.08, -0.1, 0.17]} rotation={[0, 0, -0.15]} material={TUSK_MAT}>
          <coneGeometry args={[0.026, 0.13, 5]} />
        </mesh>
        <mesh position={[0.08, -0.1, 0.17]} rotation={[0, 0, 0.15]} material={TUSK_MAT}>
          <coneGeometry args={[0.026, 0.13, 5]} />
        </mesh>
        <mesh position={[-0.2, 0, 0]} material={skinMat}>
          <boxGeometry args={[0.06, 0.12, 0.14]} />
        </mesh>
        <mesh position={[0.2, 0, 0]} material={skinMat}>
          <boxGeometry args={[0.06, 0.12, 0.14]} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.36, 0.95, 0.05]}>
        <mesh position={[0, -0.02, 0]} castShadow material={skinDarkMat}>
          <boxGeometry args={[0.2, 0.1, 0.3]} />
        </mesh>
        <mesh position={[0.02, -0.25, 0.04]} rotation={[0.2, 0, 0.05]} castShadow material={skinMat}>
          <boxGeometry args={[0.17, 0.5, 0.24]} />
        </mesh>
        <mesh position={[0.04, -0.52, 0.08]} rotation={[0.2, 0, 0.05]} castShadow material={skinDarkMat}>
          <boxGeometry args={[0.16, 0.1, 0.22]} />
        </mesh>
        {isShaman ? (
          /* Gnarled staff topped with a glowing orb */
          <group position={[0.05, -0.5, 0.1]} rotation={[0.1, 0, 0.08]}>
            <mesh position={[0, -0.1, 0]} castShadow material={STAFF_MAT}>
              <cylinderGeometry args={[0.03, 0.035, 1.1, 6]} />
            </mesh>
            <mesh position={[0, 0.5, 0]} material={ORB_MAT}>
              <icosahedronGeometry args={[0.1, 0]} />
            </mesh>
          </group>
        ) : (
          /* Spiked war-club */
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
                material={BAND_MAT}
              >
                <coneGeometry args={[0.03, 0.09, 4]} />
              </mesh>
            ))}
          </group>
        )}
      </group>
      <group ref={leftArmRef} position={[-0.36, 0.95, 0.05]}>
        <mesh position={[0, -0.02, 0]} castShadow material={skinDarkMat}>
          <boxGeometry args={[0.2, 0.1, 0.3]} />
        </mesh>
        <mesh position={[-0.02, -0.25, 0.04]} rotation={[0.2, 0, -0.05]} castShadow material={skinMat}>
          <boxGeometry args={[0.17, 0.5, 0.24]} />
        </mesh>
        <mesh position={[-0.04, -0.52, 0.08]} rotation={[0.2, 0, -0.05]} castShadow material={skinDarkMat}>
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
