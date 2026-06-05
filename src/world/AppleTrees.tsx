import * as THREE from 'three'
import { scatterInRegion } from './tileMap'
import { ForageField, type ForageConfig } from './ForageField'
import { appleStore } from './appleStore'

// Forest apples — walk up to a little orchard fruit-tree to FORAGE it (no
// swinging), yielding a Forest Apple (small heal). The forage loop, placement and
// culling all live in ForageField; this module is just the model + config.
//
// Made DELIBERATELY distinct from the scatter forest (Scatter.tsx): those are cool
// saturated greens (#2f7a36..#4cb358) on dark-brown trunks in irregular blobs/cones.
// The apple tree is a warm yellow-green ROUND lollipop canopy on a clear trunk,
// studded with bright red apples + a couple fallen on the ground — so the eye
// snaps to it among the woods. Still foragable (no collision blocker) and short
// (~1.75 tall), so it doesn't read as a wall.

const TRUNK = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1, flatShading: true })
// Warm yellow-greens — a different hue family from the forest's cool greens.
const LEAF = new THREE.MeshStandardMaterial({ color: '#8fc24a', roughness: 1, flatShading: true })
const LEAF_DARK = new THREE.MeshStandardMaterial({ color: '#6fa238', roughness: 1, flatShading: true })
const APPLE = new THREE.MeshStandardMaterial({
  color: '#e23223',
  emissive: '#8a1208',
  emissiveIntensity: 0.35,
  roughness: 0.45,
  flatShading: true,
})

// Rounded lollipop canopy: one big ball + a few smaller bumps for an organic
// fuller crown. detail:1 icosahedra read rounder than the forest's faceted blobs.
const FOLIAGE: Array<{ p: [number, number, number]; r: number; m: THREE.Material }> = [
  { p: [0, 1.15, 0], r: 0.55, m: LEAF },
  { p: [0.3, 1.05, 0.18], r: 0.32, m: LEAF_DARK },
  { p: [-0.28, 1.1, -0.16], r: 0.3, m: LEAF_DARK },
  { p: [0.1, 1.45, 0.0], r: 0.34, m: LEAF },
  { p: [-0.15, 1.0, 0.22], r: 0.3, m: LEAF_DARK },
]
// Ripe apples studded over the canopy surface — the signature tell.
const APPLES: Array<[number, number, number]> = [
  [0.4, 1.3, 0.3],
  [-0.42, 1.22, 0.3],
  [0.38, 1.42, -0.28],
  [-0.34, 1.4, -0.3],
  [0.02, 1.62, 0.18],
  [0.5, 1.1, -0.05],
  [-0.5, 1.08, 0.05],
  [0.1, 1.18, 0.52],
  [-0.12, 1.16, -0.52],
]
// A couple windfalls on the ground — readable even from a low camera angle.
const WINDFALLS: Array<[number, number, number]> = [
  [0.34, 0.09, 0.2],
  [-0.28, 0.09, -0.22],
]

/** A single orchard apple tree (model-smith registered), base on y=0. */
export function AppleModel() {
  return (
    <group>
      {/* Clear trunk so the round crown reads as a fruit tree, not a bush. */}
      <mesh position={[0, 0.375, 0]} castShadow material={TRUNK}>
        <cylinderGeometry args={[0.1, 0.14, 0.75, 7]} />
      </mesh>
      {/* Rounded crown. */}
      {FOLIAGE.map((f, i) => (
        <mesh key={i} position={f.p} castShadow material={f.m}>
          <icosahedronGeometry args={[f.r, 1]} />
        </mesh>
      ))}
      {/* Ripe apples in the canopy. */}
      {APPLES.map((a, i) => (
        <mesh key={`a${i}`} position={a} castShadow material={APPLE}>
          <sphereGeometry args={[0.1, 8, 6]} />
        </mesh>
      ))}
      {/* Windfall apples at the base. */}
      {WINDFALLS.map((a, i) => (
        <mesh key={`w${i}`} position={a} castShadow material={APPLE}>
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
  // n=26 because scatterInRegion now drops rim points overlapping onto swamp/grass/
  // off-island tiles (~½ of the forest ring), leaving ~14 apple trees in the wood.
  spawns: () => scatterInRegion('forest', 26),
}

export function AppleTrees() {
  return <ForageField config={APPLE_CONFIG} />
}
