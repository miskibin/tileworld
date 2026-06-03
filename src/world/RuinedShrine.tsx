import { useMemo } from 'react'
import * as THREE from 'three'

// Forest-biome landmark: a small ruined stone shrine — a pair of intact columns
// carrying a cracked lintel (the surviving archway), two broken column stumps, a
// mossy altar at the centre, and scattered rubble. ~4.5 units at the archway. A
// quiet focal point in the woods.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const STONE = '#9a958a'
const STONE_DARK = '#6b675e'
const MOSS = '#5d7a3a'
const MOSS_DARK = '#46612b'

const COL_R = 0.42
const COL_H = 3.4
const SPAN = 2.8 // distance between the two intact columns (along X)

// Fluted column: a slightly tapered drum stack. Built as one tapered cylinder
// with a wider base plinth.
function columnGroup(
  key: string,
  x: number,
  z: number,
  height: number,
  stoneMat: THREE.Material,
  darkMat: THREE.Material,
) {
  return (
    <group key={key} position={[x, 0, z]}>
      {/* Square plinth */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow material={darkMat}>
        <boxGeometry args={[COL_R * 2.6, 0.4, COL_R * 2.6]} />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, 0.4 + height / 2, 0]} castShadow receiveShadow material={stoneMat}>
        <cylinderGeometry args={[COL_R * 0.85, COL_R, height, 8]} />
      </mesh>
      {/* Capital */}
      <mesh position={[0, 0.4 + height + 0.12, 0]} castShadow receiveShadow material={darkMat}>
        <boxGeometry args={[COL_R * 2.3, 0.24, COL_R * 2.3]} />
      </mesh>
    </group>
  )
}

interface Rubble {
  x: number
  z: number
  s: number
  rot: number
}
const RUBBLE: Rubble[] = [
  { x: 1.9, z: 1.4, s: 0.6, rot: 0.5 },
  { x: -2.1, z: 0.8, s: 0.5, rot: 1.2 },
  { x: 0.6, z: -2.0, s: 0.7, rot: 2.1 },
  { x: -1.4, z: -1.6, s: 0.45, rot: 0.9 },
  { x: 2.2, z: -0.6, s: 0.4, rot: 1.8 },
]

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

  const lintelY = 0.4 + COL_H + 0.24

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Cracked stone foundation slab */}
      <mesh position={[0, 0.08, 0]} receiveShadow material={darkMat}>
        <boxGeometry args={[5.2, 0.16, 4.6]} />
      </mesh>

      {/* Two intact columns carrying the surviving archway */}
      {columnGroup('col-l', -SPAN / 2, -1.4, COL_H, stoneMat, darkMat)}
      {columnGroup('col-r', SPAN / 2, -1.4, COL_H, stoneMat, darkMat)}

      {/* Cracked lintel across the top — split into two offset blocks so it reads
          as broken at the join. */}
      <group position={[0, lintelY + 0.2, -1.4]}>
        <mesh position={[-0.75, 0.0, 0]} rotation={[0, 0, 0.04]} castShadow receiveShadow material={stoneMat}>
          <boxGeometry args={[SPAN / 2 + 0.3, 0.4, 0.7]} />
        </mesh>
        <mesh position={[0.78, 0.05, 0]} rotation={[0, 0, -0.06]} castShadow receiveShadow material={stoneMat}>
          <boxGeometry args={[SPAN / 2 + 0.2, 0.4, 0.7]} />
        </mesh>
        {/* Moss along the top of the lintel */}
        <mesh position={[0, 0.24, 0]} material={mossMat}>
          <boxGeometry args={[SPAN + 0.2, 0.06, 0.55]} />
        </mesh>
      </group>

      {/* Two broken column stumps (front row) */}
      <group position={[-SPAN / 2, 0, 1.5]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[COL_R * 2.6, 0.4, COL_R * 2.6]} />
        </mesh>
        <mesh position={[0, 0.4 + 0.55, 0]} rotation={[0.06, 0, 0.04]} castShadow receiveShadow material={stoneMat}>
          <cylinderGeometry args={[COL_R, COL_R, 1.1, 8]} />
        </mesh>
        {/* jagged broken top */}
        <mesh position={[0.08, 0.4 + 1.15, 0.05]} rotation={[0.3, 0.4, 0.2]} castShadow material={stoneMat}>
          <coneGeometry args={[COL_R * 0.9, 0.3, 6]} />
        </mesh>
      </group>
      <group position={[SPAN / 2, 0, 1.5]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[COL_R * 2.6, 0.4, COL_R * 2.6]} />
        </mesh>
        <mesh position={[0, 0.4 + 0.35, 0]} rotation={[-0.05, 0, -0.05]} castShadow receiveShadow material={stoneMat}>
          <cylinderGeometry args={[COL_R, COL_R, 0.7, 8]} />
        </mesh>
      </group>

      {/* Fallen column drum lying across the slab */}
      <group position={[0.4, 0.42, 0.4]} rotation={[0, 0.3, Math.PI / 2]}>
        <mesh castShadow receiveShadow material={stoneMat}>
          <cylinderGeometry args={[COL_R * 0.9, COL_R * 0.9, 1.8, 8]} />
        </mesh>
      </group>

      {/* Mossy altar at the centre */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow receiveShadow material={stoneMat}>
          <boxGeometry args={[1.3, 0.7, 0.9]} />
        </mesh>
        {/* Moss blanket over the altar top */}
        <mesh position={[0, 0.82, 0]} receiveShadow material={mossDarkMat}>
          <boxGeometry args={[1.34, 0.08, 0.94]} />
        </mesh>
        {/* Worn altar base step */}
        <mesh position={[0, 0.12, 0]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[1.6, 0.24, 1.2]} />
        </mesh>
      </group>

      {/* Scattered rubble blocks */}
      {RUBBLE.map((r, i) => (
        <mesh
          key={`rub-${i}`}
          position={[r.x, r.s / 2 + 0.08, r.z]}
          rotation={[r.rot * 0.3, r.rot, r.rot * 0.2]}
          castShadow
          receiveShadow
          material={i % 2 ? stoneMat : darkMat}
        >
          <boxGeometry args={[r.s, r.s * 0.8, r.s * 0.9]} />
        </mesh>
      ))}
    </group>
  )
}
