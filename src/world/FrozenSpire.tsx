import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Snow-biome landmark: a tall frozen obelisk of pale-blue ice, jagged at the
// crown, ringed by smaller shards jutting from a frosted base. Built tall enough
// (~8 units) to read as a focal point from across the snowfield.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const ICE = '#9fc6e8'
const ICE_DEEP = '#6f9fcf'
const ICE_PALE = '#d8ecf8'
const FROST = '#eaf4fb'

// Tapered hexagonal ice crystal: a prism body capped by a point, as one merged
// geometry so each shard is cheap. h = total height, r = base radius.
function crystalGeo(h: number, r: number): THREE.BufferGeometry {
  const bodyH = h * 0.7
  const tipH = h * 0.3
  const body = new THREE.CylinderGeometry(r * 0.62, r, bodyH, 6)
  body.translate(0, bodyH / 2, 0)
  const tip = new THREE.ConeGeometry(r * 0.62, tipH, 6)
  tip.translate(0, bodyH + tipH / 2, 0)
  return mergeGeometries([body, tip], false) as THREE.BufferGeometry
}

// Central obelisk + base + ring of shards, defined once as module-level geometry.
const SPIRE_GEO = crystalGeo(7.2, 0.85)
const BASE_GEO = (() => {
  const g = new THREE.CylinderGeometry(2.0, 2.4, 0.7, 8)
  g.translate(0, 0.35, 0)
  return g
})()

interface Shard {
  x: number
  z: number
  h: number
  r: number
  rot: number
  lean: number
}
const SHARDS: Shard[] = [
  { x: 1.4, z: 0.5, h: 3.4, r: 0.5, rot: 0.4, lean: 0.18 },
  { x: -1.2, z: 1.1, h: 2.6, r: 0.42, rot: 1.2, lean: -0.22 },
  { x: -0.6, z: -1.5, h: 4.0, r: 0.55, rot: 2.1, lean: 0.12 },
  { x: 1.0, z: -1.2, h: 2.2, r: 0.38, rot: 0.8, lean: 0.26 },
  { x: -1.6, z: -0.3, h: 3.0, r: 0.48, rot: 3.0, lean: -0.16 },
  { x: 0.4, z: 1.6, h: 2.4, r: 0.4, rot: 1.7, lean: 0.2 },
]
// Shard geometries are static — build them once at module load (not per render).
const SHARD_GEOS = SHARDS.map((s) => crystalGeo(s.h, s.r))

// Materials are instance-invariant — module-level consts, shared across every
// spire and never rebuilt (no per-component useMemo).
const ICE_MAT = new THREE.MeshStandardMaterial({ color: ICE, roughness: 0.3, metalness: 0.1, flatShading: true })
const ICE_DEEP_MAT = new THREE.MeshStandardMaterial({ color: ICE_DEEP, roughness: 0.35, flatShading: true })
const PALE_MAT = new THREE.MeshStandardMaterial({ color: ICE_PALE, roughness: 0.4, flatShading: true })
const FROST_MAT = new THREE.MeshStandardMaterial({ color: FROST, roughness: 0.6, flatShading: true })

export function FrozenSpire({
  position = [0, 0, 0],
  rotation = 0,
}: {
  position?: [number, number, number]
  rotation?: number
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Frosted base mound */}
      <mesh geometry={BASE_GEO} material={FROST_MAT} castShadow receiveShadow />

      {/* Central obelisk, leaning very slightly for a jagged feel */}
      <group position={[0, 0.5, 0]} rotation={[0.04, 0.3, 0.05]}>
        <mesh geometry={SPIRE_GEO} material={ICE_MAT} castShadow receiveShadow />
        {/* Deep-ice inner facet for color depth */}
        <mesh position={[0.18, 2.6, 0.12]} rotation={[0.1, 0.5, 0.08]} material={ICE_DEEP_MAT} castShadow>
          <coneGeometry args={[0.32, 4.6, 5]} />
        </mesh>
      </group>

      {/* Ring of smaller shards around the base */}
      {SHARDS.map((s, i) => (
        <group
          key={i}
          position={[s.x, 0.45, s.z]}
          rotation={[s.lean, s.rot, s.lean * 0.5]}
        >
          <mesh geometry={SHARD_GEOS[i]} material={i % 2 ? PALE_MAT : ICE_MAT} castShadow receiveShadow />
        </group>
      ))}
    </group>
  )
}
