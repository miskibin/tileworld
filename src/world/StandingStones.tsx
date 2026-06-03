import { useMemo } from 'react'
import * as THREE from 'three'

// Rock-biome landmark: a stone circle — six rough megaliths standing in a ring
// with two lintels laid across the top of adjacent pairs, like a henge. Tallest
// uprights ~4.5 units. A clear focal point on the rocky highlands.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const STONE = '#8a8780'
const STONE_DARK = '#62605a'
const MOSS = '#6f7d3c'

const RING_R = 3.2 // radius of the circle
const N_STONES = 6
const STONE_H = 4.2
const STONE_W = 1.1
const STONE_D = 0.7

// Per-stone deterministic variation (height, yaw jitter, lean) so the ring looks
// rough-hewn rather than stamped.
function frac(x: number): number {
  return x - Math.floor(x)
}
function hash(i: number, s: number): number {
  return frac(Math.sin(i * 12.9898 + s * 78.233) * 43758.5453)
}

export function StandingStones({
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

  // Build stone placements once.
  const stones = useMemo(() => {
    return Array.from({ length: N_STONES }, (_, i) => {
      const a = (i / N_STONES) * Math.PI * 2
      const x = Math.cos(a) * RING_R
      const z = Math.sin(a) * RING_R
      const h = STONE_H * (0.78 + hash(i, 1) * 0.32)
      const lean = (hash(i, 2) - 0.5) * 0.16
      const yaw = a + Math.PI / 2 + (hash(i, 3) - 0.5) * 0.3 // face the centre, jittered
      const fallen = i === 4 // one toppled stone for ruin character
      return { x, z, h, lean, yaw, fallen }
    })
  }, [])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Low earth/turf platform the circle stands on */}
      <mesh position={[0, 0.1, 0]} receiveShadow material={darkMat}>
        <cylinderGeometry args={[RING_R + 1.0, RING_R + 1.2, 0.2, 16]} />
      </mesh>

      {stones.map((s, i) =>
        s.fallen ? (
          // Toppled megalith lying on its side on the platform
          <group key={i} position={[s.x, 0.62, s.z]} rotation={[0, s.yaw, Math.PI / 2]}>
            <mesh castShadow receiveShadow material={stoneMat}>
              <boxGeometry args={[STONE_W, s.h * 0.85, STONE_D]} />
            </mesh>
          </group>
        ) : (
          <group key={i} position={[s.x, 0.2, s.z]} rotation={[s.lean, s.yaw, s.lean * 0.5]}>
            {/* Upright megalith — slightly narrower at top for a hewn look */}
            <mesh position={[0, s.h / 2, 0]} castShadow receiveShadow material={stoneMat}>
              <boxGeometry args={[STONE_W, s.h, STONE_D]} />
            </mesh>
            <mesh position={[0, s.h, 0]} castShadow material={stoneMat}>
              <boxGeometry args={[STONE_W * 0.85, 0.4, STONE_D * 0.85]} />
            </mesh>
            {/* Moss patch creeping up the base of some stones */}
            {i % 2 === 0 && (
              <mesh position={[0, 0.5, STONE_D / 2 + 0.005]} material={mossMat}>
                <boxGeometry args={[STONE_W * 0.7, 0.8, 0.04]} />
              </mesh>
            )}
          </group>
        ),
      )}

      {/* Two lintels laid across the tops of adjacent standing pairs (stones
          0-1 and 2-3). Each spans the gap between two uprights at their top. */}
      {[
        [0, 1],
        [2, 3],
      ].map(([a, b], k) => {
        const sa = stones[a]
        const sb = stones[b]
        const mx = (sa.x + sb.x) / 2
        const mz = (sa.z + sb.z) / 2
        const dx = sb.x - sa.x
        const dz = sb.z - sa.z
        const span = Math.hypot(dx, dz)
        const ang = Math.atan2(dz, dx)
        const y = Math.min(sa.h, sb.h) + 0.2
        return (
          <group key={`lintel-${k}`} position={[mx, y, mz]} rotation={[0, -ang, 0]}>
            <mesh castShadow receiveShadow material={darkMat}>
              <boxGeometry args={[span + STONE_W * 0.6, 0.5, STONE_D * 0.9]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
