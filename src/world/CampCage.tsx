import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { tileTopY } from './tileMap'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import { getAliveOrks } from './orkStore'
import { freeCaptive } from './rescue'
import { sayHeroLine } from './voiceStore'
import { spawnFloat, addShake } from './fxStore'
import { playLevelUp, playVillagerGrunt } from '../audio/sfx'

// A prison cage at an ork camp holding captive villagers. While the camp's guard
// orks live the cage is locked; clear them all and the door bursts open — the
// captives are freed as castle militia (heirs) that path home to the keep. This
// is the primary heir source (see rescue.ts). One CampCage sits at each of the
// three guarded camps (forest / desert / snow).

const WOOD = new THREE.MeshStandardMaterial({ color: '#4b3724', roughness: 1, flatShading: true })
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: '#33271a', roughness: 1, flatShading: true })
const BAR = new THREE.MeshStandardMaterial({ color: '#6b6f76', roughness: 0.7, metalness: 0.4, flatShading: true })
// Captive clothing — drab prisoner tones.
const CAPTIVE_BODY = new THREE.MeshStandardMaterial({ color: '#7c6a54', roughness: 1, flatShading: true })
const CAPTIVE_HEAD = new THREE.MeshStandardMaterial({ color: '#caa980', roughness: 0.9, flatShading: true })

const W = 1.7 // cage span (tiles)
const H = 1.5 // cage height
const HW = W / 2

function VBar({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, H / 2, z]} castShadow material={BAR}>
      <boxGeometry args={[0.07, H - 0.06, 0.07]} />
    </mesh>
  )
}

function Captive({ x, z, seed }: { x: number; z: number; seed: number }) {
  const lean = (seed - 0.5) * 0.3 // slight per-captive lean
  return (
    <group position={[x, 0, z]} rotation={[0, seed * 6.28, 0]}>
      <mesh position={[0, 0.32, 0]} rotation={[lean, 0, 0]} castShadow material={CAPTIVE_BODY}>
        <boxGeometry args={[0.32, 0.56, 0.22]} />
      </mesh>
      <mesh position={[0, 0.74, 0]} castShadow material={CAPTIVE_HEAD}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
      </mesh>
    </group>
  )
}

/** The cage mesh tree (model-smith registered). `openAmount` swings the door
 *  (0 shut → 1 flung open); `captives` is how many prisoner figures to show. */
export function Cage({ openAmount = 0, captives = 2 }: { openAmount?: number; captives?: number }) {
  return (
    <group>
      {/* Plank floor. */}
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow material={WOOD_DARK}>
        <boxGeometry args={[W + 0.12, 0.12, W + 0.12]} />
      </mesh>
      {/* Corner posts. */}
      {[
        [-HW, -HW],
        [HW, -HW],
        [-HW, HW],
        [HW, HW],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, H / 2, z]} castShadow material={WOOD}>
          <boxGeometry args={[0.14, H, 0.14]} />
        </mesh>
      ))}
      {/* Top rim rails (4 sides). */}
      <mesh position={[0, H - 0.05, -HW]} castShadow material={WOOD}>
        <boxGeometry args={[W, 0.1, 0.1]} />
      </mesh>
      <mesh position={[0, H - 0.05, HW]} castShadow material={WOOD}>
        <boxGeometry args={[W, 0.1, 0.1]} />
      </mesh>
      <mesh position={[-HW, H - 0.05, 0]} castShadow material={WOOD}>
        <boxGeometry args={[0.1, 0.1, W]} />
      </mesh>
      <mesh position={[HW, H - 0.05, 0]} castShadow material={WOOD}>
        <boxGeometry args={[0.1, 0.1, W]} />
      </mesh>
      {/* Vertical bars on the three fixed sides (north z=-HW, south z=+HW, west x=-HW). */}
      {[-0.45, 0, 0.45].map((x) => (
        <VBar key={`n${x}`} x={x} z={-HW} />
      ))}
      {[-0.45, 0, 0.45].map((x) => (
        <VBar key={`s${x}`} x={x} z={HW} />
      ))}
      {[-0.45, 0, 0.45].map((z) => (
        <VBar key={`w${z}`} x={-HW} z={z} />
      ))}
      {/* Door on the east side (x=+HW): a hinged gate of bars swinging out about
          the +z corner post. Bars + the cross-rail stay within the east face so
          nothing pokes past the cage when shut. */}
      <group position={[HW, 0, HW]} rotation={[0, -openAmount * 1.5, 0]}>
        <VBar x={0} z={-0.45} />
        <VBar x={0} z={-0.9} />
        <VBar x={0} z={-1.35} />
        <mesh position={[0, H - 0.2, -0.9]} castShadow material={BAR}>
          <boxGeometry args={[0.06, 0.06, 1.5]} />
        </mesh>
      </group>
      {/* Captives huddled inside. */}
      {captives >= 1 && <Captive x={-0.25} z={0.15} seed={0.3} />}
      {captives >= 2 && <Captive x={0.3} z={-0.2} seed={0.72} />}
    </group>
  )
}

