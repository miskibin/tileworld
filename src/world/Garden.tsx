import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

interface GardenProps {
  position: [number, number, number]
  rotation?: number
  /** half-size of garden patch in tiles */
  size?: number
  seed?: number
}

const SOIL = '#5a3a22'
const FENCE = '#3a2616'
const VEG_GREEN = '#3a7a2a'
const VEG_ALT = '#5a9a3a'
const VEG_ORANGE = '#e07a26'
const VEG_RED = '#c64238'

const SOIL_MAT = new THREE.MeshStandardMaterial({ color: SOIL, roughness: 1 })
const FENCE_MAT = new THREE.MeshStandardMaterial({ color: FENCE, roughness: 1 })
const FENCE_POST_GEO = new THREE.BoxGeometry(0.08, 0.4, 0.08)
const FENCE_RAIL_GEO = new THREE.BoxGeometry(1.0, 0.04, 0.04)

const VEG_GEO = new THREE.IcosahedronGeometry(0.13, 0)
const VEG_MATS = [
  new THREE.MeshStandardMaterial({ color: VEG_GREEN, roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: VEG_ALT, roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: VEG_ORANGE, roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: VEG_RED, roughness: 0.85, flatShading: true }),
]

interface Veg {
  x: number
  z: number
  scale: number
  matIdx: number
}

function pseudoRand(seed: number, n: number): number {
  const x = Math.sin(seed * 9301 + n * 49297) * 233280
  return x - Math.floor(x)
}

export function Garden({ position, rotation = 0, size = 1.4, seed = 0 }: GardenProps) {
  const vegRefs = useRef<(THREE.InstancedMesh | null)[]>([null, null, null, null])

  const vegs = useMemo(() => {
    const arr: Veg[] = []
    const rows = 5
    const cols = 5
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (r + 0.5) / rows
        const v = (c + 0.5) / cols
        const jitterX = (pseudoRand(seed, r * cols + c) - 0.5) * 0.18
        const jitterZ = (pseudoRand(seed + 1, r * cols + c) - 0.5) * 0.18
        const px = (u * 2 - 1) * size + jitterX
        const pz = (v * 2 - 1) * size + jitterZ
        const matIdx = Math.floor(pseudoRand(seed + 2, r * cols + c) * VEG_MATS.length)
        const scale = 0.7 + pseudoRand(seed + 3, r * cols + c) * 0.6
        arr.push({ x: px, z: pz, scale, matIdx })
      }
    }
    return arr
  }, [seed, size])

  useEffect(() => {
    // Group veggies by material into instanced meshes
    const dummy = new THREE.Object3D()
    const byMat: Veg[][] = [[], [], [], []]
    vegs.forEach((v) => byMat[v.matIdx].push(v))
    byMat.forEach((group, mi) => {
      const inst = vegRefs.current[mi]
      if (!inst) return
      group.forEach((v, i) => {
        dummy.position.set(v.x, 0.1, v.z)
        dummy.rotation.set(0, pseudoRand(seed + 4, i + mi * 100) * Math.PI * 2, 0)
        dummy.scale.setScalar(v.scale)
        dummy.updateMatrix()
        inst.setMatrixAt(i, dummy.matrix)
      })
      inst.count = group.length
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
    })
  }, [vegs, seed])

  // Fence posts and rails along perimeter
  const fenceItems = useMemo(() => {
    const posts: { x: number; z: number }[] = []
    const rails: { x: number; z: number; rot: number; len: number }[] = []
    const ext = size + 0.18
    const spacing = ext * 2 / 5
    for (let i = 0; i <= 5; i++) {
      const t = -ext + i * spacing
      posts.push({ x: t, z: -ext })
      posts.push({ x: t, z: ext })
      if (i < 5) {
        rails.push({ x: t + spacing / 2, z: -ext, rot: 0, len: spacing })
        rails.push({ x: t + spacing / 2, z: ext, rot: 0, len: spacing })
      }
    }
    for (let i = 1; i < 5; i++) {
      const t = -ext + i * spacing
      posts.push({ x: -ext, z: t })
      posts.push({ x: ext, z: t })
    }
    // Side rails
    for (let i = 0; i < 5; i++) {
      const t = -ext + i * spacing + spacing / 2
      rails.push({ x: -ext, z: t, rot: Math.PI / 2, len: spacing })
      rails.push({ x: ext, z: t, rot: Math.PI / 2, len: spacing })
    }
    return { posts, rails }
  }, [size])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Soil patch */}
      <mesh position={[0, 0.02, 0]} receiveShadow material={SOIL_MAT}>
        <boxGeometry args={[size * 2 + 0.05, 0.04, size * 2 + 0.05]} />
      </mesh>

      {/* Veggies — one InstancedMesh per material color */}
      {VEG_MATS.map((mat, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            vegRefs.current[i] = el
          }}
          args={[VEG_GEO, mat, 30]}
          castShadow
        />
      ))}

      {/* Fence posts */}
      {fenceItems.posts.map((p, i) => (
        <mesh
          key={`p${i}`}
          position={[p.x, 0.2, p.z]}
          castShadow
          material={FENCE_MAT}
          geometry={FENCE_POST_GEO}
        />
      ))}
      {/* Fence rails */}
      {fenceItems.rails.map((r, i) => (
        <mesh
          key={`r${i}`}
          position={[r.x, 0.3, r.z]}
          rotation={[0, r.rot, 0]}
          castShadow
          material={FENCE_MAT}
        >
          <boxGeometry args={[r.len, 0.04, 0.04]} />
        </mesh>
      ))}
    </group>
  )
}
