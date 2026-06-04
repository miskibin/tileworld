import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { findSpawnNear } from './obstacles'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'
import { getPlayer } from './playerStore'
import { addItem } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playGold } from '../audio/sfx'
import { createHerb, resetHerbs, collectHerb, type HerbState } from './herbStore'

// Marsh herbs in the swamp — walk up to one to FORAGE it (no swinging), yielding a
// Marsh Herb (heal + resist) for hard nights. Pure hand-built mesh; base on y=0.
// The glowing bud makes them readable in the dim, hazardous bog.

const LEAF = new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 1, flatShading: true })
const LEAF_DARK = new THREE.MeshStandardMaterial({ color: '#2b5630', roughness: 1, flatShading: true })
const BUD = new THREE.MeshStandardMaterial({
  color: '#aef0c4',
  emissive: '#7fe0b0',
  emissiveIntensity: 0.5,
  roughness: 0.5,
  flatShading: true,
})

const BLADE_ANGLES = [0, 1.26, 2.51, 3.77, 5.03] // 5 blades around the stem

/** A single herb plant (model-smith registered), base on y=0. */
export function HerbModel() {
  return (
    <group>
      {/* Splayed leaf blades. */}
      {BLADE_ANGLES.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08]}
          rotation={[Math.cos(a) * 0.4, -a, Math.sin(a) * 0.4]}
          castShadow
          material={i % 2 === 0 ? LEAF : LEAF_DARK}
        >
          <boxGeometry args={[0.07, 0.42, 0.14]} />
        </mesh>
      ))}
      {/* Glowing medicinal bud at the crown. */}
      <mesh position={[0, 0.42, 0]} castShadow material={BUD}>
        <icosahedronGeometry args={[0.1, 0]} />
      </mesh>
    </group>
  )
}

const HARVEST_R2 = 0.85 * 0.85

function HerbView({ state }: { state: HerbState }) {
  const groupRef = useRef<THREE.Group>(null!)
  const [taken, setTaken] = useState(false)

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const g = groupRef.current
    if (!g) return
    if (taken) return
    if (isCulled(state.x, state.z)) {
      g.visible = false
      return
    }
    g.visible = true
    // Gentle sway.
    g.rotation.z = Math.sin(clock.getElapsedTime() * 1.3 + state.seed * 6) * 0.08

    // Forage on proximity (no swing needed).
    const p = getPlayer()
    const dx = p.x - state.x
    const dz = p.z - state.z
    if (dx * dx + dz * dz < HARVEST_R2) {
      if (addItem('marsh_herb', 1)) {
        collectHerb(state)
        spawnFloat('+🌿 Marsh Herb', '#aef0c4', state.x, state.y + 1.0, state.z, 1.3)
        playGold()
        setTaken(true)
      }
    }
  })

  if (taken) return null
  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]}>
      <HerbModel />
    </group>
  )
}

// Hand-placed across the reachable swamp band (S of the castle). findSpawnNear
// snaps each onto a standable, prop-free tile.
const HERB_SPAWNS: Array<{ pos: [number, number]; seed: number }> = [
  { pos: [72, 84], seed: 0.1 },
  { pos: [66, 88], seed: 0.3 },
  { pos: [78, 86], seed: 0.5 },
  { pos: [60, 82], seed: 0.7 },
  { pos: [84, 90], seed: 0.9 },
  { pos: [70, 92], seed: 0.15 },
  { pos: [76, 80], seed: 0.35 },
  { pos: [64, 94], seed: 0.55 },
  { pos: [82, 83], seed: 0.75 },
  { pos: [58, 88], seed: 0.95 },
  { pos: [88, 86], seed: 0.25 },
  { pos: [72, 97], seed: 0.65 },
]

export function HerbPlants() {
  const [herbs, setHerbs] = useState<HerbState[]>([])
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetHerbs()
      setHerbs(
        HERB_SPAWNS.map((h) => {
          const s = findSpawnNear(h.pos[0], h.pos[1])
          return createHerb(s.x, s.z, h.seed)
        }),
      )
    })
    return () => {
      cancelAnimationFrame(handle)
      resetHerbs()
    }
  }, [])
  return (
    <group>
      {herbs.map((h) => (
        <HerbView key={h.id} state={h} />
      ))}
    </group>
  )
}
