import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { findSpawnNear } from './obstacles'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'
import { getPlayer } from './playerStore'
import { addItem } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playGold } from '../audio/sfx'
import { createApple, resetApples, collectApple, type AppleState } from './appleStore'

// Forest apples — walk up to a little apple sapling to FORAGE it (no swinging),
// yielding a Forest Apple (small heal). Pure hand-built mesh; base on y=0. A low
// fruiting bush, not a full canopy tree, so it reads as gatherable and doesn't
// block the woods.

const TRUNK = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1, flatShading: true })
const LEAF = new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 1, flatShading: true })
const LEAF_DARK = new THREE.MeshStandardMaterial({ color: '#2f5e34', roughness: 1, flatShading: true })
const APPLE = new THREE.MeshStandardMaterial({
  color: '#d23b2b',
  emissive: '#7a1410',
  emissiveIntensity: 0.25,
  roughness: 0.5,
  flatShading: true,
})

// Foliage clusters (icosahedron blobs) and the ripe apples nestled in them.
const FOLIAGE: Array<{ p: [number, number, number]; r: number; m: THREE.Material }> = [
  { p: [0, 0.92, 0], r: 0.4, m: LEAF },
  { p: [0.26, 0.78, 0.1], r: 0.28, m: LEAF_DARK },
  { p: [-0.22, 0.8, -0.08], r: 0.26, m: LEAF_DARK },
]
const APPLES: Array<[number, number, number]> = [
  [0.22, 0.74, 0.18],
  [-0.2, 0.7, 0.16],
  [0.05, 0.64, -0.22],
  [0.0, 1.02, 0.18],
]

/** A single apple sapling (model-smith registered), base on y=0. */
export function AppleModel() {
  return (
    <group>
      {/* Short trunk. */}
      <mesh position={[0, 0.3, 0]} castShadow material={TRUNK}>
        <cylinderGeometry args={[0.07, 0.1, 0.6, 6]} />
      </mesh>
      {/* Leafy crown. */}
      {FOLIAGE.map((f, i) => (
        <mesh key={i} position={f.p} castShadow material={f.m}>
          <icosahedronGeometry args={[f.r, 0]} />
        </mesh>
      ))}
      {/* Ripe apples tucked in the foliage. */}
      {APPLES.map((a, i) => (
        <mesh key={i} position={a} castShadow material={APPLE}>
          <sphereGeometry args={[0.08, 8, 6]} />
        </mesh>
      ))}
    </group>
  )
}

const HARVEST_R2 = 0.95 * 0.95

function AppleView({ state }: { state: AppleState }) {
  const groupRef = useRef<THREE.Group>(null!)
  const [taken, setTaken] = useState(false)

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const g = groupRef.current
    if (!g) return
    if (taken) return
    // Freeze the (static) tree's matrix while far (cullVisible flips
    // matrixWorldAutoUpdate off), not just hide it.
    const culled = isCulled(state.x, state.z)
    cullVisible(g, culled)
    if (culled) return
    // Gentle sway.
    g.rotation.z = Math.sin(clock.getElapsedTime() * 1.1 + state.seed * 6) * 0.05

    // Forage on proximity (no swing needed).
    const p = getPlayer()
    const dx = p.x - state.x
    const dz = p.z - state.z
    if (dx * dx + dz * dz < HARVEST_R2) {
      if (addItem('apple', 1)) {
        collectApple(state)
        spawnFloat('+🍎 Apple', '#ff8a78', state.x, state.y + 1.2, state.z, 1.3)
        playGold()
        setTaken(true)
      }
    }
  })

  if (taken) return null
  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]}>
      <AppleModel />
    </group>
  )
}

// Hand-placed across the western forest blob (region centre ~[32,80], r34).
// findSpawnNear snaps each onto a standable, prop-free tile.
const APPLE_SPAWNS: Array<{ pos: [number, number]; seed: number }> = [
  { pos: [30, 78], seed: 0.12 },
  { pos: [36, 82], seed: 0.34 },
  { pos: [26, 84], seed: 0.56 },
  { pos: [40, 80], seed: 0.78 },
  { pos: [32, 88], seed: 0.91 },
  { pos: [22, 80], seed: 0.27 },
  { pos: [38, 74], seed: 0.63 },
  { pos: [28, 90], seed: 0.45 },
  { pos: [44, 84], seed: 0.83 },
  { pos: [34, 72], seed: 0.19 },
]

export function AppleTrees() {
  const [apples, setApples] = useState<AppleState[]>([])
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetApples()
      setApples(
        APPLE_SPAWNS.map((a) => {
          const s = findSpawnNear(a.pos[0], a.pos[1])
          return createApple(s.x, s.z, a.seed)
        }),
      )
    })
    return () => {
      cancelAnimationFrame(handle)
      resetApples()
    }
  }, [])
  return (
    <group>
      {apples.map((a) => (
        <AppleView key={a.id} state={a} />
      ))}
    </group>
  )
}
