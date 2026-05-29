import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLS, ROWS, CENTER_X, CENTER_Z } from './tileMap'
import { isPaused } from './pauseStore'

const W = COLS + 8
const H = ROWS + 8

export function Water() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const frame = useRef(0)

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, 32, 24)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  const basePositions = useMemo(() => {
    const arr = geo.attributes.position.array as Float32Array
    return new Float32Array(arr)
  }, [geo])

  useFrame(({ clock }) => {
    if (isPaused()) return
    const t = clock.getElapsedTime()
    const pos = geo.attributes.position.array as Float32Array
    for (let i = 0; i < pos.length; i += 3) {
      const bx = basePositions[i]
      const bz = basePositions[i + 2]
      pos[i + 1] =
        Math.sin(bx * 0.55 + t * 0.9) * 0.05 +
        Math.cos(bz * 0.7 + t * 1.1) * 0.05
    }
    geo.attributes.position.needsUpdate = true
    // Recompute normals only every 4th frame — the gentle ripple doesn't need
    // per-frame normals and computeVertexNormals is the expensive part.
    if (frame.current++ % 4 === 0) geo.computeVertexNormals()
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geo}
      position={[0, 0.05, 0]}
      receiveShadow
    >
      <meshStandardMaterial
        color="#2780c9"
        roughness={0.35}
        metalness={0.1}
        transparent
        opacity={0.92}
      />
    </mesh>
  )
}

// Solid darker floor under water so transparent areas don't reveal sky.
export function WaterFloor() {
  return (
    <mesh
      position={[0, -0.2, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[W + 4, H + 4]} />
      <meshStandardMaterial color="#0d3a66" roughness={1} />
    </mesh>
  )
}

// Re-export for World.tsx convenience.
export const WATER_CENTER: [number, number, number] = [
  -CENTER_X + COLS / 2,
  0,
  -CENTER_Z + ROWS / 2,
]
