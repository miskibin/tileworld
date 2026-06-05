import * as THREE from 'three'

// Desert-biome landmark: a weathered stepped sandstone pyramid, partly sunk into
// the dunes, tapering to a small capstone with a dark doorway. ~1.6 units tall,
// ~2.2-unit footprint — pyramids read wide and low.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. A subtle "buried" look comes from the wide drifted-sand skirt and a
// faint lean, never from sinking structure below the ground plane. No lights, no
// interaction.

// --- palette -----------------------------------------------------------------
const SAND = '#cdab6e' // warm sandstone (light tiers)
const SAND_DARK = '#a8854c' // weathered darker stone (alt tiers + trim)
const SAND_SKIRT = '#bf9d63' // drifted sand around the base
const CAP = '#d8c48f' // pale sun-bleached capstone
const SHADOW = '#2c2114' // doorway void

// --- dimensions --------------------------------------------------------------
// Stepped tiers: each a square box, narrowing as it rises. Built upward from
// y=0. Five short courses keep the silhouette stepped without getting tall.
const TIERS = [
  { w: 2.2, h: 0.3 },
  { w: 1.82, h: 0.28 },
  { w: 1.44, h: 0.26 },
  { w: 1.06, h: 0.24 },
  { w: 0.68, h: 0.22 },
] as const

const SKIRT_W = 2.55
const SKIRT_H = 0.14
const CAP_R = 0.4
const CAP_H = 0.34

// Doorway carved into the front (+Z) of the lowest two courses.
const DOOR_W = 0.42
const DOOR_H = 0.62
const JAMB_W = 0.1

// --- shared materials (module-level, flat-shaded) ----------------------------
const sandMat = new THREE.MeshStandardMaterial({ color: SAND, roughness: 1, flatShading: true })
const darkMat = new THREE.MeshStandardMaterial({ color: SAND_DARK, roughness: 1, flatShading: true })
const skirtMat = new THREE.MeshStandardMaterial({ color: SAND_SKIRT, roughness: 1, flatShading: true })
const capMat = new THREE.MeshStandardMaterial({ color: CAP, roughness: 0.8, flatShading: true })
const voidMat = new THREE.MeshStandardMaterial({ color: SHADOW, roughness: 1, flatShading: true })

// Precompute cumulative base-y of each tier (skirt sits beneath, tiers start at 0).
const tierY: number[] = []
{
  let y = 0
  for (const t of TIERS) {
    tierY.push(y)
    y += t.h
  }
}
const topY = tierY[TIERS.length - 1] + TIERS[TIERS.length - 1].h
const frontZ = TIERS[0].w / 2 // +Z face of the base course

export function SunkenPyramid({
  position = [0, 0, 0],
  rotation = 0,
}: {
  position?: [number, number, number]
  rotation?: number
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Faint settled lean — small enough that no corner clips below ground. */}
      <group rotation={[0.02, 0, -0.015]}>
        {/* Drifted sand skirt fanning out around the buried base. */}
        <mesh position={[0, SKIRT_H / 2, 0]} receiveShadow material={skirtMat}>
          <boxGeometry args={[SKIRT_W, SKIRT_H, SKIRT_W]} />
        </mesh>

        {/* Stepped sandstone courses, alternating light / weathered. */}
        {TIERS.map((t, i) => (
          <mesh
            key={i}
            position={[0, tierY[i] + t.h / 2, 0]}
            castShadow
            receiveShadow
            material={i % 2 ? darkMat : sandMat}
          >
            <boxGeometry args={[t.w, t.h, t.w]} />
          </mesh>
        ))}

        {/* Pale capstone crowning the top course. */}
        <mesh position={[0, topY + CAP_H / 2, 0]} castShadow receiveShadow material={capMat}>
          <coneGeometry args={[CAP_R, CAP_H, 4]} />
        </mesh>

        {/* Dark doorway recess in the front face of the lowest courses. */}
        <mesh position={[0, SKIRT_H + DOOR_H / 2, frontZ - 0.04]} material={voidMat}>
          <boxGeometry args={[DOOR_W, DOOR_H, 0.16]} />
        </mesh>
        {/* Two stone jambs framing the doorway. */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * (DOOR_W / 2 + JAMB_W / 2), SKIRT_H + DOOR_H / 2, frontZ + 0.02]}
            castShadow
            material={darkMat}
          >
            <boxGeometry args={[JAMB_W, DOOR_H + 0.06, 0.12]} />
          </mesh>
        ))}
        {/* Worn lintel slab spanning the doorway. */}
        <mesh
          position={[0, SKIRT_H + DOOR_H + 0.06, frontZ + 0.02]}
          castShadow
          material={darkMat}
        >
          <boxGeometry args={[DOOR_W + 2 * JAMB_W + 0.06, 0.12, 0.14]} />
        </mesh>
      </group>
    </group>
  )
}
