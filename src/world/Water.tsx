import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLS, ROWS, CENTER_X, CENTER_Z } from './tileMap'
import { isPaused } from './pauseStore'
import { waterTexture } from './textures'

// Wide open ocean ring around the island. A big plane fading into the horizon
// fog reads as the open sea; the margin is generous so the distant mountain
// backdrop (see DistantMountains) sits well out on the water, not at the edge.
const W = COLS + 280
const H = ROWS + 280

export function Water() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const frame = useRef(0)

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, 56, 48)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  const basePositions = useMemo(() => {
    const arr = geo.attributes.position.array as Float32Array
    return new Float32Array(arr)
  }, [geo])

  // Scrolling ripple texture so rivers/sea read as flowing, not glassy.
  const mat = useMemo(() => {
    const map = waterTexture('#2780c9', 7)
    return new THREE.MeshStandardMaterial({
      color: map ? '#5aa6e0' : '#2780c9',
      map: map ?? undefined,
      roughness: 0.3,
      metalness: 0.15,
      transparent: true,
      opacity: 0.9,
    })
  }, [])

  useFrame(({ clock }, dt) => {
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
    // Drift the ripple texture so the surface looks like it's flowing.
    if (mat.map) {
      mat.map.offset.x = (mat.map.offset.x + dt * 0.015) % 1
      mat.map.offset.y = (mat.map.offset.y + dt * 0.024) % 1
    }
  })

  return <mesh ref={meshRef} geometry={geo} material={mat} position={[0, 0.05, 0]} receiveShadow />
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
