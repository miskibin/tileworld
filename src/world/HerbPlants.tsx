import * as THREE from 'three'
import { scatterInRegion } from './tileMap'
import { ForageField, type ForageConfig } from './ForageField'
import { herbStore } from './herbStore'

// Marsh herbs in the swamp — walk up to one to FORAGE it (no swinging), yielding
// a Marsh Herb (heal + resist) for hard nights. The forage loop, placement and
// culling all live in ForageField; this module is just the model + config.
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

// Scattered across the reachable swamp blob (REGIONS 'swamp'); findSpawnNear
// snaps each onto a standable, prop-free tile.
const HERB_CONFIG: ForageConfig = {
  Model: HerbModel,
  item: 'marsh_herb',
  store: herbStore,
  harvestR: 0.85,
  float: { text: '+🌿 Marsh Herb', color: '#aef0c4', y: 1.0 },
  sway: { freq: 1.3, amp: 0.08 },
  spawns: () => scatterInRegion('swamp', 6),
}

export function HerbPlants() {
  return <ForageField config={HERB_CONFIG} />
}