interface CampCageProps {
  /** the guarded camp's centre (orks home-anchored here) */
  camp: { x: number; z: number }
  /** local offset of the cage from the camp centre (tiles) */
  offset?: [number, number]
  captives?: number
  seed?: number
}

const CHECK_INTERVAL = 0.4 // seconds between camp-clear polls

export function CampCage({ camp, offset = [-2, 2], captives = 2, seed = 0 }: CampCageProps) {
  const cageX = camp.x + offset[0]
  const cageZ = camp.z + offset[1]
  const cageY = useMemo(() => tileTopY(Math.floor(cageX), Math.floor(cageZ)), [cageX, cageZ])

  // Solid footprint matching the plank floor (W+0.12 wide) so the hero and orks
  // route around the cage instead of clipping through the bars. The cage sits ≥2
  // tiles off the camp centre, so this box never traps the home-anchored guards.
  useEffect(() => {
    const half = (W + 0.12) / 2 + 0.1
    const owner = `campcage:${cageX},${cageZ}`
    registerHouseBlocker(
      { minX: cageX - half, maxX: cageX + half, minZ: cageZ - half, maxZ: cageZ + half },
      owner,
    )
    return () => resetHouseBlockers(owner)
  }, [cageX, cageZ])

  const groupRef = useRef<THREE.Group>(null!)
  const sawOrks = useRef(false) // guard the startup race (orks spawn a frame late)
  const nextCheck = useRef(0)
  const [freed, setFreed] = useState(false)

  // Count this camp's still-living guard orks (home-anchored at the camp centre).
  const aliveGuards = (): number => {
    let n = 0
    for (const o of getAliveOrks()) {
      if (o.home && Math.abs(o.home.x - camp.x) < 1.5 && Math.abs(o.home.z - camp.z) < 1.5) n++
    }
    return n
  }

  useFrame((rf) => {
    if (isFrozen()) return
    const g = groupRef.current
    if (!g) return
    // Freeze the (static) cage's matrix while far (cullVisible flips
    // matrixWorldAutoUpdate off), not just hide it.
    const culled = isCulled(cageX, cageZ)
    cullVisible(g, culled)
    if (culled || freed) return

    const t = rf.clock.getElapsedTime()
    if (t < nextCheck.current) return
    nextCheck.current = t + CHECK_INTERVAL

    const guards = aliveGuards()
    if (guards > 0) {
      sawOrks.current = true
      return
    }
    // Free only once we've actually seen the camp populated AND it's now empty.
    if (sawOrks.current) {
      // Only ONE captive leaves with you as militia — the rest bolt for the wilds
      // the instant the bars open. A camp is a single hard-won heir, not a crowd.
      freeCaptive(cageX, cageZ + 1.2, seed % 1, 0)
      const fled = Math.max(0, captives - 1)
      spawnFloat(
        fled > 0 ? `1 rescued · ${fled} fled` : '1 rescued',
        '#9be38a',
        cageX,
        cageY + 2.2,
        cageZ,
        1.8,
      )
      playLevelUp()
      playVillagerGrunt()
      // First camp cleared this run — explain the rescued become castle militia.
      sayHeroLine('first-rescue', '/audio/vo/rescue.mp3')
      addShake(0.3)
      setFreed(true)
    }
  })

  return (
    <group ref={groupRef} position={[cageX, cageY, cageZ]} name="campcage">
      <Cage openAmount={freed ? 1 : 0} captives={freed ? 0 : captives} />
    </group>
  )
}
