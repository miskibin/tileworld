import { useMemo } from 'react'
import * as THREE from 'three'

// Forest-biome landmark: a small, overgrown ruined shrine — a low stone platform
// carrying a few weathered columns at varied broken heights, one toppled column
// drum lying on the platform, a partial lintel still bridging the two tall
// columns, a mossy altar block, and a little scattered rubble. A quiet, pretty
// focal point in the woods. ~2.4-unit footprint, ~2.0 units tall.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const STONE = '#a8a399'
const STONE_DARK = '#736e64'
const MOSS = '#5d7a3a'
const MOSS_DARK = '#445c2a'

// --- platform ---
const PLAT_W = 2.4 // x footprint
const PLAT_D = 2.2 // z footprint
const PLAT_H = 0.18 // step slab thickness
const PLAT_TOP = PLAT_H // columns stand on top of the slab

// --- columns ---
const COL_R = 0.2
const PLINTH = 0.12 // square base block under each column
const TALL_H = 1.55 // intact pair height (shaft above plinth)
const CAP_H = 0.12 // capital block height

// Shared materials are created per-instance in the component (R3F convention in
// this repo memoises them so they aren't rebuilt every render); named here only
// via the palette consts above.

interface ColSpec {
  x: number
  z: number
  h: number // shaft height
  cap: boolean // intact capital on top?
  broken: boolean // jagged broken crown instead of a capital?
}

// Four columns ringing the altar. The back pair (negative z) is tall + intact and
// carries the surviving lintel; the front pair is broken to varied heights.
const COL_GAP_X = 0.78 // half-distance between left/right columns
const COL_BACK_Z = -0.7
const COL_FRONT_Z = 0.7

const COLUMNS: ColSpec[] = [
  { x: -COL_GAP_X, z: COL_BACK_Z, h: TALL_H, cap: true, broken: false },
  { x: COL_GAP_X, z: COL_BACK_Z, h: TALL_H, cap: true, broken: false },
  { x: -COL_GAP_X, z: COL_FRONT_Z, h: 0.95, cap: false, broken: true },
  { x: COL_GAP_X, z: COL_FRONT_Z, h: 0.45, cap: false, broken: true },
]

// Mossy patches clinging to bases / platform corners.
interface Patch {
  x: number
  z: number
  w: number
  d: number
}
const MOSS_PATCHES: Patch[] = [
  { x: -0.85, z: 0.85, w: 0.5, d: 0.45 },
  { x: 0.95, z: -0.55, w: 0.4, d: 0.5 },
  { x: 0.2, z: 0.95, w: 0.55, d: 0.35 },
]

// Small scattered rubble blocks on / beside the platform.
interface Rubble {
  x: number
  z: number
  s: number
  rot: number
  dark: boolean
}
const RUBBLE: Rubble[] = [
  { x: 0.95, z: 0.7, s: 0.26, rot: 0.6, dark: false },
  { x: -1.0, z: -0.25, s: 0.22, rot: 1.3, dark: true },
  { x: 0.55, z: -0.9, s: 0.2, rot: 2.0, dark: false },
]

function Column({
  spec,
  stoneMat,
  darkMat,
  mossMat,
}: {
  spec: ColSpec
  stoneMat: THREE.Material
  darkMat: THREE.Material
  mossMat: THREE.Material
}) {
  const plinthTop = PLAT_TOP + PLINTH
  const shaftTop = plinthTop + spec.h
  return (
    <group position={[spec.x, 0, spec.z]}>
      {/* Square plinth resting on the platform */}
      <mesh position={[0, PLAT_TOP + PLINTH / 2, 0]} castShadow receiveShadow material={darkMat}>
        <boxGeometry args={[COL_R * 2.6, PLINTH, COL_R * 2.6]} />
      </mesh>
      {/* Tapered shaft */}
      <mesh position={[0, plinthTop + spec.h / 2, 0]} castShadow receiveShadow material={stoneMat}>
        <cylinderGeometry args={[COL_R * 0.86, COL_R, spec.h, 8]} />
      </mesh>
      {spec.cap && (
        <mesh position={[0, shaftTop + CAP_H / 2, 0]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[COL_R * 2.5, CAP_H, COL_R * 2.5]} />
        </mesh>
      )}
      {spec.broken && (
        // Jagged broken crown — a little tilted cone sitting on the shaft top.
        <mesh
          position={[COL_R * 0.18, shaftTop + 0.07, COL_R * 0.12]}
          rotation={[0.25, 0.5, 0.18]}
          castShadow
          material={stoneMat}
        >
          <coneGeometry args={[COL_R * 0.95, 0.22, 6]} />
        </mesh>
      )}
      {/* Moss skirt around the base */}
      <mesh position={[0, PLAT_TOP + 0.04, 0]} receiveShadow material={mossMat}>
        <boxGeometry args={[COL_R * 2.8, 0.06, COL_R * 2.8]} />
      </mesh>
    </group>
  )
}

