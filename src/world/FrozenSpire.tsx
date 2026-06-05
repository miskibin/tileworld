import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Snow-biome landmark: a tidy cluster of pale-blue ice crystals — one tall
// faceted spire flanked by a few shorter shards of varied height, rising from a
// small frosted base. Stylised low-poly to match the game's flat-shaded look;
// kept compact (~1.8 footprint, ~2.2 tall) so it reads as scenery, not a tower.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const ICE = '#a9d2f0' // pale crystal blue
const ICE_PALE = '#dcf0fb' // bright highlight facet
const ICE_DEEP = '#6fa6d6' // deep inner ice
const FROST = '#cfe4f2' // frosted base

// Tapered hexagonal ice crystal: a prism body capped by a faceted point, merged
// to one geometry so each shard is a single cheap draw. h = total height,
// r = base radius. The slight inward taper gives a clean crystal silhouette.
function crystalGeo(h: number, r: number): THREE.BufferGeometry {
  const bodyH = h * 0.64
  const tipH = h * 0.36
  const body = new THREE.CylinderGeometry(r * 0.66, r, bodyH, 6)
  body.translate(0, bodyH / 2, 0)
  const tip = new THREE.ConeGeometry(r * 0.66, tipH, 6)
  tip.translate(0, bodyH + tipH / 2, 0)
  return mergeGeometries([body, tip], false) as THREE.BufferGeometry
}

// Central spire + frosted base, defined once as module-level geometry.
const SPIRE_H = 2.0
const SPIRE_R = 0.36
const SPIRE_GEO = crystalGeo(SPIRE_H, SPIRE_R)

// Slim deep-ice inner facet running up the spire for colour depth.
const CORE_GEO = (() => {
  const g = crystalGeo(SPIRE_H * 0.78, SPIRE_R * 0.42)
  return g
})()

const BASE_H = 0.26
const BASE_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.78, 0.95, BASE_H, 8)
  g.translate(0, BASE_H / 2, 0)
  return g
})()

interface Shard {
  x: number
  z: number
  h: number
  r: number
  rot: number
  lean: number
  pale: boolean
}
// A small ring of flanking shards, varied height, leaning gently outward so the
// silhouette steps down cleanly from the central spire. Kept inside the base.
const SHARDS: Shard[] = [
  { x: 0.42, z: 0.18, h: 1.32, r: 0.24, rot: 0.5, lean: 0.16, pale: true },
  { x: -0.36, z: 0.34, h: 1.04, r: 0.2, rot: 1.4, lean: -0.18, pale: false },
  { x: -0.28, z: -0.42, h: 1.5, r: 0.26, rot: 2.3, lean: 0.14, pale: true },
  { x: 0.34, z: -0.34, h: 0.84, r: 0.18, rot: 0.9, lean: -0.2, pale: false },
]
// Shard geometries are static — build them once at module load (not per render).
const SHARD_GEOS = SHARDS.map((s) => crystalGeo(s.h, s.r))

// Materials are instance-invariant — module-level consts, shared across every
// spire and never rebuilt (no per-component useMemo).
const ICE_MAT = new THREE.MeshStandardMaterial({ color: ICE, roughness: 0.28, metalness: 0.08, flatShading: true })
const PALE_MAT = new THREE.MeshStandardMaterial({ color: ICE_PALE, roughness: 0.34, flatShading: true })
const DEEP_MAT = new THREE.MeshStandardMaterial({ color: ICE_DEEP, roughness: 0.38, flatShading: true })
const FROST_MAT = new THREE.MeshStandardMaterial({ color: FROST, roughness: 0.7, flatShading: true })

export function FrozenSpire({
  position = [0, 0, 0],
  rotation = 0,
}: {
  position?: [number, number, number]
  rotation?: number
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Frosted base mound — shards and spire are seated just inside its rim */}
      <mesh geometry={BASE_GEO} material={FROST_MAT} castShadow receiveShadow />

      {/* Central spire, leaning a hair for a natural crystal feel */}
      <group position={[0, BASE_H, 0]} rotation={[0.03, 0.4, 0.03]}>
        <mesh geometry={SPIRE_GEO} material={ICE_MAT} castShadow receiveShadow />
        {/* Deep-ice inner facet, nested so it shares the spire's lean */}
        <mesh geometry={CORE_GEO} material={DEEP_MAT} position={[0.04, 0, 0.02]} castShadow />
      </group>

      {/* Ring of flanking shards seated on the base */}
      {SHARDS.map((s, i) => (
        <group key={i} position={[s.x, BASE_H, s.z]} rotation={[s.lean, s.rot, s.lean * 0.5]}>
          <mesh geometry={SHARD_GEOS[i]} material={s.pale ? PALE_MAT : ICE_MAT} castShadow receiveShadow />
        </group>
      ))}
    </group>
  )
}
