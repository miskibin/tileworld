import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { subscribeGraves, type Grave as GraveData } from './successionStore'

// A fallen hero's resting place. Planted where the player dies in the
// "Blade Passes" succession mechanic, the body stays behind as this headstone
// while the spirit moves on. Small, weathered, readable from a distance.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement.

const STONE = '#8d8c86'
const STONE_DARK = '#54534f'
const DIRT = '#6b4f37'
const MOSS = '#6f7d3c'

const MOUND_W = 0.9
const MOUND_D = 0.6
const MOUND_H = 0.16

const SLAB_W = 0.5
const SLAB_H = 0.5
const SLAB_D = 0.12
const SLAB_Z = -0.1 // sit toward the back of the mound

const CAP_R = SLAB_W / 2 // rounded headstone top matches the slab half-width

export function Grave({
  position = [0, 0, 0],
  rotation = 0,
  lean = 0,
}: {
  position?: [number, number, number]
  rotation?: number
  /** small forward/back lean (radians) so a field of graves looks weathered */
  lean?: number
}) {
  const stoneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95, flatShading: true }),
    [],
  )
  const engraveMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 1, flatShading: true }),
    [],
  )
  const dirtMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DIRT, roughness: 1, flatShading: true }),
    [],
  )
  const mossMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, flatShading: true }),
    [],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Grave mound */}
      <mesh position={[0, MOUND_H / 2, 0]} castShadow receiveShadow material={dirtMat}>
        <boxGeometry args={[MOUND_W, MOUND_H, MOUND_D]} />
      </mesh>
      {/* A strip of moss/grass creeping over the mound top */}
      <mesh position={[0, MOUND_H + 0.01, 0.06]} receiveShadow material={mossMat}>
        <boxGeometry args={[MOUND_W * 0.8, 0.04, MOUND_D * 0.45]} />
      </mesh>

      {/* The headstone leans slightly via this inner group (pivot at the base). */}
      <group position={[0, MOUND_H * 0.5, SLAB_Z]} rotation={[lean, 0, 0]}>
        {/* Slab body */}
        <mesh position={[0, SLAB_H / 2, 0]} castShadow receiveShadow material={stoneMat}>
          <boxGeometry args={[SLAB_W, SLAB_H, SLAB_D]} />
        </mesh>
        {/* Rounded top (half-cylinder cap), axis along Z so the round faces front */}
        <mesh
          position={[0, SLAB_H, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
          material={stoneMat}
        >
          <cylinderGeometry args={[CAP_R, CAP_R, SLAB_D, 16]} />
        </mesh>
        {/* Engraved cross on the front face */}
        <mesh position={[0, SLAB_H * 0.55, SLAB_D / 2 + 0.005]} material={engraveMat}>
          <boxGeometry args={[0.06, 0.3, 0.03]} />
        </mesh>
        <mesh position={[0, SLAB_H * 0.66, SLAB_D / 2 + 0.005]} material={engraveMat}>
          <boxGeometry args={[0.22, 0.06, 0.03]} />
        </mesh>
      </group>
    </group>
  )
}

/** Renders every grave the player has left behind this run. Drop once in World
 *  (inside the offset group). Each grave gets a deterministic yaw + weathered
 *  lean from its id so the field doesn't look stamped. */
export function GraveField() {
  const [list, setList] = useState<GraveData[]>([])
  useEffect(() => subscribeGraves((l) => setList([...l])), [])
  return (
    <group>
      {list.map((g) => {
        // deterministic per-grave variation
        const rot = ((g.id * 2.39996) % (Math.PI * 2)) - Math.PI
        const lean = (((g.id * 7) % 5) - 2) * 0.04 // small forward/back tilt
        return <Grave key={g.id} position={[g.x, g.y, g.z]} rotation={rot} lean={lean} />
      })}
    </group>
  )
}
