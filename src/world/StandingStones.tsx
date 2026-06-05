import { useMemo } from 'react'
import * as THREE from 'three'

// Rock-biome landmark: a small weathered megalith circle — five rough granite
// uprights leaning slightly around a low central altar stone. A tidy, pretty
// focal point on the rocky highlands rather than a sprawling henge.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const GRANITE = '#8f8c86' // light weathered granite
const GRANITE_DARK = '#6b6862' // shaded / base tone + altar
const MOSS = '#74803f' // subtle moss accent

const RING_R = 0.85 // radius of the circle (centres of the uprights)
const N_STONES = 5
const STONE_H = 1.55 // base upright height (varied per stone)
const STONE_W = 0.34
const STONE_D = 0.22
const PLINTH_H = 0.12 // low turf/earth platform the circle stands on

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
    () => new THREE.MeshStandardMaterial({ color: GRANITE, roughness: 1, flatShading: true }),
    [],
  )
  const darkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: GRANITE_DARK, roughness: 1, flatShading: true }),
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
      const h = STONE_H * (0.82 + hash(i, 1) * 0.3) // ~1.27..1.65 tall
      const lean = (hash(i, 2) - 0.5) * 0.13 // gentle tilt
      const yaw = a + Math.PI / 2 + (hash(i, 3) - 0.5) * 0.4 // roughly face the centre
      const w = STONE_W * (0.85 + hash(i, 4) * 0.35) // slight width variety
      return { x, z, h, lean, yaw, w }
    })
  }, [])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Low turf platform the circle stands on */}
      <mesh position={[0, PLINTH_H / 2, 0]} receiveShadow material={darkMat}>
        <cylinderGeometry args={[RING_R + 0.3, RING_R + 0.42, PLINTH_H, 16]} />
      </mesh>
      {/* Thin moss ring blended into the turf edge */}
      <mesh position={[0, PLINTH_H + 0.005, 0]} receiveShadow material={mossMat}>
        <cylinderGeometry args={[RING_R + 0.18, RING_R + 0.18, 0.02, 16]} />
      </mesh>

      {/* Central altar — a low broad granite slab on two small footings */}
      <group position={[0, PLINTH_H, 0]}>
        <mesh position={[0.16, 0.11, 0.1]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[0.16, 0.22, 0.16]} />
        </mesh>
        <mesh position={[-0.16, 0.11, -0.1]} castShadow receiveShadow material={darkMat}>
          <boxGeometry args={[0.16, 0.22, 0.16]} />
        </mesh>
        <mesh position={[0, 0.27, 0]} rotation={[0, 0.5, 0]} castShadow receiveShadow material={stoneMat}>
          <boxGeometry args={[0.62, 0.12, 0.42]} />
        </mesh>
        {/* Moss patch on the altar top */}
        <mesh position={[0.12, 0.335, 0.06]} rotation={[0, 0.5, 0]} material={mossMat}>
          <boxGeometry args={[0.22, 0.02, 0.16]} />
        </mesh>
      </group>

      {/* Ring of weathered uprights */}
      {stones.map((s, i) => (
        <group key={i} position={[s.x, PLINTH_H, s.z]} rotation={[s.lean, s.yaw, s.lean * 0.5]}>
          {/* Upright megalith — slightly narrower & shorter taper at the top */}
          <mesh position={[0, s.h / 2, 0]} castShadow receiveShadow material={stoneMat}>
            <boxGeometry args={[s.w, s.h, STONE_D]} />
          </mesh>
          {/* Hewn cap, narrower, for a chiselled silhouette */}
          <mesh position={[0, s.h - 0.04, 0]} castShadow receiveShadow material={darkMat}>
            <boxGeometry args={[s.w * 0.78, 0.16, STONE_D * 0.78]} />
          </mesh>
          {/* Moss creeping up the base of alternating stones */}
          {i % 2 === 0 && (
            <mesh position={[0, 0.26, STONE_D / 2 + 0.004]} material={mossMat}>
              <boxGeometry args={[s.w * 0.62, 0.4, 0.03]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}
