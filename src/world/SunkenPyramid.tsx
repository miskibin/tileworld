import { useMemo } from 'react'
import * as THREE from 'three'

// Desert-biome landmark: a weathered stepped sandstone pyramid, half-buried and
// tilted in the dunes, with a dark doorway and a worn capstone. ~6 units tall.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. The whole structure leans via an inner group to read as "sunken". No
// lights, no interaction.

const SAND = '#cdab6e'
const SAND_DARK = '#a8854c'
const SAND_LIGHT = '#ddc189'
const SHADOW = '#3a2c18' // doorway void
const CAP = '#c0b890' // pale capstone

// Stepped tiers: each is a square box, narrowing as it rises. Built upward from
// y=0; the buried/tilt look comes from the wrapping group, not from sinking a
// tier below the ground (keeps the inspector happy about base alignment).
const TIERS = [
  { w: 5.4, h: 1.0 },
  { w: 4.4, h: 0.95 },
  { w: 3.4, h: 0.9 },
  { w: 2.4, h: 0.85 },
  { w: 1.5, h: 0.8 },
]

export function SunkenPyramid({
  position = [0, 0, 0],
  rotation = 0,
}: {
  position?: [number, number, number]
  rotation?: number
}) {
  const sandMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SAND, roughness: 1, flatShading: true }),
    [],
  )
  const darkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SAND_DARK, roughness: 1, flatShading: true }),
    [],
  )
  const lightMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SAND_LIGHT, roughness: 1, flatShading: true }),
    [],
  )
  const capMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CAP, roughness: 0.85, flatShading: true }),
    [],
  )
  const voidMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SHADOW, roughness: 1 }),
    [],
  )

  // Precompute the cumulative y of each tier base.
  const tierY: number[] = []
  {
    let y = 0
    for (const t of TIERS) {
      tierY.push(y)
      y += t.h
    }
  }
  const topY = tierY[TIERS.length - 1] + TIERS[TIERS.length - 1].h

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Slight tilt + partial bury: lean the pyramid and let the base tier skirt
          spread out like drifted sand. A small lift keeps the lowest tilted
          corner at the ground plane (rather than corner-buried) so the structure
          still reads as settled into the dune without clipping under terrain. */}
      <group position={[0, 0.12, 0]} rotation={[0.035, 0, -0.028]}>
        {/* Drifted sand skirt around the base */}
        <mesh position={[0, 0.18, 0]} receiveShadow material={lightMat}>
          <boxGeometry args={[6.2, 0.36, 6.2]} />
        </mesh>

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

        {/* Capstone on top */}
        <mesh position={[0, topY + 0.4, 0]} castShadow receiveShadow material={capMat}>
          <coneGeometry args={[0.95, 0.8, 4]} />
        </mesh>

        {/* Dark doorway carved into the front (lowest two tiers, +Z face) */}
        <mesh position={[0, 0.95, TIERS[0].w / 2 - 0.05]} material={voidMat}>
          <boxGeometry args={[0.85, 1.5, 0.5]} />
        </mesh>
        {/* Lintel above the doorway */}
        <mesh position={[0, 1.78, TIERS[0].w / 2 + 0.02]} castShadow material={darkMat}>
          <boxGeometry args={[1.15, 0.28, 0.3]} />
        </mesh>
        {/* Two doorway jambs */}
        {[-0.55, 0.55].map((jx, i) => (
          <mesh key={i} position={[jx, 0.9, TIERS[0].w / 2 + 0.02]} castShadow material={darkMat}>
            <boxGeometry args={[0.22, 1.6, 0.3]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