export function RuinedShrine({
  position = [0, 0, 0],
  rotation = 0,
}: {
  position?: [number, number, number]
  rotation?: number
}) {
  const stoneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE, roughness: 1, flatShading: true }),
    [],
  )
  const darkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 1, flatShading: true }),
    [],
  )
  const mossMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, flatShading: true }),
    [],
  )
  const mossDarkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MOSS_DARK, roughness: 1, flatShading: true }),
    [],
  )

  // Lintel bridges the two tall back columns at their capital height.
  const lintelY = PLAT_TOP + PLINTH + TALL_H + CAP_H

  // A toppled column drum lying on the platform (rolled to its side).
  const TOPPLE_LEN = 1.1
  const toppleY = PLAT_TOP + COL_R // half-diameter off the slab

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* --- Low stepped stone platform --- */}
      {/* Wide bottom step */}
      <mesh position={[0, PLAT_H / 2, 0]} receiveShadow castShadow material={darkMat}>
        <boxGeometry args={[PLAT_W, PLAT_H, PLAT_D]} />
      </mesh>
      {/* Inner riser (slightly inset) for a tidy stepped read */}
      <mesh position={[0, PLAT_H + 0.05, 0]} receiveShadow castShadow material={stoneMat}>
        <boxGeometry args={[PLAT_W - 0.45, 0.1, PLAT_D - 0.45]} />
      </mesh>

      {/* --- Columns --- */}
      {COLUMNS.map((spec, i) => (
        <Column
          key={`col-${i}`}
          spec={spec}
          stoneMat={stoneMat}
          darkMat={darkMat}
          mossMat={mossMat}
        />
      ))}

      {/* --- Surviving lintel across the tall back pair --- */}
      <mesh
        position={[0, lintelY + 0.08, COL_BACK_Z]}
        rotation={[0, 0, 0.015]}
        castShadow
        receiveShadow
        material={stoneMat}
      >
        <boxGeometry args={[COL_GAP_X * 2 + COL_R * 2.4, 0.18, COL_R * 2.2]} />
      </mesh>
      {/* Moss creeping over the lintel top */}
      <mesh position={[0, lintelY + 0.19, COL_BACK_Z]} material={mossMat}>
        <boxGeometry args={[COL_GAP_X * 2, 0.05, COL_R * 1.8]} />
      </mesh>

      {/* --- Toppled column drum lying on the platform --- */}
      <group position={[0.45, toppleY, 0.05]} rotation={[0, 0.35, Math.PI / 2]}>
        <mesh castShadow receiveShadow material={stoneMat}>
          <cylinderGeometry args={[COL_R, COL_R * 0.92, TOPPLE_LEN, 8]} />
        </mesh>
      </group>

      {/* --- Mossy altar block at the centre --- */}
      <group position={[0, 0, 0]}>
        {/* base step */}
        <mesh position={[0, PLAT_TOP + 0.08, 0]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[0.78, 0.16, 0.62]} />
        </mesh>
        {/* altar body */}
        <mesh position={[0, PLAT_TOP + 0.16 + 0.21, 0]} castShadow receiveShadow material={stoneMat}>
          <boxGeometry args={[0.6, 0.42, 0.46]} />
        </mesh>
        {/* moss slab on top */}
        <mesh position={[0, PLAT_TOP + 0.16 + 0.42 + 0.03, 0]} receiveShadow material={mossDarkMat}>
          <boxGeometry args={[0.64, 0.06, 0.5]} />
        </mesh>
      </group>

      {/* --- Scattered moss patches on the platform --- */}
      {MOSS_PATCHES.map((p, i) => (
        <mesh
          key={`moss-${i}`}
          position={[p.x, PLAT_TOP + 0.03, p.z]}
          receiveShadow
          material={mossMat}
        >
          <boxGeometry args={[p.w, 0.05, p.d]} />
        </mesh>
      ))}

      {/* --- Scattered rubble --- */}
      {RUBBLE.map((r, i) => (
        <mesh
          key={`rub-${i}`}
          position={[r.x, PLAT_TOP + r.s / 2, r.z]}
          rotation={[r.rot * 0.25, r.rot, r.rot * 0.18]}
          castShadow
          receiveShadow
          material={r.dark ? darkMat : stoneMat}
        >
          <boxGeometry args={[r.s, r.s * 0.8, r.s * 0.9]} />
        </mesh>
      ))}
    </group>
  )
}
