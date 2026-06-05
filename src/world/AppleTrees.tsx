import * as THREE from 'three'
import { scatterInRegion } from './tileMap'
import { ForageField, type ForageConfig } from './ForageField'
import { appleStore } from './appleStore'

// Forest apples — walk up to a little apple sapling to FORAGE it (no swinging),
// yielding a Forest Apple (small heal). The forage loop, placement and culling
// all live in ForageField; this module is just the model + config. A low fruiting
// bush, not a full canopy tree, so it reads as gatherable and doesn't block the
// woods.

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

// Scattered across the western forest blob (REGIONS 'forest'); findSpawnNear
// snaps each onto a standable, prop-free tile.
const APPLE_CONFIG: ForageConfig = {
  Model: AppleModel,
  item: 'apple',
  store: appleStore,
  harvestR: 0.95,
  float: { text: '+🍎 Apple', color: '#ff8a78', y: 1.2 },
  sway: { freq: 1.1, amp: 0.05 },
  spawns: () => scatterInRegion('forest', 5),
}

export function AppleTrees() {
  return <ForageField config={APPLE_CONFIG} />
}
