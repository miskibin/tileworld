import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { findSpawnNear } from './obstacles'
import { fromBase } from './tileMap'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'
import { createOre, resetOre, type OreState } from './oreStore'

// Ore boulders — destructible stone nodes in the rock highlands. Mine them with
// the sword (Character swing) for stone (resourceStore → defense upgrades). Pure
// hand-built mesh tree; see model-smith. Base sits on y=0, the parent group
// supplies the world placement at the node's ground height.

// Per-variant vein colour: gold / copper / iron-blue / crystal. The rock body is
// shared; only the glinting vein changes so each node reads a little different.
const VEIN_COLORS = ['#e8c14a', '#d2723a', '#9fb0c4', '#6fd0e0'] as const

interface OreMats {
  rock: THREE.MeshStandardMaterial
  rockDark: THREE.MeshStandardMaterial
  vein: THREE.MeshStandardMaterial
}

export function makeMats(variant: number): OreMats {
  return {
    rock: new THREE.MeshStandardMaterial({ color: '#7c828b', roughness: 1, flatShading: true }),
    rockDark: new THREE.MeshStandardMaterial({ color: '#5b6068', roughness: 1, flatShading: true }),
    vein: new THREE.MeshStandardMaterial({
      color: VEIN_COLORS[variant % VEIN_COLORS.length],
      roughness: 0.4,
      metalness: 0.6,
      emissive: VEIN_COLORS[variant % VEIN_COLORS.length],
      emissiveIntensity: 0.15,
      flatShading: true,
    }),
  }
}

/** The boulder mesh tree, authored around the local origin with its base on y=0. */
export function OreBoulder({
  rotation = 0,
  scale = 1,
  materials,
}: {
  rotation?: number
  scale?: number
  materials: OreMats
}) {
  return (
    <group rotation={[0, rotation, 0]} scale={scale}>
      {/* Rubble skirt — flat on the ground so the boulder reads as embedded. */}
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow material={materials.rockDark}>
        <boxGeometry args={[1.2, 0.18, 1.1]} />
      </mesh>
      {/* Main crag. */}
      <mesh position={[0, 0.46, 0]} rotation={[0.05, 0.3, 0.04]} castShadow receiveShadow material={materials.rock}>
        <boxGeometry args={[0.95, 0.78, 0.85]} />
      </mesh>
      {/* Shoulder boulders. */}
      <mesh position={[0.34, 0.55, -0.12]} rotation={[0, -0.5, 0.1]} castShadow receiveShadow material={materials.rock}>
        <boxGeometry args={[0.58, 0.56, 0.6]} />
      </mesh>
      <mesh position={[-0.3, 0.5, 0.24]} rotation={[0.08, 0.8, -0.06]} castShadow receiveShadow material={materials.rockDark}>
        <boxGeometry args={[0.5, 0.46, 0.5]} />
      </mesh>
      {/* Ore veins poking out of the faces. */}
      <mesh position={[0.12, 0.52, 0.45]} rotation={[0, 0.2, 0.5]} castShadow material={materials.vein}>
        <boxGeometry args={[0.5, 0.12, 0.12]} />
      </mesh>
      <mesh position={[-0.12, 0.66, -0.3]} rotation={[0.3, 0, 0.2]} castShadow material={materials.vein}>
        <boxGeometry args={[0.12, 0.42, 0.12]} />
      </mesh>
      <mesh position={[0.4, 0.34, 0.28]} rotation={[0, 0.6, 0]} castShadow material={materials.vein}>
        <boxGeometry args={[0.34, 0.1, 0.1]} />
      </mesh>
    </group>
  )
}

function OreView({ state }: { state: OreState }) {
  const groupRef = useRef<THREE.Group>(null!)
  const mats = useMemo(() => makeMats(state.variant), [state.variant])
  const baseVein = mats.vein.emissiveIntensity
  const [visible, setVisible] = useState(true)

  useFrame((rf) => {
    if (isFrozen()) return
    const g = groupRef.current
    if (!g) return
    // Hide once mined out, and skip work when far from the player.
    if (state.hp <= 0) {
      if (visible) setVisible(false)
      return
    }
    // Freeze the (static) boulder's matrix while far — cullVisible flips
    // matrixWorldAutoUpdate off so three skips its subtree entirely, not just hide.
    const culled = isCulled(state.x, state.z)
    cullVisible(g, culled)
    if (culled) return
    g.position.set(state.x, state.y, state.z)
    // Hurt flash: brighten the veins for a beat when struck.
    const now = rf.clock.getElapsedTime()
    const flash = Math.max(0, (state.hurtFlashUntil - now) / 0.18)
    mats.vein.emissiveIntensity = baseVein + flash * 1.4
    const j = 1 - flash * 0.06 // tiny recoil squash on impact
    g.scale.setScalar(j)
  })

  if (!visible) return null
  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]}>
      <OreBoulder rotation={state.seed * Math.PI * 2} materials={mats} />
    </group>
  )
}

// Hand-placed nodes clustered on the rock range's reachable foot/apron (the
// castle-facing approach; the deep core is cliffs). findSpawnNear snaps each to
// the nearest standable, prop-free tile — same idiom as BEAR_SPAWNS / ORK_CAMPS.
const ORE_SPAWNS: Array<{ pos: [number, number]; seed: number }> = [
  { pos: [110, 66], seed: 0.12 },
  { pos: [106, 60], seed: 0.37 },
  { pos: [112, 70], seed: 0.61 },
  { pos: [104, 54], seed: 0.84 },
  { pos: [108, 72], seed: 0.21 },
  { pos: [114, 62], seed: 0.49 },
  { pos: [102, 64], seed: 0.73 },
  { pos: [110, 50], seed: 0.95 },
  { pos: [106, 74], seed: 0.08 },
  { pos: [112, 48], seed: 0.56 },
  { pos: [100, 60], seed: 0.31 },
  { pos: [108, 56], seed: 0.67 },
  // Extra nodes so the rock highlands actually read as a mining ground.
  { pos: [102, 70], seed: 0.18 },
  { pos: [114, 56], seed: 0.42 },
  { pos: [98, 66], seed: 0.59 },
  { pos: [116, 68], seed: 0.77 },
  { pos: [106, 48], seed: 0.88 },
  { pos: [104, 68], seed: 0.27 },
]

export function OreNodes() {
  const [nodes, setNodes] = useState<OreState[]>([])
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetOre()
      setNodes(
        ORE_SPAWNS.map((o) => {
          // ORE_SPAWNS are base-map rock-apron coords; scale onto the enlarged map.
          const [bx, bz] = fromBase(o.pos[0], o.pos[1])
          const s = findSpawnNear(bx, bz)
          return createOre(s.x, s.z, o.seed)
        }),
      )
    })
    return () => {
      cancelAnimationFrame(handle)
      resetOre()
    }
  }, [])
  return (
    <group>
      {nodes.map((o) => (
        <OreView key={o.id} state={o} />
      ))}
    </group>
  )
}
